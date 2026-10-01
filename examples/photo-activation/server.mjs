import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

const key = process.env.MAGIC_HOUR_API_KEY;
if (!key) throw new Error("Set MAGIC_HOUR_API_KEY before starting.");
const campaign = {
  name: process.env.CAMPAIGN_NAME || "Studio moment",
  prompt:
    process.env.CAMPAIGN_PROMPT ||
    "Transform this photo into an editorial studio portrait with a vivid violet background and warm cinematic lighting. Preserve the person's identity, clothing, and facial expression. No text or logos.",
  model: "flux-2-klein",
  resolution: "640px",
};
// Local demo only: restart loses handles. Persist ownership before public deployment.
const jobs = new Map();
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function api(path, body) {
  const response = await fetch(`https://api.magichour.ai/v1${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const error = new Error(
      response.status === 402
        ? "Campaign credits exhausted. Ask the operator to top up."
        : response.status === 401
          ? "API key rejected. Ask the operator to check server configuration."
          : `Magic Hour returned HTTP ${response.status}. Check the API dashboard before starting another generation.`
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
createServer(async (req, res) => {
  try {
    if (!["127.0.0.1:3002", "localhost:3002"].includes(req.headers.host))
      return json(res, 403, { error: "Use the local starter URL." });
    const path = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && ["/", "/app.js"].includes(path)) {
      res.writeHead(200, { "Content-Type": path === "/" ? "text/html" : "text/javascript" });
      return res.end(
        await readFile(new URL(path === "/" ? "./index.html" : "./app.js", import.meta.url))
      );
    }
    if (req.method === "GET" && path === "/campaign")
      return json(res, 200, { name: campaign.name });
    if (req.method === "POST" && path === "/generate") {
      // Reject cross-site requests to this localhost service.
      if (req.headers.origin !== `http://${req.headers.host}`)
        return json(res, 403, { error: "Open the starter on its local URL." });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024)
          return json(res, 413, { error: "Choose a photo smaller than 10 MB." });
        chunks.push(chunk);
      }
      const type = req.headers["content-type"];
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
      if (!extension || !size)
        return json(res, 400, { error: "Choose a JPEG, PNG, or WebP photo." });
      const upload = await api("/files/upload-urls", { items: [{ type: "image", extension }] });
      const item = upload.items[0];
      const uploaded = await fetch(item.upload_url, {
        method: "PUT",
        headers: { "Content-Type": type },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(60000),
      });
      if (!uploaded.ok) throw new Error("Photo upload failed. No generation was requested.");
      const project = await api("/ai-image-editor", {
        name: campaign.name,
        model: campaign.model,
        resolution: campaign.resolution,
        image_count: 1,
        style: { prompt: campaign.prompt },
        assets: { image_file_paths: [item.file_path] },
      });
      const handle = randomUUID();
      jobs.set(handle, project.id);
      return json(res, 200, { handle, credits: project.credits_charged });
    }
    const match = path.match(/^\/jobs\/([a-f0-9-]+)(\/download)?$/);
    if (req.method === "GET" && match && jobs.has(match[1])) {
      const project = await api(`/image-projects/${encodeURIComponent(jobs.get(match[1]))}`);
      if (!match[2])
        return json(res, 200, {
          status: project.status,
          error: project.error?.message,
          ready: project.status === "complete" && !!project.downloads?.length,
        });
      if (project.status !== "complete" || !project.downloads?.length)
        return json(res, 409, { error: "Result not ready." });
      // Refresh expiring output URLs; never accept a user-supplied download URL.
      const output = await fetch(project.downloads[0].url, { signal: AbortSignal.timeout(60000) });
      if (!output.ok || !output.body)
        throw new Error("Download unavailable. Try downloading again.");
      res.writeHead(200, {
        "Content-Type": output.headers.get("content-type") || "image/png",
        "Content-Disposition": 'attachment; filename="studio-moment.png"',
        "Cache-Control": "no-store",
      });
      Readable.fromWeb(output.body)
        .on("error", () => res.destroy())
        .pipe(res);
      return;
    }
    json(res, 404, { error: "Not found. Restarting the demo clears job handles." });
  } catch (error) {
    if (res.headersSent) return res.destroy();
    json(res, error.status || 502, {
      error:
        error.name === "TimeoutError"
          ? "Request timed out. Check the API dashboard before generating again; a job may already exist."
          : error.message,
    });
  }
}).listen(3002, "127.0.0.1", () => console.log("Photo activation: http://127.0.0.1:3002"));

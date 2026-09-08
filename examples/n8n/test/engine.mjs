import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { connect } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const exec = promisify(execFile);
const n8n = process.argv[2];
if (!n8n || !process.env.N8N_USER_FOLDER)
  throw new Error("Provide n8n path and a disposable N8N_USER_FOLDER.");
const directory = await mkdtemp(path.join(tmpdir(), "magic-hour-workflows-"));
const fixtures = {
  image: await readFile(new URL("./fixtures/product.png", import.meta.url)),
  video: await readFile(new URL("./fixtures/product.mp4", import.meta.url)),
};
const calls = [];
let pending = false;
const handler = async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  calls.push({ method: req.method, path: url.pathname });
  const json = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.hostname === "example.com" && url.pathname.startsWith("/magic-hour-test/")) {
    assert.equal(
      req.headers.authorization,
      undefined,
      "Do not forward API credentials to downloads"
    );
    const type = url.pathname.endsWith(".mp4") ? "video" : "image";
    res.writeHead(200, { "Content-Type": type === "video" ? "video/mp4" : "image/png" });
    res.end(fixtures[type]);
  } else if (url.hostname === "api.magichour.ai") {
    assert.equal(req.headers.authorization, "Bearer invalid-ci-fixture-key");
    if (req.method === "POST" && url.pathname === "/v1/ai-image-generator") {
      assert.ok(body.style.prompt);
      assert.equal(body.image_count, 1);
      json({ id: "generated-image", credits_charged: 5 });
    } else if (req.method === "POST" && url.pathname === "/v1/image-to-video") {
      assert.equal(body.assets.image_file_path, "https://example.com/product.png");
      assert.equal(body.end_seconds, 1);
      json({ id: "generated-video", credits_charged: 24 });
    } else if (req.method === "GET" && /^\/v1\/(image|video)-projects\//.test(url.pathname)) {
      const type = url.pathname.includes("image-projects") ? "image" : "video";
      json({
        id: url.pathname.split("/").at(-1),
        status: pending ? "rendering" : "complete",
        downloads: pending
          ? []
          : [
              {
                url: `https://example.com/magic-hour-test/result.${type === "image" ? "png" : "mp4"}`,
              },
            ],
      });
    } else json({ error: "Unexpected API call" }, 400);
  } else json({ error: "Unexpected host" }, 400);
};
const certificate = path.join(directory, "fixture-cert.pem");
const privateKey = path.join(directory, "fixture-key.pem");
await exec("openssl", [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-days",
  "1",
  "-keyout",
  privateKey,
  "-out",
  certificate,
  "-subj",
  "/CN=Magic Hour CI fixture",
  "-addext",
  "subjectAltName=DNS:api.magichour.ai,DNS:example.com",
]);
const tlsServer = createTlsServer(
  { key: await readFile(privateKey), cert: await readFile(certificate) },
  handler
);
await new Promise((resolve) => tlsServer.listen(0, "127.0.0.1", resolve));
const proxy = createServer(handler);
proxy.on("connect", (req, client, head) => {
  if (!["api.magichour.ai:443", "example.com:443"].includes(req.url)) {
    client.destroy();
    return;
  }
  const upstream = connect(tlsServer.address().port, "127.0.0.1", () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
const env = {
  ...process.env,
  NODE_EXTRA_CA_CERTS: certificate,
  HTTP_PROXY: proxyUrl,
  HTTPS_PROXY: proxyUrl,
  http_proxy: proxyUrl,
  https_proxy: proxyUrl,
  NO_PROXY: "localhost,127.0.0.1",
};
async function cli(args) {
  return exec(n8n, args, { env, maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
}
function result(stdout) {
  const start = stdout.search(/^\{/m);
  return JSON.parse(stdout.slice(start, stdout.lastIndexOf("}") + 1));
}
try {
  const credentials = path.join(directory, "credentials.json");
  await writeFile(
    credentials,
    JSON.stringify([
      {
        id: "mhFixtureCredential",
        name: "Magic Hour CI fixture",
        type: "magicHourApi",
        data: { apiKey: "invalid-ci-fixture-key" },
      },
    ])
  );
  await cli(["import:credentials", `--input=${credentials}`]);
  for (const [index, file] of [
    "generate-product-image",
    "animate-product-image",
    "recover-generation",
    "recover-generation",
  ].entries()) {
    const workflow = JSON.parse(await readFile(new URL(`../${file}.json`, import.meta.url)));
    workflow.id = `mhWorkflowTest${index}`;
    const node = workflow.nodes.find((item) => item.name === "Magic Hour");
    node.credentials.magicHourApi.id = "mhFixtureCredential";
    if (node.parameters.imageFilePath)
      node.parameters.imageFilePath = "https://example.com/product.png";
    if (node.parameters.videoProjectId) node.parameters.videoProjectId = "existing-video";
    const input = path.join(directory, `${workflow.id}.json`);
    await writeFile(input, JSON.stringify(workflow));
    await cli(["import:workflow", `--input=${input}`]);
    pending = index === 3;
    const before = calls.length;
    const { stdout } = await cli(["execute", `--id=${workflow.id}`, "--rawOutput"]).catch(
      (error) => {
        if (pending && error.stdout) return error;
        throw error;
      }
    );
    const execution = result(stdout);
    const data = execution.data.resultData;
    if (pending) {
      assert.ok(data.error, "Unfinished recovery must stop before downloading");
      assert.ok(!data.runData["Download result"]);
    } else {
      assert.equal(data.error, undefined);
      const binary = data.runData["Download result"][0].data.main[0][0].binary.data;
      assert.equal(binary.mimeType, index === 0 ? "image/png" : "video/mp4");
      assert.ok(binary.fileSize);
    }
    const requests = calls.slice(before);
    assert.equal(requests.filter((call) => call.method === "POST").length, index < 2 ? 1 : 0);
    console.log(JSON.stringify({ workflow: file, pending, passed: true, requests }));
  }
} finally {
  proxy.close();
  tlsServer.closeAllConnections();
  tlsServer.close();
}

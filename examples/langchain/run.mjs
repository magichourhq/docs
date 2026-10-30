import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connectMagicHour, mediaWorkflow, projectData, operations } from "./workflow.mjs";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "generate" },
    prompt: { type: "string" },
    image: { type: "string" },
    resume: { type: "string" },
    check: { type: "boolean", default: false },
    "submit-only": { type: "boolean", default: false },
    "max-credits": { type: "string" },
  },
});
let client;
try {
  const state = values.resume
    ? JSON.parse(await readFile(values.resume, "utf8"))
    : {
        mode: values.mode,
        prompt: values.prompt,
        image: values.image,
        submitOnly: values["submit-only"],
      };
  if (values.resume && (!state.projectId || !state.mode))
    throw new Error("Resume file must contain projectId and mode.");
  if (!Object.hasOwn(operations, state.mode)) throw new Error("Use generate, edit or animate.");
  // Local preflight based on documented fixed settings, not a server-enforced cap.
  const expectedCredits = state.mode === "animate" ? 24 : 5;
  if (
    !values.check &&
    !values.resume &&
    (!values["max-credits"] ||
      !Number.isFinite(Number(values["max-credits"])) ||
      Number(values["max-credits"]) < expectedCredits)
  )
    throw new Error(
      `Set --max-credits to at least ${expectedCredits} after checking current pricing.`
    );
  client = connectMagicHour(process.env.MAGIC_HOUR_API_KEY);
  const tools = await client.listTools();
  const accountTool = tools.find((tool) => tool.name === "get_account_info");
  if (!accountTool) throw new Error("Magic Hour account verification tool is unavailable.");
  const account = projectData(
    await accountTool.invoke({
      type: "tool_call",
      id: randomUUID(),
      name: "get_account_info",
      args: {},
    })
  );
  if (typeof account.credits !== "number")
    throw new Error("Could not verify Magic Hour authentication.");
  if (values.check) {
    if (!Object.values(operations).every((name) => tools.some((tool) => tool.name === name)))
      throw new Error("A required Magic Hour operation is unavailable.");
    console.log(`Authenticated; ${tools.length} tools discovered. No generation requested.`);
  } else {
    const directory = join("outputs", randomUUID());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const graph = mediaWorkflow({
      tools,
      saveProject: async (record) => {
        const file = join(directory, "project.json");
        await writeFile(file, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
        console.log(`Saved recovery record: ${file}`);
      },
    });
    const result = await graph.invoke(state);
    if (result.submitOnly)
      console.log(
        `Accepted project ${result.projectId}; charged ${result.creditsCharged} credits. Resume the saved record to retrieve the result.`
      );
    for (const [index, url] of (result.outputUrls ?? []).entries()) {
      // Signed URLs must remain unchanged. Never forward the Magic Hour bearer key.
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok)
        throw new Error(`Download failed (HTTP ${response.status}); resume the saved project.`);
      const mime = response.headers.get("content-type")?.split(";")[0];
      const extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "video/mp4": "mp4",
      }[mime];
      if (
        !extension ||
        (result.mode === "animate" ? !mime.startsWith("video/") : !mime.startsWith("image/"))
      )
        throw new Error(
          "Unexpected download media type; resume the saved project to inspect the result."
        );
      const file = join(directory, `result-${index + 1}.${extension}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(file, { flags: "wx" }));
      console.log(`Saved result: ${file}`);
    }
    if (!result.submitOnly) {
      await writeFile(
        join(directory, "receipt.json"),
        JSON.stringify(
          {
            projectId: result.projectId,
            mode: result.mode,
            status: "complete",
            creditsCharged: result.creditsCharged,
            fileCount: result.outputUrls.length,
          },
          null,
          2
        ) + "\n",
        { flag: "wx", mode: 0o600 }
      );
      console.log(
        `Completed project ${result.projectId}; final charge ${result.creditsCharged} credits.`
      );
    }
  }
} catch (error) {
  let message = error.message;
  for (const secret of [process.env.MAGIC_HOUR_API_KEY])
    if (secret) message = message.replaceAll(secret, "[redacted]");
  console.error(message);
  process.exitCode = 1;
} finally {
  await client?.close();
}

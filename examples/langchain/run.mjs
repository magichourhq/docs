import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ChatOpenAI } from "@langchain/openai";
import { connectMagicHour, mediaWorkflow } from "./workflow.mjs";

const { values } = parseArgs({
  options: {
    mode: { type: "string", default: "generate" },
    prompt: { type: "string" },
    image: { type: "string" },
    resume: { type: "string" },
    "improve-prompt": { type: "boolean", default: false },
  },
});
let client;
try {
  const state = values.resume
    ? JSON.parse(await readFile(values.resume, "utf8"))
    : { mode: values.mode, prompt: values.prompt, image: values.image };
  if (values.resume && (!state.projectId || !state.mode))
    throw new Error("Resume file must contain projectId and mode.");
  if (
    values["improve-prompt"] &&
    !values.resume &&
    (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
  )
    throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL to improve a prompt.");
  const directory = join("outputs", randomUUID());
  await mkdir(directory, { recursive: true });
  client = connectMagicHour(process.env.MAGIC_HOUR_API_KEY);
  const tools = await client.getTools();
  const graph = mediaWorkflow({
    tools,
    promptModel:
      values["improve-prompt"] && !values.resume
        ? new ChatOpenAI({ model: process.env.OPENAI_MODEL, maxRetries: 0, timeout: 30000 })
        : undefined,
    saveProject: async (record) => {
      const file = join(directory, "project.json");
      await writeFile(file, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
      console.log(`Saved recovery record: ${file}`);
    },
  });
  const result = await graph.invoke(state);
  for (const [index, url] of result.outputUrls.entries()) {
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
} catch (error) {
  let message = error.message;
  for (const secret of [process.env.MAGIC_HOUR_API_KEY, process.env.OPENAI_API_KEY])
    if (secret) message = message.replaceAll(secret, "[redacted]");
  console.error(message);
  process.exitCode = 1;
} finally {
  await client?.close();
}

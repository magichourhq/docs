import { writeFile } from "node:fs/promises";

process.env.OTEL_SDK_DISABLED = "true";
process.env.VOLTAGENT_LOG_LEVEL = "fatal";

const apiKey = process.env.MAGIC_HOUR_API_KEY;
const projectId = process.env.MAGIC_HOUR_IMAGE_PROJECT_ID;
if (!apiKey?.trim() || !projectId?.trim()) {
  throw new Error("Set MAGIC_HOUR_API_KEY and MAGIC_HOUR_IMAGE_PROJECT_ID.");
}
const { MCPClient } = await import("@voltagent/core");

function metadata(result) {
  if (result?.isError) throw new Error("Magic Hour rejected the tool call.");
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  for (const block of result?.content ?? []) {
    if (block.type !== "text") continue;
    try {
      const value = JSON.parse(block.text);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  throw new Error("Magic Hour returned no project or account metadata.");
}

const client = new MCPClient({
  clientInfo: { name: "magic_hour", version: "1.0.0" },
  server: {
    type: "streamable-http",
    url: "https://mcp.magichour.ai/",
    requestInit: { headers: { Authorization: `Bearer ${apiKey.trim()}` } },
  },
  timeout: 60000,
});
let phase = "MCP connection";
try {
  await client.connect();
  phase = "tool discovery";
  const tools = await client.getAgentTools();
  const account = tools.magic_hour_account_retrieve;
  const wait = tools.magic_hour_wait_for_image_project;
  if (typeof account?.execute !== "function" || typeof wait?.execute !== "function") {
    throw new Error("Required Magic Hour tools are unavailable.");
  }
  console.log(`Discovered ${Object.keys(tools).length} executable tools.`);
  phase = "account authorization";
  const accountData = metadata(await account.execute({}));
  if (typeof accountData.id !== "string" || typeof accountData.credits !== "number") {
    throw new Error("Magic Hour returned unexpected account metadata.");
  }
  console.log("Magic Hour API authorization confirmed.");
  phase = "image recovery";
  const result = await wait.execute({
    id: projectId,
    timeout_seconds: 30,
    include_inline_downloads: process.env.MAGIC_HOUR_SAVE_IMAGE === "1",
    max_inline_downloads: 1,
    max_bytes_per_download: 8388608,
  });
  const project = metadata(result);
  if (project.id !== projectId || typeof project.status !== "string") {
    throw new Error("Project response did not match the saved ID.");
  }
  console.log("Image project status:", project.status);

  if (process.env.MAGIC_HOUR_SAVE_IMAGE === "1") {
    if (project.status !== "complete") throw new Error("Image is not complete; retain the saved ID.");
    phase = "PNG retention";
    const image = result?.content?.find((block) => block.type === "image");
    if (image?.mimeType !== "image/png" || typeof image.data !== "string") {
      throw new Error("This example saves PNG image content only.");
    }
    await writeFile("magic-hour-image.png", Buffer.from(image.data, "base64"));
    console.log("Saved image: magic-hour-image.png");
  }
} catch (error) {
  console.error(
    `Magic Hour recovery failed during ${phase}. Retain the saved project ID; no generation was requested.`
  );
  if (Number.isFinite(error?.code)) console.error("MCP error code:", error.code);
  process.exitCode = 1;
} finally {
  try {
    await client.disconnect();
  } catch {
    console.error("MCP connection cleanup failed.");
    process.exitCode = 1;
  }
}

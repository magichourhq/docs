import { writeFile } from "node:fs/promises";

process.env.GENKIT_ENV = "prod";
process.env.GENKIT_REFLECTION_ENABLED = "false";
process.env.OTEL_SDK_DISABLED = "true";

const { genkit } = await import("genkit");
const { createMcpClient } = await import("@genkit-ai/mcp");
const apiKey = process.env.MAGIC_HOUR_API_KEY;
const projectId = process.env.MAGIC_HOUR_IMAGE_PROJECT_ID;
if (!apiKey?.trim() || !projectId?.trim()) {
  throw new Error("Set MAGIC_HOUR_API_KEY and MAGIC_HOUR_IMAGE_PROJECT_ID.");
}

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

const client = createMcpClient({
  name: "magic_hour",
  serverName: "magic_hour",
  rawToolResponses: true,
  mcpServer: {
    url: "https://mcp.magichour.ai/",
    requestInit: { headers: { Authorization: `Bearer ${apiKey.trim()}` } },
  },
});
let phase = "MCP connection";
try {
  await client.ready();
  phase = "tool discovery";
  const tools = await client.getActiveTools(genkit({ promptDir: null }));
  const account = tools.find((tool) => tool.__action.name === "magic_hour/get_account_info");
  const wait = tools.find((tool) => tool.__action.name === "magic_hour/wait_for_image_project");
  if (!account || !wait) throw new Error("Required Magic Hour tools are unavailable.");
  console.log(`Discovered ${tools.length} tools.`);
  phase = "account authorization";
  const accountData = metadata(await account({}));
  if (typeof accountData.id !== "string" || typeof accountData.credits !== "number") {
    throw new Error("Magic Hour returned unexpected account metadata.");
  }
  console.log("Magic Hour API authorization confirmed.");
  phase = "image recovery";
  const result = await wait({
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
    await client.disable();
  } catch {
    console.error("MCP connection cleanup failed.");
    process.exitCode = 1;
  }
}

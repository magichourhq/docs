import assert from "node:assert/strict";
import { connectMagicHour, operations, projectData } from "./workflow.mjs";

// Read-only production compatibility check. Never use a real key in this test.
const client = connectMagicHour("invalid-integration-smoke-key");
try {
  const tools = await client.getTools();
  for (const name of [
    ...Object.values(operations),
    "wait_for_image_project",
    "wait_for_video_project",
  ])
    assert.ok(
      tools.some((tool) => tool.name === name),
      `Missing tool: ${name}`
    );
  const ping = tools.find((tool) => tool.name === "ping");
  const pong = projectData(
    await ping.invoke({ type: "tool_call", id: "smoke-ping", name: "ping", args: {} })
  );
  assert.equal(pong.result, "pong");
  await assert.rejects(tools.find((tool) => tool.name === "account_retrieve").invoke({}), /401/);
  console.log(
    JSON.stringify({
      tool_count: tools.length,
      ping: "passed",
      invalid_key: "rejected",
      generation_calls: 0,
    })
  );
} finally {
  await client.close();
}

import assert from "node:assert/strict";
import test from "node:test";
import { mediaWorkflow, projectData } from "./workflow.mjs";

const output = (data) => ({ artifact: [{ type: "mcp_structured_content", data }] });

test("missing durable persistence rejects before a paid create", async () => {
  const calls = [];
  const graph = mediaWorkflow({ tools: toolsFor({ calls }) });
  await assert.rejects(graph.invoke({ mode: "generate", prompt: "blue mug" }), /saveProject/);
  assert.deepEqual(calls, []);
});
function toolsFor({ create = { id: "accepted-job", credits_charged: 5 }, wait, calls }) {
  return ["ai_image_generator_create_image", "wait_for_image_project"].map((name) => ({
    name,
    invoke: async (call) => {
      calls.push(name);
      return output(name.startsWith("wait_") ? wait : create);
    },
  }));
}

test("resuming an accepted project never invokes a generation tool", async () => {
  const calls = [];
  const graph = mediaWorkflow({
    tools: toolsFor({
      calls,
      wait: {
        status: "complete",
        exact_download_urls: ["https://example.com/image.png?signature=kept"],
        credits_charged: 5,
      },
    }),
    saveProject: () => assert.fail("resume must not save a new job"),
  });
  const result = await graph.invoke({ mode: "generate", projectId: "accepted-job" });
  assert.deepEqual(calls, ["wait_for_image_project"]);
  assert.equal(result.outputUrls[0], "https://example.com/image.png?signature=kept");
});

test("a failed durable save stops before polling and exposes the accepted ID", async () => {
  const calls = [];
  const graph = mediaWorkflow({
    tools: toolsFor({ calls }),
    saveProject: async () => {
      throw new Error("disk full");
    },
  });
  await assert.rejects(
    graph.invoke({ mode: "generate", prompt: "blue mug" }),
    /accepted-job.*resume/
  );
  assert.deepEqual(calls, ["ai_image_generator_create_image"]);
});

test("submit-only awaits persistence and returns without polling", async () => {
  const calls = [];
  const graph = mediaWorkflow({
    tools: toolsFor({ calls }),
    saveProject: async (record) => {
      await Promise.resolve();
      calls.push("persisted");
      assert.equal(record.creditsCharged, 5);
    },
  });
  const result = await graph.invoke({ mode: "generate", prompt: "blue mug", submitOnly: true });
  assert.equal(result.projectId, "accepted-job");
  assert.deepEqual(calls, ["ai_image_generator_create_image", "persisted"]);
});

for (const status of ["error", "canceled", "rendering"]) {
  test(`${status} does not become a completed output or another paid create`, async () => {
    const calls = [];
    const graph = mediaWorkflow({
      tools: toolsFor({ calls, wait: { status } }),
      saveProject: async () => {},
    });
    await assert.rejects(
      graph.invoke({ mode: "generate", projectId: "accepted-job" }),
      new RegExp(status)
    );
    assert.deepEqual(calls, ["wait_for_image_project"]);
  });
}

test("complete without a download fails without resubmission", async () => {
  const calls = [];
  const graph = mediaWorkflow({
    tools: toolsFor({ calls, wait: { status: "complete", downloads: [] } }),
    saveProject: async () => {},
  });
  await assert.rejects(
    graph.invoke({ mode: "generate", projectId: "accepted-job" }),
    /no usable download/
  );
  assert.deepEqual(calls, ["wait_for_image_project"]);
});

test("adapter 2 error messages cannot be parsed as successful structured output", () => {
  for (const status of [401, 402, 429, 500]) {
    assert.throws(
      () =>
        projectData({
          ...output({ id: "not-success" }),
          status: "error",
          content: `HTTP ${status}`,
        }),
      new RegExp(String(status))
    );
  }
  assert.deepEqual(projectData({ content: [{ type: "text", text: '{"id":"accepted-job"}' }] }), {
    id: "accepted-job",
  });
});

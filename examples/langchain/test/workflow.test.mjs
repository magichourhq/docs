import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import Ajv from "ajv";
import { mediaWorkflow, operations } from "../workflow.mjs";

const schemas = JSON.parse(await readFile(new URL("./tool-schemas.json", import.meta.url)));
const ajv = new Ajv({ strict: false });
const validators = new Map(schemas.map((tool) => [tool.name, ajv.compile(tool.inputSchema)]));
const calls = [];
let status = "complete";
let creationError = false;
let missingDownloads = false;
const sessions = new Set();
const http = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, "Bearer invalid-local-test-key");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const server = new Server(
    { name: "magic-hour-test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: schemas }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const validate = validators.get(params.name);
    assert.ok(validate(params.arguments), JSON.stringify(validate.errors));
    calls.push(params);
    const create = params.name.includes("create_");
    if (create && creationError)
      return { isError: true, content: [{ type: "text", text: "Response lost after acceptance" }] };
    const data = create
      ? { id: "fixture-project", credits_charged: 5 }
      : {
          id: params.arguments.id,
          status,
          exact_download_urls: missingDownloads
            ? []
            : ["https://example.com/result?signature=x%2B%2Fy&expires=123"],
        };
    // Real wait tools have multiple text blocks plus machine-readable structured content.
    return {
      content: [
        { type: "text", text: create ? JSON.stringify(data) : "Project status" },
        ...(!create ? [{ type: "text", text: "Keep signed URLs unchanged" }] : []),
      ],
      structuredContent: data,
    };
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  sessions.add(server);
  await server.connect(transport);
  await transport.handleRequest(
    req,
    res,
    chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
  );
});
await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
const client = new MultiServerMCPClient({
  magic_hour: {
    transport: "http",
    url: `http://127.0.0.1:${http.address().port}/`,
    headers: { Authorization: "Bearer invalid-local-test-key" },
    automaticSSEFallback: false,
  },
});
const tools = await client.getTools();
after(async () => {
  await client.close();
  await Promise.all([...sessions].map((server) => server.close()));
  http.closeAllConnections();
  await new Promise((resolve) => http.close(resolve));
});

for (const mode of ["generate", "edit", "animate"]) {
  test(`LangGraph ${mode}: prompt model → MCP create → save ID → wait → signed output`, async () => {
    calls.length = 0;
    const saved = [];
    const graph = mediaWorkflow({
      tools,
      promptModel: new FakeListChatModel({ responses: ["A carefully composed product image"] }),
      saveProject: async (project) => {
        assert.equal(calls.length, 1);
        saved.push(project);
      },
    });
    const result = await graph.invoke({
      mode,
      prompt: "Product scene",
      image: "https://example.com/product.png",
    });
    assert.deepEqual(
      calls.map((call) => call.name),
      [operations[mode], `wait_for_${mode === "animate" ? "video" : "image"}_project`]
    );
    assert.equal(calls[0].arguments.style.prompt, "A carefully composed product image");
    assert.equal(calls[1].arguments.include_inline_downloads, false);
    assert.deepEqual(saved, [{ mode, projectId: "fixture-project" }]);
    assert.deepEqual(result.outputUrls, [
      "https://example.com/result?signature=x%2B%2Fy&expires=123",
    ]);
  });
}
test("Resuming a project skips generation and prompt-model calls", async () => {
  calls.length = 0;
  const graph = mediaWorkflow({
    tools,
    saveProject: () => assert.fail("No new project"),
    promptModel: { invoke: () => assert.fail("No prompt rewrite") },
  });
  const result = await graph.invoke({ mode: "animate", projectId: "saved-video" });
  assert.equal(result.projectId, "saved-video");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["wait_for_video_project"]
  );
});
for (const terminal of ["timeout", "error", "canceled", "rendering"]) {
  test(`${terminal} never reaches successful output`, async () => {
    status = terminal;
    try {
      const graph = mediaWorkflow({ tools, saveProject: async () => {} });
      await assert.rejects(
        graph.invoke({ mode: "generate", projectId: "saved-image" }),
        /saved-image/
      );
    } finally {
      status = "complete";
    }
  });
}
test("Ambiguous creation error is not retried", async () => {
  calls.length = 0;
  creationError = true;
  try {
    const graph = mediaWorkflow({ tools, saveProject: () => assert.fail("No ID returned") });
    await assert.rejects(
      graph.invoke({ mode: "generate", prompt: "Product" }),
      /may already exist/
    );
    assert.equal(calls.length, 1);
  } finally {
    creationError = false;
  }
});
test("Missing downloads cannot be reported as success", async () => {
  missingDownloads = true;
  try {
    const graph = mediaWorkflow({ tools, saveProject: async () => {} });
    await assert.rejects(
      graph.invoke({ mode: "generate", projectId: "saved-image" }),
      /no usable download/
    );
  } finally {
    missingDownloads = false;
  }
});
test("Record write failure retains the ID and stops before waiting", async () => {
  calls.length = 0;
  const graph = mediaWorkflow({
    tools,
    saveProject: async () => {
      throw new Error("disk full");
    },
  });
  await assert.rejects(graph.invoke({ mode: "generate", prompt: "Product" }), /fixture-project/);
  assert.equal(calls.length, 1);
});

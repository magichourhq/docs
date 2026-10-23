import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const code = readFileSync(new URL("../dist/code.js", import.meta.url), "utf8");
function harness() {
  const messages: any[] = [],
    created: any[] = [];
  const original = {
    id: "original",
    name: "Product photo",
    width: 900,
    height: 900,
    removed: false,
    fills: [{ type: "SOLID" }],
    exportAsync: async () => new Uint8Array([1, 2, 3]),
  };
  const other = { ...original, id: "other" };
  const nodes: Record<string, any> = { original, other };
  const storage = new Map();
  const figma: any = {
    showUI() {},
    on() {},
    notify() {},
    ui: { postMessage: (message: any) => messages.push(message) },
    currentPage: { selection: [original], appendChild() {} },
    clientStorage: {
      getAsync: async (key: string) => storage.get(key),
      setAsync: async (key: string, value: unknown) => storage.set(key, value),
    },
    viewport: { center: { x: 500, y: 500 }, scrollAndZoomIntoView() {} },
    getNodeByIdAsync: async (id: string) => nodes[id] ?? null,
    createImage: () => ({
      hash: "image-hash",
      getSizeAsync: async () => ({ width: 640, height: 640 }),
    }),
    createRectangle: () => {
      const node = {
        id: "new",
        resize(w: number, h: number) {
          Object.assign(this, { width: w, height: h });
        },
      };
      created.push(node);
      return node;
    },
  };
  figma.currentPage.id = "page-1";
  figma.currentPage.type = "PAGE";
  Object.assign(original, { parent: figma.currentPage });
  Object.assign(other, { parent: figma.currentPage });
  runInNewContext(code, { figma, __html__: "<html></html>", Uint8Array });
  return { figma, messages, created, original, other, nodes, storage };
}
test("exports the original selection with a correlated request ID", async () => {
  const { figma, messages } = harness();
  await figma.ui.onmessage({ type: "export-selection", requestId: 4 });
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
    type: "selection-exported",
    requestId: 4,
    targetId: "original",
    bytes: [1, 2, 3],
  });
});
test("new image is centered and selected without replacing existing fills", async () => {
  const { figma, created, original } = harness();
  await figma.ui.onmessage({ type: "insert-image", bytes: [1, 2, 3] });
  assert.equal(created.length, 1);
  assert.equal(created[0].x, 180);
  assert.equal(created[0].width, 640);
  assert.equal(figma.currentPage.selection[0].id, "new");
  assert.equal(original.fills[0].type, "SOLID");
});
test("explicit replacement targets the original layer after selection changes", async () => {
  const { figma, original, other, created } = harness();
  figma.currentPage.selection = [other];
  await figma.ui.onmessage({
    type: "insert-image",
    targetId: "original",
    replace: true,
    bytes: [1, 2, 3],
  });
  assert.equal(original.fills[0].type, "IMAGE");
  assert.equal(other.fills[0].type, "SOLID");
  assert.equal(created.length, 0);
});
test("deleted replacement target reports an error without modifying the canvas", async () => {
  const { figma, nodes, created, messages } = harness();
  delete nodes.original;
  await figma.ui.onmessage({
    type: "insert-image",
    targetId: "original",
    replace: true,
    bytes: [1, 2, 3],
  });
  assert.equal(created.length, 0);
  assert.equal(messages[0].type, "plugin-error");
});
test("invalid byte messages are rejected", async () => {
  const { figma, created, messages } = harness();
  await figma.ui.onmessage({ type: "insert-image", bytes: [999] });
  assert.equal(created.length, 0);
  assert.equal(messages[0].type, "plugin-error");
});
test("only the project ID is persisted for resume", async () => {
  const { figma, storage } = harness();
  await figma.ui.onmessage({ type: "remember-project", id: "project-1" });
  assert.deepEqual([...storage.values()], ["project-1"]);
});

test("switching pages does not modify the original layer until the user returns", async () => {
  const { figma, original, messages } = harness();
  figma.currentPage = { id: "different-page", type: "PAGE", selection: [] };
  await figma.ui.onmessage({
    type: "insert-image",
    targetId: "original",
    replace: true,
    bytes: [1, 2, 3],
  });
  assert.equal(original.fills[0].type, "SOLID");
  assert.equal(messages[0].type, "plugin-error");
});

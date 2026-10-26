import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MagicHourWorkflow, imageRequest, ProjectError } from "../client.mjs";
import { run } from "../run.mjs";

const expires = new Date(Date.now() + 86_400_000).toISOString();
const output = {
  url: "https://outputs.example/test.png?signature=preserve-exactly",
  expires_at: expires,
};
function fixture(responses) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, "Unexpected API request");
      return new Response(JSON.stringify(next.body ?? next), { status: next.http ?? 200 });
    },
  };
}

test("submit persists accepted ID before polling and preserves exact download URL", async () => {
  const f = fixture([
    { id: "image_1", credits_charged: 5 },
    { id: "image_1", status: "queued" },
    { id: "image_1", status: "complete", credits_charged: 4, downloads: [output] },
  ]);
  let saved;
  const c = new MagicHourWorkflow({
    token: "test-token",
    fetchImpl: f.fetch,
    sleep: async () => {
      assert.equal(saved.id, "image_1");
    },
  });
  const receipt = await c.submit("generate", imageRequest("A mug"), {
    onAccepted: async (r) => {
      saved = r;
    },
  });
  assert.equal(f.calls.length, 1);
  const result = await c.wait(receipt);
  assert.equal(result.credits_charged, 4);
  assert.equal(result.downloads[0].url, output.url);
  assert.equal(result.review_required, true);
  assert.equal(f.calls.filter((x) => x.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(f.calls[0].body), imageRequest("A mug"));
  assert.equal(f.calls[0].redirect, "error");
});

test("polling failure preserves receipt, and a resumed wait never posts again", async () => {
  const f = fixture([
    { id: "image_2", credits_charged: 5 },
    new Error("network"),
    { id: "image_2", status: "complete", credits_charged: 5, downloads: [output] },
  ]);
  const c = new MagicHourWorkflow({ token: "test-token", fetchImpl: f.fetch });
  const receipt = await c.submit("generate", imageRequest("A mug"));
  await assert.rejects(
    c.wait(receipt),
    (e) => e instanceof ProjectError && e.receipt.id === "image_2"
  );
  assert.equal((await c.wait(receipt)).status, "complete");
  assert.equal(f.calls.filter((x) => x.method === "POST").length, 1);
});

test("bounded polling returns pending rather than resubmitting", async () => {
  const f = fixture([
    { id: "image_3", status: "rendering" },
    { id: "image_3", status: "rendering" },
  ]);
  const c = new MagicHourWorkflow({ token: "t", fetchImpl: f.fetch, sleep: async () => {} });
  const result = await c.wait({ id: "image_3", kind: "image" }, { maxPolls: 2 });
  assert.equal(result.pending, true);
  assert.equal(result.id, "image_3");
  assert.ok(f.calls.every((x) => x.method === "GET"));
});

for (const status of ["error", "canceled", "draft"]) {
  test(`${status} is terminal and retains the original ID`, async () => {
    const f = fixture([{ id: "video_1", status }]);
    const c = new MagicHourWorkflow({ token: "t", fetchImpl: f.fetch });
    await assert.rejects(
      c.wait({ id: "video_1", kind: "video" }),
      (e) => e.receipt.id === "video_1"
    );
    assert.equal(f.calls.length, 1);
  });
}

test("complete without usable media is not success", async () => {
  for (const downloads of [
    [],
    [{ url: "http://outputs.example/x.png", expires_at: expires }],
    [{ ...output, expires_at: "2020-01-01T00:00:00Z" }],
    [{ url: output.url }],
  ]) {
    const f = fixture([{ id: "image_1", status: "complete", downloads }]);
    const c = new MagicHourWorkflow({ token: "t", fetchImpl: f.fetch });
    await assert.rejects(c.wait({ id: "image_1", kind: "image" }), ProjectError);
  }
});

test("unknown status, wrong ID and unsafe receipt are rejected", async () => {
  for (const data of [
    { id: "other", status: "complete" },
    { id: "image_1", status: "new-state" },
  ]) {
    const f = fixture([data]);
    const c = new MagicHourWorkflow({ token: "t", fetchImpl: f.fetch });
    await assert.rejects(c.get({ id: "image_1", kind: "image" }), ProjectError);
    await assert.rejects(c.get({ id: "../other", kind: "image" }), TypeError);
  }
});

test("ambiguous create is never retried and does not expose the token", async () => {
  const f = fixture([new Error("socket timeout")]);
  const c = new MagicHourWorkflow({ token: "secret-token", fetchImpl: f.fetch });
  await assert.rejects(c.submit("generate", imageRequest("A mug")), (e) => {
    assert.equal(e.receipt.outcome, "unknown");
    assert.ok(!e.message.includes("secret-token"));
    return true;
  });
  assert.equal(f.calls.length, 1);
});

test("CLI exclusive intent prevents duplicate creates; resume uses only GET", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mh-workflow-"));
  const input = join(dir, "input.json");
  const receipt = join(dir, "receipt.json");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(input, JSON.stringify({ prompt: "A mug" }));
  const f = fixture([
    { id: "image_4", credits_charged: 5 },
    new Error("network"),
    { id: "image_4", status: "complete", credits_charged: 5, downloads: [output] },
  ]);
  try {
    await assert.rejects(run(["generate", receipt, input], { token: "t", fetchImpl: f.fetch }));
    assert.equal(JSON.parse(await readFile(receipt, "utf8")).id, "image_4");
    await assert.rejects(run(["generate", receipt, input], { token: "t", fetchImpl: f.fetch }), {
      code: "EEXIST",
    });
    assert.equal(
      (await run(["resume", receipt], { token: "t", fetchImpl: f.fetch })).status,
      "complete"
    );
    const stored = await readFile(receipt, "utf8");
    assert.ok(!stored.includes("signature="));
    assert.equal(f.calls.filter((x) => x.method === "POST").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

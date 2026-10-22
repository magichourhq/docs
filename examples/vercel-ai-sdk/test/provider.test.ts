import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProviderRegistry,
  generateImage,
  experimental_generateVideo as generateVideo,
} from "ai";
import { createMagicHour, MagicHourError } from "../src/index.js";
import { MagicHourClient } from "../src/client.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
function fixture(statuses = ["queued", "rendering", "complete"], failStatus?: number) {
  const calls: { url: string; method: string; headers: Headers; body: any }[] = [];
  let polls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input),
      method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ url, method, headers, body });
    if (!url.startsWith("https://api.magichour.ai")) {
      assert.equal(headers.has("Authorization"), false, "no API key sent to media storage");
      if (method === "PUT") {
        assert.ok(body instanceof Uint8Array);
        return new Response(null, { status: 200 });
      }
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    }
    assert.equal(headers.get("Authorization"), "Bearer test-key");
    if (url.endsWith("/files/upload-urls"))
      return Response.json({
        items: [
          { upload_url: "https://storage.example/upload", file_path: "api-assets/test/input.png" },
        ],
      });
    if (method === "POST")
      return failStatus
        ? new Response(null, { status: failStatus })
        : Response.json({ id: "project-1", credits_charged: 5 });
    const status = statuses[Math.min(polls++, statuses.length - 1)];
    return Response.json({
      id: "project-1",
      status,
      credits_charged: 5,
      downloads:
        status === "complete"
          ? [{ url: "https://storage.example/output.png", expires_at: "2099-01-01" }]
          : [],
    });
  };
  return {
    calls,
    provider: createMagicHour({ apiKey: "test-key", fetch: fetcher, pollIntervalMs: 0 }),
    fetcher,
  };
}
test("actual AI SDK generates an image, polls the image collection and returns metadata", async () => {
  const { calls, provider } = fixture();
  const result = await generateImage({
    model: provider.image("flux-2-klein"),
    prompt: "A mug",
    size: "1024x1024",
    maxRetries: 0,
  });
  assert.deepEqual(result.image.uint8Array, new Uint8Array(png));
  assert.equal(
    (result.providerMetadata.magichour.images[0] as { projectId: string }).projectId,
    "project-1"
  );
  const submitted = calls.find((c) => c.method === "POST")!;
  assert.deepEqual(submitted.body, {
    model: "flux-2-klein",
    image_count: 1,
    resolution: "1k",
    aspect_ratio: "1:1",
    style: { prompt: "A mug" },
  });
  assert.equal(calls.filter((c) => c.url.includes("/image-projects/")).length, 3);
});
test("provider works with AI SDK registry and batches images into single-image jobs", async () => {
  const { calls, provider } = fixture(["complete"]);
  const registry = createProviderRegistry({ magichour: provider });
  const result = await generateImage({
    model: registry.imageModel("magichour:z-image-turbo"),
    prompt: "Mug",
    n: 2,
    maxRetries: 0,
  });
  assert.equal(result.images.length, 2);
  assert.equal(calls.filter((c) => c.method === "POST").length, 2);
});
test("actual AI SDK text-to-video uses the video collection and returns bytes", async () => {
  const { calls, provider } = fixture();
  const result = await generateVideo({
    model: provider.video("ltx-2.5"),
    prompt: "Waves",
    duration: 1,
    resolution: "1280x720",
    generateAudio: false,
    maxRetries: 0,
  });
  assert.ok(result.video.uint8Array.length);
  assert.deepEqual(calls.find((c) => c.method === "POST")!.body, {
    model: "ltx-2.5",
    end_seconds: 1,
    resolution: "720p",
    style: { prompt: "Waves" },
    aspect_ratio: "16:9",
    audio: false,
  });
  assert.equal(calls.filter((c) => c.url.includes("/video-projects/")).length, 3);
});
test("image-to-video uploads actual bytes and sends the returned asset path", async () => {
  const { calls, provider } = fixture(["complete"]);
  await generateVideo({
    model: provider.video("ltx-2.5"),
    prompt: { image: png, text: "Animate" },
    duration: 1,
    maxRetries: 0,
  });
  assert.equal(calls[0].url, "https://api.magichour.ai/v1/files/upload-urls");
  assert.equal(calls[1].method, "PUT");
  const create = calls.find((c) => c.url.endsWith("/image-to-video"))!;
  assert.equal(create.body.assets.image_file_path, "api-assets/test/input.png");
  assert.equal(create.body.aspect_ratio, undefined);
});
test("image URL goes directly to Magic Hour without a local download", async () => {
  const { calls, provider } = fixture(["complete"]);
  await generateVideo({
    model: provider.video(),
    prompt: { image: "https://example.com/image.png", text: "Animate" },
    aspectRatio: "adaptive",
    maxRetries: 0,
  });
  assert.equal(calls[0].body.assets.image_file_path, "https://example.com/image.png");
});
for (const status of ["error", "canceled"])
  test(`terminal ${status} preserves project ID without recreating the job`, async () => {
    const { calls, provider } = fixture([status]);
    await assert.rejects(
      () => generateImage({ model: provider.image(), prompt: "Mug", maxRetries: 3 }),
      (error) =>
        error instanceof MagicHourError &&
        error.projectId === "project-1" &&
        error.isRetryable === false
    );
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
  });
for (const code of [401, 402, 429, 500])
  test(`HTTP ${code} does not retry paid POSTs`, async () => {
    const { calls, provider } = fixture([], code);
    await assert.rejects(() =>
      generateImage({ model: provider.image(), prompt: "Mug", maxRetries: 3 })
    );
    assert.equal(calls.length, 1);
  });
test("lost submission response reports unknown acceptance without automatic retries", async () => {
  let calls = 0;
  const provider = createMagicHour({
    apiKey: "test-key",
    fetch: async () => {
      calls++;
      throw new TypeError("network");
    },
  });
  await assert.rejects(
    () => generateImage({ model: provider.image(), prompt: "Mug", maxRetries: 3 }),
    /Acceptance is unknown/
  );
  assert.equal(calls, 1);
});
test("abort after acceptance preserves ID and never starts another job", async () => {
  const { calls, fetcher } = fixture(["rendering"]);
  const controller = new AbortController();
  const provider = createMagicHour({
    apiKey: "test-key",
    fetch: fetcher,
    pollIntervalMs: 0,
    onProjectCreated: () => controller.abort(),
  });
  await assert.rejects(
    () =>
      generateImage({
        model: provider.image(),
        prompt: "Mug",
        abortSignal: controller.signal,
        maxRetries: 0,
      }),
    (error) => error instanceof MagicHourError && error.projectId === "project-1"
  );
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
});
test("a saved project can be resumed with GET only", async () => {
  const { calls, fetcher } = fixture(["complete"]);
  const client = new MagicHourClient({ apiKey: "test-key", fetch: fetcher });
  assert.equal((await client.wait("project-1", "image", client.signal())).status, "complete");
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("unsupported size, seed, model and options fail before a paid request", async () => {
  const { calls, provider } = fixture();
  await assert.rejects(() =>
    generateImage({ model: provider.image(), prompt: "Mug", size: "500x500", maxRetries: 0 })
  );
  await assert.rejects(() =>
    generateImage({ model: provider.image(), prompt: "Mug", seed: 1, maxRetries: 0 })
  );
  await assert.rejects(() =>
    generateImage({
      model: provider.image(),
      prompt: "Mug",
      providerOptions: { magichour: { image_count: 16 } },
      maxRetries: 0,
    })
  );
  assert.throws(() => provider.imageModel("not-a-model"));
  await assert.rejects(() =>
    generateVideo({ model: provider.video(), prompt: "Mug", fps: 30, maxRetries: 0 })
  );
  assert.equal(calls.length, 0);
});
test("failed downloads retain the project ID", async () => {
  const { fetcher } = fixture(["complete"]);
  const provider = createMagicHour({
    apiKey: "test-key",
    fetch: async (url, init) =>
      String(url).startsWith("https://storage.")
        ? new Response(null, { status: 403 })
        : fetcher(url, init),
  });
  await assert.rejects(
    () => generateImage({ model: provider.image(), prompt: "Mug", maxRetries: 0 }),
    (error) => error instanceof MagicHourError && error.projectId === "project-1"
  );
});

test("awaits durable project-ID persistence before polling", async () => {
  const { calls, fetcher } = fixture(["complete"]);
  let release!: () => void;
  let accepted!: () => void;
  const saved = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const provider = createMagicHour({
    apiKey: "test-key",
    fetch: fetcher,
    onProjectCreated: async () => {
      accepted();
      await saved;
    },
  });
  const pending = generateImage({ model: provider.image(), prompt: "Mug", maxRetries: 0 });
  await created;
  assert.equal(calls.length, 1, "only submission happens before persistence completes");
  release();
  await pending;
  assert.ok(calls.some((c) => c.url.includes("/image-projects/")));
});

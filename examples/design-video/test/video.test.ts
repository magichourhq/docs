import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VideoService,
  VideoPanel,
  type EditorHost,
  type JobStore,
  type VideoOptions,
  validateImage,
} from "../shared/video";
const png = new Blob(
  [
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64"
    ),
  ],
  { type: "image/png" }
);
const mp4 = Uint8Array.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]);
const options: VideoOptions = {
  prompt: "A slow camera push in",
  duration: 1,
  resolution: "480p",
  aspectRatio: "16:9",
};
function fixture(
  overrides: {
    status?: number;
    pending?: boolean;
    saveFails?: boolean;
    downloadFails?: boolean;
    lostPost?: boolean;
  } = {}
) {
  const calls: { url: string; init: RequestInit }[] = [];
  let saved: string | null = null;
  const store: JobStore = {
    load: async () => saved,
    save: async (id) => {
      if (overrides.saveFails) throw Error("Storage unavailable");
      saved = id;
    },
  };
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const headers = new Headers(init.headers);
    if (url.startsWith("https://api.magichour.ai/"))
      assert.equal(headers.get("Authorization"), "Bearer controlled-key");
    else assert.equal(headers.has("Authorization"), false);
    if (url.endsWith("upload-urls"))
      return Response.json({
        items: [
          { upload_url: "https://storage.example/upload", file_path: "api-assets/source.png" },
        ],
      });
    if (url.endsWith("/upload")) return new Response(null, { status: 200 });
    if (init.method === "POST") {
      if (overrides.lostPost) throw new TypeError("Network failed");
      if (overrides.status) return new Response(null, { status: overrides.status });
      return Response.json({ id: "video-accepted" });
    }
    if (url.includes("/video-projects/")) {
      assert.equal(saved, "video-accepted", "accepted ID must be persisted before polling");
      return Response.json({
        id: "video-accepted",
        status: overrides.pending ? "rendering" : "complete",
        credits_charged: 24,
        downloads: [
          { url: "https://storage.example/output.mp4", expires_at: "2030-01-01T00:00:00Z" },
        ],
      });
    }
    return new Response(overrides.downloadFails ? null : mp4, {
      status: overrides.downloadFails ? 403 : 200,
    });
  };
  const service = new VideoService({
    apiKey: "controlled-key",
    platform: "test",
    store,
    fetch: fetcher,
    pollIntervalMs: 1,
    timeoutMs: 1000,
  });
  return {
    calls,
    store,
    fetcher,
    service,
    get saved() {
      return saved;
    },
    set saved(id: string | null) {
      saved = id;
    },
  };
}
test("image-to-video uploads binary bytes without auth to storage, persists ID, retrieves completed MP4", async () => {
  const f = fixture();
  const result = await f.service.generate(options, { blob: png, label: "Selected" });
  assert.equal(result.id, "video-accepted");
  assert.equal(result.credits, 24);
  assert.equal(result.blob.type, "video/mp4");
  const post = f.calls.find((c) => c.url.endsWith("/image-to-video"))!;
  const body = JSON.parse(post.init.body as string);
  assert.equal(body.model, "ltx-2.5");
  assert.equal(body.assets.image_file_path, "api-assets/source.png");
  assert.equal(body.audio, false);
  assert.equal(body.aspect_ratio, undefined);
  assert.deepEqual(
    new Uint8Array(f.calls.find((c) => c.url.endsWith("/upload"))!.init.body as Uint8Array),
    new Uint8Array(await png.arrayBuffer())
  );
});
test("creative brief uses text-to-video and explicit aspect ratio without an upload", async () => {
  const f = fixture();
  await f.service.generate({ ...options, aspectRatio: "9:16" });
  assert.equal(
    f.calls.some((c) => c.url.endsWith("upload-urls")),
    false
  );
  assert.equal(
    JSON.parse(f.calls.find((c) => c.url.endsWith("/text-to-video"))!.init.body as string)
      .aspect_ratio,
    "9:16"
  );
});
for (const status of [401, 402, 429, 500])
  test(`HTTP ${status} never retries a paid generation`, async () => {
    const f = fixture({ status });
    await assert.rejects(f.service.generate(options), new RegExp(`HTTP ${status}`));
    assert.equal(f.calls.filter((c) => c.init.method === "POST").length, 1);
  });
test("lost submission response reports unknown acceptance without retrying", async () => {
  const f = fixture({ lostPost: true });
  await assert.rejects(f.service.generate(options), /Acceptance is unknown/);
  assert.equal(f.calls.length, 1);
});
test("failed durable storage retains the accepted project ID and stops before polling", async () => {
  const f = fixture({ saveFails: true });
  await assert.rejects(f.service.generate(options), (e: any) => e.projectId === "video-accepted");
  assert.equal(f.calls.length, 1);
});
test("stopping after acceptance retains ID and GET-only recovery never rebills", async () => {
  const f = fixture({ pending: true }),
    abort = new AbortController();
  const p = f.service.generate(options, undefined, abort.signal);
  setTimeout(() => abort.abort(), 10);
  await assert.rejects(p, (e: any) => e.projectId === "video-accepted");
  const recovered = fixture();
  recovered.saved = f.saved;
  await recovered.service.retrieve(f.saved!);
  assert.equal(
    recovered.calls.every((c) => !c.init.method || c.init.method === "GET"),
    true
  );
});
test("download failure keeps the accepted ID", async () => {
  const f = fixture({ downloadFails: true });
  await assert.rejects(f.service.generate(options), (e: any) => e.projectId === "video-accepted");
});
test("invalid image bytes and options fail before upload or paid POST", async () => {
  const f = fixture();
  await assert.rejects(f.service.generate({ ...options, duration: 0 }));
  await assert.rejects(
    f.service.generate(options, {
      blob: new Blob(["not png"], { type: "image/png" }),
      label: "bad",
    })
  );
  assert.equal(f.calls.length, 0);
  await assert.rejects(validateImage(new Blob(["svg"], { type: "image/svg+xml" })));
});
test("panel blocks generation until saved jobs load, and while an accepted ID exists", async () => {
  const f = fixture();
  f.saved = "video-accepted";
  const host: EditorHost = {
    name: "Test",
    selectionLabel: "Test",
    store: f.store,
    insertVideo: async () => {},
  };
  const panel = new VideoPanel(host, { fetch: f.fetcher });
  await panel.generate("controlled-key", options);
  assert.equal(f.calls.length, 0);
  await panel.init();
  await panel.generate("controlled-key", options);
  assert.equal(f.calls.length, 0);
  assert.match(panel.state.message, /Resume the saved project/);
});
test("panel serializes simultaneous clicks into one paid POST", async () => {
  const f = fixture();
  const panel = new VideoPanel(
    { name: "Test", selectionLabel: "Test", store: f.store, insertVideo: async () => {} },
    { fetch: f.fetcher }
  );
  await panel.init();
  await Promise.all([
    panel.generate("controlled-key", options),
    panel.generate("controlled-key", options),
  ]);
  assert.equal(f.calls.filter((c) => c.url.endsWith("/text-to-video")).length, 1);
});
test("host insertion failure leaves the result resumable without regeneration", async () => {
  const f = fixture();
  let inserts = 0;
  const panel = new VideoPanel(
    {
      name: "Test",
      selectionLabel: "Test",
      store: f.store,
      insertVideo: async () => {
        inserts++;
        throw Error("host response lost");
      },
    },
    { fetch: f.fetcher }
  );
  await panel.init();
  await panel.generate("controlled-key", options);
  const posts = f.calls.filter((c) => c.init.method === "POST").length;
  await panel.insert("controlled-key");
  assert.equal(inserts, 1);
  assert.match(panel.state.message, /Check your design/);
  assert.equal(panel.state.savedId, "video-accepted");
  assert.equal(f.calls.filter((c) => c.init.method === "POST").length, posts);
});

test("editor permission failure prevents a paid submission", async () => {
  const f = fixture();
  const panel = new VideoPanel(
    {
      name: "Test",
      selectionLabel: "Test",
      store: f.store,
      prepareGeneration: async () => {
        throw new Error("Editor is read only");
      },
      insertVideo: async () => {},
    },
    { fetch: f.fetcher }
  );
  await panel.init();
  await panel.generate("controlled-key", options);
  assert.equal(f.calls.length, 0);
  assert.match(panel.state.message, /read only/);
});

test("manual resume still retrieves an existing project when local saving fails", async () => {
  const f = fixture({ saveFails: true });
  f.saved = "video-accepted";
  const panel = new VideoPanel(
    { name: "Test", selectionLabel: "Test", store: f.store, insertVideo: async () => {} },
    { fetch: f.fetcher }
  );
  await panel.init();
  await panel.resume("controlled-key", "video-accepted");
  assert.equal(panel.state.result?.id, "video-accepted");
  assert.match(panel.state.message, /Copy the project ID/);
  assert.equal(
    f.calls.some((c) => c.init.method === "POST"),
    false
  );
});

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Ajv from "ajv";
import wait from "../wait-for-result.mjs";

// Use the same Axios instance as @pipedream/platform, with HTTP intercepted.
const require = createRequire(import.meta.url);
const axios = require("axios");
const originalAdapter = axios.defaults.adapter;
afterEach(() => {
  axios.defaults.adapter = originalAdapter;
});
const openapi = JSON.parse(
  await readFile(new URL("../../../api-reference/openapi.json", import.meta.url))
);
const ajv = new Ajv({ strict: false, validateFormats: false });

function context(overrides = {}) {
  const exports = {};
  const reruns = [];
  return {
    exports,
    reruns,
    context: { JIT: false, run: { runs: 1 }, ...overrides },
    export: (name, value) => {
      exports[name] = value;
    },
    flow: {
      rerun: (...args) => {
        reruns.push(args);
      },
    },
  };
}

function respond(body, inspect = () => {}) {
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    inspect(config);
    return { data: body, status: 200, statusText: "OK", headers: {}, config };
  };
  return () => calls;
}

const props = {
  apiKey: " test-secret ",
  name: "Catalog SKU 123",
  prompt: "A ceramic mug on a white table",
  image: "https://example.com/product.png",
  duration: 5,
  model: "default",
  aspectRatio: "1:1",
  sourceFace: "https://example.com/consented-face.png",
  targetImage: "https://example.com/portrait.png",
  audio: "https://example.com/approved-voice.mp3",
  video: "https://example.com/approved-video.mp4",
};

for (const [file, endpoint, projectType] of [
  ["generate-image", "ai-image-generator", "image"],
  ["animate-image", "image-to-video", "video"],
  ["generate-video", "text-to-video", "video"],
  ["edit-image", "ai-image-editor", "image"],
  ["face-swap-photo", "face-swap-photo", "image"],
  ["talking-photo", "ai-talking-photo", "video"],
  ["lip-sync", "lip-sync", "video"],
]) {
  test(`${file} sends one schema-valid generation request and preserves its ID`, async () => {
    const component = (await import(`../${file}.mjs`)).default;
    const validate = ajv.compile(
      openapi.paths[`/v1/${endpoint}`].post.requestBody.content["application/json"].schema
    );
    const calls = respond({ id: "project-123", credits: 5 }, (config) => {
      assert.equal(config.url, `https://api.magichour.ai/v1/${endpoint}`);
      assert.equal(config.method, "post");
      assert.equal(config.headers.Authorization, "Bearer test-secret");
      assert.equal(config.maxRedirects, 0);
      assert.ok(validate(JSON.parse(config.data)), JSON.stringify(validate.errors));
    });
    const $ = context();
    const result = await component.run.call(props, { $ });
    assert.equal(calls(), 1);
    assert.equal(result.project_id, "project-123");
    assert.equal(result.project_type, projectType);
    assert.equal($.reruns.length, 0);
    assert.ok(!JSON.stringify({ result, exports: $.exports }).includes("test-secret"));
  });
}

test("polling an unfinished project only schedules a GET rerun", async () => {
  const $ = context();
  const calls = respond({ status: "rendering" }, (config) => {
    assert.equal(config.method, "get");
    assert.equal(config.url, "https://api.magichour.ai/v1/video-projects/project-123");
  });
  const result = await wait.run.call(
    { apiKey: "test-secret", projectId: "project-123", projectType: "video" },
    { $ }
  );
  assert.equal(result, undefined);
  assert.equal(calls(), 1);
  assert.deepEqual($.reruns, [[60000, null, 20]]);
});

test("completed project passes every download to the destination", async () => {
  const $ = context();
  respond({
    status: "complete",
    downloads: [{ url: "https://example.com/1.png" }, { url: "https://example.com/2.png" }],
  });
  const result = await wait.run.call(
    { apiKey: "test-secret", projectId: "project-123", projectType: "image" },
    { $ }
  );
  assert.deepEqual(result.output_urls, ["https://example.com/1.png", "https://example.com/2.png"]);
  assert.equal(result.output_url, result.output_urls[0]);
  assert.equal($.reruns.length, 0);
});

for (const [status, override, message] of [
  ["error", {}, /status error/],
  ["canceled", {}, /status canceled/],
  ["complete", {}, /without a download/],
  ["unexpected", {}, /unexpected status/],
  ["queued", { JIT: true }, /deploy the workflow/],
  ["rendering", { run: { runs: 21 } }, /20 minutes.*Reuse this ID/],
]) {
  test(`stops downstream work for ${status} ${JSON.stringify(override)}`, async () => {
    const $ = context(override);
    respond({ status });
    await assert.rejects(
      wait.run.call(
        { apiKey: "test-secret", projectId: "project-123", projectType: "video" },
        { $ }
      ),
      message
    );
    assert.equal($.reruns.length, 0);
  });
}

test("ambiguous network failure strips credentials and never retries generation", async () => {
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    const error = new Error("socket timeout");
    error.config = config;
    throw error;
  };
  const component = (await import("../generate-image.mjs")).default;
  await assert.rejects(component.run.call(props, { $: context() }), (error) => {
    assert.match(error.message, /request may already have been accepted/);
    assert.ok(!JSON.stringify(error).includes("test-secret"));
    assert.equal(error.config, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test("missing project ID stops the workflow without retrying", async () => {
  const calls = respond({ status: "queued" });
  const component = (await import("../generate-image.mjs")).default;
  await assert.rejects(component.run.call(props, { $: context() }), /did not return a project ID/);
  assert.equal(calls(), 1);
});

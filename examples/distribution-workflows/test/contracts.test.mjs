import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { imageRequest } from "../client.mjs";

const spec = JSON.parse(
  await readFile(new URL("../../../api-reference/openapi.json", import.meta.url), "utf8")
);
const endpoints = {
  generate: "/v1/ai-image-generator",
  edit: "/v1/ai-image-editor",
  animate: "/v1/image-to-video",
  lipsync: "/v1/lip-sync",
};

function checkRequiredAndEnums(value, schema, path) {
  for (const field of schema.required ?? []) assert.ok(field in value, `Missing ${path}.${field}`);
  for (const [key, data] of Object.entries(value)) {
    const field = schema.properties?.[key];
    assert.ok(field, `Unknown ${path}.${key}`);
    if (field.enum) assert.ok(field.enum.includes(data), `Invalid enum ${path}.${key}`);
    if (field.minimum !== undefined)
      assert.ok(data >= field.minimum, `Below minimum ${path}.${key}`);
    if (field.maximum !== undefined)
      assert.ok(data <= field.maximum, `Above maximum ${path}.${key}`);
    if (field.type === "object") checkRequiredAndEnums(data, field, `${path}.${key}`);
  }
}

for (const [tool, endpoint] of Object.entries(endpoints)) {
  test(`${tool} request matches the checked-in current OpenAPI contract`, async () => {
    const raw = JSON.parse(
      await readFile(new URL(`../requests/${tool}.json`, import.meta.url), "utf8")
    );
    const request = tool === "generate" ? imageRequest(raw.prompt, raw) : raw;
    const schema = spec.paths[endpoint].post.requestBody.content["application/json"].schema;
    checkRequiredAndEnums(request, schema, tool);
  });
}

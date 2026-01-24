// @ts-check

const fs = require("fs");

function stripDeprecated(value) {
  if (Array.isArray(value)) {
    return value.map(stripDeprecated).filter((v) => v !== undefined);
  }

  if (value && typeof value === "object") {
    // Drop this node entirely if deprecated
    if (value.deprecated === true) {
      return undefined;
    }

    const result = {};

    for (const [key, val] of Object.entries(value)) {
      const cleaned = stripDeprecated(val);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }

    return result;
  }

  return value;
}

// Process both OpenAPI specs
const specs = ["api-reference/openapi.json", "webhook-reference/openapi.json"];

specs.forEach((specPath) => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const cleaned = stripDeprecated(spec);
  fs.writeFileSync(specPath, JSON.stringify(cleaned));
});

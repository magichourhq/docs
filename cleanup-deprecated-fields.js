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

const spec = JSON.parse(fs.readFileSync("openapi.json", "utf8"));
const cleaned = stripDeprecated(spec);

fs.writeFileSync("openapi.json", JSON.stringify(cleaned, null, 2));

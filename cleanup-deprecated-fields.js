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

    // Keep JSON Schema objects valid after deprecated properties are removed.
    if (result.properties && Array.isArray(result.required)) {
      result.required = result.required.filter((key) =>
        Object.prototype.hasOwnProperty.call(result.properties, key)
      );

      if (result.required.length === 0) {
        delete result.required;
      }
    }

    return result;
  }

  return value;
}

/**
 * Deprecated property names that survive nowhere else in the same schema.
 *
 * A name can be deprecated in one place and current in another: `style.model` is deprecated on the
 * image editor while the top-level `model` is not, and the code samples only show us a bare name.
 * Scrubbing on the leaf name alone would delete the wrong line, so a name is only a candidate when
 * the schema keeps no live property by that name.
 */
function deprecatedOnlyNames(schema, dead = new Set(), live = new Set()) {
  if (!schema || typeof schema !== "object") return { dead, live };

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (property.deprecated === true) {
      dead.add(name);
    } else {
      live.add(name);
      deprecatedOnlyNames(property, dead, live);
    }
  }

  if (schema.items) deprecatedOnlyNames(schema.items, dead, live);

  return { dead, live };
}

const camelCase = (name) => name.replace(/_(.)/g, (_, char) => char.toUpperCase());

/** Index just past a value that starts at `from`, and whether a trailing comma came with it. */
function endOfValue(source, from) {
  let depth = 0;

  for (let i = from; i < source.length; i++) {
    const char = source[i];

    if (char === '"' || char === "'" || char === "`") {
      i++;
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }

    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) {
      if (depth === 0) return { end: i, comma: false };
      depth--;
    } else if (char === "," && depth === 0) {
      return { end: i + 1, comma: true };
    }
  }

  return { end: source.length, comma: false };
}

const emptyObjects = (source) => (source.match(/\{\s*\}/g) ?? []).length;

/** Remove every `name: value` or `name=value` binding from one code sample. */
function removeBinding(source, name) {
  let text = source;

  for (const variant of new Set([name, camelCase(name)])) {
    const binding = new RegExp(`(^|[\\s,{\\[(])(["'\`]?)${variant}\\2\\s*[:=]`);

    for (;;) {
      const match = binding.exec(text);
      if (!match) break;

      const keyStart = match.index + match[1].length;
      const { end, comma } = endOfValue(text, match.index + match[0].length);

      let from = keyStart;
      let to = end;

      // Take the whole line when nothing else shares it, so no blank line is left behind.
      const lineStart = text.lastIndexOf("\n", from - 1) + 1;
      if (/^[ \t]*$/.test(text.slice(lineStart, from))) {
        from = lineStart;
        const newline = text.slice(to).match(/^[ \t]*\r?\n/);
        if (newline) to += newline[0].length;
      }

      // A binding that ended at a closing delimiter leaves the comma before it dangling.
      const head = comma ? text.slice(0, from) : text.slice(0, from).replace(/,(\s*)$/, "$1");
      text = head + text.slice(to);
    }
  }

  return text;
}

/**
 * Scrub deprecated parameters out of the code samples attached to each operation.
 *
 * `stripDeprecated` removes them from the request schemas but leaves `x-codeSamples` untouched, so
 * the samples go on passing parameters the reference no longer documents. Copy-pasting one is the
 * fastest way for a reader, or an agent, to send a request the docs disagree with.
 *
 * A binding is only removed when the sample still reads as a working call without it. Where a
 * deprecated parameter was replaced rather than dropped, deleting it strands the sample without an
 * input, which is worse than leaving it stale, so those go to code-sample-migrations.json instead.
 */
function scrubCodeSamples(spec, original) {
  const removed = [];
  const needsMigration = [];

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const samples = operation["x-codeSamples"];
      // The flags live in the original: `stripDeprecated` has already deleted them from `spec`.
      const schema =
        original.paths?.[path]?.[method]?.requestBody?.content?.["application/json"]?.schema;
      if (!Array.isArray(samples) || !schema) continue;

      const { dead, live } = deprecatedOnlyNames(schema);
      const candidates = [...dead].filter((name) => !live.has(name));
      if (candidates.length === 0) continue;

      for (const sample of samples) {
        for (const name of candidates) {
          const source = sample.source ?? "";
          const scrubbed = removeBinding(source, name);
          if (scrubbed === source) continue;

          // A parameter that was replaced rather than dropped is the only thing its object holds,
          // so removing it hollows the object out. That sample needs the replacement written in,
          // which is a judgement call, not a deletion.
          if (emptyObjects(scrubbed) > emptyObjects(source)) {
            needsMigration.push(`${path} (${sample.lang}): ${name}`);
            continue;
          }

          sample.source = scrubbed;
          removed.push(`${path} (${sample.lang}): ${name}`);
        }
      }
    }
  }

  return { removed, needsMigration };
}

/** Apply the hand-written rewrites for parameters that were replaced rather than dropped. */
function applyMigrations(spec, migrations) {
  const applied = [];
  const stale = [];

  for (const migration of migrations) {
    const { path, method, lang, find, replace } = migration;
    const sample = spec.paths?.[path]?.[method]?.["x-codeSamples"]?.find((s) => s.lang === lang);

    if (!sample?.source.includes(find)) {
      // Already in the shape we want, so upstream fixed it and the entry has nothing left to do.
      if (!sample?.source.includes(replace)) stale.push(`${path} (${lang}): ${migration.reason}`);
      continue;
    }

    sample.source = sample.source.split(find).join(replace);
    applied.push(`${path} (${lang}): ${migration.reason}`);
  }

  return { applied, stale };
}

// Process both OpenAPI specs
const specs = ["api-reference/openapi.json", "webhook-reference/openapi.json"];

const { migrations } = JSON.parse(fs.readFileSync("code-sample-migrations.json", "utf8"));

specs.forEach((specPath) => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const cleaned = stripDeprecated(spec);
  // Migrations run first: a rewritten sample no longer holds the parameter the scrubber looks for.
  const { applied, stale } = applyMigrations(
    cleaned,
    migrations.filter((m) => cleaned.paths?.[m.path])
  );
  const { removed, needsMigration } = scrubCodeSamples(cleaned, spec);

  for (const entry of [...applied, ...removed]) {
    console.log(`cleaned sample: ${entry}`);
  }

  for (const entry of needsMigration) {
    console.warn(
      `sample still passes a deprecated parameter and dropping it would empty the object it ` +
        `belongs to; add an entry to code-sample-migrations.json: ${entry}`
    );
  }

  for (const entry of stale) {
    console.warn(`migration no longer matches and can probably be deleted: ${entry}`);
  }

  fs.writeFileSync(specPath, JSON.stringify(cleaned));
});

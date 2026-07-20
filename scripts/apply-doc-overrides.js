// @ts-check

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const specPath = path.join(root, "api-reference/openapi.json");
const metricsPath = path.join(root, "data/processing-times.json");
const outputPath = path.join(root, "api-reference/processing-times.mdx");
const marker = "<!-- processing-time -->";

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));

function listMdxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listMdxFiles(entryPath)
      : entry.name.endsWith(".mdx")
        ? [entryPath]
        : [];
  });
}

const endpointPages = new Map();

for (const filePath of listMdxFiles(path.join(root, "api-reference"))) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/^openapi:\s+post\s+(\S+)$/m);

  if (match) {
    endpointPages.set(
      match[1],
      `/${path
        .relative(root, filePath)
        .replaceAll(path.sep, "/")
        .replace(/\.mdx$/, "")}`
    );
  }
}

for (const category of metrics.categories) {
  for (const endpoint of category.endpoints) {
    const operation = spec.paths?.[endpoint.path]?.post;

    if (!operation) {
      throw new Error(`POST ${endpoint.path} not found in OpenAPI spec`);
    }

    const existingDescription = (operation.description || "")
      .replace(new RegExp(`\\n*${marker}[\\s\\S]*$`), "")
      .trimEnd();
    const note = endpoint.note ? ` ${endpoint.note}` : "";
    const processingTime = [
      marker,
      `**Observed processing time (${metrics.window}):** p50 ${endpoint.p50}; p95 ${endpoint.p95}.`,
      `${metrics.methodology} These values are not an SLA.${note}`,
      "[See processing times for all endpoints](/api-reference/processing-times).",
    ].join("\n\n");

    operation.description = existingDescription
      ? `${existingDescription}\n\n${processingTime}`
      : processingTime;
  }
}

const updated = new Date(`${metrics.asOf}T00:00:00Z`).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const lines = [
  "---",
  'title: "Processing Times"',
  'description: "Observed p50 and p95 end-to-end processing times for Magic Hour API endpoints."',
  "---",
  "",
  `These values cover the **${metrics.window} ending ${updated}**. ${metrics.methodology}`,
  "",
  "<Warning>",
  "  Processing time varies with queue load, input duration, resolution, and model complexity. These",
  "  values describe observed customer traffic and are not an SLA. Build timeout handling into every",
  "  integration.",
  "</Warning>",
  "",
  "**p50** means half of completed jobs finished within this time. **p95** means 95% finished within",
  "this time.",
  "",
];

for (const category of metrics.categories) {
  lines.push(
    `## ${category.name} endpoints`,
    "",
    "| Endpoint | p50 | p95 |",
    "| --- | ---: | ---: |"
  );

  for (const endpoint of category.endpoints) {
    const page = endpointPages.get(endpoint.path);
    const label = `\`POST ${endpoint.path}\``;
    const linkedLabel = page ? `[${label}](${page})` : label;
    lines.push(`| ${linkedLabel} | ${endpoint.p50} | ${endpoint.p95} |`);
  }

  const notes = category.endpoints.filter((endpoint) => endpoint.note);
  if (notes.length) {
    lines.push("");
    for (const endpoint of notes) {
      lines.push(`<Note>**POST ${endpoint.path}:** ${endpoint.note}</Note>`);
    }
  }

  lines.push("");
}

lines.push(
  "## Integration guidance",
  "",
  "- Use webhooks for long-running jobs instead of aggressive polling.",
  "- If polling, use the interval recommended in the integration guide and apply exponential backoff.",
  "- Set timeouts above observed p95 when your product can tolerate the wait.",
  "- Treat every latency figure as directional, not guaranteed.",
  "",
  "[Learn how to monitor jobs and handle timeouts →](/integration/overview)",
  ""
);

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
fs.writeFileSync(outputPath, lines.join("\n"));

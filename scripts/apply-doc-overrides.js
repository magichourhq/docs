// @ts-check

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const specPath = path.join(root, "api-reference/openapi.json");
const metricsPath = path.join(root, "data/processing-times.json");
const outputPath = path.join(root, "api-reference/processing-times.mdx");
const legacyMarker = "<!-- processing-time -->";
const processingTimeHeading = "### Typical completion time";
/** @type {Record<string, string>} */
const descriptionOverrides = {
  "/v1/face-swap": `Replace faces in a video using a source image. The target can be an uploaded video or a YouTube URL.

### Basic workflow

1. Upload the source face image and target video with [Generate Upload URLs](/api-reference/files/generate-asset-upload-urls).
2. Set \`assets.video_source\` to \`file\` or \`youtube\`, then provide the matching video input.
3. Use \`all-faces\` to apply one source face everywhere, or \`individual-faces\` with \`face_mappings\` to control each replacement.
4. Create the job, wait for it to complete, then download the result from \`downloads\`.

### Useful options

- \`start_seconds\` and \`end_seconds\` select the part of the video to process.
- \`style.version\` selects a specific model version; \`default\` uses the recommended version.
- \`face_swap_mode\` controls whether one or multiple detected faces are replaced.

### Cost

Credits are based on the frames rendered. The create response includes an estimate; the completed project contains the final charge.

[See Face Swap examples →](https://magichour.ai/products/face-swap)`,
  "/v1/ai-voice-generator": `Convert text into spoken audio using a selected voice.

### Basic workflow

1. Put the text to speak in \`style.prompt\`.
2. Choose a supported \`style.voice_name\`.
3. Create the job, wait for it to complete, then download the generated audio from \`downloads\`.

### Cost

Text costs 0.05 credits per character, rounded up to the nearest whole credit.`,
};

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

    const existingDescription = (descriptionOverrides[endpoint.path] || operation.description || "")
      .replace(
        new RegExp(
          `\\n*(?:${legacyMarker}|${processingTimeHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[\\s\\S]*$`
        ),
        ""
      )
      .trimEnd();
    const note = endpoint.note ? ` ${endpoint.note}` : "";
    const processingTime = [
      processingTimeHeading,
      `**${endpoint.p50} median** over the last 30 days, measured from request to completion (queueing included).`,
      `Actual time varies with input size, job complexity, and demand. This is not an SLA.${note}`,
      "[Compare all endpoint times →](/api-reference/processing-times)",
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
  'description: "Observed median end-to-end processing times for Magic Hour API endpoints."',
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
  "**p50 (median)** means half of completed jobs finished within this time.",
  "",
];

for (const category of metrics.categories) {
  lines.push(`## ${category.name} endpoints`, "", "| Endpoint | Median (p50) |", "| --- | ---: |");

  for (const endpoint of category.endpoints) {
    const page = endpointPages.get(endpoint.path);
    const label = `\`POST ${endpoint.path}\``;
    const linkedLabel = page ? `[${label}](${page})` : label;
    lines.push(`| ${linkedLabel} | ${endpoint.p50} |`);
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
  "- Set timeouts based on your product's tolerance for delayed jobs.",
  "- Treat every latency figure as directional, not guaranteed.",
  "",
  "[Learn how to monitor jobs and handle timeouts →](/integration/overview)",
  ""
);

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
fs.writeFileSync(outputPath, lines.join("\n"));

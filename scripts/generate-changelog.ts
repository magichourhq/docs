#!/usr/bin/env tsx
/**
 * Automatic changelog generator for Magic Hour docs.
 *
 * Fetches Linear issues with the "feature" label (then keeps only issues whose
 * completion calendar day in America/Los_Angeles falls in the since/until window),
 * rewrites each into polished MDX prose via GPT-5, and
 * prepends the new <Update> blocks to changelog.mdx.
 *
 * Each generated <Update> block is tagged "API" and/or "Web App" so readers can
 * filter the changelog by surface (Mintlify renders these tags as filter pills).
 *
 * Date window (America/Los_Angeles calendar days):
 *   --since omitted → start = day after top <Update label="YYYY-MM-DD"> in changelog.mdx
 *                     (strictly after that label; issues on the label day itself are skipped)
 *   --since set     → start = that day inclusive (LA day ≥ --since)
 *   --until omitted → no end bound (include everything from start through now)
 *   --until set     → end = that day inclusive (LA day ≤ --until)
 *
 * Usage:
 *   yarn changelog                       # since=day after latest <Update>; until=none
 *   yarn changelog --since 2026-01-01    # override start (inclusive)
 *   yarn changelog --until 2026-01-31    # optional end (inclusive)
 *   yarn changelog --since 2026-01-01 --until 2026-01-31
 *   yarn changelog --list-teams          # print available Linear team IDs and exit
 *   yarn changelog --dry-run             # print generated MDX without writing files
 *   yarn changelog --skip-select         # include all fetched issues (no multiselect prompt)
 *   yarn changelog --yes                 # write without the interactive confirm prompt (for CI)
 *
 * CI: .github/workflows/update-changelog.yml runs this on a schedule with
 * --skip-select --yes and opens a PR with the new entries.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import { LinearClient } from "@linear/sdk";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import "dotenv/config";

// Tags surfaced as filter pills on the Mintlify changelog page.
const TAG_API = "API" as const;
const TAG_WEB_APP = "Web App" as const;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CHANGELOG_PATH = path.resolve(__dirname, "../changelog.mdx");
const LABEL_NAME = "feature";

// Existing changelog examples used to steer the AI tone
const TONE_EXAMPLES = `
<Update label="2026-02-18">

## Added LTX-2 Model for Image-to-Video and Text-to-Video

We now added LTX-2 Model for Image-to-Video and Text-to-Video. The big change we made is that you can use LTX-2 (at 480p) without a subscription.

Try it now by visiting https://magichour.ai/create/image-to-video and https://magichour.ai/create/text-to-video.

</Update>

<Update label="2026-02-04">

## Updated AI Image Editor API to include models param

You can now specify the following models for AI Image Editor:

- \`qwen-edit\`
- \`nano-banana\`

\`\`\`python
res = client.v1.ai_image_editor.generate(
    ...
    model="nano-banana",
)
\`\`\`

Try it out now by upgrading to the latest version of the SDK.

</Update>

<Update label="2026-01-19">

## New Usage Page

Added a dedicated \`/usage\` page so users can track their consumption at a glance.

</Update>
`.trim();

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const listTeams = args.includes("--list-teams");
const dryRun = args.includes("--dry-run");
const skipSelect = args.includes("--skip-select");
const autoYes = args.includes("--yes");
const sinceIdx = args.indexOf("--since");
const sinceOverride = sinceIdx !== -1 ? args[sinceIdx + 1] : undefined;
const untilIdx = args.indexOf("--until");
const untilOverride = untilIdx !== -1 ? args[untilIdx + 1] : undefined;

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Error: missing environment variable ${name}`);
    console.error(`Copy .env.example to .env and fill in your credentials.`);
    process.exit(1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Parse the last changelog label from changelog.mdx
// ---------------------------------------------------------------------------

function parseLastChangelogLabel(): string {
  const content = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const match = content.match(/<Update\s+label="(\d{4}-\d{2}-\d{2})"/);
  if (!match) {
    throw new Error(`Could not find any <Update label="..."> in ${CHANGELOG_PATH}`);
  }
  return match[1]!;
}

// ---------------------------------------------------------------------------
// Linear helpers
// ---------------------------------------------------------------------------

async function listLinearTeams(client: LinearClient): Promise<void> {
  const teams = await client.teams();
  console.log("\nAvailable Linear teams:");
  for (const team of teams.nodes) {
    console.log(`  ${team.id}  ${team.name} (${team.key})`);
  }
}

interface LinearIssue {
  id: string;
  title: string;
  description: string | undefined;
  url: string;
  completedAt: Date;
}

async function fetchFeatureIssues(
  client: LinearClient,
  teamId: string,
  completedOnOrAfterUtc: Date,
  completedOnOrBeforeUtc?: Date
): Promise<LinearIssue[]> {
  const completedAtFilter: { gte: string; lte?: string } = {
    gte: completedOnOrAfterUtc.toISOString(),
  };
  if (completedOnOrBeforeUtc) {
    completedAtFilter.lte = completedOnOrBeforeUtc.toISOString();
  }

  const issueConnection = await client.issues({
    filter: {
      team: { id: { eq: teamId } },
      labels: { name: { eq: LABEL_NAME } },
      completedAt: completedAtFilter,
    },
    // Fetch up to 100 issues; pagination not expected to be needed
    first: 100,
  });

  const issues: LinearIssue[] = [];
  for (const issue of issueConnection.nodes) {
    if (!issue.completedAt) continue;
    issues.push({
      id: issue.id,
      title: issue.title,
      description: issue.description ?? undefined,
      url: issue.url,
      completedAt: new Date(issue.completedAt),
    });
  }

  // Sort oldest → newest so we prepend in the right order later
  issues.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  return issues;
}

// ---------------------------------------------------------------------------
// Group issues by date (YYYY-MM-DD)
// ---------------------------------------------------------------------------

function toDateStr(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function groupByDate(issues: LinearIssue[]): Map<string, LinearIssue[]> {
  const groups = new Map<string, LinearIssue[]>();
  for (const issue of issues) {
    const key = toDateStr(issue.completedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(issue);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// AI: rewrite Linear issues into polished changelog prose
// ---------------------------------------------------------------------------

async function generateUpdateBlock(dateStr: string, issues: LinearIssue[]): Promise<string> {
  const issuesSummary = issues
    .map(
      (issue, i) =>
        `Issue ${i + 1}:\nTitle: ${issue.title}\nDescription:\n${issue.description ?? "(no description)"}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `\
You are writing changelog entries for Magic Hour, an AI video and image generation platform.

Your job is to rewrite Linear issue titles and descriptions into polished, user-facing changelog prose in MDX format, and to classify which surface each change affects.

Content rules:
- Write in the same style as the existing examples below — concise, direct, and action-oriented
- Start each entry with "## " followed by a clear, punchy title (not the raw Linear title)
- Write 1-3 short paragraphs describing what changed and why it matters to the user
- If relevant, include a code snippet (Python or TypeScript matching the issue context)
- End with a "Try it out now:" link if there's a product URL in the description, otherwise omit it
- If multiple issues are provided for the same day, write a separate "## " section for each
- Do NOT include the <Update label="..."> wrapper — just the inner MDX content
- Do NOT include any image or Frame tags — new entries ship without images
- Do NOT hallucinate details not present in the issue

Classification rules (the "tags" field):
- "${TAG_API}": the change affects the public API / SDK (new endpoints, params, models exposed via the API, webhook changes, SDK updates). Code snippets calling \`client.*\` are a strong signal.
- "${TAG_WEB_APP}": the change affects the magichour.ai web product (new pages, UI, in-app tools/flows). A magichour.ai/create or app URL is a strong signal.
- Return every tag that applies. Many changes touch both surfaces — include both then.
- Return at least one tag.

Existing changelog style examples:
${TONE_EXAMPLES}
`;

  const userPrompt = `\
Generate changelog MDX content for the following Linear issue(s) completed on ${dateStr}:

${issuesSummary}
`;

  const { object } = await generateObject({
    model: openai("gpt-5"),
    system: systemPrompt,
    prompt: userPrompt,
    schema: z.object({
      content: z.string().describe("The inner MDX content (## sections), no <Update> wrapper"),
      tags: z
        .array(z.enum([TAG_API, TAG_WEB_APP]))
        .min(1)
        .describe("Which product surfaces this update affects"),
    }),
  });

  // De-dupe and keep a stable order (API before Web App)
  const orderedTags = [TAG_API, TAG_WEB_APP].filter((t) => object.tags.includes(t));
  const tagsAttr = `tags={${JSON.stringify(orderedTags)}}`;

  // New entries ship without images — real screenshots are added by hand later if
  // wanted. Emitting placeholder paths to non-existent files would break links.
  return `<Update label="${dateStr}" ${tagsAttr}>\n\n${object.content.trim()}\n\n</Update>`;
}

// ---------------------------------------------------------------------------
// Insert new Update blocks into changelog.mdx
// ---------------------------------------------------------------------------

function insertIntoChangelog(newBlocks: string[]): void {
  const content = fs.readFileSync(CHANGELOG_PATH, "utf-8");

  // Find the position of the first <Update to prepend before it
  const insertionPoint = content.indexOf("<Update ");
  if (insertionPoint === -1) {
    throw new Error(`No <Update ...> found in ${CHANGELOG_PATH}`);
  }

  // Blocks are sorted oldest→newest; we want newest first in the file
  const newContent =
    content.slice(0, insertionPoint) +
    newBlocks.reverse().join("\n\n") +
    "\n\n" +
    content.slice(insertionPoint);

  fs.writeFileSync(CHANGELOG_PATH, newContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Interactive confirmation prompt
// ---------------------------------------------------------------------------

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

/** Space toggles selection; Enter confirms. Toggle off issues to exclude from the changelog. */
async function promptIssueSelection(issues: LinearIssue[]): Promise<LinearIssue[]> {
  if (skipSelect || !process.stdin.isTTY) {
    if (!skipSelect && !process.stdin.isTTY) {
      console.log("stdin is not a TTY — including all issues (use --skip-select to silence this).");
    }
    return issues;
  }

  const { cancel, isCancel, multiselect } = await import("@clack/prompts");
  const selectedIds = await multiselect({
    message: "Include these issues in the changelog (toggle to exclude)",
    options: issues.map((issue) => ({
      value: issue.id,
      label: `[${toDateStr(issue.completedAt)}] ${issue.title}`,
    })),
    initialValues: issues.map((i) => i.id),
    required: true,
    maxItems: Math.min(issues.length, 15),
  });

  if (isCancel(selectedIds)) {
    cancel("Changelog generation cancelled.");
    process.exit(0);
  }

  const idSet = new Set(selectedIds);
  return issues.filter((issue) => idSet.has(issue.id));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const linearApiKey = requireEnv("LINEAR_API_KEY");
  requireEnv("OPENAI_API_KEY"); // needed by @ai-sdk/openai implicitly via env

  const client = new LinearClient({ apiKey: linearApiKey });

  // --list-teams mode
  if (listTeams) {
    await listLinearTeams(client);
    return;
  }

  const teamId = requireEnv("LINEAR_TEAM_ID");

  // Loose UTC bounds for Linear; real cutoffs match <Update> labels via toDateStr (LA).
  let completedOnOrAfterUtc: Date;
  let changelogDayOk: (issue: LinearIssue) => boolean;
  if (sinceOverride) {
    completedOnOrAfterUtc = new Date(`${sinceOverride}T00:00:00.000Z`);
    changelogDayOk = (i) => toDateStr(i.completedAt) >= sinceOverride;
    console.log(`Using --since ${sinceOverride} (LA calendar day ≥ this after fetch)`);
  } else {
    const lastLabel = parseLastChangelogLabel();
    completedOnOrAfterUtc = new Date(`${lastLabel}T00:00:00.000Z`);
    changelogDayOk = (i) => toDateStr(i.completedAt) > lastLabel;
    console.log(`Last changelog <Update>: ${lastLabel}`);
  }

  let completedOnOrBeforeUtc: Date | undefined;
  if (untilOverride) {
    completedOnOrBeforeUtc = new Date(`${untilOverride}T23:59:59.999Z`);
    const dayOk = changelogDayOk;
    changelogDayOk = (i) => dayOk(i) && toDateStr(i.completedAt) <= untilOverride;
    console.log(`Using --until ${untilOverride} (LA calendar day ≤ this after fetch)`);
  }

  console.log(
    `\nFetching Linear issues with label "${LABEL_NAME}" completed on or after ${completedOnOrAfterUtc.toISOString()} (UTC)` +
      (completedOnOrBeforeUtc
        ? ` and on or before ${completedOnOrBeforeUtc.toISOString()} (UTC)`
        : "") +
      "..."
  );
  const raw = await fetchFeatureIssues(
    client,
    teamId,
    completedOnOrAfterUtc,
    completedOnOrBeforeUtc
  );
  const issues = raw.filter(changelogDayOk);

  if (issues.length === 0) {
    console.log("No new issues found. Changelog is up to date.");
    return;
  }

  console.log(`Found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.log(`  [${toDateStr(issue.completedAt)}] ${issue.title}`);
  }

  const selectedIssues = await promptIssueSelection(issues);
  if (selectedIssues.length === 0) {
    console.log("No issues selected. Exiting.");
    return;
  }
  if (selectedIssues.length < issues.length) {
    console.log(`Including ${selectedIssues.length} of ${issues.length} issue(s).`);
  }

  // Group by date
  const groups = groupByDate(selectedIssues);
  console.log(`\nGenerating ${groups.size} <Update> block(s) via GPT-5...`);

  const newBlocks: string[] = [];

  for (const [dateStr, groupIssues] of groups) {
    process.stdout.write(`  ${dateStr} (${groupIssues.length} issue(s))... `);
    const block = await generateUpdateBlock(dateStr, groupIssues);
    newBlocks.push(block);
    console.log("done");
  }

  // Preview
  console.log("\n--- Generated MDX Preview ---\n");
  console.log(newBlocks.join("\n\n"));
  console.log("\n--- End Preview ---\n");

  if (dryRun) {
    console.log("Dry run mode — no files were written.");
    return;
  }

  // Confirm before writing (skipped with --yes or when stdin is not a TTY, e.g. CI)
  if (!autoYes && process.stdin.isTTY) {
    const ok = await confirm(`Write ${newBlocks.length} new block(s) to changelog.mdx?`);
    if (!ok) {
      console.log("Aborted. No files were changed.");
      return;
    }
  }

  insertIntoChangelog(newBlocks);

  console.log(`\nDone! ${newBlocks.length} new block(s) added to changelog.mdx.`);
  console.log("Next steps:");
  console.log("  1. Review the generated entries in changelog.mdx");
  console.log("  2. Replace the placeholder images with real screenshots");
  console.log("  3. Commit and push");
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

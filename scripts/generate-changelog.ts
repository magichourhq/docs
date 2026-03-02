#!/usr/bin/env tsx
/**
 * Automatic changelog generator for Magic Hour docs.
 *
 * Fetches Linear issues with the "feature" label completed after the last
 * changelog entry, rewrites each into polished MDX prose via GPT-5, and
 * prepends the new <Update> blocks to changelog.mdx.
 *
 * Usage:
 *   yarn changelog                  # auto-detect last date from changelog.mdx
 *   yarn changelog --since 2026-01-01  # override start date
 *   yarn changelog --list-teams     # print available Linear team IDs and exit
 *   yarn changelog --dry-run        # print generated MDX without writing files
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import { LinearClient } from "@linear/sdk";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import "dotenv/config";

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
const sinceIdx = args.indexOf("--since");
const sinceOverride = sinceIdx !== -1 ? args[sinceIdx + 1] : undefined;

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
// Parse the last changelog date from changelog.mdx
// ---------------------------------------------------------------------------

function parseLastChangelogDate(): Date {
  const content = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const match = content.match(/<Update\s+label="(\d{4}-\d{2}-\d{2})"/);
  if (!match) {
    throw new Error(`Could not find any <Update label="..."> in ${CHANGELOG_PATH}`);
  }
  const [, dateStr] = match;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  console.log(`Last changelog entry date: ${dateStr}`);
  return date;
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
  since: Date
): Promise<LinearIssue[]> {
  // Linear SDK filter: issues in the team, with the "feature" label, completed after since
  const issueConnection = await client.issues({
    filter: {
      team: { id: { eq: teamId } },
      labels: { name: { eq: LABEL_NAME } },
      completedAt: { gt: since.toISOString() },
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

Your job is to rewrite Linear issue titles and descriptions into polished, user-facing changelog prose in MDX format.

Rules:
- Write in the same style as the existing examples below — concise, direct, and action-oriented
- Start each entry with "## " followed by a clear, punchy title (not the raw Linear title)
- Write 1-3 short paragraphs describing what changed and why it matters to the user
- If relevant, include a code snippet (Python or TypeScript matching the issue context)
- End with a "Try it out now:" link if there's a product URL in the description, otherwise omit it
- If multiple issues are provided for the same day, write a separate "## " section for each
- Do NOT include the <Update label="..."> wrapper — just the inner MDX content
- Do NOT include any image or Frame tags — those will be added automatically
- Do NOT hallucinate details not present in the issue

Existing changelog style examples:
${TONE_EXAMPLES}
`;

  const userPrompt = `\
Generate changelog MDX content for the following Linear issue(s) completed on ${dateStr}:

${issuesSummary}
`;

  const { text } = await generateText({
    model: openai("gpt-5"),
    system: systemPrompt,
    prompt: userPrompt,
  });

  // Build the <Update> block with a placeholder image tag after each ## section
  const contentWithPlaceholders = addImagePlaceholders(text.trim(), dateStr);

  return `<Update label="${dateStr}">\n\n${contentWithPlaceholders}\n\n</Update>`;
}

// ---------------------------------------------------------------------------
// Add placeholder image Frame tags after each ## heading
// ---------------------------------------------------------------------------

function addImagePlaceholders(content: string, dateStr: string): string {
  const [year, month] = dateStr.split("-");
  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);

    // After a ## heading, insert a placeholder image frame
    if (lines[i].startsWith("## ")) {
      const title = lines[i].replace(/^##\s+/, "");
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      result.push("", `<Frame>![${title}](/changelog/images/${year}/${month}/${slug}.jpg)</Frame>`);
    }
  }

  return result.join("\n");
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

  // Determine the date cutoff
  let since: Date;
  if (sinceOverride) {
    since = new Date(`${sinceOverride}T00:00:00.000Z`);
    console.log(`Using provided start date: ${sinceOverride}`);
  } else {
    since = parseLastChangelogDate();
  }

  // Fetch issues from Linear
  console.log(
    `\nFetching Linear issues with label "${LABEL_NAME}" completed after ${toDateStr(since)}...`
  );
  const issues = await fetchFeatureIssues(client, teamId, since);

  if (issues.length === 0) {
    console.log("No new issues found. Changelog is up to date.");
    return;
  }

  console.log(`Found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.log(`  [${toDateStr(issue.completedAt)}] ${issue.title}`);
  }

  // Group by date
  const groups = groupByDate(issues);
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

  // Confirm before writing
  const ok = await confirm(`Write ${newBlocks.length} new block(s) to changelog.mdx?`);
  if (!ok) {
    console.log("Aborted. No files were changed.");
    return;
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

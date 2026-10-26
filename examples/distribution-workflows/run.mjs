import { readFile, writeFile, open, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MagicHourWorkflow, imageRequest, ProjectError } from "./client.mjs";

export async function run(argv, { token = process.env.MAGIC_HOUR_API_KEY, fetchImpl } = {}) {
  const [command, receiptName, inputName] = argv;
  if (!["generate", "edit", "animate", "lipsync", "resume"].includes(command) || !receiptName) {
    throw new Error(
      "Usage: node run.mjs <generate|edit|animate|lipsync|resume> <receipt.json> [input.json]"
    );
  }
  const receiptPath = resolve(receiptName);
  const client = new MagicHourWorkflow({ token, fetchImpl });
  let receipt;
  if (command === "resume") {
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    if (!receipt.id)
      throw new Error("No accepted ID in receipt. Reconcile account history; do not rerun create.");
  } else {
    if (!inputName) throw new Error("An input JSON path is required.");
    const input = JSON.parse(await readFile(inputName, "utf8"));
    const body =
      command === "generate" && typeof input.prompt === "string"
        ? imageRequest(input.prompt, input)
        : input;
    if (JSON.stringify(body).includes("REPLACE_WITH_"))
      throw new Error("Replace the sample asset paths with your uploaded file_path values first.");
    await mkdir(dirname(receiptPath), { recursive: true });
    // Exclusive intent file: a retry with the same receipt path cannot submit another billable job.
    const intent = await open(receiptPath, "wx", 0o600);
    await intent.writeFile(
      JSON.stringify({
        tool: command,
        outcome: "submission_in_progress",
        started_at: new Date().toISOString(),
      })
    );
    await intent.close();
    const save = async (data) => {
      const tmp = `${receiptPath}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tmp, receiptPath);
    };
    try {
      receipt = await client.submit(command, body, { onAccepted: save });
    } catch (error) {
      if (error instanceof ProjectError && error.receipt?.id) await save(error.receipt);
      throw error;
    }
  }
  const result = await client.wait(receipt);
  // Keep signed output URLs out of durable receipts and ordinary logs.
  const finalTmp = `${receiptPath}.tmp`;
  await writeFile(
    finalTmp,
    JSON.stringify(
      {
        ...receipt,
        status: result.status,
        credits_charged: result.credits_charged,
        checked_at: new Date().toISOString(),
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  await rename(finalTmp, receiptPath);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await run(process.argv.slice(2));
    console.log(
      JSON.stringify(
        {
          id: result.id,
          kind: result.kind,
          status: result.status,
          credits_charged: result.credits_charged,
          outputs: result.downloads?.length ?? 0,
          review_required: true,
          pending: result.pending ?? false,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Workflow failed.");
    if (error instanceof ProjectError && error.receipt?.id)
      console.error(`Recover project ID: ${error.receipt.id}`);
    process.exitCode = 1;
  }
}

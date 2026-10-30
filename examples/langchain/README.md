# Magic Hour with LangChain and LangGraph

Generate a product image, edit a catalog photo, or animate a still with Magic Hour's
hosted MCP server. This example uses the released `@langchain/mcp-adapters` 2.0.1
and LangGraph 1.5.2. It requires Node.js 22 or newer and your existing Magic Hour
API key. No separate language-model key or language-model call is required.

## Install and verify authentication

```sh
git clone https://github.com/magichourhq/docs.git
cd docs/examples/langchain
npm ci
# Set MAGIC_HOUR_API_KEY in your shell or secret manager. Never commit it.
node run.mjs --check
```

Create a key in the [Developer Hub](https://magichour.ai/developer?utm_source=langchain&utm_medium=integration&utm_campaign=api_distribution).
The check discovers tools and calls `get_account_info` to verify real authorization.
Public tool discovery alone does not validate your key. It starts no generation and
prints no account identifiers or balance.

## Generate, edit, or animate

Each command creates one paid job, saves its project ID before waiting, then downloads
the completed media. Check [current model pricing](https://docs.magichour.ai/api-reference/models)
before setting `--max-credits`:

```sh
node run.mjs --mode generate --max-credits 5 \
  --prompt "A blue ceramic mug on a cream studio background, product photography, no text"

node run.mjs --mode edit --max-credits 5 \
  --image "https://YOUR_PUBLIC_HOST/product.png" \
  --prompt "Change only the mug color to forest green; preserve its shape and background"

node run.mjs --mode animate --max-credits 24 \
  --image "https://YOUR_PUBLIC_HOST/product.png" \
  --prompt "A gentle camera orbit around the product, consistent shape and lighting"
```

Replace the example URL with a directly accessible image or a Magic Hour `file_path`
from the [upload API](https://docs.magichour.ai/api-reference/files/generate-asset-upload-urls).
A local filename or private sharing-page URL is not an uploaded input.

Fixed image settings are one Flux 2 Klein image at 640px. Animation uses one second
of LTX 2.5 at 480p with audio disabled. At the October 22, 2026 documented rates,
these are 5 and 24 credits respectively. The flag is a local check against those
fixed settings, **not a server-enforced billing cap or a live price quote**. Review
pricing when reusing the example. It does not purchase credits or change your plan.
Use a separate controlled test account if a strict provider-side limit is required.

## Save now, resume later

To demonstrate asynchronous recovery deliberately:

```sh
node run.mjs --mode generate --max-credits 5 --submit-only \
  --prompt "A blue ceramic mug on a cream studio background"
# Use the actual recovery path printed by the command:
node run.mjs --resume outputs/YOUR_RUN_ID/project.json
```

`--submit-only` returns after the job ID is durably saved and before polling.
Resume calls only account verification and the matching wait tool; it never invokes
the generation tool. It writes the downloaded files and a receipt containing the
project ID, final credits, and file count, without credentials, prompts or signed URLs.
Outputs are ignored by Git. Keep recovery files private.

Queued or rendering jobs can be resumed after the 60-second wait window. Error or
canceled jobs stop without another create request. A completed project without a
usable download is an error. If creation's response is lost before an ID is known,
check Magic Hour history before retrying; automatic POST retries can double-charge.
The graph also stops if saving the accepted ID fails, and tells you to retain that ID.
Downloads preserve the provider's signed URL exactly and receive no API-key header.

## Embed in your application

```js
import { connectMagicHour, mediaWorkflow } from "./workflow.mjs";

const adapter = connectMagicHour(process.env.MAGIC_HOUR_API_KEY);
try {
  const graph = mediaWorkflow({
    tools: await adapter.listTools(),
    saveProject: async (record) => {
      // Await your durable database write here before polling starts.
      await yourProjectStore.insert(record);
    },
  });
  const result = await graph.invoke({ mode: "generate", prompt: "A blue mug" });
  // result.projectId, result.creditsCharged, result.outputUrls
} finally {
  await adapter.close();
}
```

Keep the adapter open while its tools are used. The graph has one create node and
no edge back to it. Do not wrap the whole graph in an automatic retry policy.
The adapter explicitly keeps canonical tool names for its single fixed server and
checks adapter 2 error ToolMessages before accepting structured results.

## Verification and release scope

```sh
node --test workflow.test.mjs
```

The tests use controlled tool responses for recovery, failed persistence, pending,
failed and canceled jobs, missing downloads, and adapter 2 HTTP error messages.
They do not spend credits. See [VALIDATION.md](./VALIDATION.md) for live evidence
and remaining gates.

This is an executable first-party example. It is not a published LangChain package,
LangChain catalog approval, or hosted LangGraph deployment. Useful official references:
[LangChain MCP](https://docs.langchain.com/oss/javascript/langchain/mcp) and
[adapter 2 migration](https://docs.langchain.com/oss/javascript/migrate/langchain-mcp-adapters).

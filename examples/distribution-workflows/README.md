# Media workflows for automation builders

Runnable Node.js 22+ examples for generating images, editing an approved product photo,
animating an image, or applying replacement audio to a video. No web app, database,
deployment or dependency installation is required.

The same HTTP operations can be mapped into workflow tools. The platform guides describe
their setup boundaries explicitly; these files are not native gallery exports or proof of
a marketplace listing.

## Run an image workflow

Set `MAGIC_HOUR_API_KEY` in your shell or your platform's secret store. An API call can
consume credits; inspect the chosen model and account limits first.

```sh
node run.mjs generate receipts/example.json requests/generate.json
```

The command creates an exclusive intent file before submitting, saves the accepted
project ID before checking its status, and prints a compact result. A second create with
the same receipt path is rejected. If a status check fails or the wait ends, resume the
same project:

```sh
node run.mjs resume receipts/example.json
```

An unknown submission outcome requires account-history reconciliation. Deleting the
receipt and rerunning create can charge for a second job. There is no automatic POST retry.

## Edit, animate, or lip sync

Upload assets using the [input-files guide](https://docs.magichour.ai/integration/inputs-and-outputs).
Replace the explicit placeholder `file_path` values in the request files. Local filesystem
paths and ordinary download URLs are not interchangeable with uploaded asset paths.

```sh
node run.mjs edit receipts/product.json requests/edit.json
node run.mjs animate receipts/shot.json requests/animate.json
node run.mjs lipsync receipts/dialogue.json requests/lipsync.json
```

Use assets you own or are allowed to process. The product-photo example requests
preservation; it does not guarantee unchanged labels, logos or geometry. Check every
output before publishing. For lip sync, inspect mouth timing, facial stability and the
selected audio segment.

## Use the adapter from another script

```js
import { MagicHourWorkflow, imageRequest } from "./client.mjs";

const client = new MagicHourWorkflow({ token: process.env.MAGIC_HOUR_API_KEY });
const receipt = await client.submit("generate", imageRequest("A matte blue mug"), {
  onAccepted: async (accepted) => {
    // Persist accepted.id and accepted.kind in your durable workflow state here.
  },
});
const result = await client.wait(receipt);
if (result.pending) {
  // Save the ID and schedule a later GET; do not repeat submit.
} else {
  // Consume result.downloads now. Exact signed URLs and expiry timestamps are retained.
}
```

The CLI deliberately omits signed URLs from logs and durable receipts. To retrieve a
fresh download list, call `client.get(receipt)` or `client.wait(receipt)` in your private
workflow. Signed URLs expire; copy approved outputs into storage you control before
depending on them. Never forward the API bearer token to an output host.

## Platform handoffs

- [Gumloop](./gumloop.md): remote MCP setup plus a campaign-asset workflow specification.
- [Albato](./albato.md): custom HTTP action mappings for submit, status, and review handoff.
- [Fuser](./fuser.md): provider request/response mapping and a lip-sync recipe for vendor review.
- [Creator product-image workflow](./product-image-workflow.md): input contract and visual review checklist.
- [Publisher fact sheet](./publisher-facts.md): neutral product facts and source URLs.

## Verification

```sh
npm test
```

Tests exercise real adapter code with controlled HTTP responses: accepted-ID persistence,
GET-only recovery, terminal failures, output expiry, URL preservation, bounded waiting and
duplicate-create protection. They do not establish visual quality, a platform installation,
or a successful live generation. Keep live-run evidence separate from fixture results.

Request bodies follow the repository's current OpenAPI specification. Model availability,
credits and account entitlements may change; consult the selected endpoint before use.

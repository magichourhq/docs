# Magic Hour n8n workflows

Import these workflow JSON files into n8n after installing [`@gladiator1st/n8n-nodes-magichour`](https://www.npmjs.com/package/@gladiator1st/n8n-nodes-magichour) under **Settings → Community Nodes**. Installation on n8n Cloud depends on the package's verified status; self-hosted users can install community packages. Select your own Magic Hour credential after import; no credential is included.

| Workflow                                                | Setup                                                                                                                    | Output                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [Generate a product image](generate-product-image.json) | Replace the product prompt; uses Flux 2 Klein, one 640px image                                                           | Binary PNG in `data`                                            |
| [Animate a product photo](animate-product-image.json)   | Set a direct image URL or uploaded `file_path`; one-second LTX 2.3 at 480p, supported by the current node's model picker | Binary video in `data`                                          |
| [Recover a generation](recover-generation.json)         | Set an existing video project ID; switch resource/operation and fill Image Project ID for an image                       | Completed file in `data`, without submitting another generation |

Download the result from the n8n execution, or connect **Download result** to a Google Drive Upload/S3/storage node with binary input field `data`. To drive generation from Sheets, Airtable, Shopify or a CRM, replace the manual trigger and map its fields into the Magic Hour node. Source/destination accounts and permissions must be configured in your own instance.

Each flow explicitly checks `status === complete` before downloading. This also protects against the published node's known polling-timeout behavior while [the upstream fix](https://github.com/Gladiator1st/n8n-nodes-magichour/pull/1) awaits release. If execution stops, keep the project ID and use the recovery flow. Do not enable automatic retries on a paid generation step or restart the full workflow just to retrieve an existing result.

Private Drive share pages are not direct media URLs. Download the file using its authenticated source connector, obtain a Magic Hour [upload URL](https://docs.magichour.ai/api-reference/files/generate-asset-upload-urls), PUT the raw bytes without a Magic Hour bearer header, then use `file_path` as the input. Model availability, duration and cost vary by plan; verify the [API reference](https://docs.magichour.ai/api-reference) before a batch run.

## Validation

The three JSON flows are exercised in GitHub CI using n8n 2.37.10 on Node.js 24 and the published community package 1.0.3. CI imports credentials/workflows and executes the actual n8n engine. HTTP is intercepted by a local test proxy, with an invalid test-only API key; CI cannot create paid generations. It checks two generation flows, recovery, binary downloads and rejection of an unfinished result.

Separately, real API tests produced a product image, an edited image and a playable one-second video. Those live tests exercised the Pipedream components and compiled n8n node code; they did not exercise Google/Shopify/Airtable OAuth connections. The two media fixtures here are outputs from those real tests. Neither these JSON files nor the recipes are claimed as approved n8n template-gallery listings.

To reproduce the engine check in a disposable environment with n8n and the community package installed:

```sh
node test/engine.mjs /path/to/n8n
```

The script uses a new temporary credential/workflow directory and a local HTTP proxy. Point `N8N_USER_FOLDER` at a disposable n8n data directory; do not run the import test against your production instance.

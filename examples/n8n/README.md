# Magic Hour n8n workflows

For a new self-hosted n8n setup, go to **Settings → Community Nodes → Install** and enter the official [`@magichourhq/n8n-nodes-magichour`](https://www.npmjs.com/package/@magichourhq/n8n-nodes-magichour) package. The [official node README](https://github.com/magichourhq/n8n-nodes-magichour#installation) covers setup and migration from the earlier unscoped package. n8n Cloud requires community nodes to be verified before they can be installed.

The workflow JSON files below reference the earlier [`@gladiator1st/n8n-nodes-magichour`](https://www.npmjs.com/package/@gladiator1st/n8n-nodes-magichour) package. To import these files as written, install that package on self-hosted n8n and select your own Magic Hour credential after import.

| Workflow                                                | Setup                                                                                                                    | Output                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [Generate a product image](generate-product-image.json) | Replace the product prompt; uses Flux 2 Klein, one 640px image                                                           | Binary PNG in `data`                                            |
| [Animate a product photo](animate-product-image.json)   | Set a direct image URL or uploaded `file_path`; one-second LTX 2.3 at 480p, supported by the current node's model picker | Binary video in `data`                                          |
| [Recover a generation](recover-generation.json)         | Set an existing video project ID; switch resource/operation and fill Image Project ID for an image                       | Completed file in `data`, without submitting another generation |

Download the result from the n8n execution, or connect **Download result** to a Google Drive Upload/S3/storage node with binary input field `data`. To drive generation from Sheets, Airtable, Shopify or a CRM, replace the manual trigger and map its fields into the Magic Hour node. Source/destination accounts and permissions must be configured in your own instance.

Each flow explicitly checks `status === complete` before downloading. This protects the examples if the earlier node returns before the job completes. If execution stops, keep the project ID and use the recovery flow. Do not enable automatic retries on a paid generation step or restart the full workflow just to retrieve an existing result.

Private Drive share pages are not direct media URLs. Download the file using its authenticated source connector, obtain a Magic Hour [upload URL](https://docs.magichour.ai/api-reference/files/generate-asset-upload-urls), PUT the raw bytes without a Magic Hour bearer header, then use `file_path` as the input. Model availability, duration and cost vary by plan; verify the [API reference](https://docs.magichour.ai/api-reference) before a batch run.

Separately, real API tests produced a product image, an edited image and a playable one-second video. Those live tests exercised the Pipedream components and compiled n8n node code; they did not exercise Google/Shopify/Airtable OAuth connections. Neither these JSON files nor the recipes are claimed as approved n8n template-gallery listings.

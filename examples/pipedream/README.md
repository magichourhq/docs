# Magic Hour actions for Pipedream

Generate images, animate product photos, edit images, swap faces, and create talking or lip-synced videos in a workflow. These are **custom components**, not an approved Pipedream marketplace app. Native app onboarding is tracked in [Pipedream #21920](https://github.com/PipedreamHQ/pipedream/issues/21920).

## Install

Requires Node.js 22+, a Pipedream workspace, and a [Magic Hour API key](https://magichour.ai/developer?utm_source=pipedream&utm_medium=integration&utm_campaign=api_distribution). Generation consumes Magic Hour credits; Pipedream execution has its own plan limits and pricing.

```sh
git clone https://github.com/magichourhq/docs.git
cd docs/examples/pipedream
npm ci
npm test
```

[Install and authenticate the Pipedream CLI](https://pipedream.com/docs/cli/install), then publish the actions you need into your own workspace:

```sh
pd publish generate-image.mjs
pd publish animate-image.mjs
pd publish generate-video.mjs
pd publish edit-image.mjs
pd publish face-swap-photo.mjs
pd publish talking-photo.mjs
pd publish lip-sync.mjs
pd publish wait-for-result.mjs
```

Keep `common.mjs` beside the action files: it is a relative import bundled with each component. Add a published action to a workflow and enter the API key in its secret field. Publishing to your account does not create a public marketplace listing.

## Generate, wait, save

1. Add a trigger and choose one generation action. Map the prompt or source media from the trigger.
2. Save the returned `project_id` to the source record before proceeding. A successful create request means the job was accepted, not that the media is ready.
3. Add **Wait for Result**. Map `projectId` to `{{steps.generate.$return_value.project_id}}` and `projectType` to `{{steps.generate.$return_value.project_type}}`, replacing `generate` with the actual step name.
4. Map `{{steps.wait.$return_value.output_url}}` to your destination's file-URL input. If it requires binary data, download that URL first. Save the file promptly; download URLs expire.

Wait for Result checks the existing project once per minute for up to 20 minutes using [Pipedream's rerun mechanism](https://pipedream.com/docs/workflows/building-workflows/code/nodejs/rerun). It reruns only the waiting step, never the paid generation step. Scheduled reruns work in **deployed workflows**. An editor test against a pending project tells you to test again after completion or deploy. A failed, canceled, or timed-out job stops downstream steps.

Turn off automatic retries on generation steps. If a POST times out or a trigger is delivered twice, inspect the saved project ID and account history before creating another job. For batch input, process one record at a time and use a durable source-record-to-project-ID mapping; workflow replays can otherwise incur duplicate charges. Pipedream retries and scheduled runs may consume execution credits.

## Actions

| Action          | Magic Hour API                              | Result                              |
| --------------- | ------------------------------------------- | ----------------------------------- |
| Generate Image  | `POST /v1/ai-image-generator`               | One image                           |
| Animate Image   | `POST /v1/image-to-video`                   | Video                               |
| Generate Video  | `POST /v1/text-to-video`                    | Video                               |
| Edit Image      | `POST /v1/ai-image-editor`                  | One image                           |
| Face Swap Photo | `POST /v1/face-swap-photo`                  | Image                               |
| Talking Photo   | `POST /v1/ai-talking-photo`                 | Video                               |
| Lip Sync        | `POST /v1/lip-sync`                         | Video                               |
| Wait for Result | `GET /v1/{image,video,audio}-projects/{id}` | Completed project and download URLs |

Model availability, valid durations, resolution and credit cost depend on the endpoint and account tier. The default model follows Magic Hour's recommendation. For a small free-tier smoke test, use image model `flux-2-klein` with `640px`, or image-to-video model `ltx-2.5` with a one-second duration. Paid generations may cost more. See the [API reference](https://docs.magichour.ai/api-reference).

## Workflow recipes

The mappings below are build instructions, not hosted template links. Connect the source and destination accounts in your own workspace; their OAuth connections are not included here.

| Workflow                                  | Input and action mapping                                                                                              | Save and publish                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Sheets → Magic Hour → Google Drive | New approved row: `prompt` → Generate Image prompt; `sku` → project name                                              | Write `project_id` back to that row, wait, then use Google Drive Upload File with the result URL. Store the Drive file ID in the row.                  |
| Shopify product → video → social          | Product image's direct URL → Animate Image image; product title + camera direction → prompt; duration 5               | Save project ID in a metafield or workflow datastore, wait, then create a social draft with the result file. Publish after product and caption review. |
| Airtable → bulk video generation          | View filtered to `approved=true` and empty `project_id`; one record's `image_url` and `motion_prompt` → Animate Image | Immediately write the returned ID to the record, wait, attach the downloaded result and mark complete. Skip records already carrying a project ID.     |
| RSS → AI image/video → social             | Deduplicate by article GUID, generate a visual brief with an LLM, map that text to Generate Image or Generate Video   | Save the GUID and project ID, wait, save media, then pass approved caption and media to the social connector.                                          |
| Upload image → animate → save             | Upload the image through the Magic Hour file API, map returned `file_path` to Animate Image                           | Save project ID, wait, download MP4 to Drive, S3, or your storage connector.                                                                           |
| CRM record → personalized video           | Approved portrait URL + pre-generated personalized audio URL → Talking Photo; duration must fit the audio             | Save project ID on the record, wait, save the video URL to CRM. Send only through the user's authorized campaign.                                      |
| LLM → prompt → Magic Hour → publish       | LLM structured output `{prompt, title, caption}` → Generate Image/Video prompt and project name                       | Save project ID, wait, persist media, then pass it to a publishing step after approval.                                                                |

For private Drive or Airtable files, download the bytes with that platform's authenticated connector. Call [Generate Asset Upload URLs](https://docs.magichour.ai/api-reference/files/generate-asset-upload-urls) with the extension and type, **PUT the raw bytes** to the returned `upload_url`, and pass `file_path` to Magic Hour. Do not send the Magic Hour bearer token to the storage upload URL. A Drive share page is not a direct image URL.

## Validation and publication status

On September 7, 2026, the actual Generate Image and Edit Image components were installed with `@pipedream/platform` and executed against Magic Hour, then the Wait for Result component retrieved both completed PNGs. An actual installed n8n Magic Hour node animated the generated product image into a playable H.264 MP4 after a real binary upload. Total: 34 existing Magic Hour credits, no purchase. Invalid and subsequently revoked credentials returned HTTP 401.

`npm test` checks all seven request schemas against this repository's OpenAPI file, async completion/error handling, polling limits, and credential-safe errors. These tests do not spend credits.

**Remaining verification:** publishing these components to a Pipedream workspace, deployed scheduler behavior, and end-to-end source/destination OAuth workflows. Local execution is not evidence that those hosted steps have passed. Never put a production API key or signed download URL in a public issue or exported workflow.

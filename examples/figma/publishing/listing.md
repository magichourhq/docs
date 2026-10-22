# Magic Hour — Figma Community submission

Status: prepared for the owner to test and submit from Figma Desktop; not submitted.

## Listing fields

**Name:** Magic Hour

**Tagline:** Generate and edit images in your design workflow.

**Category:** Design tools

**Description:**

Create a new image from a prompt, or edit one selected layer using Magic Hour, without manually moving files between tools.

- Generate an image with Flux 2 Klein or Qwen Image 2.1.
- Edit a selected layer: change its colors, background, style, or other details with a prompt.
- Choose square, landscape, or portrait output at 640px, 1K, or 2K.
- Preview the completed image, then insert it as a new image or explicitly replace the original layer's fill.
- Stop waiting and resume an accepted generation later without submitting a second paid job.

Requires a separate Magic Hour account, a Magic Hour API key, and sufficient API credits. Generations and edits use your Magic Hour credit balance. The Figma plugin is free to install; API usage has its own pricing and plan requirements.

Your API key stays in the plugin UI's session memory. Only the selected layer is exported for an edit. Prompts and selected-layer images are sent to Magic Hour for processing. The plugin saves the latest accepted project ID locally so you can resume waiting after reopening it.

**Website:** https://magichour.ai

**Setup instructions:** https://docs.magichour.ai/integration/figma

**Get an API key:** https://magichour.ai/developer?utm_source=figma&utm_medium=integration

**Support:** support@magichour.ai

**Privacy policy:** https://magichour.ai/privacy-policy

**Terms:** https://magichour.ai/terms-of-service

**Suggested tags:** image generation, image editing, product design, creative tools, Magic Hour

## Submission materials

- `icon-128.png`: existing Magic Hour brand icon rendered at the recommended 128×128 size. `icon.png` preserves the original 144×144 asset.
- `generate-preview.png` and `edit-preview.png`: actual plugin UI with completed live outputs, captured in the browser harness. These are previews of the plugin interface; do not describe them as Figma Desktop screenshots.
- `cover.png`: 1920×1080 cover using the live UI previews. Regenerate with `node render-publishing.mjs` after installing the plugin's dev dependencies.

## Owner desktop steps

Figma requires a macOS or Windows desktop app to develop and submit classic plugins, plus two-factor authentication on the publishing account. The connected account is `support@magichour.ai` (`runs`).

1. Create a development plugin in Figma Desktop and put the assigned ID in the build manifest, or set `FIGMA_PLUGIN_ID` when building the release bundle. Do not invent an ID.
2. Import the manifest, run one image generation, run one selected-layer edit, and check actual insertion and explicit replacement in a Design file.
3. Check the captured original-layer behavior by changing selection while waiting, and test Stop waiting / Resume saved generation after reopening the plugin.
4. In Manage plugins, choose Publish, use the listing fields and assets above, and submit to Community as the authorized Magic Hour publisher.
5. Record the assigned plugin ID and submission/listing URL in PX-579. A submission is not approval.

The MCP account connection does not provide a standard-plugin publishing API. Figma's publishing website returned HTTP 403 from this execution environment.

Sources: [classic plugin publishing](https://help.figma.com/hc/en-us/articles/360042293394-Publish-classic-plugins-to-the-Figma-Community), [review guidelines](https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines).

# Magic Hour Figma plugin

Generate an image from a prompt, or export one selected Figma layer and edit it with Magic Hour. Preview the finished image, then insert it as a new canvas image or explicitly replace the original layer's fill.

## Build and install for development

```sh
cd examples/figma
npm ci
npm run check
npm run build
```

The shared REST transport is bundled from `../vercel-ai-sdk/src/client.ts`, so keep both example directories in the checkout. No Node dependencies are required at runtime.

1. In **Figma Desktop**, choose **Plugins → Development → New Plugin**, select a plugin with a UI, and create it to obtain your own Figma-assigned plugin ID.
2. Add that assigned `id` to this directory's `manifest.json`. Do not invent an ID or reuse another publisher's ID.
3. Import this directory's manifest through **Plugins → Development → Import plugin from manifest**. Run the plugin in a Design file.
4. Enter your [Magic Hour API key](https://magichour.ai/developer?utm_source=figma&utm_medium=integration), describe the image, choose a model/resolution, and generate. Each generation consumes API credits. The key stays in the UI's session memory; it is not embedded in source, stored in client storage, or sent to the canvas bridge.
5. For editing, select one exportable layer, choose **Edit selection**, and describe the edit. The selected layer is uploaded as PNG. **Replace the original layer's fill** is opt-in; otherwise insertion creates a new image. Replacement uses the captured original layer ID even if the selection changes while waiting.

The MVP offers Flux 2 Klein and Qwen Image 2.1 at 640px/1K/2K, with square, landscape, and portrait output. It handles images only. Model/plan availability is checked by the API.

## Waiting, recovery, and privacy

The accepted image project ID is saved in Figma client storage. **Stop waiting** stops the local wait and leaves the server-side job running. **Resume saved generation** polls the saved ID without another paid POST, including after closing and reopening the plugin. A resumed project inserts as a new image because selection context is not persisted. **New generation** explicitly clears that saved ID.

The source image and prompt go to Magic Hour; upload/download bytes go to its signed storage endpoints without the API bearer token. Only the selected layer is exported. Credentials are cleared when the plugin session ends. Network access is restricted in the manifest to the Magic Hour API/media domains and supported storage providers. A public release needs a publisher identity, privacy/support links, final manifest ID, and Figma review.

## Verify

```sh
npm run build
npm test
# Install Chromium once, or point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at an existing binary:
npx playwright install chromium
npm run test:ui
```

The compiled canvas controller tests cover export, placement, explicit original-layer replacement after selection changes, removed layers, invalid data, and project-ID storage. The browser suite runs the actual UI in a restrictive opaque-origin iframe and simulates only Figma's message bridge. It tests controlled generation/editing, preview/insertion messages, interrupted wait/resume without rebilling, and credit errors.

For opt-in live UI testing, set `MAGIC_HOUR_TEST_KEY_FILE` to an owner-readable API-key file and optionally `MAGIC_HOUR_TEST_IMAGE_FILE` to a source PNG, then run `npm run test:ui -- --live`. This spends credits. It saves screenshots with the key field cleared and receipts without credentials or signed URLs.

See [validation](../../integration/creative-integrations-validation.md) for the live checks. The browser/canvas harnesses do not prove a development install in Figma Desktop or Community publication; those remain required before release.

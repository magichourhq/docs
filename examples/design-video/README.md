# Magic Hour video integrations

Development integrations for **Framer (PX-578)**, **Adobe Express (PX-577)**, and **Canva (PX-466)**. Generate a short video from an image or creative brief, preview the completed MP4, and explicitly add it to the design. They reuse the public API transport from `../vercel-ai-sdk/src/client.ts`.

These are development implementations, not published marketplace listings. Actual editor installation and marketplace review require the authorized platform accounts. Browser tests simulate editor APIs; they do not prove installed-editor behavior.

## Build and check

Requires Node.js 22.12+ (tested on Node.js 24).

```sh
cd examples/design-video
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Build outputs are self-contained under `framer/dist`, `adobe-express/dist`, `adobe-express/selection-dist`, and `canva/dist`. No test harness or test credential is included in these bundles. Keep the complete source checkout to rebuild; the shared transport is outside this directory. The lockfile pins each host SDK and keeps Framer's React 18 peer separate from Canva's React 19 UI Kit.

The model is explicitly **LTX 2.5**, with 1/3/5/10-second duration choices, 480p/720p, and no generated audio. Text-to-video offers 16:9, 1:1, and 9:16; image-to-video inherits the source ratio. Availability, plan eligibility, and pricing are enforced by Magic Hour. Consult [current API pricing](https://docs.magichour.ai/pricing) before running paid tests. Looping playback is supported in Framer; a seamless visual loop is not guaranteed.

## Host setup

- [Framer](framer/README.md): official Vite plugin tooling, selected image input, native video-file upload/insertion, looping/muted playback.
- [Adobe Express](adobe-express/README.md): stable current-page/file input, native Blob video insertion, and an isolated development-only selected-element build.
- [Canva](canva/README.md): Design Editor intent, selected original image input, UI Kit interface, AI disclosure, native video upload/ingestion/insertion.

## Credential and job handling

Users enter their own Magic Hour API key. It stays in the UI's session memory and is never embedded in a bundle, sent to editor insertion APIs, written to local storage, or attached to media-storage requests. Prompts and the chosen image are sent to Magic Hour only when the user generates. The output is copied into the editor when the user clicks **Add video to design**. Privacy: https://magichour.ai/privacy-policy. Support: support@magichour.ai.

Accepted project IDs are saved before waiting: Framer plugin data, Adobe per-user client storage, and Canva app-origin local storage. Signed output URLs and source media are not persisted. Canva's saved project ID belongs to the app origin, not a particular design; resuming and adding places the video in the currently open design. The authenticated Magic Hour API enforces project access.

**Stop waiting** stops local polling/downloads while the accepted server job continues. **Resume generation** retrieves an existing ID with GET requests, without another paid generation. A failed paid submission is never automatically retried. An interrupted POST with unknown acceptance tells the user to check account history. An accepted ID is displayed even when durable saving fails. **New generation** explicitly clears the local pointer; it does not delete the previous server project.

Insertion refreshes the existing project's download URL. Editor upload/insertion errors keep the generation resumable. A lost insertion response can mean the editor already added the video: check the canvas before explicitly adding again. No plugin replaces or deletes the source image.

## Verification

Unit tests exercise the actual shared API transport with controlled HTTP, persistence before polling, errors, abort/recovery, duplicate clicks, input validation, and host adapter contracts. Browser tests compile the actual UI and adapter code, run in Chromium, and simulate only the editor APIs and (by default) Magic Hour HTTP. Canva uses the UI Kit's test provider for theming in that harness. Test fixtures are previously generated Magic Hour image/video outputs from the same account; controlled results are identified as such.

Opt-in live UI checks use the real Magic Hour API and consume credits. Supply a file path, never a literal key in a command:

```sh
MAGIC_HOUR_TEST_KEY_FILE=/absolute/private/api-key-file npm run test:ui -- --live
```

Each live platform run creates one one-second image-to-video project. Accepted IDs are written immediately to `artifacts/browser/receipts.json` for recovery. After an interrupted run, pass `MAGIC_HOUR_RESUME_RECEIPTS=/absolute/path/receipts.json` and a fresh output directory to retrieve existing IDs instead of creating another generation. `MAGIC_HOUR_TEST_PLATFORMS=canva` limits a diagnostic run to one host. Screenshots clear the key field. Receipts omit credentials and signed URLs. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an already installed browser.

See [validation](../../integration/design-video-integrations-validation.md) for actual results and remaining release gates.

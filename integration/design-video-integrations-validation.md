# Design video integrations validation — October 22, 2026

Framer PX-578, Adobe Express PX-577, and Canva PX-466. Source is in `examples/design-video`. The automated and live Magic Hour sections below record initial harness verification; later native Canva checks are recorded separately.

## Implementation

All three reuse the existing public Magic Hour REST transport, pin LTX 2.5, upload PNG/JPEG/WebP inputs, support text-to-video, save accepted IDs before waiting, retrieve completed MP4 bytes, preview results, and insert only on an explicit user action. Storage requests receive no API bearer token. Insertion retrieves the existing project again to refresh its signed URL. Paid submissions are never automatically retried.

Framer uses the actual `@framer/plugin@5.1.0` types and official `vite-plugin-framer@1.1.1` packaging with Vite 8.0.16. It copies MP4 bytes into native file storage and adds the Video component, sized to the actual output ratio, with muted looping playback. React 18 stays isolated in the Framer workspace.

Adobe uses `@adobe/ccweb-add-on-sdk-types@1.40.0`. The stable build exports only an explicitly chosen page (with export intent and export-permission checks), or accepts a file upload, and inserts native MP4 Blobs. Both manifests pass Adobe's developer-schema validator. Selected-element capture uses the experimental document-sandbox rendition API only in a separate development bundle; Adobe prohibits distributing it until stable. The stable build directory contains no experimental sandbox or manifest.

Canva uses `@canva/design@2.13.1`, `@canva/asset@2.3.1`, platform 2.2.3, intents 2.7.1, and App UI Kit 5.15.0 with React 19. It captures the chosen original image, selects point/cursor insertion by feature support, discloses output as `app_generated`, uploads a generated JPEG preview through the native image API, uses its temporary HTTPS URL as the video thumbnail, waits for asset ingestion, and adds the native video reference. The UI explains that selection reads include the full original image outside a crop.

## Automated checks

- Twenty-two unit tests: actual shared transport with controlled HTTP, image binary upload, creative-brief generation, 401/402/429/500, lost POST responses, storage failure, abort/resume without rebilling, invalid media/options, initial saved-job loading, simultaneous clicks, insertion failures, and editor adapter contracts.
- Chromium UI tests: Framer, Adobe stable, Adobe experimental selection, and Canva UI Kit. Tests generate and decode video, preview, explicitly invoke the native insertion adapter, reopen/resume with no new paid POST, handle 402, stop/resume, and verify no API key is persisted.
- TypeScript checks and all build variants pass. Canva's harness uses the UI Kit test provider; the SDK/editor APIs are simulated. The harness is excluded from distributed builds.
- The installable CI template covers these checks. It is not active in `.github/workflows` because the available GitHub credential lacks workflow scope.

## Live Magic Hour checks

Three distinct one-second image-to-video runs completed through the actual UI with the real Magic Hour API. Each source was the earlier account-owned generated mug image used by the provider test. Each MP4 decoded to 640×640 and 1.041667 seconds. Host APIs were simulated: none of these screenshots proves installation in a real host editor. The credential field was cleared before capture.

| UI     | Project                     | Credits | MP4 bytes | SHA-256                                                            |
| ------ | --------------------------- | ------- | --------- | ------------------------------------------------------------------ |
| framer | `cmviym7mp05bchb01jyzv1y4k` | 24      | 112,814   | `a176d403bb216d29352c7b3f229664bafc214c8a5c46deb87542d2550e49c89a` |
| adobe  | `cmviymhoy058bfl017btblk0e` | 24      | 111,046   | `613da91f63b985291e25fd890b0cef4e6ab4eca1cb0daed4e93614ed9c272460` |
| canva  | `cmviymlmy025sg5011gl6fnkr` | 24      | 109,558   | `5e8c0edabac4cfdd5bb7fae3dd8b3c64e2778d4446c271ee98c9140a84b8d57a` |

Total verified charge: **72 Magic Hour credits**.

No credentials or signed output URLs are committed. Only accepted project IDs and sanitized verification receipts are recorded.

## Canva native validation — October 22, 2026

The submitted version 2 bundle was tested inside the actual Canva editor. Generation, accepted-job recovery without a new generation, selected-image capture, native video ingestion and insertion, retry, empty-selection recovery, and light/dark rendering passed. The source image remained in the design; both the video and generated preview were copied through Canva's native asset APIs.

The tested JavaScript bundle has SHA256 `c901ae7b38f5ae4be725240946fb34ffdd066ced201f3ddd5c0eb5a21b3fc882`; its translation catalog has SHA256 `de8b22ef08789bfb1a8360d610fbadf084ebb44d66480d7482dbc27f1cf858dd`. These match the recorded submitted artifacts. This later native validation supersedes the Canva harness-only and initial portal-access limitations above. Marketplace approval and publication remain pending.

## Recorded release status and remaining gates

- Framer: the [Magic Hour Video listing](https://www.framer.com/marketplace/plugins/magic-hour-video/) was restored and verified publicly on October 22. Signed-in marketplace launch, close/reopen recovery, and native video upload/insertion passed without a new generation.
- Adobe Express: stable version 0.1.0 was submitted and recorded In review. Private version 0.1.1, with byte-identical JavaScript, CSS, and HTML and only a manifest-version change, passed current-page capture, accepted-project retrieval, preview, and native video insertion. The local file-upload chooser remains unverified. Experimental selected-element capture is excluded from the submitted stable build.
- Canva: marketplace naming review, approval, and publication remain pending after version 2 submission.
- Adobe Express and Canva: marketplace approval and publication remain pending. Framer is already published; its recorded restoration is distinct from these pending reviews.

During initial setup, Framer and Adobe browser sessions reached sign-in pages, and Canva's developer portal returned HTTP 403. The later native Canva validation above supersedes that initial Canva access failure. The connected Canva MCP surface does not register or install Developer SDK apps.

## Official sources

- [Framer assets](https://www.framer.com/developers/assets), [configuration](https://www.framer.com/developers/configuration), [official starter](https://github.com/framer/plugins/tree/main/starters/cms).
- [Adobe renditions](https://developer.adobe.com/express/add-ons/docs/guides/learn/how-to/create-renditions), [video import](https://developer.adobe.com/express/add-ons/docs/guides/learn/how-to/use-videos), [manifest](https://developer.adobe.com/express/add-ons/docs/references/manifest/).
- [Canva selection](https://www.canva.dev/docs/apps/selection/), [video creation](https://www.canva.dev/docs/apps/creating-videos/), [current upload contract](https://www.canva.dev/docs/apps/api/latest/asset-upload/).

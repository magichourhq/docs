# Magic Hour for Make

Production module definitions for the Magic Hour custom app. Each module directory contains Communication, Mappable parameters (`expect.json`), and Interface blocks for the Make Apps Editor. Connection authorization, API errors, and log sanitization are inherited from the app Base. Keep the Base fixed to Magic Hour and redact the Authorization header. All module requests disable GET and non-GET redirects.

## Configure in the Make Apps Editor

Create a private app named Magic Hour. Paste `base.json` into Base. Add an API Key connection and paste `connection/communication.json` into Communication and `connection/parameters.json` into Parameters. Do not put an API key in Base, Common data, or any source file.

Create the modules below using Blank Module and attach the API Key connection. For each module, paste its `communication.json` into Communication, `expect.json` into Mappable Parameters, and `interface.json` into Interface. Leave Static Parameters empty. Enable module visibility for native scenario testing.

| Directory             | Label                      | Type             |
| --------------------- | -------------------------- | ---------------- |
| `generateImage`       | Generate an AI Image       | Action           |
| `faceSwapPhoto`       | Swap Faces in a Photo      | Action           |
| `faceSwapVideo`       | Swap Faces in a Video      | Action           |
| `imageToVideo`        | Animate an Image           | Action           |
| `textToVideo`         | Generate a Video from Text | Action           |
| `getGenerationStatus` | Get Generation Status      | Action           |
| `makeApiCall`         | Make an API Call           | Universal / REST |

Use a private scenario to execute every module and an error case before requesting Make review. These definitions do not imply a public Marketplace listing.

## Create and retrieve a generation

1. Add a generation action and connect a Magic Hour API key from https://magichour.ai/developer?tab=api-keys. Generation requests consume Magic Hour credits.
2. For media inputs, provide a direct public HTTPS file URL or a Magic Hour uploaded file_path. A Google Drive sharing-page URL is not a direct downloadable media URL. Use files you have permission to process.
3. Run the creation action once and retain its Generation ID. Its response confirms creation, not completion.
4. After a delay, run Get Generation Status with the same ID and the correct image/video/audio format. For queued or rendering jobs, retain the ID and check again on a later scheduled run. Set a finite attempt limit; do not repeat the creation action to poll.
5. Route complete jobs to HTTP Get a file using a Downloads URL, then save the file to Google Drive or another destination. Route error and canceled jobs to a failure handler. Download URLs expire at the returned ISO 8601 timestamp.
6. Read Credits charged from the final details response for the actual charge. Frame-based creation estimates can settle to the rendered frame count.

The public API has no project-list endpoint, so this version provides no global polling completion trigger. Signed webhooks are a separate workflow requiring registration and verified raw-body signatures.

## Make an API call

Use a relative path such as `/v1/account`, a method, optional query parameters, and an optional JSON body. Requests always start with the literal `https://api.magichour.ai/` origin. The path validation excludes full URLs, protocol-relative paths, dot segments, percent escapes, backslashes, query strings, and fragments. Custom headers are intentionally absent. Both redirect controls are false, and only 2xx responses count as successful.

## Defaults

Generate an image: Z-Image Turbo, one image, square, 1024px longest edge (`1k`); advanced 640px option is available for the free plan or lower-cost checks. Image-to-video and text-to-video: LTX 2.5, 480p, one second, no audio. Face swaps use all-faces mode.

## Official contracts

- https://docs.magichour.ai/api-reference/openapi.json
- https://docs.magichour.ai/api-reference/models
- https://developers.make.com/custom-apps-documentation/component-blocks/api/making-requests
- https://developers.make.com/custom-apps-documentation/block-elements/parameters
- https://developers.make.com/custom-apps-documentation/component-blocks/interface
- https://developers.make.com/custom-apps-documentation/app-components/modules/universal-module/rest

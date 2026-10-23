# Magic Hour for Make

Production module definitions for the Magic Hour custom app. Each module directory contains Communication, Mappable parameters (`expect.json`), and Interface blocks for the Make Apps Editor. Connection authorization, API errors, and log sanitization are inherited from the app Base. Keep the Base fixed to Magic Hour and redact the Authorization header. All module requests disable GET and non-GET redirects.

## Configure in the Make Apps Editor

Create a private app named Magic Hour. Paste `base.json` into Base. Add an API Key connection and paste `connection/communication.json` into Communication and `connection/parameters.json` into Parameters. Do not put an API key in Base, Common data, or any source file. Connection metadata identifies the authenticated account by email, falling back to its account ID when email is unavailable.

Create the modules below using Blank Module and attach the API Key connection. For each module, paste its `communication.json` into Communication, `expect.json` into Mappable Parameters, and `interface.json` into Interface. Leave Static Parameters empty. Enable module visibility for native scenario testing. Set Module action to Create for the five generation modules and Read for Get generation status. Paste `groups.json` into Groups; it places retrieval before creation and leaves only Make an API call in Other.

| Directory             | Label                      | Type             |
| --------------------- | -------------------------- | ---------------- |
| `generateImage`       | Generate an AI image       | Action           |
| `faceSwapPhoto`       | Swap faces in a photo      | Action           |
| `faceSwapVideo`       | Swap faces in a video      | Action           |
| `imageToVideo`        | Animate an image           | Action           |
| `textToVideo`         | Generate a video from text | Action           |
| `getGenerationStatus` | Get generation status      | Action           |
| `makeApiCall`         | Make an API call           | Universal / REST |

After changing these definitions, re-run the native scenarios for every module, including an API error and a universal-module POST with an object body, before requesting Make review. These definitions do not imply a public Marketplace listing.

## Create and retrieve a generation

1. Add a generation action and connect a Magic Hour API key from https://magichour.ai/developer?tab=api-keys. Generation requests consume Magic Hour credits.
2. For media inputs, provide a direct public HTTPS file URL or a Magic Hour uploaded file_path. A Google Drive sharing-page URL is not a direct downloadable media URL. Use files you have permission to process.
3. Run the creation action once and retain its Generation ID. Its response confirms creation, not completion.
4. After a delay, run Get generation status with the same ID and the correct image/video/audio format. For queued or rendering jobs, retain the ID and check again on a later scheduled run. Set a finite attempt limit; do not repeat the creation action to poll.
5. Route complete jobs to HTTP Get a file using a Downloads URL, then save the file to Google Drive or another destination. Route error and canceled jobs to a failure handler. Download URLs expire at the returned ISO 8601 timestamp.
6. Read Credits charged from the final details response for the actual charge. Frame-based creation estimates can settle to the rendered frame count.

Creation and status retrieval are separate so a wait timeout does not hide an accepted, chargeable job. Persist the returned ID before waiting, and resume that ID instead of submitting another generation.

The public API has no project-list endpoint, so this version provides no global polling completion trigger. Signed webhooks are a separate workflow requiring registration and verified raw-body signatures.

## Use files from Google Drive or attachments

For a PNG file downloaded by another Make module:

1. Download the file and retain its binary data.
2. Use Make an API call with Method `POST`, URL `/v1/files/upload-urls`, and this Body as a JSON object:

   ```json
   {
     "items": [{ "type": "image", "extension": "png" }]
   }
   ```

3. From the first returned `body.items` item, retain `upload_url`, `expires_at`, and `file_path`. Response items follow the request order. Use the actual asset type (`image`, `video`, or `audio`) and its supported lowercase extension without a leading dot.
4. In a standard HTTP request module, set Method to `PUT`, URL to that exact `upload_url`, and the request body to the file's binary data. Use no authentication and no Authorization header: the returned URL already authorizes this upload. Upload before `expires_at`; request a fresh upload URL if it expires. This PUT uploads bytes; it is not a JSON or multipart request.
5. After the PUT succeeds, map `file_path` into the matching generation input, such as Starting image or Target image. Do not pass `upload_url` as the generation input.

This flow keeps private files out of public sharing links. The Magic Hour universal module requests upload authorization; the separate HTTP module transfers the bytes.

## Make an API call

Use a relative path such as `/v1/account`, a method, optional query parameters, and an optional JSON body. Requests always start with the literal `https://api.magichour.ai/` origin. The path validation excludes full URLs, protocol-relative paths, dot segments, percent escapes, backslashes, query strings, and fragments. Additional headers can be supplied as name/value pairs. Authorization is supplied by the connection and cannot be overridden, regardless of header-name capitalization. Map Body as a JSON collection or array; parse existing JSON text with JSON > Parse JSON first. The request uses JSON encoding without converting an object into a quoted JSON string. Both redirect controls are false, and only 2xx responses count as successful.

## Defaults

Generate an image: Z-Image Turbo, one image, square, 1024px longest edge (`1k`); advanced 640px option is available for the free plan or lower-cost checks. Image-to-video and text-to-video: LTX 2.5, 480p, one second, no audio. Face swaps use all-faces mode. LTX 2.5 accepts every integer duration from 1 through 60 seconds on the documented image-to-video and text-to-video endpoints.

The connection uses the documented `GET /v1/account` endpoint. It returns account details for a valid key and HTTP 401 with code `unauthorized` for an invalid key.

## Official contracts

- https://docs.magichour.ai/api-reference/openapi.json
- https://docs.magichour.ai/api-reference/models
- https://developers.make.com/custom-apps-documentation/component-blocks/api/making-requests
- https://developers.make.com/custom-apps-documentation/block-elements/parameters
- https://developers.make.com/custom-apps-documentation/component-blocks/interface
- https://developers.make.com/custom-apps-documentation/app-components/modules/universal-module/rest

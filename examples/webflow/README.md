# Magic Hour GIF for Webflow

A pure Designer Extension: describe an animation, generate one GIF with Magic Hour, preview it, and explicitly add it as a native Webflow Asset and Image. No Data Client, backend, MP4 conversion, or Webflow access token is required.

## Build

Use Node 22.13 or later.

```sh
npm ci
npm run check
npm run build
```

The pinned official Webflow CLI creates `bundle.zip` from `public/`. Production bundles must stay under 5 MB. Source maps stay in `review/`, outside `public/`; set `WEBFLOW_REVIEW_DIR` to another directory when building release artifacts. Zip that exact build’s review directory separately for Webflow’s private **Source map artifact** field. It contains the external JS/CSS maps with embedded source, package manifest, lockfile, and packaging README. Never upload the review ZIP as the production extension.

```sh
WEBFLOW_REVIEW_DIR=/absolute/private/review npm run build
```

Run `npm run dev` to serve the compiled public assets on port 1337. Rebuild after source edits. Register a **Designer Extension** app in Webflow, install it on your test site, and open **Launch development app** to test localhost. For uploaded bundles, use **Launch App** to test the hosted version. Local rendering alone does not verify the Designer APIs.

## Use

1. Open the app in the Webflow Designer on the main branch, primary locale, in Design mode. You need permission to manage assets and modify images.
2. Select an existing element inside the page. The extension inserts after the current selection and never replaces the selected source. Selecting Body is rejected.
3. Enter your own Magic Hour API key and a prompt of 1–500 characters. Review the privacy disclosure and check consent. **Generate GIF** submits one paid request costing **50 Magic Hour API credits**.
4. The accepted image-project ID appears before polling. Copy it before closing the extension. **Stop waiting** stops local REST waiting/downloads; it does not cancel the server job or refund a generation.
5. Preview the completed GIF. Oversized output is resized locally to at most 512 px on its longest side, preserving animation, timing, and looping. It tries 384 px and 256 px only if needed to fit 4 MB; the original remains in Magic Hour and no new generation is submitted. **Add GIF to Webflow** uploads the bytes as an `image/gif` File, creates a native site Asset, inserts a new Image after your current selection, and sets its asset. Webflow Assets are publicly accessible and discoverable, even before the page is published.
6. **Resume** retrieves an existing Magic Hour image project without another paid generation. Paste the copied ID after reopening. **New generation** clears the current result and requires fresh consent.

The API key, prompt, and recovery ID are kept only in extension memory and are never copied to Webflow. GIF bytes are kept in memory until you explicitly add the GIF to Webflow. They are never saved in browser storage, site metadata, or analytics. Closing or refreshing the extension loses this local state. Magic Hour stores the submitted project in your account; Webflow stores the copied GIF only after Add. No Webflow token is sent to Magic Hour.

## API and limits

- `POST https://api.magichour.ai/v1/ai-gif-generator`: `{ name: "Magic Hour GIF for Webflow", style: { prompt }, output_format: "gif" }`.
- Poll `GET /v1/image-projects/{id}`, then download the signed HTTPS output without Authorization headers.
- Accept only nonempty GIF87a/GIF89a data at most **4,000,000 bytes**, matching a conservative interpretation of Webflow’s 4 MB image limit. Non-GIF results are rejected. GIFs above the limit are decoded, composited, resized, and re-encoded locally with the pinned `gifuct-js` and `gifenc` libraries; the exact resized animation is previewed before upload. Complex input that exceeds the local processing limit, or output still above 4 MB, is rejected without another generation. No MP4 conversion occurs.
- Paid POST requests are never retried. If acceptance is unknown, check Magic Hour account history before choosing New generation.
- Import failures retain the accepted project ID. Uploaded Assets and an Image awaiting attachment are reused within the same extension session/site when possible. If insertion status is uncertain, inspect the canvas before another Add.

## Release verification

Before Marketplace submission, test the exact hosted bundle in the actual Designer: unchecked consent blocks POST; permissions/selection fail before paid generation; accepted-ID recovery and stop/resume never rebill; GIF upload and animation work; Add preserves the selected source; errors and the public-asset disclosure remain clear. Validate actual API CORS from the hosted extension origin and obtain Webflow’s required `wfpre_` preflight receipt. Record native evidence and approval separately from source/build completion.

References: [Designer setup](https://developers.webflow.com/designer/reference/designer-api/getting-started), [native assets and 4 MB limit](https://developers.webflow.com/designer/reference/create-an-asset), [insert after selection](https://developers.webflow.com/designer/reference/insert-element-after), [set Image asset](https://developers.webflow.com/designer/reference/image-element/setAsset), [public Assets](https://developers.webflow.com/designer/reference/asset-overview), [packaging and private source maps](https://developers.webflow.com/apps/docs/publishing-your-app), [Magic Hour AI GIF API](https://docs.magichour.ai/api-reference/image-projects/ai-gif-generator).

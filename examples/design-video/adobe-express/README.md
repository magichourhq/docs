# Magic Hour for Adobe Express

Build from `examples/design-video` with `npm run build`. Both manifests pass Adobe's current developer-schema validator.

## Stable build: file or explicitly exported current page

`dist/manifest.json` has **no experimental API flag and no document sandbox**. It lets the user upload a PNG/JPEG/WebP or explicitly choose **Use current page**, then generate and add an MP4 through `app.document.addVideo(blob, attributes)`.

Current-page capture checks `exportAllowed()` and uses `RenditionIntent.export`. It refuses restricted exports; it does not upload a preview-only rendition or silently capture a page when the user asked for one selected element. No source elements are replaced or deleted.

1. Sign in to Adobe Express, enable add-on development, and load the manifest/bundle using Adobe's development tools.
2. Serve `dist` over locally trusted HTTPS. For the included server, set `LOCAL_TLS_KEY` and `LOCAL_TLS_CERT` to local certificate files, then run `npm run dev:adobe` from the parent directory (default port 5173). Visit and trust your local certificate before loading it in Express.
3. Enter your Magic Hour API key, upload an image or explicitly export the current page, generate, preview, and choose **Add video to design**.
4. Verify actual MP4 insertion, export restrictions, close/reopen/resume, and chosen-page behavior in Adobe Express.

## Selected element: development only

Adobe documents `VisualNode.createRendition()` as **experimental and unavailable for distributed add-ons**. The separate `selection-dist` bundle enables `experimentalApis`, supplies `code.js`, and uses the documented document-sandbox API proxy. The main `dist` bundle does not include it.

For development testing, serve `selection-dist` and load its own manifest. **Use selected element (development)** captures exactly one selected node as PNG, after checking export permission. No entire-page fallback happens in this mode. This captures a visual element including its descendants; it is not restricted to raster-image nodes.

Do not submit `selection-dist` for marketplace publication. For a public app, use the stable file/current-page build until Adobe stabilizes element-level export. This platform restriction means the original selected-image ticket is only fulfilled in the development build today.

Submission uses an authorized Adobe developer/publisher account. The manifest's `testId` is a development identifier, not a marketplace ID. Prepared listing copy is in `../publishing/listings.md`. This server has no authenticated Adobe Express editor session.

References: [renditions and experimental element capture](https://developer.adobe.com/express/add-ons/docs/guides/learn/how-to/create-renditions), [video import](https://developer.adobe.com/express/add-ons/docs/guides/learn/how-to/use-videos), [manifest](https://developer.adobe.com/express/add-ons/docs/references/manifest/).

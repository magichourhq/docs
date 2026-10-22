# Magic Hour for Canva

A Design Editor intent using the current Canva Developers SDK and App UI Kit. Build from `examples/design-video` with `npm run build`; the Developer Portal bundle is **`canva/dist/app.js`**. UI Kit CSS is included in the JS bundle so the portal does not need a separate stylesheet. The same build generates `canva/dist/messages_en.json` for the Portal’s UI translation upload, with message IDs matching the bundled UI, status, and recovery text. Canva’s `AppI18nProvider` and `initIntl` load the approved translations; untranslated locales retain the existing English copy. The API key uses a masked native password field because the UI Kit TextInput does not support password input.

## Developer Portal setup

1. Sign in to the authorized Magic Hour Canva developer account, create/select the app, and enable its Design Editor intent.
2. Configure these scopes: `canva:design:content:read`, `canva:design:content:write`, `canva:asset:private:read`, and `canva:asset:private:write`. Selection and asset reads are needed only for **Use selected image**; uploads/insertion use the write scopes.
3. Upload `dist/app.js`, or run `npm run dev:canva` from the parent directory and configure the development JavaScript URL `http://localhost:5173/app.js`. Use the Portal's preview workflow; opening the bundle outside Canva is not a valid SDK runtime.
4. Enter your own Magic Hour API key. Select exactly one raster image and click **Use selected image**, or upload your own PNG/JPEG/WebP. Canva returns the full underlying image, including content outside its crop/frame; the UI explains this before capture.
5. Generate the video, preview it, and click **Add video to design**. The adapter copies a generated JPEG preview image into Canva, retrieves its temporary HTTPS URL, and uses it when uploading the refreshed HTTPS video URL. Both assets use `aiDisclosure: "app_generated"`. It waits for ingestion before adding the native video asset. The source image remains unchanged.
6. Test real video ingestion, the original-image selection behavior, editor feature contexts, local persistence, and close/reopen/resume inside Canva before marketplace submission.

`features.isSupported` chooses point insertion or cursor insertion according to the current editing context, and generation is blocked when neither is available. The source and API key are not saved; only the accepted project ID is saved in app-origin local storage. The pointer can be resumed into the currently open design; it is not scoped to a single design.

Native video upload uses the signed Magic Hour output URL only while copying it into Canva. The app retrieves a fresh URL immediately before adding and does not store it. The preview image is uploaded through Canva’s native image API; its temporary HTTPS URL is used as the video thumbnail. Successful preview and video references are reused for explicit retries in the current app session. Video outputs are limited locally to 100 MB for conservative compatibility.

Prepared submission copy is in `../publishing/listings.md`. Actual registration, real editor testing, account/billing disclosures, required review assets, and Canva review remain publisher steps. The Canva MCP connection is a different API surface and does not register or install this app; the developer portal returned HTTP 403 from this environment.

References: [selection](https://www.canva.dev/docs/apps/selection/), [video creation](https://www.canva.dev/docs/apps/creating-videos/), [current upload contract](https://www.canva.dev/docs/apps/api/latest/asset-upload/), [feature support](https://www.canva.dev/docs/apps/supporting-features/).

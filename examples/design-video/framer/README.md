# Magic Hour for Framer

From `examples/design-video`, run `npm ci --no-audit --no-fund`, then `npm run build`. The production bundle is `framer/dist` and uses Framer's official `vite-plugin-framer` build convention, including `.mjs` entry files and `framer.json`.

## Development installation

1. Run `npm run dev:framer` and open the development plugin through Framer's [development plugin launcher](https://framer.com/plugins/open). Framer must be signed in and the project editable.
2. For a trusted local HTTPS server, provide `LOCAL_TLS_KEY` and `LOCAL_TLS_CERT` paths when starting the dev command. Use certificates trusted by your local browser; no private certificate is included here.
3. Enter your Magic Hour API key. Select an image and click **Use selected image**, or upload your own PNG/JPEG/WebP. Without an image, the creative brief creates text-to-video.
4. Choose duration/resolution, review the privacy disclosure, and check the consent box before generating. Review the preview and click **Add video to design**. The adapter uploads the MP4 bytes as a native Framer file and inserts Framer's Video component at the video's actual aspect ratio with loop, playing, and muted enabled. It adds a new component and keeps the source image.
5. Close/reopen the plugin in the same browser tab session and resume the saved project without another generation charge. Recovery stays in browser session storage, scoped to the current Framer user and project; closing the tab clears it. Older shared recovery IDs are removed when editing is allowed and are never read or migrated. Enter an existing Magic Hour project ID manually when needed. Verify actual file upload, video playback, insertion, project permissions, and session recovery inside Framer before distribution.

`framer.json` has a development-only identifier. Set `FRAMER_PLUGIN_ID` to the authorized publishing project's identifier when running `node build.mjs --release`. The release command rejects a missing publisher ID. Confirm the identifier and publisher in Framer before submission; a local build does not create a marketplace listing.

Publish through Framer's plugin dashboard using the prepared copy in `../publishing/listings.md`, and validate the actual editor build before submission. The workspace/server connection here has no signed-in Framer browser session.

References: [configuration](https://www.framer.com/developers/configuration), [assets and native video upload](https://www.framer.com/developers/assets), [components](https://www.framer.com/developers/plugins-with-components), [official starter](https://github.com/framer/plugins/tree/main/starters/cms).

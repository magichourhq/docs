# Creative integrations validation — October 21, 2026

Implementation for PX-576 (Vercel AI SDK), PX-593 (Langflow, despite the ticket's Langfuse title), and PX-579 (Figma).

## Controlled checks

- AI SDK: 17 tests through real `generateImage`, `experimental_generateVideo`, and provider registry entrypoints. Covers image and video polling, binary upload, URL inputs, batching, HTTP 401/402/429/500, interrupted submissions, abort after acceptance, GET-only resume, unsupported options, failed downloads, and awaiting durable ID persistence before polling.
- Langflow: 11 tests using the installed lfx runtime. Covers secret/string keys, validation, key rotation and hashed cache isolation, inherited discovery, Tool Mode, and clearing stale tools on key changes. Ruff passes. Upstream dependencies emit Pydantic deprecation warnings.
- Figma: 7 tests against the compiled controller with a simulated Figma API, plus a browser test of the actual UI in an opaque-origin iframe. Covers generation/editing, preview/insertion messages, uploads, waiting/resume without another paid POST, API credit errors, original-layer identity, deleted layers, page changes, and invalid byte messages.
- TypeScript checks and builds pass. The provider tarball and Figma development bundle are prepared locally. An installable CI template is provided in `examples/creative-integrations.workflow.yml`; it is not active because the available GitHub credential cannot write workflow files.

## Live checks

| Path                                         | Project                     | Verified result                                                                                  | Credits |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| AI SDK image generation                      | `cmvithv4r0063i901565h8pw1` | Completed PNG, 302,337 bytes                                                                     | 5       |
| AI SDK binary-upload image-to-video          | `cmvithzhr0065i901kyfl2mza` | Downloaded H.264 MP4, 640×640, 1.041667 seconds, 120,188 bytes                                   | 24      |
| Langflow-discovered MCP generation/retrieval | `cmvitm8kb02fyiv017p5z5l1y` | Completed image, one downloadable output; 46 tools discovered                                    | 5       |
| Figma UI image generation                    | `cmvitnocd02fwin014k1vv035` | Completed image downloaded and previewed; insertion message verified in simulated bridge         | 5       |
| Figma UI selected-image edit                 | `cmvitnvtg02gyiv01p1ecpkp5` | Real PNG upload, completed green-mug edit, preview and original-layer insertion message verified | 5       |

The five verified projects charged 44 credits. An earlier Langflow test invocation returned an MCP `CallToolResult` object before its example parser supported that object type; its project ID was not retained, so its completion and charge were not verified. It was not automatically retried. A separate test with the corrected parser completed successfully. Screenshots were recaptured by resuming completed projects without new generations.

Image SHA-256: `dfbfc1a664597bbdea32aa032975bb01a7b97a37c9eac6d3fdeaa2848ce05d32`.

Video SHA-256: `658db6e51889b5328040391a96c9c28de8c9d0fa6888ed5fd07968d41fd03833`.

No API key or signed download URL is included in these receipts. The Figma screenshots show the actual plugin UI with live output, running in the browser test harness. They are not screenshots of an installed plugin inside Figma Desktop.

## Release gates

- CI: copy the workflow template into `.github/workflows/creative-integrations.yml` using a credential with workflow write permission.
- Vercel: authorized npm publishing identity/scope, npm release, and optional upstream community-provider directory submission.
- Langflow: full editor loading, secret-variable selection, discovery of 46 tools, dynamic retrieval inputs, and completed-project output inspection passed in Langflow 1.12.7. A portable imported flow also ran through its authenticated API. Upstream review/publication remains separate.
- Figma: obtain a publisher-owned development plugin ID, import and run the built manifest in Figma Desktop, validate canvas behavior there, and complete publisher/privacy/support requirements and Community review.

Public marketplace approval and actual adoption are not established by code or local tests. These tickets should remain in review until the relevant release gates are handled.

## Sources checked

- [Vercel custom providers](https://ai-sdk.dev/providers/community-providers/custom-providers) and [video generation](https://ai-sdk.dev/docs/ai-sdk-core/video-generation), plus installed `ai@7.0.148` / `@ai-sdk/provider@4.0.31` source and types.
- [Langflow MCP component source](https://github.com/langflow-ai/langflow/blob/main/src/lfx/src/lfx/components/models_and_agents/mcp_component.py), plus installed `lfx==1.12.7` runtime.
- [Figma plugin manifest](https://developers.figma.com/docs/plugins/manifest/), [network requests](https://developers.figma.com/docs/plugins/making-network-requests/), and [image API](https://developers.figma.com/docs/plugins/api/properties/figma-createimageasync/).
- Magic Hour's current checked-in public OpenAPI schema at the implementation base, docs commit `bc909d4`.

## Post-merge release validation

The full Langflow editor test found that the API-key refresh handler cleared tools without opening the single-tool dropdown. The handler now routes through the canonical parent MCP-server refresh lifecycle. The fix and a regression test passed, then the editor discovered 46 tools and retrieved the previously completed image project. No new generation was submitted during this editor test. The portable example imports with an empty project ID and a global-secret reference; its copied validation instance returned HTTP 200 and the completed project through the authenticated flow-run API.

Figma publishing assets and listing copy are prepared in `examples/figma/publishing`. The official classic-plugin process requires a macOS/Windows desktop app to register and submit a plugin. That desktop step remains owner-operated; the connected MCP account does not expose the standard-plugin publication surface.

# Validation — October 22, 2026 Pacific

Runtime: Node.js 24.21.0; pinned MCP adapter 2.0.1, LangGraph 1.5.2, core 1.3.0.
Reuses the example reference from closed docs PR #504 / ENG-4839, updated for the
current adapter. The separate community `langchain-magic-hour` packages and their
already merged upstream directory entries are not replaced or resubmitted.

- Clean dependency install succeeded; production audit: zero vulnerabilities.
- Nine recovery/error tests pass using controlled tool responses.
- Real hosted discovery: 48 tools; required image/edit/animation operations present.
- Valid configured key: actual `account_retrieve` succeeds. Account identifiers,
  email and balance are not recorded here.
- Intentionally invalid key: actual account call returns HTTP 401; CLI exits 1.
- Missing `--max-credits`: CLI exits 1 before connection/generation.
- Actual CLI recovery of existing project `cmvitm8kb02fyiv017p5z5l1y` completed
  through the current adapter, wait helper, signed download and file writer.
  Output: PNG, 640 x 640, 266165 bytes, SHA256
  `bcdc269a133cf8a79353b832adb03223903c4e63b781085561c15471c53ba0cb`.
  This is an older completed project. Its historical 5-credit charge is not new
  spending. This verification created zero new jobs and spent zero new credits.

## Fresh generation verification

Owner-approved total cap: 100 Magic Hour credits. Source commit: `6008825`.
Each of the following CLI invocations used `--submit-only`, saved the accepted ID,
exited, and resumed that same record to wait and download.

- generate: `cmvkn3rgn0072i001pqmjp31v`, 5 final credits, 307344 bytes. SHA256 `304ba03f9a1bc9de22516f924597cb2c20a0649b470352b3db6404a9f3a03ba9`.
- edit: `cmvkn8e6j043afc0126mopp5s`, 5 final credits, 261367 bytes. SHA256 `3bb258977910146f7fe775ae13c34e37d858f3b507782f82371357044b079aab`.
- animate: `cmvkna0bx010rlt01uib9sgk1`, 24 final credits, 151281 bytes. SHA256 `28ebc742a8606b7b3149a827ba4a85141b93b7a0020f060712463948cc823211`.

Total verified charge: **34 / 100 credits**. The two PNGs decode as 640 x 640.
The image edit and animation reuse a binary input uploaded through the official
Magic Hour Python SDK 0.89.0. The MP4 decodes as H.264, 640 x 640, 24 fps,
25 frames / 1.041667 seconds. The still images were visually inspected; this
validates the integration and output handling, not commercial image quality.

These are owner-operated tests, not external developer activations or new paying
customers. Source publication still requires PR review/merge and deployed-doc
verification. Existing community package listings are tracked separately.

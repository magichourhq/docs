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

Pending: explicit test-credit cap, followed by fresh image, image-edit and
one-second animation runs, and actual create/stop/resume verification. Controlled
tests do not replace these live checks. New video generation, prompt-model
execution, production publication and external customer activation are unverified.

Output files and private recovery receipts remain Git-ignored. No API keys or
signed URLs are committed. No screenshot is applicable to this source example.

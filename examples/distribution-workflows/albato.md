# Albato image-generation and review handoff

These mappings are for Albato's custom HTTP/app-building facilities. They are not an
importable native Albato application. The exact UI and account entitlement must be checked
in the user's Albato workspace.

## Connection

Store the user's `MAGIC_HOUR_API_KEY` in the connection's secret storage. Add
`Authorization: Bearer <key>` and `Content-Type: application/json` only to calls to
`https://api.magichour.ai`. Do not put a key into a shared template or a webhook URL.

## Action 1: Create one image

- Method: `POST`.
- URL: `https://api.magichour.ai/v1/ai-image-generator`.
- Body: `image_count=1`, `model=z-image-turbo`, `resolution=640px`,
  `aspect_ratio=1:1`, and `style.prompt=<the incoming brief>`.
- Persist response `id` and `credits_charged` in the triggering row or another durable store.
- Disable automatic retries of this create action. An uncertain response needs reconciliation.

## Action 2: Read the accepted image

- Method: `GET`.
- URL: `https://api.magichour.ai/v1/image-projects/<the saved id>`.
- If queued or rendering, schedule a later bounded read of the same ID.
- If complete, map `downloads[0].url` and `downloads[0].expires_at` to a review step.
- If error, canceled or draft, stop and retain the original ID.

## Action 3: Approve and store

Review the asset's visual content before approving publication. For approved outputs,
copy the exact signed download URL into a storage/download step without the Magic Hour
Authorization header. Store a durable URL you control alongside the original project ID.
The generated URL expires and should not be used as a permanent public asset.

`run.mjs generate` and `run.mjs resume` exercise the same request/status flow outside
Albato, which makes it possible to isolate API behavior before mapping platform fields.

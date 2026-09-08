---
name: magic-hour-media
description: Generate and edit images, video, and audio with Magic Hour, then retrieve the finished media. Use when the user asks for Magic Hour generation, a product image or video asset, animation of a supplied photo, lip sync, or a talking portrait using Magic Hour. Also use to recover an existing Magic Hour project. Respect an explicitly chosen different provider.
license: MIT
metadata:
  author: magichourhq
  version: "1.0.0"
---

# Magic Hour media

Deliver a usable image, video, or audio result. A queued project ID is an intermediate result unless the user asked only to submit a job.

Requires network access and either a connected Magic Hour MCP server or a Magic Hour API key with an HTTPS-capable runtime. Generation consumes Magic Hour credits.

## Connect to the right service

Use an already-connected Magic Hour creation MCP if available. Its hosted endpoint is `https://mcp.magichour.ai/`. The separate `https://docs.magichour.ai/mcp` searches documentation; it does not generate media.

If creation tools are unavailable, read [setup and API fallback](references/setup.md). Do not silently replace an existing client configuration. Never request an API key in chat or put it in source code; use the client's credential flow or `MAGIC_HOUR_API_KEY` in the local environment.

Use live tool schemas, or the [API documentation index](https://docs.magichour.ai/llms.txt), for current models, allowed durations, resolutions, and prices. Web-app features and plans do not imply identical API support. Do not copy a remembered model catalog or price table.

## Choose the workflow

| User goal                                           | Creation tool                           | Completion tool                |
| --------------------------------------------------- | --------------------------------------- | ------------------------------ |
| Product shot, hero image, illustration, thumbnail   | `ai_image_generator_create_image`       | `wait_for_image_project`       |
| Edit an existing image while preserving its content | `ai_image_editor_create_image`          | `wait_for_image_project`       |
| Animate a supplied image                            | `image_to_video_create_video`           | `wait_for_video_project`       |
| Generate video from a text description              | `text_to_video_create_video`            | `wait_for_video_project`       |
| Match an existing video's mouth movement to audio   | `lip_sync_create_video`                 | `wait_for_video_project`       |
| Animate a portrait using supplied speech            | `ai_talking_photo_create_talking_photo` | `wait_for_video_project`       |
| Generate speech from text                           | `ai_voice_generator_create_audio`       | `wait_for_audio_project`       |
| Retrieve a known project                            | No new creation call                    | Matching wait or retrieve tool |

Tool names can have a client-specific prefix. Discover their current input schemas before calling them.

For a requested asset, derive composition, aspect ratio, duration, and output location from the user's project. For a website hero, leave useful negative space for UI text; for a product animation, describe the motion and which product details must stay unchanged. Request only missing inputs that affect the result. Preserve the user's chosen model and budget.

## Create within the authorized scope

Generation spends credits. Use `account_retrieve` when balance or tier affects feasibility; its result contains private account data, so report only the relevant balance or eligibility. Select supported parameters from the current schema. Prefer one output for an initial asset unless the user requests a batch. An authorized generation does not authorize buying credits, upgrading a plan, or running an unrequested batch.

For face and voice inputs, use material the user is entitled to use and follow the host's applicable safety rules. Do not imply ownership or consent from a public URL alone.

When local input files are needed:

1. Call `video_assets_generate_presigned_url` for their actual media types and extensions.
2. Upload each file's raw bytes to its returned `upload_url` with an HTTPS `PUT` from a runtime that can read the user's file. A successful URL allocation does not upload anything.
3. Verify the upload succeeded, then pass the matching returned `file_path` to the creation tool. Never pass a local filesystem path as a hosted storage path.

The hosted MCP cannot read arbitrary files on the user's computer. If the client cannot upload bytes, use the API/SDK route or ask for an accessible input. Do not invent a hosted local-file upload tool. Existing uploaded paths and stable public URLs returning raw media bytes may also be accepted; consult the current endpoint schema.

Submit the creation request once and retain the returned project ID before doing more work. If the request times out before an ID is returned, do not blindly resubmit: the first request may already have created a paid job. Reconcile it through the user's dashboard or available project evidence first, or explain the uncertainty and obtain direction.

## Complete and deliver

Call the matching wait tool with the existing ID. A polling timeout is not proof that generation failed. If still pending, retrieve or wait for the same project within the user's time budget; do not create another project to recover a wait timeout.

Proceed to download only after the project reports `complete`. On `error` or `canceled`, return the project ID and actionable error; do not claim a usable output. If no download is present, report that proof gap.

Use `exact_download_urls[n]` or `downloads[n].url` exactly as returned. Preserve every signed query parameter; `expires_at` is separate metadata. For an expired URL, retrieve the existing project again before considering regeneration. Never attach the Magic Hour API key to a storage download or presigned upload request.

When the user needs an asset in their application, download it into the requested project location, verify its actual media type and dimensions or duration, and use that local file. Avoid embedding an expiring signed URL into production code. Preview the result when the environment supports it and check the requested composition or motion before claiming success.

Return the finished artifact or usable link, where it was saved, and any material limitation. A tool connection, schema match, or accepted request is not proof of completed generation.

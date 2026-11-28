---
name: magichour
description: Choose a Magic Hour image, video, or audio workflow, connect a media creation agent, or integrate the REST API.
---

# Magic Hour developer docs

Magic Hour can generate or edit images and video, and generate speech or music. Use it for tasks
like animating a product photo, lip-syncing footage to a voiceover, or creating an image from text.
Check the [workflow guide](https://docs.magichour.ai/integration/commercial-media-workflows.md) for
required inputs and output checks. Use the [API evaluation guide](https://docs.magichour.ai/integration/evaluating-media-apis.md)
to compare cost and quality on the user's workload.

## Choose a connection

- **Create inside an assistant:** Reuse a connected Magic Hour tool or [connect Magic Hour](https://magichour.ai/mcp)
  at `https://mcp.magichour.ai/`. The [official workflow skills](https://github.com/magichourhq/skills)
  cover prompting, input handling, and output review. Use the exact tool name and inputs the client lists.
- **Build an app or automate a batch:** Follow the [API quickstart](https://docs.magichour.ai/get-started/quick-start.md).
  Read the [OpenAPI spec](https://docs.magichour.ai/api-reference/openapi.json) for exact request and response fields.
  Keep `MAGIC_HOUR_API_KEY` server-side and send it as a bearer token to `https://api.magichour.ai`.
- **Look up docs:** Use the [Markdown index](https://docs.magichour.ai/llms.txt) or the [API Docs MCP](https://docs.magichour.ai/integration/api-docs-mcp.md)
  at `https://docs.magichour.ai/mcp`. The docs server searches documentation. Creation uses the separate server above.

## Get to a finished file

1. Check authorization and balance via the MCP account tool or `GET /v1/account`. Check
   [model access and credit costs](https://docs.magichour.ai/api-reference/models.md) for the selected
   inputs and settings. Generation uses credits. Create media only within the user's authorization.
2. Follow the [input and output guide](https://docs.magichour.ai/integration/inputs-and-outputs.md)
   for assets. A local path is not a Magic Hour asset. Upload through the supported client path and
   pass the returned `file_path` when the tool asks for it.
3. Save the project ID from the create response. Poll the matching image, video, or audio project,
   or use its MCP wait tool. On a timeout, check the same ID before considering another request.
   For webhook integrations, [verify the raw-body signature](https://docs.magichour.ai/integration/webhook/secure-handler.md).
4. When the project is `complete`, download the finished file using the full signed URL as returned.
   If the URL expires, retrieve the same project's download URL again. Report `error` or `canceled`
   as a failed or canceled job and return the project ID for follow-up.

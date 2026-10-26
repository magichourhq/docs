# Gumloop campaign-asset handoff

## Existing remote MCP path

Magic Hour's hosted Streamable HTTP MCP endpoint is `https://mcp.magichour.ai/`.
Use a client that supports this transport and the authentication documented in the
[MCP guide](https://docs.magichour.ai/integration/model-context-protocol).

If your Gumloop account supports custom remote MCP connectors, configure that endpoint
through its native connector UI and keep credentials in Gumloop's credential storage.
Confirm whether your account supports the server's authentication flow before use.
There is no account installation or native catalog acceptance receipt supplied here.

## One campaign-asset workflow

1. Accept a campaign brief and an approved product-photo asset.
2. Use the image-editing operation to create one candidate asset.
3. Persist the returned project ID as workflow state before any status check.
4. Retrieve that project's image status until complete, failed, canceled, or the wait ends.
5. On completion, deliver the exact returned URL and expiry to a private review step.
6. Store an approved asset in your own storage. Publish only after approval.

For HTTP-based setup, the runnable reference implementation is `client.mjs`; the request
body is `requests/edit.json`. An accepted project is recovered through GET, not another POST.

## Connector-review packet

- API origin: `https://api.magichour.ai`.
- Authentication: `Authorization: Bearer <user-supplied API key>`.
- Create operation: `POST /v1/ai-image-editor`.
- Status operation: `GET /v1/image-projects/{id}`.
- Success: `status=complete` and a nonempty usable `downloads` array.
- Stop conditions: `error`, `canceled`, or `draft`; retain the ID for investigation.
- Bounded wait: at most 60 seconds in the sample; later workflow steps can resume.
- Billing: the creation receipt has `credits_charged`; completion is authoritative.

Gumloop controls its public connector catalog. This packet is implementation material
for a provider review, not a representation that Magic Hour is a native listed connector.

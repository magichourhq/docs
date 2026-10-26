# Fuser lip-sync provider review packet

Fuser's adapter registry and native nodes are controlled by Fuser. The public documentation
does not provide a public third-party adapter-submission API. This is a working HTTP
reference and a concrete node mapping for their review, not an installed Fuser adapter.

## Proposed node

Inputs: an uploaded video `file_path`, an uploaded audio `file_path`, start/end seconds,
and a supported generation mode. Use an existing user-owned sample and a short segment
for the first evaluation.

Submit `requests/lipsync.json` to `POST https://api.magichour.ai/v1/lip-sync` with a
user-supplied bearer credential. Immediately persist the returned `id` and the credit
estimate. Retrieve `GET /v1/video-projects/{id}` until the project completes or reaches
a terminal state. The reference adapter never starts another generation to recover output.

Outputs: original project ID, final status, final `credits_charged`, and the completed
`downloads` objects with their expiry timestamps. The native adapter should preserve
these fields rather than reduce an accepted job to a generic failure string.

## Reusable recipe

1. User-owned video and replacement audio enter the workflow.
2. A trim/segment choice defines the same source interval for every comparison.
3. The lip-sync node submits once and records the ID.
4. A status step resumes that ID if the original interaction times out.
5. The result goes to a video-review node; it is not published automatically.

Review mouth alignment at consonants, face identity, teeth/tongue artifacts, temporal
stability, audio continuity and the selected segment boundaries. A completed API response
does not prove that these checks pass.

For a provider-review test, Fuser must confirm its adapter input/output contract and
credential flow. A public recipe should contain only media cleared for redistribution,
and should omit credentials, private inputs and private generation history.

# Magic Hour provider for Vercel AI SDK

Image generation, text-to-video, and image-to-video through Magic Hour's public API. Implements the AI SDK v7 / provider v4 image and experimental video interfaces. No separate service is required.

## Install from this repository

This package is prepared for npm publication as `@magichour/ai-sdk-provider`; it is **not yet published**. Use the local package or a tarball until publisher access is configured.

```sh
cd examples/vercel-ai-sdk
npm ci
npm run build
npm pack
# In your consuming project:
npm install /absolute/path/to/magichour-ai-sdk-provider-0.1.0.tgz ai@7.0.148
```

Requires Node.js 22+. Compatibility was tested with `ai@7.0.148` and `@ai-sdk/provider@4.0.31`. Video APIs are experimental; retest before upgrading.

```ts
import { generateImage, experimental_generateVideo as generateVideo } from "ai";
import { createMagicHour } from "@magichour/ai-sdk-provider";

const magichour = createMagicHour({
  // Defaults to process.env.MAGIC_HOUR_API_KEY. Keep this server-side.
  onProjectCreated: ({ id, kind }) => console.log(`Accepted ${kind} project: ${id}`),
});

const { image } = await generateImage({
  model: magichour.image("flux-2-klein"),
  prompt: "A ceramic mug on a clean studio background",
  aspectRatio: "1:1",
  providerOptions: { magichour: { resolution: "640px" } },
  maxRetries: 0,
});

const { video } = await generateVideo({
  model: magichour.video("ltx-2.5"),
  prompt: { image: image.uint8Array, text: "A gentle camera push toward the mug" },
  duration: 1,
  providerOptions: { magichour: { resolution: "480p" } },
  maxRetries: 0,
});
```

For text-to-video, pass a string prompt instead of `{image,text}`. Input images may be binary data, base64, or HTTPS URL strings. Binary images are uploaded with the public file API; the returned asset path is sent to generation. `imageModel` also works with `createProviderRegistry`.

## Supported scope

- Image models: `default`, `flux-2-klein`, `z-image-turbo`, `qwen-image-2.1`.
- Video models: `default`, `ltx-2.5`, `minimax-h3`, `wan-2.2`.
- Image resolution tiers: `640px` (default), `1k`, `2k`. Image `size` maps 640/1024/2048 longest edges to these tiers; the API produces model-supported dimensions, not arbitrary exact pixel sizes.
- Video resolution tiers: `360p`, `480p` (default), `720p`, `1080p`, `4k`. Exact model support, duration limits, plan eligibility, and pricing are enforced by Magic Hour. Video `resolution` maps supported short-edge sizes to tiers.
- Text-to-image and text-to-video aspect ratios: `1:1`, `16:9`, `9:16`. Image-to-video inherits its input ratio; omit `aspectRatio` or use `adaptive`.
- One output per paid API request. The AI SDK batches a larger `n` into multiple requests, each charged separately.
- Seeds, custom FPS, image editing/masks, role-tagged frame inputs, and reference-video inputs are rejected before submission.

`default` follows Magic Hour's current recommendation and may change its cost and behavior. Choose an explicit model and resolution when those need to remain predictable. The example's live image cost 5 credits; its one-second LTX video cost 24 credits on the tested account. Consult current [API pricing](https://docs.magichour.ai/pricing) before larger runs.

## Async jobs and errors

`doGenerate` submits once, polls the matching image/video project collection, and downloads bytes before returning. The default wait timeout is ten minutes; configure `timeoutMs` and `pollIntervalMs` on `createMagicHour`. An abort stops waiting and downloading; it does not cancel an accepted server-side generation.

Persist the ID in `onProjectCreated` before waiting. Errors after acceptance retain `MagicHourError.projectId`. A lost POST response is reported as unknown acceptance. The transport never retries a paid POST, and its errors are not retryable SDK API errors. Set `maxRetries: 0` in application code and avoid wrapping the entire call in another automatic retry.

Use the existing public `GET /v1/image-projects/{id}` or `GET /v1/video-projects/{id}` endpoint to resume retrieval after an interruption. Do not generate again just because waiting failed. Media storage uploads/downloads receive no API bearer token. Signed output URLs are downloaded promptly; no signed URL is returned as the sole durable result.

Image metadata is available at `providerMetadata.magichour.images[0]` (`projectId`, `creditsCharged`); video metadata is at `providerMetadata.magichour`. These are Magic Hour credits, not token usage.

## Checks and example

```sh
npm run check
npm test
npm run build
# With MAGIC_HOUR_API_KEY set; each invocation spends credits:
npm run example
npm run example -- --video
```

The test suite uses actual AI SDK entrypoints with controlled HTTP. Live image generation and a real binary-upload image-to-video run also passed. See [validation](../../integration/creative-integrations-validation.md). npm publication and a community-provider directory submission remain outstanding.

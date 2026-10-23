import {
  NoSuchModelError,
  type ImageModelV4,
  type ImageModelV4CallOptions,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type ProviderV4,
} from "@ai-sdk/provider";
import { MagicHourClient, MagicHourError, httpsURL, type ClientSettings } from "./client.js";
export { MagicHourError } from "./client.js";
export type MagicHourSettings = Omit<ClientSettings, "apiKey"> & { apiKey?: string };
const imageModels = ["default", "flux-2-klein", "z-image-turbo", "qwen-image-2.1"] as const;
const videoModels = ["default", "ltx-2.5", "minimax-h3", "wan-2.2"] as const;
export type MagicHourImageModelId = (typeof imageModels)[number];
export type MagicHourVideoModelId = (typeof videoModels)[number];
export interface MagicHourProvider extends Omit<ProviderV4, "imageModel"> {
  image(modelId?: MagicHourImageModelId): ImageModelV4;
  imageModel(modelId?: string): ImageModelV4;
  video(modelId?: MagicHourVideoModelId): VideoModelV4;
  videoModel(modelId?: MagicHourVideoModelId): VideoModelV4;
}
function ratio(value: string | undefined): string | undefined {
  if (value !== undefined && !["1:1", "16:9", "9:16"].includes(value))
    throw new Error("Supported aspect ratios: 1:1, 16:9, 9:16.");
  return value;
}
function extra(options: ImageModelV4CallOptions | VideoModelV4CallOptions, allowed: string[]) {
  const values = options.providerOptions?.magichour ?? {};
  for (const key of Object.keys(values))
    if (!allowed.includes(key)) throw new Error(`Unsupported Magic Hour option: ${key}.`);
  return values;
}
function imageResolution(size: string | undefined, option: unknown): string {
  if (
    option !== undefined &&
    (typeof option !== "string" || !["640px", "1k", "2k"].includes(option))
  )
    throw new Error("Image resolution must be 640px, 1k, or 2k.");
  if (!size) return (option as string | undefined) ?? "640px";
  if (option !== undefined)
    throw new Error("Use either size or providerOptions.magichour.resolution.");
  // Magic Hour exposes longest-edge tiers, rather than arbitrary pixel sizes.
  const [width, height] = size.split("x").map(Number);
  const edge = Math.max(width, height);
  const tier = new Map([
    [640, "640px"],
    [1024, "1k"],
    [2048, "2k"],
  ]).get(edge);
  if (!tier)
    throw new Error(
      "Use a 640, 1024, or 2048 longest edge, or set providerOptions.magichour.resolution."
    );
  return tier;
}
function ratioFromSize(size: string | undefined): string | undefined {
  if (!size) return undefined;
  const [w, h] = size.split("x").map(Number);
  if (w <= 0 || h <= 0) throw new Error("Invalid dimensions.");
  for (const r of ["1:1", "16:9", "9:16"]) {
    const [rw, rh] = r.split(":").map(Number);
    if (Math.abs(w / h - rw / rh) < 0.002) return r;
  }
  throw new Error("Dimensions must have a 1:1, 16:9, or 9:16 aspect ratio.");
}
export function createMagicHour(settings: MagicHourSettings = {}): MagicHourProvider {
  // Resolve credentials lazily so merely importing or registering the provider needs no key.
  const client = () =>
    new MagicHourClient({
      ...settings,
      apiKey: settings.apiKey ?? process.env.MAGIC_HOUR_API_KEY ?? "",
    });
  function image(modelId: string = "default"): ImageModelV4 {
    if (!(imageModels as readonly string[]).includes(modelId))
      throw new NoSuchModelError({ modelId, modelType: "imageModel" });
    return {
      specificationVersion: "v4",
      provider: "magichour.image",
      modelId,
      maxImagesPerCall: 1,
      supportsFileInputs: false,
      supportsMaskInputs: false,
      async doGenerate(options) {
        if (!options.prompt?.trim()) throw new Error("An image prompt is required.");
        if (options.n !== 1) throw new Error("One image per request is supported.");
        if (options.files?.length || options.mask)
          throw new Error("This provider supports image generation, not image editing.");
        if (options.seed !== undefined)
          throw new Error("Magic Hour does not expose a seed parameter.");
        const extras = extra(options, ["resolution"]);
        const resolution = imageResolution(options.size, extras.resolution);
        const sizeRatio = ratioFromSize(options.size);
        if (sizeRatio && options.aspectRatio && sizeRatio !== options.aspectRatio)
          throw new Error("size and aspectRatio disagree.");
        const aspectRatio = ratio(options.aspectRatio ?? sizeRatio);
        const transport = client();
        const signal = transport.signal(options.abortSignal);
        const timestamp = new Date();
        const id = await transport.create(
          "ai-image-generator",
          "image",
          {
            model: modelId,
            image_count: 1,
            resolution,
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            style: { prompt: options.prompt },
          },
          signal,
          options.headers
        );
        const project = await transport.wait(id, "image", signal, options.headers);
        try {
          const images = await Promise.all(
            project.downloads.slice(0, 1).map((d) => transport.download(d.url, signal))
          );
          return {
            images,
            warnings: [],
            isRetryable: false,
            response: { timestamp, modelId, headers: undefined },
            providerMetadata: {
              magichour: {
                projectId: id,
                creditsCharged: project.credits_charged,
                images: [{ projectId: id, creditsCharged: project.credits_charged }],
              },
            },
          };
        } catch {
          throw new MagicHourError("Could not download the generated image.", id);
        }
      },
    };
  }
  function video(modelId: MagicHourVideoModelId = "default"): VideoModelV4 {
    if (!videoModels.includes(modelId))
      throw new NoSuchModelError({ modelId, modelType: "videoModel" });
    return {
      specificationVersion: "v4",
      provider: "magichour.video",
      modelId,
      maxVideosPerCall: 1,
      async doGenerate(options) {
        if (options.n !== 1) throw new Error("One video per request is supported.");
        if (!options.prompt?.trim() && !options.image)
          throw new Error("A prompt or input image is required.");
        if (options.seed !== undefined || options.fps !== undefined)
          throw new Error("Magic Hour does not expose seed or FPS parameters.");
        if (options.frameImages?.length || options.inputReferences?.length)
          throw new Error("Frame and reference inputs are not supported by this adapter.");
        const extras = extra(options, ["resolution"]);
        if (
          extras.resolution !== undefined &&
          (typeof extras.resolution !== "string" ||
            !["360p", "480p", "720p", "1080p", "4k"].includes(extras.resolution))
        )
          throw new Error("Invalid Magic Hour video resolution.");
        if (options.resolution && extras.resolution !== undefined)
          throw new Error("Use either resolution or providerOptions.magichour.resolution.");
        let resolution = extras.resolution ?? "480p";
        const dimensionsRatio = ratioFromSize(options.resolution);
        if (options.resolution) {
          const shortEdge = Math.min(...options.resolution.split("x").map(Number));
          const mapped = new Map([
            [360, "360p"],
            [480, "480p"],
            [720, "720p"],
            [1080, "1080p"],
            [2160, "4k"],
          ]).get(shortEdge);
          if (!mapped)
            throw new Error(
              "Unsupported video dimensions; use a resolution tier in providerOptions.magichour."
            );
          resolution = mapped;
        }
        if (options.image && options.aspectRatio && options.aspectRatio !== "adaptive")
          throw new Error(
            "Image-to-video inherits the input image ratio; omit aspectRatio or use adaptive."
          );
        if (!options.image && options.aspectRatio === "adaptive")
          throw new Error("adaptive requires an input image.");
        const aspectRatio = options.image
          ? undefined
          : ratio(options.aspectRatio ?? dimensionsRatio);
        if (
          !options.image &&
          dimensionsRatio &&
          options.aspectRatio &&
          dimensionsRatio !== options.aspectRatio
        )
          throw new Error("resolution and aspectRatio disagree.");
        const duration = options.duration ?? 5;
        if (!Number.isFinite(duration) || duration < 1 || duration > 60)
          throw new Error(
            "Duration must be between 1 and 60 seconds; model-specific limits also apply."
          );
        // Validate all options before uploading input or submitting a paid generation.
        const transport = client();
        const signal = transport.signal(options.abortSignal);
        let imagePath: string | undefined;
        if (options.image?.type === "url") imagePath = httpsURL(options.image.url);
        else if (options.image?.type === "file") {
          const extension = (
            { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<
              string,
              string
            >
          )[options.image.mediaType];
          if (!extension) throw new Error("Image-to-video accepts PNG, JPEG, or WebP.");
          const bytes =
            typeof options.image.data === "string"
              ? new Uint8Array(Buffer.from(options.image.data, "base64"))
              : options.image.data;
          imagePath = await transport.uploadImage(bytes, extension, signal);
        }
        const timestamp = new Date();
        const id = await transport.create(
          imagePath ? "image-to-video" : "text-to-video",
          "video",
          {
            model: modelId,
            end_seconds: duration,
            resolution,
            ...(options.prompt ? { style: { prompt: options.prompt } } : {}),
            ...(imagePath
              ? { assets: { image_file_path: imagePath } }
              : { aspect_ratio: aspectRatio ?? "16:9" }),
            ...(options.generateAudio !== undefined ? { audio: options.generateAudio } : {}),
          },
          signal,
          options.headers
        );
        const project = await transport.wait(id, "video", signal, options.headers);
        try {
          const data = await transport.download(project.downloads[0].url, signal);
          return {
            videos: [{ type: "binary", data, mediaType: "video/mp4" }],
            warnings: [],
            response: { timestamp, modelId, headers: undefined },
            providerMetadata: {
              magichour: { projectId: id, creditsCharged: project.credits_charged },
            },
          };
        } catch {
          throw new MagicHourError("Could not download the generated video.", id);
        }
      },
    };
  }
  return {
    specificationVersion: "v4",
    image,
    imageModel: image,
    video,
    videoModel: video,
    languageModel(modelId: string): never {
      throw new NoSuchModelError({ modelId, modelType: "languageModel" });
    },
    embeddingModel(modelId: string): never {
      throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
    },
  };
}
export const magichour = createMagicHour();

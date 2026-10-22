import { MagicHourClient, MagicHourError } from "../../vercel-ai-sdk/src/client";

export type SourceImage = { blob: Blob; label: string };
export type VideoOptions = {
  prompt: string;
  duration: number;
  resolution: "480p" | "720p";
  aspectRatio: "16:9" | "1:1" | "9:16";
};
export type VideoResult = {
  id: string;
  blob: Blob;
  url: string;
  expiresAt: string;
  credits: number;
};
export type JobStore = { load(): Promise<string | null>; save(id: string | null): Promise<void> };
export type EditorHost = {
  name: string;
  selectionLabel: string;
  captureImage?(): Promise<SourceImage>;
  prepareGeneration?(): Promise<void>;
  store: JobStore;
  insertVideo(result: VideoResult): Promise<void>;
};
const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export function projectId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("Enter a valid Magic Hour video project ID.");
  return value;
}
export async function validateImage(blob: Blob): Promise<string> {
  const extension = extensions[blob.type];
  if (!extension || !blob.size || blob.size > 20 * 1024 * 1024)
    throw new Error("Choose a PNG, JPEG, or WebP image up to 20 MB.");
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const valid =
    extension === "png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
      : extension === "jpg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (!valid) throw new Error("The image bytes do not match its PNG, JPEG, or WebP type.");
  return extension;
}
export class VideoService {
  constructor(
    private readonly settings: {
      apiKey: string;
      store: JobStore;
      fetch?: typeof fetch;
      pollIntervalMs?: number;
      timeoutMs?: number;
      platform: string;
    }
  ) {}
  private client() {
    return new MagicHourClient({
      ...this.settings,
      onProjectCreated: ({ id }) => this.settings.store.save(id),
    });
  }
  async generate(
    options: VideoOptions,
    source?: SourceImage,
    abort?: AbortSignal
  ): Promise<VideoResult> {
    if (!options.prompt.trim() || options.prompt.length > 2000)
      throw new Error("Describe the motion in 1–2,000 characters.");
    if (!Number.isInteger(options.duration) || options.duration < 1 || options.duration > 10)
      throw new Error("Choose a duration from 1 to 10 seconds.");
    if (
      !["480p", "720p"].includes(options.resolution) ||
      !["16:9", "1:1", "9:16"].includes(options.aspectRatio)
    )
      throw new Error("Choose a supported resolution and aspect ratio.");
    const extension = source ? await validateImage(source.blob) : undefined;
    const c = this.client(),
      signal = c.signal(abort);
    const path = source
      ? await c.uploadImage(new Uint8Array(await source.blob.arrayBuffer()), extension!, signal)
      : undefined;
    const id = await c.create(
      path ? "image-to-video" : "text-to-video",
      "video",
      {
        name: `Magic Hour for ${this.settings.platform}`,
        model: "ltx-2.5",
        end_seconds: options.duration,
        resolution: options.resolution,
        style: { prompt: options.prompt.trim() },
        audio: false,
        ...(path ? { assets: { image_file_path: path } } : { aspect_ratio: options.aspectRatio }),
      },
      signal
    );
    return this.retrieve(id, abort);
  }
  async retrieve(id: string, abort?: AbortSignal): Promise<VideoResult> {
    projectId(id);
    const c = this.client(),
      signal = c.signal(abort);
    const p = await c.wait(id, "video", signal);
    try {
      const bytes = await c.download(p.downloads[0].url, signal);
      if (!bytes.length || bytes.length > 100 * 1024 * 1024)
        throw new Error("Video must be nonempty and at most 100 MB.");
      if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
        throw new Error("The completed output is not an MP4 video.");
      return {
        id,
        blob: new Blob([bytes as BlobPart], { type: "video/mp4" }),
        url: p.downloads[0].url,
        expiresAt: p.downloads[0].expires_at,
        credits: p.credits_charged,
      };
    } catch {
      throw new MagicHourError(
        "Could not download the completed MP4. Resume to retrieve it again.",
        id
      );
    }
  }
}

export type PanelState = {
  ready: boolean;
  busy: boolean;
  message: string;
  error: boolean;
  savedId: string;
  source?: SourceImage;
  result?: VideoResult;
};
export class VideoPanel {
  state: PanelState = {
    ready: false,
    busy: false,
    message: "Choose an image or start from a creative brief.",
    error: false,
    savedId: "",
  };
  private abort?: AbortController;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly host: EditorHost,
    private readonly transport: Partial<ConstructorParameters<typeof VideoService>[0]> = {}
  ) {}
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<PanelState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const callback of this.listeners) callback();
  }
  async init() {
    try {
      const id = await this.host.store.load();
      if (id)
        this.update({
          savedId: projectId(id),
          message: "A saved generation is available. Resume it without another generation charge.",
        });
    } catch {
      this.update({
        error: true,
        message: "Saved generation could not be read. You can enter its project ID to resume.",
      });
    } finally {
      this.update({ ready: true });
    }
  }
  private async run(task: () => Promise<void>) {
    if (this.state.busy) return;
    this.abort = new AbortController();
    this.update({ busy: true, error: false });
    try {
      await task();
    } catch (error) {
      const id = error instanceof MagicHourError ? error.projectId : undefined;
      this.update({
        error: true,
        ...(id ? { savedId: id } : {}),
        message:
          error instanceof MagicHourError
            ? error.message
            : error instanceof Error
              ? error.message
              : "The operation failed. Try again after checking the editor.",
      });
    } finally {
      this.update({ busy: false });
      this.abort = undefined;
    }
  }
  async capture() {
    await this.run(async () => {
      if (!this.host.captureImage) throw new Error("Upload an image to use with this editor.");
      const source = await this.host.captureImage();
      await validateImage(source.blob);
      this.update({
        source,
        message: "Image ready. Only this captured image will be uploaded when you generate.",
      });
    });
  }
  async selectFile(file: File) {
    await this.run(async () => {
      await validateImage(file);
      this.update({ source: { blob: file, label: file.name }, message: "Image ready to animate." });
    });
  }
  removeImage() {
    if (!this.state.busy)
      this.update({ source: undefined, message: "Start from a creative brief." });
  }
  private service(key: string) {
    return new VideoService({
      ...this.transport,
      apiKey: key,
      platform: this.host.name,
      store: {
        load: () => this.host.store.load(),
        save: async (id) => {
          // Show the accepted ID even if durable storage fails.
          this.update({ savedId: id ?? "" });
          await this.host.store.save(id);
        },
      },
    });
  }
  async generate(key: string, options: VideoOptions) {
    await this.run(async () => {
      if (!this.state.ready)
        throw new Error("Wait for saved generations to load before generating.");
      if (this.state.savedId)
        throw new Error(
          "Resume the saved project, or choose New generation before another paid submission."
        );
      await this.host.prepareGeneration?.();
      this.update({
        message: "Generating with Magic Hour. You may stop waiting and resume later.",
        result: undefined,
      });
      const result = await this.service(key).generate(
        options,
        this.state.source,
        this.abort!.signal
      );
      this.update({
        result,
        message: `Video ready · ${result.credits} Magic Hour credits. Preview it before adding it to your design.`,
      });
    });
  }
  async resume(key: string, id: string) {
    await this.run(async () => {
      projectId(id);
      let saved = true;
      try {
        await this.host.store.save(id);
      } catch {
        saved = false;
      }
      this.update({
        savedId: id,
        message: "Retrieving the existing generation. No new generation is submitted.",
        result: undefined,
      });
      const result = await this.service(key).retrieve(id, this.abort!.signal);
      this.update({
        result,
        message: `Video ready · original charge ${result.credits} Magic Hour credits.${saved ? "" : " Copy the project ID; local saving is unavailable."}`,
      });
    });
  }
  async insert(key: string) {
    await this.run(async () => {
      const old = this.state.result;
      if (!old) throw new Error("Generate or resume a video first.");
      // Refresh signed media URLs immediately before the host copies the output.
      const result = await this.service(key).retrieve(old.id, this.abort!.signal);
      this.update({ result, message: "Adding the video to your design…" });
      try {
        await this.host.insertVideo(result);
      } catch {
        throw new Error(
          "The editor could not confirm insertion. Check your design before adding again. Your generation is saved."
        );
      }
      this.update({ message: "Video added to your design." });
    });
  }
  stop() {
    this.abort?.abort();
  }
  async reset() {
    if (this.state.busy) return;
    try {
      await this.host.store.save(null);
      this.update({
        savedId: "",
        result: undefined,
        error: false,
        message:
          "Ready for a new paid generation. The previous project remains in your Magic Hour account.",
      });
    } catch {
      this.update({
        error: true,
        message: "Could not clear the saved project. Resume it or try New generation again.",
      });
    }
  }
  dispose() {
    this.disposed = true;
    this.abort?.abort();
    this.listeners.clear();
  }
}

import {
  MagicHourClient,
  MagicHourError,
  englishMessage,
  type MessageFormatter,
  type Project,
} from "../../vercel-ai-sdk/src/client";

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
const unknownSubmission = "magic-hour:submission-unknown";
export class EditorInsertionError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string
  ) {
    super(code);
  }
}
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
export function projectId(value: string, formatMessage: MessageFormatter = englishMessage): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error(
      formatMessage({
        defaultMessage: "Enter a valid Magic Hour video project ID.",
        description: "Status or recovery instruction in the video generation panel.",
      })
    );
  return value;
}
export async function validateImage(
  blob: Blob,
  formatMessage: MessageFormatter = englishMessage
): Promise<string> {
  const extension = extensions[blob.type];
  if (!extension || !blob.size || blob.size > 20 * 1024 * 1024)
    throw new Error(
      formatMessage({
        defaultMessage: "Choose a PNG, JPEG, or WebP image up to 20 MB.",
        description: "Status or recovery instruction in the video generation panel.",
      })
    );
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const valid =
    extension === "png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
      : extension === "jpg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (!valid)
    throw new Error(
      formatMessage({
        defaultMessage: "The image bytes do not match its PNG, JPEG, or WebP type.",
        description: "Status or recovery instruction in the video generation panel.",
      })
    );
  return extension;
}
export class VideoService {
  constructor(
    private readonly settings: {
      apiKey: string;
      formatMessage?: MessageFormatter;
      store: JobStore;
      fetch?: typeof fetch;
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProjectStatus?: (status: Project["status"]) => void | Promise<void>;
      platform: string;
    }
  ) {
    this.formatMessage = settings.formatMessage ?? englishMessage;
  }
  private readonly formatMessage: MessageFormatter;
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
      throw new Error(
        this.formatMessage({
          defaultMessage: "Describe the motion in 1–2,000 characters.",
          description: "Status or recovery instruction in the video generation panel.",
        })
      );
    if (!Number.isInteger(options.duration) || options.duration < 1 || options.duration > 10)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Choose a duration from 1 to 10 seconds.",
          description: "Status or recovery instruction in the video generation panel.",
        })
      );
    if (
      !["480p", "720p"].includes(options.resolution) ||
      !["16:9", "1:1", "9:16"].includes(options.aspectRatio)
    )
      throw new Error(
        this.formatMessage({
          defaultMessage: "Choose a supported resolution and aspect ratio.",
          description: "Status or recovery instruction in the video generation panel.",
        })
      );
    const extension = source ? await validateImage(source.blob, this.formatMessage) : undefined;
    const c = this.client(),
      signal = c.signal(abort);
    const path = source
      ? await c.uploadImage(new Uint8Array(await source.blob.arrayBuffer()), extension!, signal)
      : undefined;
    try {
      await this.settings.store.save(unknownSubmission);
    } catch {
      throw new Error(
        this.formatMessage({
          defaultMessage:
            "Could not save recovery information. No generation was submitted. Reopen the add-on and try again.",
          description: "Instruction when recovery storage is unavailable before a paid submission.",
        })
      );
    }
    let id: string;
    try {
      id = await c.create(
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
    } catch (error) {
      if (error instanceof MagicHourError && !error.acceptanceUnknown && !error.projectId) {
        try {
          await this.settings.store.save(null);
        } catch {
          throw new Error(
            this.formatMessage({
              defaultMessage:
                "The generation was rejected, but recovery information could not be cleared. Check account history before clearing the interrupted submission.",
              description:
                "Recovery instruction when a rejected submission's local intent cannot be cleared.",
            })
          );
        }
      }
      throw error;
    }
    return this.retrieve(id, abort);
  }
  async retrieve(id: string, abort?: AbortSignal): Promise<VideoResult> {
    projectId(id, this.formatMessage);
    const c = this.client(),
      signal = c.signal(abort);
    const p = await c.wait(id, "video", signal);
    try {
      const bytes = await c.download(p.downloads[0].url, signal);
      if (!bytes.length || bytes.length > 100 * 1024 * 1024)
        throw new Error(
          this.formatMessage({
            defaultMessage: "Video must be nonempty and at most 100 MB.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
        throw new Error(
          this.formatMessage({
            defaultMessage: "The completed output is not an MP4 video.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      return {
        id,
        blob: new Blob([bytes as BlobPart], { type: "video/mp4" }),
        url: p.downloads[0].url,
        expiresAt: p.downloads[0].expires_at,
        credits: p.credits_charged,
      };
    } catch {
      throw new MagicHourError(
        this.formatMessage({
          defaultMessage: "Could not download the completed MP4. Resume to retrieve it again.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
        id,
        undefined,
        this.formatMessage
      );
    }
  }
}

export type PanelState = {
  ready: boolean;
  busy: boolean;
  activeProject: boolean;
  keyLocked: boolean;
  submissionUnknown: boolean;
  message: string;
  error: boolean;
  apiStatus?: number;
  savedId: string;
  source?: SourceImage;
  result?: VideoResult;
};
export class VideoPanel {
  state: PanelState = {
    ready: false,
    busy: false,
    activeProject: false,
    keyLocked: false,
    submissionUnknown: false,
    message: "",
    error: false,
    savedId: "",
  };
  private abort?: AbortController;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly host: EditorHost,
    private readonly transport: Partial<ConstructorParameters<typeof VideoService>[0]> = {}
  ) {
    this.formatMessage = transport.formatMessage ?? englishMessage;
    this.state.message = this.formatMessage({
      defaultMessage: "Choose an image or start from a creative brief.",
      description: "Initial instruction for the video generation panel.",
    });
  }
  private readonly formatMessage: MessageFormatter;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.state;
  clearApiError() {
    this.update({ error: false, message: "", apiStatus: undefined });
  }
  private update(patch: Partial<PanelState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const callback of this.listeners) callback();
  }
  async init() {
    try {
      const id = await this.host.store.load();
      if (id === unknownSubmission)
        this.update({
          activeProject: true,
          submissionUnknown: true,
          message: this.formatMessage({
            defaultMessage:
              "A previous submission may still be running. Check your Magic Hour account history and resume the exact project ID from that submission before generating again.",
            description:
              "Recovery instruction after an interrupted paid submission with no returned project ID.",
          }),
        });
      else if (id)
        this.update({
          savedId: projectId(id, this.formatMessage),
          activeProject: true,
          message: this.formatMessage({
            defaultMessage:
              "A saved generation is available. Resume it without another generation charge.",
            description: "Status or recovery instruction in the video generation panel.",
          }),
        });
    } catch {
      this.update({
        error: true,
        activeProject: true,
        submissionUnknown: true,
        message: this.formatMessage({
          defaultMessage:
            "Saved generation could not be read. You can enter its project ID to resume.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
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
      const status = error instanceof MagicHourError ? error.status : undefined;
      const acceptanceUnknown = error instanceof MagicHourError && error.acceptanceUnknown;
      let recoverySaved = true;
      if (acceptanceUnknown) {
        this.update({ activeProject: true, submissionUnknown: true, keyLocked: true });
        try {
          await this.host.store.save(unknownSubmission);
        } catch {
          recoverySaved = false;
        }
      }
      const activeProject =
        this.state.activeProject &&
        !(status === 404 && !this.state.savedId && !this.state.submissionUnknown);
      const apiMessage =
        status === 401
          ? this.formatMessage({
              defaultMessage:
                "Your API key is invalid or no longer active. Check or replace it in your Magic Hour account.",
              description: "Account guidance after an API key is rejected.",
            })
          : status === 402
            ? this.formatMessage({
                defaultMessage:
                  "This generation needs more credits or a plan that supports these settings. Check your Magic Hour balance, plan and API pricing.",
                description: "Account guidance after a credit or plan restriction.",
              })
            : status === 403
              ? this.formatMessage({
                  defaultMessage:
                    "This key cannot access the project or operation. Check that you are using the right Magic Hour account and plan.",
                  description: "Account guidance after API access is denied.",
                })
              : status === 404 && id
                ? this.formatMessage({
                    defaultMessage:
                      "This project was not found for this key. Check the project ID and use a key from the account that created it.",
                    description: "Recovery guidance when an existing project is not accessible.",
                  })
                : status === 429
                  ? this.formatMessage({
                      defaultMessage:
                        "Magic Hour is receiving too many requests. Wait a moment before trying again.",
                      description: "Guidance after the API rate limit is reached.",
                    })
                  : status
                    ? this.formatMessage({
                        defaultMessage:
                          "Magic Hour could not complete this operation. Check your account and try again later, or contact support.",
                        description: "Guidance after an unrecognized API response error.",
                      })
                    : undefined;
      this.update({
        error: true,
        apiStatus: status,
        activeProject,
        keyLocked:
          acceptanceUnknown ||
          (activeProject && ![401, 403, 404].includes(status ?? 0) && this.state.keyLocked),
        message:
          (apiMessage
            ? new MagicHourError(apiMessage, id, status, this.formatMessage).message
            : error instanceof MagicHourError
              ? error.message
              : error instanceof Error
                ? error.message
                : this.formatMessage({
                    defaultMessage: "The operation failed. Try again after checking the editor.",
                    description: "Status or recovery instruction in the video generation panel.",
                  })) +
          (recoverySaved
            ? ""
            : this.formatMessage({
                defaultMessage:
                  " Keep this add-on open while checking account history; the recovery state could not be saved.",
                description: "Warning when unknown submission recovery could not be persisted.",
              })),
      });
    } finally {
      this.update({ busy: false });
      this.abort = undefined;
    }
  }
  async capture() {
    await this.run(async () => {
      if (!this.host.captureImage)
        throw new Error(
          this.formatMessage({
            defaultMessage: "Upload an image to use with this editor.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      const source = await this.host.captureImage();
      await validateImage(source.blob, this.formatMessage);
      this.update({
        source,
        message: this.formatMessage({
          defaultMessage:
            "Image ready. Only this captured image will be uploaded when you generate.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
    });
  }
  async selectFile(file: File) {
    await this.run(async () => {
      await validateImage(file, this.formatMessage);
      this.update({
        source: { blob: file, label: file.name },
        message: this.formatMessage({
          defaultMessage: "Image ready to animate.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
    });
  }
  removeImage() {
    if (!this.state.busy)
      this.update({
        source: undefined,
        message: this.formatMessage({
          defaultMessage: "Start from a creative brief.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
  }
  private service(key: string, onStatus?: (status: Project["status"]) => Promise<void>) {
    this.update({ keyLocked: !!key.trim() });
    return new VideoService({
      ...this.transport,
      apiKey: key,
      platform: this.host.name,
      onProjectStatus: async (status) => {
        if (["draft", "queued", "rendering", "complete", "error", "canceled"].includes(status)) {
          this.update({
            activeProject: ["draft", "queued", "rendering"].includes(status),
            keyLocked: ["draft", "queued", "rendering"].includes(status),
          });
          await onStatus?.(status);
        }
      },
      store: {
        load: () => this.host.store.load(),
        save: async (id) => {
          // Show the accepted ID even if durable storage fails.
          if (id === unknownSubmission) {
            await this.host.store.save(id);
            this.update({ activeProject: true, submissionUnknown: true });
          } else if (id) {
            this.update({ savedId: id, activeProject: true, submissionUnknown: false });
            await this.host.store.save(id);
          } else {
            await this.host.store.save(null);
            this.update({ savedId: "", activeProject: false, submissionUnknown: false });
          }
        },
      },
    });
  }
  async generate(key: string, options: VideoOptions) {
    await this.run(async () => {
      if (!this.state.ready)
        throw new Error(
          this.formatMessage({
            defaultMessage: "Wait for saved generations to load before generating.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      if (this.state.savedId || this.state.activeProject)
        throw new Error(
          this.formatMessage({
            defaultMessage:
              "Resume the saved project, or choose New generation before another paid submission.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      await this.host.prepareGeneration?.();
      this.update({
        message: this.formatMessage({
          defaultMessage: "Generating with Magic Hour. You may stop waiting and resume later.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
        result: undefined,
      });
      const result = await this.service(key).generate(
        options,
        this.state.source,
        this.abort!.signal
      );
      this.update({
        result,
        message: this.formatMessage(
          {
            defaultMessage:
              "Video ready · {credits} Magic Hour credits. Preview it before adding it to your design.",
            description: "Successful video generation with charged credit amount.",
          },
          { credits: result.credits }
        ),
      });
    });
  }
  async resume(key: string, id: string) {
    await this.run(async () => {
      projectId(id, this.formatMessage);
      if (this.state.activeProject && this.state.savedId && id !== this.state.savedId)
        throw new Error(
          this.formatMessage({
            defaultMessage:
              "Resume the saved project first. Its status is unresolved, so its ID cannot be replaced.",
            description: "Recovery instruction preventing replacement of a running project ID.",
          })
        );
      let saved = true,
        recorded = false;
      this.update({
        message: this.formatMessage({
          defaultMessage: "Retrieving the existing generation. No new generation is submitted.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
        result: undefined,
      });
      const result = await this.service(key, async () => {
        if (recorded) return;
        recorded = true;
        this.update({ savedId: id, submissionUnknown: false });
        try {
          await this.host.store.save(id);
        } catch {
          saved = false;
        }
      }).retrieve(id, this.abort!.signal);
      this.update({
        result,
        message: saved
          ? this.formatMessage(
              {
                defaultMessage: "Video ready · original charge {credits} Magic Hour credits.",
                description: "Existing video retrieved without a new charge.",
              },
              { credits: result.credits }
            )
          : this.formatMessage(
              {
                defaultMessage:
                  "Video ready · original charge {credits} Magic Hour credits. Copy the project ID; local saving is unavailable.",
                description:
                  "Existing video retrieved, but local recovery pointer could not be saved.",
              },
              { credits: result.credits }
            ),
      });
    });
  }
  async insert(key: string) {
    await this.run(async () => {
      const old = this.state.result;
      if (!old)
        throw new Error(
          this.formatMessage({
            defaultMessage: "Generate or resume a video first.",
            description: "Status or recovery instruction in the video generation panel.",
          })
        );
      // Refresh signed media URLs immediately before the host copies the output.
      const result = await this.service(key).retrieve(old.id, this.abort!.signal);
      this.update({
        result,
        message: this.formatMessage({
          defaultMessage: "Adding the video to your design…",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
      try {
        await this.host.insertVideo(result);
      } catch (error) {
        throw new Error(
          this.formatMessage({
            defaultMessage:
              "The editor could not confirm insertion. Check your design before adding again. Your generation is saved.",
            description: "Status or recovery instruction in the video generation panel.",
          }) +
            (error instanceof EditorInsertionError
              ? " " +
                this.formatMessage(
                  {
                    defaultMessage: "Error code: {code}.",
                    description:
                      "Safe error code reported by the host editor during video insertion.",
                  },
                  { code: error.code }
                ) +
                (error.detail
                  ? " " +
                    this.formatMessage(
                      {
                        defaultMessage: "Details: {detail}",
                        description:
                          "A bounded, redacted explanation of a rejected editor request.",
                      },
                      { detail: error.detail }
                    )
                  : "")
              : "")
        );
      }
      this.update({
        message: this.formatMessage({
          defaultMessage: "Video added to your design.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
    });
  }
  stop() {
    this.abort?.abort();
  }
  async reset(historyChecked = false) {
    if (
      this.state.busy ||
      (this.state.activeProject && !(historyChecked && this.state.submissionUnknown))
    )
      return;
    this.update({ busy: true });
    try {
      await this.host.store.save(null);
      this.update({
        savedId: "",
        activeProject: false,
        keyLocked: false,
        submissionUnknown: false,
        result: undefined,
        error: false,
        apiStatus: undefined,
        message: this.formatMessage({
          defaultMessage:
            "Ready for a new paid generation. The previous project remains in your Magic Hour account.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
    } catch {
      this.update({
        error: true,
        message: this.formatMessage({
          defaultMessage:
            "Could not clear the saved project. Resume it or try New generation again.",
          description: "Status or recovery instruction in the video generation panel.",
        }),
      });
    } finally {
      this.update({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    this.abort?.abort();
    this.listeners.clear();
  }
}

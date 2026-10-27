/** Shared REST transport, also bundled into the Figma plugin. Never retries a paid POST. */
export type MessageDescriptor = { id?: string; defaultMessage: string; description: string };
export type MessageFormatter = (
  message: MessageDescriptor,
  values?: Record<string, string | number>
) => string;
export const englishMessage: MessageFormatter = (message, values = {}) =>
  message.defaultMessage.replace(/\{(\w+)\}/g, (placeholder, key) =>
    String(values[key] ?? placeholder)
  );
export type ProjectKind = "image" | "video";
export type Project = {
  id: string;
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled";
  credits_charged: number;
  downloads: { url: string; expires_at: string }[];
  error?: { message: string; code: string } | null;
};
export class MagicHourError extends Error {
  readonly isRetryable = false;
  constructor(
    message: string,
    readonly projectId?: string,
    readonly status?: number,
    formatMessage: MessageFormatter = englishMessage,
    readonly acceptanceUnknown = false
  ) {
    super(
      projectId
        ? formatMessage(
            {
              defaultMessage:
                "{message} (project {projectId}; resume this project instead of generating again)",
              description:
                "Error recovery guidance containing the original error and accepted project ID.",
            },
            { message, projectId }
          )
        : message
    );
    this.name = "MagicHourError";
  }
}
export type ClientSettings = {
  apiKey: string;
  formatMessage?: MessageFormatter;
  fetch?: typeof globalThis.fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProjectCreated?: (project: { id: string; kind: ProjectKind }) => void | Promise<void>;
  onProjectStatus?: (status: Project["status"]) => void | Promise<void>;
};
export function httpsURL(value: string, formatMessage: MessageFormatter = englishMessage): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      formatMessage({
        defaultMessage: "Expected an HTTPS media URL.",
        description: "Error shown when a Magic Hour API operation cannot complete.",
      })
    );
  return url.href;
}
export class MagicHourClient {
  private readonly fetcher: typeof globalThis.fetch;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  private readonly formatMessage: MessageFormatter;
  constructor(private readonly settings: ClientSettings) {
    this.formatMessage = settings.formatMessage ?? englishMessage;
    if (!settings.apiKey?.trim())
      throw new Error(
        this.formatMessage({
          defaultMessage: "Magic Hour API key is required.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    this.fetcher = settings.fetch ?? globalThis.fetch.bind(globalThis);
    this.pollIntervalMs = settings.pollIntervalMs ?? 2000;
    this.timeoutMs = settings.timeoutMs ?? 600_000;
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs < 0)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid poll interval.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid timeout.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
  }
  signal(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }
  async request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    extraHeaders?: Record<string, string | undefined>
  ): Promise<T> {
    const headers = new Headers();
    for (const [key, value] of Object.entries(extraHeaders ?? {}))
      if (value !== undefined) headers.set(key, value);
    headers.set("Authorization", `Bearer ${this.settings.apiKey.trim()}`);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await this.fetcher(`https://api.magichour.ai${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: signal ?? this.signal(),
      redirect: "error",
    }).catch(() => {
      throw new Error(
        this.formatMessage({
          defaultMessage: "Could not reach Magic Hour. Check your connection and try again.",
          description: "Guidance when an API request cannot reach Magic Hour.",
        })
      );
    });
    if (!response.ok) {
      // Do not echo a remote response that could contain credentials or signed URLs.
      throw new MagicHourError(
        this.formatMessage(
          {
            defaultMessage: "Magic Hour API returned HTTP {status}.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          },
          { status: response.status }
        ),
        undefined,
        response.status,
        this.formatMessage
      );
    }
    return response.json().catch(() => {
      throw new Error(
        this.formatMessage({
          defaultMessage:
            "Magic Hour returned an unreadable response. Try again later or contact support.",
          description: "Guidance when an API response cannot be read.",
        })
      );
    }) as Promise<T>;
  }
  async create(
    endpoint: string,
    kind: ProjectKind,
    body: unknown,
    signal: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<string> {
    let created: { id: string };
    try {
      created = await this.request<{ id: string }>(`/v1/${endpoint}`, body, signal, headers);
    } catch (error) {
      if (
        error instanceof MagicHourError &&
        [400, 401, 402, 403, 404, 413, 415, 422, 429].includes(error.status ?? 0)
      )
        throw error;
      throw new MagicHourError(
        this.formatMessage({
          defaultMessage:
            "Generation submission was interrupted. Acceptance is unknown; check account history before submitting again.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        }),
        undefined,
        undefined,
        this.formatMessage,
        true
      );
    }
    if (
      !created ||
      typeof created !== "object" ||
      typeof created.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(created.id)
    )
      throw new MagicHourError(
        this.formatMessage({
          defaultMessage: "Missing project ID. Check account history before submitting again.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        }),
        undefined,
        undefined,
        this.formatMessage,
        true
      );
    try {
      await this.settings.onProjectCreated?.({ id: created.id, kind });
    } catch {
      throw new MagicHourError(
        this.formatMessage({
          defaultMessage: "Could not save the accepted project ID.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        }),
        created.id,
        undefined,
        this.formatMessage
      );
    }
    return created.id;
  }
  async getProject(
    id: string,
    kind: ProjectKind,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project> {
    const project = await this.request<Project>(
      `/v1/${kind}-projects/${encodeURIComponent(id)}`,
      undefined,
      signal,
      headers
    );
    await this.settings.onProjectStatus?.(project.status);
    return project;
  }
  async wait(
    id: string,
    kind: ProjectKind,
    signal: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project> {
    try {
      while (true) {
        signal.throwIfAborted();
        const project = await this.getProject(id, kind, signal, headers);
        if (project.status === "complete") {
          if (!project.downloads?.length)
            throw new Error(
              this.formatMessage({
                defaultMessage: "Completed project has no downloadable output.",
                description: "Error shown when a Magic Hour API operation cannot complete.",
              })
            );
          for (const download of project.downloads) httpsURL(download.url, this.formatMessage);
          return project;
        }
        if (project.status === "error" || project.status === "canceled")
          throw new Error(
            project.status === "error"
              ? this.formatMessage({
                  defaultMessage: "Generation error.",
                  description: "The generation failed on the server.",
                })
              : this.formatMessage({
                  defaultMessage: "Generation canceled.",
                  description: "The generation was canceled on the server.",
                })
          );
        if (!["draft", "queued", "rendering"].includes(project.status))
          throw new Error(
            this.formatMessage({
              defaultMessage: "Unknown project status.",
              description: "Error shown when a Magic Hour API operation cannot complete.",
            })
          );
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            signal.removeEventListener("abort", abort);
            resolve();
          };
          const timer = setTimeout(done, this.pollIntervalMs);
          const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            reject(
              new Error(
                this.formatMessage({
                  defaultMessage: "Waiting stopped.",
                  description: "Error shown when a Magic Hour API operation cannot complete.",
                })
              )
            );
          };
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    } catch (error) {
      throw new MagicHourError(
        error instanceof MagicHourError
          ? this.formatMessage({
              defaultMessage: "Could not retrieve the project.",
              description: "Error shown when a Magic Hour API operation cannot complete.",
            })
          : error instanceof Error
            ? error.message
            : this.formatMessage({
                defaultMessage: "Waiting stopped.",
                description: "Error shown when a Magic Hour API operation cannot complete.",
              }),
        id,
        error instanceof MagicHourError ? error.status : undefined,
        this.formatMessage
      );
    }
  }
  async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await this.fetcher(httpsURL(url, this.formatMessage), {
      signal: signal ?? this.signal(),
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error(
        this.formatMessage(
          {
            defaultMessage: "Media download returned HTTP {status}.",
            description: "Error shown when a Magic Hour API operation cannot complete.",
          },
          { status: response.status }
        )
      );
    return new Uint8Array(await response.arrayBuffer());
  }
  async uploadImage(bytes: Uint8Array, extension: string, signal: AbortSignal): Promise<string> {
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) || !bytes.length)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Expected a nonempty PNG, JPEG, or WebP image.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    const { items } = await this.request<{ items: { upload_url: string; file_path: string }[] }>(
      "/v1/files/upload-urls",
      { items: [{ type: "image", extension }] },
      signal
    );
    const item = items?.[0];
    if (!item?.file_path || !item.upload_url)
      throw new Error(
        this.formatMessage({
          defaultMessage: "Invalid upload response.",
          description: "Error shown when a Magic Hour API operation cannot complete.",
        })
      );
    const response = await this.fetcher(httpsURL(item.upload_url, this.formatMessage), {
      method: "PUT",
      body: bytes as BodyInit,
      signal,
      credentials: "omit",
    }).catch(() => null);
    if (!response?.ok)
      throw new Error(
        this.formatMessage({
          defaultMessage: "The image could not be uploaded. Choose your image again and try later.",
          description: "Guidance when image storage rejects an upload.",
        })
      );
    return item.file_path;
  }
}

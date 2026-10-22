/** Shared REST transport, also bundled into the Figma plugin. Never retries a paid POST. */
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
    readonly status?: number
  ) {
    super(
      projectId
        ? `${message} (project ${projectId}; resume this project instead of generating again)`
        : message
    );
    this.name = "MagicHourError";
  }
}
export type ClientSettings = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProjectCreated?: (project: { id: string; kind: ProjectKind }) => void | Promise<void>;
};
export function httpsURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Expected an HTTPS media URL.");
  return url.href;
}
export class MagicHourClient {
  private readonly fetcher: typeof globalThis.fetch;
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  constructor(private readonly settings: ClientSettings) {
    if (!settings.apiKey?.trim()) throw new Error("Magic Hour API key is required.");
    this.fetcher = settings.fetch ?? globalThis.fetch.bind(globalThis);
    this.pollIntervalMs = settings.pollIntervalMs ?? 2000;
    this.timeoutMs = settings.timeoutMs ?? 600_000;
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs < 0)
      throw new Error("Invalid poll interval.");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error("Invalid timeout.");
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
    });
    if (!response.ok) {
      // Do not echo a remote response that could contain credentials or signed URLs.
      throw new MagicHourError(
        `Magic Hour API returned HTTP ${response.status}.`,
        undefined,
        response.status
      );
    }
    return response.json() as Promise<T>;
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
      if (error instanceof MagicHourError) throw error;
      throw new MagicHourError(
        "Generation submission was interrupted. Acceptance is unknown; check account history before submitting again."
      );
    }
    if (typeof created.id !== "string" || !created.id)
      throw new MagicHourError(
        "Missing project ID. Check account history before submitting again."
      );
    try {
      await this.settings.onProjectCreated?.({ id: created.id, kind });
    } catch {
      throw new MagicHourError("Could not save the accepted project ID.", created.id);
    }
    return created.id;
  }
  async getProject(
    id: string,
    kind: ProjectKind,
    signal?: AbortSignal,
    headers?: Record<string, string | undefined>
  ): Promise<Project> {
    return this.request<Project>(
      `/v1/${kind}-projects/${encodeURIComponent(id)}`,
      undefined,
      signal,
      headers
    );
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
            throw new Error("Completed project has no downloadable output.");
          for (const download of project.downloads) httpsURL(download.url);
          return project;
        }
        if (project.status === "error" || project.status === "canceled")
          throw new Error(`Generation ${project.status}.`);
        if (!["draft", "queued", "rendering"].includes(project.status))
          throw new Error("Unknown project status.");
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            signal.removeEventListener("abort", abort);
            resolve();
          };
          const timer = setTimeout(done, this.pollIntervalMs);
          const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            reject(new Error("Waiting stopped."));
          };
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    } catch (error) {
      throw new MagicHourError(
        error instanceof MagicHourError
          ? "Could not retrieve the project."
          : error instanceof Error
            ? error.message
            : "Waiting stopped.",
        id
      );
    }
  }
  async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    const response = await this.fetcher(httpsURL(url), {
      signal: signal ?? this.signal(),
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`Media download returned HTTP ${response.status}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
  async uploadImage(bytes: Uint8Array, extension: string, signal: AbortSignal): Promise<string> {
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) || !bytes.length)
      throw new Error("Expected a nonempty PNG, JPEG, or WebP image.");
    const { items } = await this.request<{ items: { upload_url: string; file_path: string }[] }>(
      "/v1/files/upload-urls",
      { items: [{ type: "image", extension }] },
      signal
    );
    const item = items?.[0];
    if (!item?.file_path || !item.upload_url) throw new Error("Invalid upload response.");
    const response = await this.fetcher(httpsURL(item.upload_url), {
      method: "PUT",
      body: bytes as BodyInit,
      signal,
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`Image upload returned HTTP ${response.status}.`);
    return item.file_path;
  }
}

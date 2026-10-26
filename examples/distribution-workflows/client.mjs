/** A small, dependency-free HTTP adapter for media workflow builders. */
export class ProjectError extends Error {
  constructor(message, receipt, options) {
    super(message, options);
    this.name = "ProjectError";
    this.receipt = receipt;
  }
}

const TOOLS = {
  generate: { path: "/v1/ai-image-generator", kind: "image" },
  edit: { path: "/v1/ai-image-editor", kind: "image" },
  animate: { path: "/v1/image-to-video", kind: "video" },
  lipsync: { path: "/v1/lip-sync", kind: "video" },
};
const STATUSES = new Set(["draft", "queued", "rendering", "complete", "error", "canceled"]);

function assertReceipt(receipt) {
  if (
    !receipt ||
    !["image", "video"].includes(receipt.kind) ||
    typeof receipt.id !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(receipt.id)
  ) {
    throw new TypeError("A receipt needs an image/video kind and an exact project ID.");
  }
}

export function imageRequest(prompt, { model = "z-image-turbo", aspect = "1:1", count = 1 } = {}) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new TypeError("A prompt is required.");
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new TypeError("Use 1–4 images.");
  if (!["1:1", "16:9", "9:16"].includes(aspect)) throw new TypeError("Unsupported aspect ratio.");
  return {
    image_count: count,
    model,
    aspect_ratio: aspect,
    resolution: "640px",
    style: { prompt },
  };
}

export class MagicHourWorkflow {
  constructor({
    token,
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    requestTimeoutMs = 30_000,
  } = {}) {
    if (typeof token !== "string" || !token.trim())
      throw new TypeError("MAGIC_HOUR_API_KEY is required.");
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1)
      throw new TypeError("Invalid request timeout.");
    this.token = token;
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(path, { method = "GET", body, timeoutMs = this.requestTimeoutMs } = {}) {
    const response = await this.fetch(`https://api.magichour.ai${path}`, {
      method,
      redirect: "error",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, this.requestTimeoutMs))),
    });
    // Do not include an untrusted provider response or credentials in a workflow log.
    if (!response.ok) throw new Error(`Magic Hour API returned HTTP ${response.status}.`);
    return response.json();
  }

  /** Submit once. Persist onAccepted before beginning any polling. Never retry POST automatically. */
  async submit(tool, body, { onAccepted } = {}) {
    const config = TOOLS[tool];
    if (!config) throw new TypeError("Unknown workflow tool.");
    let data;
    try {
      data = await this.request(config.path, { method: "POST", body });
    } catch (cause) {
      throw new ProjectError(
        "Submission outcome is unknown. Reconcile account history before another submission.",
        { kind: config.kind, tool, outcome: "unknown" },
        { cause }
      );
    }
    const receipt = {
      kind: config.kind,
      tool,
      id: data?.id,
      credits_charged: data?.credits_charged,
    };
    try {
      assertReceipt(receipt);
    } catch (cause) {
      throw new ProjectError(
        "Submission returned no usable project ID. Reconcile account history; do not resubmit.",
        { kind: config.kind, tool, outcome: "unknown" },
        { cause }
      );
    }
    if (onAccepted) {
      try {
        await onAccepted(receipt);
      } catch (cause) {
        throw new ProjectError(
          `Project ${receipt.id} was accepted but its receipt could not be saved. Recover this ID.`,
          receipt,
          { cause }
        );
      }
    }
    return receipt;
  }

  async get(receipt, { timeoutMs } = {}) {
    assertReceipt(receipt);
    let data;
    try {
      data = await this.request(`/v1/${receipt.kind}-projects/${encodeURIComponent(receipt.id)}`, {
        timeoutMs,
      });
    } catch (cause) {
      throw new ProjectError(
        `Read failed for project ${receipt.id}. Resume this same project.`,
        receipt,
        { cause }
      );
    }
    if (!data || data.id !== receipt.id || !STATUSES.has(data.status)) {
      throw new ProjectError(`Invalid status response for project ${receipt.id}.`, receipt);
    }
    return data;
  }

  /** Bound the wait and return the accepted ID even if rendering is still in progress. */
  async wait(receipt, { maxWaitMs = 60_000, pollIntervalMs = 2_000, maxPolls = 60 } = {}) {
    assertReceipt(receipt);
    if (
      !Number.isFinite(maxWaitMs) ||
      maxWaitMs < 1 ||
      !Number.isFinite(pollIntervalMs) ||
      pollIntervalMs < 0 ||
      !Number.isInteger(maxPolls) ||
      maxPolls < 1
    )
      throw new TypeError("Invalid polling limits.");
    const deadline = Date.now() + maxWaitMs;
    let project;
    for (let i = 0; i < maxPolls && Date.now() < deadline; i++) {
      project = await this.get(receipt, { timeoutMs: Math.max(1, deadline - Date.now()) });
      if (
        project.status === "error" ||
        project.status === "canceled" ||
        project.status === "draft"
      ) {
        throw new ProjectError(
          `Project ${receipt.id} is ${project.status}. No new job was submitted.`,
          receipt
        );
      }
      if (project.status === "complete") {
        if (!Array.isArray(project.downloads) || !project.downloads.length) {
          throw new ProjectError(
            `Completed project ${receipt.id} has no output. Resume or investigate this ID.`,
            receipt
          );
        }
        for (const download of project.downloads) {
          let url;
          try {
            url = new URL(download.url);
          } catch {
            throw new ProjectError("Invalid output URL.", receipt);
          }
          if (url.protocol !== "https:" || url.username || url.password)
            throw new ProjectError("Invalid output URL.", receipt);
          if (
            typeof download.expires_at !== "string" ||
            !Number.isFinite(Date.parse(download.expires_at)) ||
            Date.parse(download.expires_at) <= Date.now()
          )
            throw new ProjectError(
              "Output URL is expired or has no valid expiry. Retrieve this project again.",
              receipt
            );
        }
        return {
          ...receipt,
          status: "complete",
          credits_charged: project.credits_charged,
          downloads: project.downloads,
          review_required: true,
        };
      }
      if (i + 1 < maxPolls)
        await this.sleep(Math.max(0, Math.min(pollIntervalMs, deadline - Date.now())));
    }
    return {
      ...receipt,
      status: project?.status ?? "queued",
      pending: true,
      review_required: true,
    };
  }
}

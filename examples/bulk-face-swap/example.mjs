// Node.js 20+. Save as example.mjs; run: node example.mjs
// Server-side JavaScript. Never expose your API key in browser code.
const API = "https://api.magichour.ai/v1";
const token = process.env.MAGIC_HOUR_API_KEY;
if (!token) throw new Error("Set MAGIC_HOUR_API_KEY");

// Edit these request settings first.
// Set PROJECT_ID to resume polling a submitted job without paying twice.
let projectId = process.env.PROJECT_ID;
let payload;
if (!projectId) {
  payload = {
    assets: {
      face_swap_mode: "all-faces",
      source_file_path: "",
      target_file_path: "",
    },
    name: "Batch Face Swap photo",
  };
  if (!process.env.SOURCE_FACE_URL || !process.env.TARGET_IMAGE_URL)
    throw new Error("Set SOURCE_FACE_URL and TARGET_IMAGE_URL");
  payload.assets.source_file_path = process.env.SOURCE_FACE_URL;
  payload.assets.target_file_path = process.env.TARGET_IMAGE_URL;
}

function retryAfterMs(value) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function request(path, body) {
  const response = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  }).catch((error) => {
    error.transientPollFailure = body === undefined;
    throw error;
  });
  if (!response.ok) {
    const error = new Error(
      "HTTP " +
        response.status +
        ": " +
        (await response.text().catch(() => "Unable to read error body"))
    );
    error.transientPollFailure =
      body === undefined && ([408, 429].includes(response.status) || response.status >= 500);
    error.retryAfterMs = retryAfterMs(response.headers.get("Retry-After"));
    throw error;
  }
  return response.json().catch((error) => {
    error.transientPollFailure = body === undefined;
    throw error;
  });
}

if (!projectId) {
  // Do not automatically retry this POST after a connection timeout.
  const job = await request("/face-swap-photo", payload);
  projectId = job.id;
  console.log("PROJECT_ID=" + projectId);
}

const deadline = Date.now() + 900_000;
let delay = 2_000;
let complete = false;
while (Date.now() < deadline) {
  let result;
  try {
    result = await request("/image-projects/" + projectId);
    if (!result || typeof result !== "object" || typeof result.status !== "string") {
      const error = new Error("Polling response is missing a valid status");
      error.transientPollFailure = true;
      throw error;
    }
  } catch (error) {
    if (!error.transientPollFailure) throw error;
    const wait = error.retryAfterMs ?? delay;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(wait, Math.max(0, deadline - Date.now())))
    );
    delay = Math.min(delay * 2, 15_000);
    continue;
  }
  if (result.status === "complete") {
    if (!result.downloads?.length) throw new Error("Complete job has no downloads");
    console.log("Credits charged:", result.credits_charged);
    for (const download of result.downloads) {
      console.log("Download:", download.url);
      console.log("Expires:", download.expires_at);
    }
    complete = true;
    break;
  }
  if (["error", "canceled"].includes(result.status)) {
    throw new Error(projectId + ": " + result.status + "; " + JSON.stringify(result.error));
  }
  await new Promise((resolve) => setTimeout(resolve, delay));
  delay = Math.min(delay * 2, 15_000);
}
if (!complete) throw new Error("Still processing. Resume with PROJECT_ID=" + projectId);

import { MagicHourClient } from "../../vercel-ai-sdk/src/client.js";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const prompt = $<HTMLTextAreaElement>("prompt"),
  apiKey = $<HTMLInputElement>("api-key");
const run = $<HTMLButtonElement>("run"),
  resume = $<HTMLButtonElement>("resume"),
  stop = $<HTMLButtonElement>("stop");
const insert = $<HTMLButtonElement>("insert"),
  preview = $<HTMLImageElement>("preview");
let mode: "generate" | "edit" = "generate",
  canExport = false,
  targetId: string | undefined;
let busy = false,
  projectId: string | undefined,
  resultBytes: Uint8Array | undefined,
  previewURL: string | undefined;
let controller: AbortController | undefined,
  exportCounter = 0;
let exportRequest:
  | {
      id: number;
      resolve: (value: { bytes: Uint8Array; targetId: string }) => void;
      reject: (error: Error) => void;
    }
  | undefined;
const post = (message: unknown) => parent.postMessage({ pluginMessage: message }, "*");
function status(text: string, error = false) {
  $("status").textContent = text;
  $("status").dataset.error = String(error);
}
function update() {
  run.disabled = busy || !!projectId || (mode === "edit" && !canExport);
  run.textContent = mode === "generate" ? "Generate image" : "Edit selected layer";
  resume.hidden = !projectId || busy || !!resultBytes;
  stop.hidden = !busy;
  $("new").hidden = busy || !projectId;
  insert.hidden = !resultBytes || busy;
  for (const id of [
    "generate-tab",
    "edit-tab",
    "model",
    "resolution",
    "aspect",
    "prompt",
    "api-key",
    "replace",
  ])
    $<HTMLButtonElement | HTMLInputElement>(id).disabled = busy;
  $("project").hidden = !projectId;
  $("project").textContent = projectId ? `Project: ${projectId}` : "";
}
function setMode(next: "generate" | "edit") {
  mode = next;
  $("generate-tab").setAttribute("aria-selected", String(mode === "generate"));
  $("edit-tab").setAttribute("aria-selected", String(mode === "edit"));
  $("selection").hidden = mode !== "edit";
  $("replace-label").hidden = mode !== "edit";
  $("prompt-label").textContent =
    mode === "generate" ? "Describe your image" : "Describe your edit";
  update();
}
$("generate-tab").onclick = () => setMode("generate");
$("edit-tab").onclick = () => setMode("edit");
function client() {
  return new MagicHourClient({
    apiKey: apiKey.value,
    timeoutMs: 1_200_000,
    onProjectCreated: ({ id }) => {
      projectId = id;
      post({ type: "remember-project", id });
      update();
      status("Generating your image. You can stop waiting and resume this project later.");
    },
  });
}
async function exportSelection(
  signal: AbortSignal
): Promise<{ bytes: Uint8Array; targetId: string }> {
  return new Promise((resolve, reject) => {
    const id = ++exportCounter;
    const timeout = setTimeout(() => finish(new Error("Layer export timed out.")), 30_000);
    const abort = () => finish(new Error("Layer export stopped."));
    function cleanup() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      exportRequest = undefined;
    }
    function finish(error: Error) {
      cleanup();
      reject(error);
    }
    exportRequest = {
      id,
      resolve: (result) => {
        cleanup();
        resolve(result);
      },
      reject: finish,
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    post({ type: "export-selection", requestId: id });
  });
}
async function showResult(transport: MagicHourClient, id: string, signal: AbortSignal) {
  const project = await transport.wait(id, "image", signal);
  const bytes = await transport.download(project.downloads[0].url, signal);
  resultBytes = bytes;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(new Blob([bytes as BlobPart]));
  preview.src = previewURL;
  preview.hidden = false;
  status("Your image is ready. Insert it into the canvas.");
}
$("form").onsubmit = (event) => event.preventDefault();
run.onclick = async () => {
  if (!$<HTMLFormElement>("form").reportValidity()) return;
  if (busy || projectId || !prompt.value.trim() || !apiKey.value.trim()) return;
  busy = true;
  controller = new AbortController();
  update();
  try {
    const transport = client(),
      signal = transport.signal(controller.signal);
    let imagePath: string | undefined;
    if (mode === "edit") {
      status("Exporting your selected layer…");
      const source = await exportSelection(signal);
      targetId = source.targetId;
      status("Uploading the selected image…");
      imagePath = await transport.uploadImage(source.bytes, "png", signal);
    } else targetId = undefined;
    status("Submitting your generation…");
    const body = {
      image_count: 1,
      model: $<HTMLSelectElement>("model").value,
      resolution: $<HTMLSelectElement>("resolution").value,
      aspect_ratio: $<HTMLSelectElement>("aspect").value,
      style: { prompt: prompt.value.trim() },
      ...(imagePath ? { assets: { image_file_paths: [imagePath] } } : {}),
    };
    const id = await transport.create(
      mode === "edit" ? "ai-image-editor" : "ai-image-generator",
      "image",
      body,
      signal
    );
    await showResult(transport, id, signal);
  } catch (error) {
    status(error instanceof Error ? error.message : "Generation failed.", true);
  } finally {
    busy = false;
    update();
  }
};
stop.onclick = () => controller?.abort();
resume.onclick = async () => {
  if (!projectId || busy) return;
  if (!apiKey.value.trim()) {
    status("Enter your API key to resume the saved project.", true);
    apiKey.focus();
    return;
  }
  busy = true;
  controller = new AbortController();
  update();
  status("Checking the saved project…");
  try {
    const transport = client();
    await showResult(transport, projectId, transport.signal(controller.signal));
  } catch (error) {
    status(error instanceof Error ? error.message : "Could not resume this project.", true);
  } finally {
    busy = false;
    update();
  }
};
$("new").onclick = () => {
  projectId = undefined;
  resultBytes = undefined;
  targetId = undefined;
  preview.hidden = true;
  post({ type: "remember-project", id: "" });
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = undefined;
  status("Ready for a new generation.");
  update();
};
insert.onclick = () => {
  if (!resultBytes) return;
  insert.disabled = true;
  post({
    type: "insert-image",
    bytes: Array.from(resultBytes),
    targetId,
    replace: !!targetId && $<HTMLInputElement>("replace").checked,
  });
};
window.onmessage = (event) => {
  if (event.source !== parent) return;
  const message = event.data?.pluginMessage;
  if (!message) return;
  if (message.type === "selection") {
    canExport = !!message.canExport;
    $("selection").textContent = canExport
      ? `Selected: ${message.name}`
      : "Select one layer in Figma to edit.";
    update();
  } else if (message.type === "saved-project" && message.id && !busy && !projectId) {
    projectId = message.id;
    status("A previous generation is available. Enter your key to resume.");
    update();
  } else if (
    message.type === "selection-exported" &&
    exportRequest &&
    exportRequest.id === message.requestId
  ) {
    exportRequest.resolve({ bytes: new Uint8Array(message.bytes), targetId: message.targetId });
  } else if (message.type === "plugin-error") {
    if (exportRequest && exportRequest.id === message.requestId)
      exportRequest!.reject(new Error(message.message));
    else {
      status(message.message, true);
      insert.disabled = false;
    }
  } else if (message.type === "inserted") {
    status("Added to your Figma canvas.");
    insert.disabled = false;
  }
};
post({ type: "ready" });
update();

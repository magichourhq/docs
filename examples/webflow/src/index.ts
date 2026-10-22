import { MagicHourClient, MagicHourError } from "../../vercel-ai-sdk/src/client";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = el<HTMLFormElement>("generate-form");
const key = el<HTMLInputElement>("key");
const prompt = el<HTMLTextAreaElement>("prompt");
const consent = el<HTMLInputElement>("consent");
const project = el<HTMLInputElement>("project");
let busy = false;
let disposed = false;
let acceptedId = "";
let acceptanceUnknown = false;
let abort: AbortController | undefined;
let result: { id: string; blob: Blob; credits: number } | undefined;
let previewUrl = "";
let asset: Asset | undefined;
let pendingImage: ImageElement | undefined;
let assetSite = "";

function status(message: string, error = false) {
  if (disposed) return;
  el("status").textContent = message;
  el("status").className = error ? "error" : "";
}
function render() {
  if (disposed) return;
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement
  >(
    "#generate-form input, #generate-form textarea, #generate-form button, #project, #resume, #add, #reset"
  ))
    control.disabled = busy;
  el<HTMLButtonElement>("generate").disabled = busy || !!acceptedId || acceptanceUnknown;
  el<HTMLButtonElement>("add").disabled = busy || !result;
  el("stop").hidden = !abort;
  el("reset").hidden = !acceptedId && !acceptanceUnknown;
  el("result").hidden = !result;
}
function projectId(value: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("Enter a valid Magic Hour image project ID.");
  return value;
}
function remember(id: string) {
  acceptedId = projectId(id);
  project.value = acceptedId;
  el<HTMLDetailsElement>("recovery").open = true;
  acceptanceUnknown = false;
  render();
}
function client() {
  return new MagicHourClient({ apiKey: key.value, onProjectCreated: ({ id }) => remember(id) });
}
async function insertionTarget() {
  const modes = await webflow.canForAppMode([
    webflow.appModes.canDesign,
    webflow.appModes.canManageAssets,
    webflow.appModes.canModifyImageElement,
  ]);
  if (!modes.canDesign || !modes.canManageAssets || !modes.canModifyImageElement)
    throw new Error(
      "Switch to Design mode on the main branch with permission to manage assets and images."
    );
  const selected = await webflow.getSelectedElement();
  if (!selected || selected.type === "Body")
    throw new Error("Select an element inside the page. The GIF will be inserted after it.");
  return selected;
}
async function retrieve(c: MagicHourClient, id: string, signal: AbortSignal) {
  const completed = await c.wait(projectId(id), "image", signal);
  const bytes = await c.download(completed.downloads[0].url, signal);
  if (!bytes.length || bytes.length > 4_000_000)
    throw new Error(
      "This GIF exceeds Webflow’s 4 MB image limit. Your project remains in Magic Hour; this GIF cannot be added at its current size."
    );
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a")
    throw new Error(
      "The completed output is not a GIF. Resume an AI GIF project generated with GIF output."
    );
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  result = {
    id,
    blob: new Blob([bytes as BlobPart], { type: "image/gif" }),
    credits: completed.credits_charged,
  };
  previewUrl = URL.createObjectURL(result.blob);
  el<HTMLImageElement>("preview").src = previewUrl;
  status(`GIF ready · original charge ${result.credits} credits. Preview it before Add.`);
}
async function run(task: (signal: AbortSignal) => Promise<void>, stoppable = true) {
  if (busy || disposed) return;
  busy = true;
  const controller = new AbortController();
  abort = stoppable ? controller : undefined;
  render();
  try {
    await task(controller.signal);
  } catch (error) {
    if (error instanceof MagicHourError && error.projectId) remember(error.projectId);
    const message =
      error instanceof Error
        ? error.message
        : "The operation failed. Check your project and try again.";
    status(
      acceptanceUnknown
        ? message +
            " Acceptance is unknown. Check Magic Hour account history before starting another paid generation."
        : message,
      true
    );
  } finally {
    busy = false;
    abort = undefined;
    render();
  }
}
form.onsubmit = (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  void run(async (signal) => {
    if (acceptedId || acceptanceUnknown)
      throw new Error(
        "Resume the existing project or choose New generation before another paid submission."
      );
    const text = prompt.value.trim();
    if (!text || text.length > 500) throw new Error("Describe your animation in 1–500 characters.");
    if (!consent.checked)
      throw new Error("Agree to send your prompt to Magic Hour before generating.");
    const c = client();
    await insertionTarget();
    status("Submitting one paid GIF generation. The accepted project ID will appear below.");
    acceptanceUnknown = true;
    let id: string;
    try {
      id = await c.create(
        "ai-gif-generator",
        "image",
        {
          name: "Magic Hour GIF for Webflow",
          style: { prompt: text },
          output_format: "gif",
        },
        c.signal(signal)
      );
    } catch (error) {
      if (error instanceof MagicHourError && [400, 401, 402, 404, 422].includes(error.status ?? 0))
        acceptanceUnknown = false;
      throw error;
    }
    status(
      "Generating your GIF. Copy the project ID before closing; Stop waiting keeps the server job running."
    );
    await retrieve(c, id, c.signal(signal));
  });
};
el("resume").onclick = () =>
  void run(async (signal) => {
    const id = projectId(project.value.trim());
    const c = client();
    if (id !== acceptedId) {
      asset = undefined;
      pendingImage = undefined;
    }
    remember(id);
    result = undefined;
    status("Retrieving the existing image project. No new generation or charge is submitted.");
    await retrieve(c, id, c.signal(signal));
  });
el("stop").onclick = () => abort?.abort();
el("reset").onclick = () => {
  if (busy) return;
  if (
    acceptanceUnknown &&
    !window.confirm(
      "The previous request may have been accepted. Check your Magic Hour account history before starting another paid generation. Continue?"
    )
  )
    return;
  acceptedId = "";
  acceptanceUnknown = false;
  project.value = "";
  result = undefined;
  asset = undefined;
  pendingImage = undefined;
  consent.checked = false;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  el<HTMLImageElement>("preview").removeAttribute("src");
  status("Ready for a new paid generation. Existing projects remain in your Magic Hour account.");
  render();
};
el("add").onclick = () =>
  void run(async () => {
    if (!result) throw new Error("Generate or resume a GIF first.");
    const target = await insertionTarget();
    const { siteId } = await webflow.getSiteInfo();
    if (assetSite !== siteId) {
      asset = undefined;
      pendingImage = undefined;
      assetSite = siteId;
    }
    status("Copying your GIF into Webflow’s public site assets, then inserting an Image…");
    if (!asset)
      asset = await webflow.createAsset(
        new File([result.blob], `magic-hour-${result.id}.gif`, { type: "image/gif" })
      );
    if (!pendingImage) {
      try {
        const inserted = await target.after(webflow.elementPresets.Image);
        if (inserted.type !== "Image") throw new Error("Unexpected inserted element.");
        pendingImage = inserted;
      } catch {
        throw new Error(
          "Webflow could not confirm inserting the Image. Check your canvas before trying Add again; the uploaded asset is retained."
        );
      }
    }
    try {
      await pendingImage.setAsset(asset);
      await pendingImage.setAltText("AI-generated animation created with Magic Hour.");
    } catch {
      throw new Error(
        "The Image was created but Webflow could not confirm attaching the GIF. Check the canvas; retry Add to attach the existing asset."
      );
    }
    pendingImage = undefined;
    status("GIF added as a native Webflow Image. Your selected source element is unchanged.");
  }, false);
addEventListener(
  "pagehide",
  () => {
    disposed = true;
    abort?.abort();
    key.value = "";
    prompt.value = "";
    consent.checked = false;
    acceptedId = "";
    result = undefined;
    asset = undefined;
    pendingImage = undefined;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  },
  { once: true }
);
render();

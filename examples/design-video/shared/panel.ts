import { VideoPanel, type EditorHost, type VideoOptions } from "./video";
import "./style.css";
export function mountPanel(host: EditorHost, requireGenerationConsent = false) {
  const root = document.getElementById("root")!;
  root.innerHTML = `<main class="panel"><header><span class="brand">MAGIC HOUR</span><h1>Bring your images to life</h1><p>Create a short video for your design.</p></header>
  <label>Magic Hour API key<input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Enter your API key"></label>
  <p class="hint">Your key stays in this session. Generations use your Magic Hour API credits.</p>
  <section aria-label="Starting image"><button id="selection" class="secondary"></button><label class="file-label">Or upload an image<input id="file" type="file" accept="image/png,image/jpeg,image/webp"></label>
  <div id="source" hidden><img id="source-preview" alt="Starting image"><p id="source-name"></p><button id="remove" class="quiet">Remove image</button></div></section>
  <label>Motion or creative brief<textarea id="prompt" rows="3" maxlength="2000" placeholder="A gentle camera push in. Keep the product steady and the background calm."></textarea></label>
  <div class="fields"><label>Duration<select id="duration"><option value="1">1 second</option><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="10">10 seconds</option></select></label><label>Resolution<select id="resolution"><option>480p</option><option>720p</option></select></label></div>
  <label id="ratio-label">Aspect ratio<select id="ratio"><option value="16:9">Landscape · 16:9</option><option value="1:1">Square · 1:1</option><option value="9:16">Portrait · 9:16</option></select></label>
  <p class="hint">LTX 2.5 · muted video. Image inputs keep their original aspect ratio. Loop playback does not guarantee a seamless visual loop.</p>
  ${requireGenerationConsent ? `<label class="hint" style="display:block"><input id="consent" type="checkbox" required style="width:auto;margin-right:8px">I agree to send my prompt and chosen image, if any, to Magic Hour for AI video generation. Magic Hour credits apply.</label><p class="hint"><a href="https://magichour.ai/privacy-policy" target="_blank" rel="noreferrer">Magic Hour Privacy Policy</a></p>` : ""}
  <button id="generate">Generate video</button><button id="stop" class="secondary" hidden>Stop waiting</button>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="result" hidden aria-label="Generated video"><video id="video" controls muted loop playsinline></video><button id="insert">Add video to design</button></section>
  <details id="recovery"><summary>Resume an existing generation</summary><label>Video project ID<input id="project" autocomplete="off" spellcheck="false"></label><button id="resume" class="secondary">Resume generation</button><p class="hint">Retrieves the existing project without another generation charge. Stop waiting leaves the server job running.</p></details>
  <button id="reset" class="quiet" hidden>New generation</button>
  <footer><a href="https://magichour.ai/developer?utm_source=design-integration&utm_medium=integration" target="_blank" rel="noreferrer">Get API key</a><a href="https://docs.magichour.ai/pricing" target="_blank" rel="noreferrer">API pricing</a><a href="https://magichour.ai/privacy-policy" target="_blank" rel="noreferrer">Privacy</a><a href="mailto:support@magichour.ai">Support</a></footer>
  <p class="hint">Your prompt and chosen image go to Magic Hour. The finished video is copied into your design when you click Add.</p></main>`;
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const key = el<HTMLInputElement>("key"),
    prompt = el<HTMLTextAreaElement>("prompt"),
    project = el<HTMLInputElement>("project");
  el("selection").textContent = host.selectionLabel;
  el("selection").hidden = !host.captureImage;
  const panel = new VideoPanel(host);
  let source: Blob | undefined,
    result: Blob | undefined,
    sourceUrl = "",
    resultUrl = "";
  const render = () => {
    const s = panel.state;
    for (const id of [
      "selection",
      "file",
      "remove",
      "prompt",
      "duration",
      "resolution",
      "ratio",
      "reset",
      "resume",
      "insert",
    ])
      el<HTMLInputElement>(id).disabled = s.busy;
    el<HTMLButtonElement>("generate").disabled = !s.ready || s.busy || !!s.savedId;
    el<HTMLButtonElement>("insert").disabled = s.busy || !s.result;
    el("stop").hidden = !s.busy;
    el("reset").hidden = !s.savedId;
    el("source").hidden = !s.source;
    el("result").hidden = !s.result;
    el("ratio-label").hidden = !!s.source;
    el("status").textContent = s.message;
    el("status").className = s.error ? "error" : "";
    if (s.savedId && document.activeElement !== project) project.value = s.savedId;
    if (source !== s.source?.blob) {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      source = s.source?.blob;
      sourceUrl = source ? URL.createObjectURL(source) : "";
      el<HTMLImageElement>("source-preview").src = sourceUrl;
    }
    el("source-name").textContent = s.source?.label ?? "";
    if (result !== s.result?.blob) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      result = s.result?.blob;
      resultUrl = result ? URL.createObjectURL(result) : "";
      if (resultUrl) el<HTMLVideoElement>("video").src = resultUrl;
      else el<HTMLVideoElement>("video").removeAttribute("src");
    }
  };
  panel.subscribe(render);
  render();
  void panel.init();
  el("selection").onclick = () => void panel.capture();
  el<HTMLInputElement>("file").onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void panel.selectFile(file);
  };
  el("remove").onclick = () => panel.removeImage();
  el("stop").onclick = () => panel.stop();
  el("reset").onclick = () => void panel.reset();
  el("generate").onclick = () => {
    if (requireGenerationConsent && !el<HTMLInputElement>("consent").reportValidity()) return;
    void panel.generate(key.value, {
      prompt: prompt.value,
      duration: Number(el<HTMLSelectElement>("duration").value),
      resolution: el<HTMLSelectElement>("resolution").value as VideoOptions["resolution"],
      aspectRatio: el<HTMLSelectElement>("ratio").value as VideoOptions["aspectRatio"],
    });
  };
  el("resume").onclick = () => void panel.resume(key.value, project.value.trim());
  el("insert").onclick = () => void panel.insert(key.value);
  addEventListener(
    "pagehide",
    () => {
      key.value = "";
      panel.dispose();
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
    { once: true }
  );
}

import { VideoPanel, type EditorHost, type VideoOptions } from "./video";
import { MagicHourClient, MagicHourError } from "../../vercel-ai-sdk/src/client";
import "./style.css";
export function mountPanel(host: EditorHost, requireGenerationConsent = false) {
  const root = document.getElementById("root")!;
  root.innerHTML = `<main class="panel"><header><span class="brand">MAGIC HOUR</span><h1>Bring your images to life</h1><p>Create a short video for your design.</p></header>
  <label>Magic Hour API key<input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Enter your API key"></label>
  <button id="connect" class="secondary">Connect account</button><p id="connection" class="hint" role="status" aria-live="polite">Not connected. Enter your key and connect to validate it.</p>
  <p class="hint">Your key stays in this session. This add-on has no separate fee. Generations use your Magic Hour account's credit balance.</p>
  <details><summary>How Magic Hour credits work</summary><p class="hint">New accounts currently receive 400 signup credits. Basic accounts can manually claim 100 daily credits, up to seven claims in total; these are not automatic daily refills. Generation cost varies by model, duration and resolution. Monthly plan credits arrive after successful monthly payment; annual plan credits arrive upfront. Unused subscription and credit-pack credits roll over and do not expire. Buy a credit pack or renew your plan when your balance is insufficient. Some settings, including 720p here, require a paid plan. <a href="https://magichour.ai/pricing" target="_blank" rel="noreferrer">Check plans and credits</a>.</p></details>
  <section aria-label="Starting image"><button id="selection" class="secondary"></button><label class="file-label">Or upload an image<input id="file" type="file" accept="image/png,image/jpeg,image/webp"></label>
  <div id="source" hidden><img id="source-preview" alt="Starting image" draggable="false"><p id="source-name"></p><button id="remove" class="quiet">Remove image</button></div></section>
  <label>Motion or creative brief<textarea id="prompt" rows="3" maxlength="2000" placeholder="A gentle camera push in. Keep the product steady and the background calm."></textarea></label>
  <div class="fields"><label>Duration<select id="duration"><option value="1">1 second</option><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="10">10 seconds</option></select></label><label>Resolution<select id="resolution"><option>480p</option><option>720p</option></select></label></div>
  <label id="ratio-label">Aspect ratio<select id="ratio"><option value="16:9">Landscape · 16:9</option><option value="1:1">Square · 1:1</option><option value="9:16">Portrait · 9:16</option></select></label>
  <p class="hint">LTX 2.5 · muted video. Image inputs keep their original aspect ratio. Loop playback does not guarantee a seamless visual loop.</p>
  ${requireGenerationConsent ? `<label class="hint" style="display:block"><input id="consent" type="checkbox" required style="width:auto;margin-right:8px">I agree to send my prompt and chosen image, if any, to Magic Hour for AI video generation. Magic Hour credits apply.</label><p class="hint"><a href="https://magichour.ai/privacy-policy" target="_blank" rel="noreferrer">Magic Hour Privacy Policy</a></p>` : ""}
  <button id="generate">Generate video</button><button id="stop" class="secondary" hidden>Stop waiting</button>
  <p id="status" role="status" aria-live="polite"></p>
  <section id="result" hidden aria-label="Generated video"><video id="video" controls muted loop playsinline draggable="false"></video><button id="insert">Add video to design</button></section>
  <details id="recovery"><summary>Resume an existing generation</summary><label>Video project ID<input id="project" autocomplete="off" spellcheck="false"></label><button id="resume" class="secondary">Resume generation</button><p class="hint">Retrieves the existing project without another generation charge. Stop waiting leaves the server job running.</p></details>
  <section id="unknown" hidden><label><input id="history-checked" type="checkbox">I checked my Magic Hour account history and found no project from this submission.</label><p class="hint">If a project appears, resume its exact ID instead. Clearing recovery permits another generation charge.</p><button id="clear-unknown" class="secondary">Clear interrupted submission</button></section>
  <button id="reset" class="quiet" hidden>New generation</button>
  <footer><a href="https://magichour.ai/developer?utm_source=design-integration&utm_medium=integration" target="_blank" rel="noreferrer">Account and API key</a><a href="https://docs.magichour.ai/billing/overview" target="_blank" rel="noreferrer">API pricing</a><a href="https://magichour.ai/privacy-policy" target="_blank" rel="noreferrer">Privacy</a><a href="mailto:support@magichour.ai">Support</a></footer>
  <p class="hint">Your prompt and chosen image go to Magic Hour. The finished video is copied into your design when you click Add.</p></main>`;
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const key = el<HTMLInputElement>("key"),
    prompt = el<HTMLTextAreaElement>("prompt"),
    project = el<HTMLInputElement>("project");
  el("selection").textContent = host.selectionLabel;
  el("selection").hidden = !host.captureImage;
  const panel = new VideoPanel(host);
  let connected = false,
    connecting = false,
    connectionMessage = "Not connected. Enter your key and connect to validate it.",
    connectionAbort: AbortController | undefined;
  let source: Blob | undefined,
    result: Blob | undefined,
    sourceUrl = "",
    resultUrl = "";
  const render = () => {
    const s = panel.state;
    const busy = s.busy || connecting;
    if (connected && s.apiStatus === 401) {
      connected = false;
      connectionMessage = "Connection expired. Check your key and connect again.";
    }
    el("unknown").hidden = !s.submissionUnknown;
    el<HTMLInputElement>("history-checked").disabled = busy;
    el<HTMLButtonElement>("clear-unknown").disabled =
      busy || !el<HTMLInputElement>("history-checked").checked;
    key.disabled = busy || connected;
    el<HTMLButtonElement>("connect").disabled =
      busy || s.keyLocked || (!connected && !key.value.trim());
    el("connect").textContent = connecting
      ? "Connecting…"
      : connected
        ? "Disconnect account"
        : "Connect account";
    el("connection").textContent =
      connectionMessage +
      (s.keyLocked
        ? " Key changes stay locked while this generation may be running. Resume to check its status."
        : "");
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
      el<HTMLInputElement>(id).disabled = busy;
    el<HTMLButtonElement>("generate").disabled =
      !connected || !s.ready || busy || !!s.savedId || s.activeProject;
    el<HTMLButtonElement>("resume").disabled = !connected || busy;
    el<HTMLButtonElement>("insert").disabled = !connected || busy || !s.result;
    el<HTMLButtonElement>("reset").disabled = busy || s.activeProject;
    project.disabled = busy || (s.activeProject && !!s.savedId);
    el("stop").hidden = !s.busy;
    el("reset").hidden = !s.savedId;
    el("source").hidden = !s.source;
    el("result").hidden = !s.result;
    el("ratio-label").hidden = !!s.source;
    el("status").textContent = s.message;
    el("status").className = s.error ? "error" : "";
    if (s.savedId && document.activeElement !== project) project.value = s.savedId;
    if (source !== s.source?.blob) {
      if (el<HTMLInputElement>("file").files?.[0] !== s.source?.blob)
        el<HTMLInputElement>("file").value = "";
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
  key.oninput = render;
  el("history-checked").onchange = render;
  el("clear-unknown").onclick = async () => {
    if (!el<HTMLInputElement>("history-checked").checked) return;
    await panel.reset(true);
    el<HTMLInputElement>("history-checked").checked = false;
    render();
  };
  el("connect").onclick = async () => {
    if (panel.state.busy || connecting || panel.state.keyLocked) return;
    if (connected) {
      connected = false;
      key.value = "";
      connectionMessage = "Disconnected. Your key has been removed from this session.";
      render();
      return;
    }
    connecting = true;
    connectionMessage = "Checking your API key with Magic Hour…";
    connectionAbort = new AbortController();
    render();
    try {
      const client = new MagicHourClient({ apiKey: key.value, timeoutMs: 15000 });
      const account = await client.request<{ id: string; credits: number }>(
        "/v1/account",
        undefined,
        client.signal(connectionAbort.signal)
      );
      if (
        typeof account.id !== "string" ||
        !Number.isInteger(account.credits) ||
        account.credits < 0
      )
        throw new Error("Account response was not recognized.");
      connected = true;
      connectionMessage = `Connected. API key validated. ${account.credits.toLocaleString()} credits available at this check. Disconnect to change the key.`;
      panel.clearApiError();
    } catch (error) {
      connectionMessage =
        error instanceof MagicHourError && error.status === 401
          ? "Could not connect. Check that your Magic Hour API key is valid and active."
          : "Could not validate your API key. Check your connection and try again.";
    } finally {
      connecting = false;
      connectionAbort = undefined;
      render();
    }
  };
  root.addEventListener("dragstart", (event) => {
    if (
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    )
      event.preventDefault();
  });
  for (const name of ["dragover", "drop"])
    root.addEventListener(name, (event) => {
      if (
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      )
        event.preventDefault();
    });
  render();
  void panel.init();
  el("selection").onclick = () => void panel.capture();
  el<HTMLInputElement>("file").onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await panel.selectFile(file);
      if (panel.state.source?.blob !== file) input.value = "";
    }
  };
  el("remove").onclick = () => {
    if (panel.state.busy || connecting) return;
    el<HTMLInputElement>("file").value = "";
    panel.removeImage();
  };
  el("stop").onclick = () => panel.stop();
  el("reset").onclick = () => void panel.reset();
  el("generate").onclick = () => {
    el<HTMLInputElement>("history-checked").checked = false;
    if (!connected || connecting) return;
    if (requireGenerationConsent && !el<HTMLInputElement>("consent").reportValidity()) return;
    void panel.generate(key.value, {
      prompt: prompt.value,
      duration: Number(el<HTMLSelectElement>("duration").value),
      resolution: el<HTMLSelectElement>("resolution").value as VideoOptions["resolution"],
      aspectRatio: el<HTMLSelectElement>("ratio").value as VideoOptions["aspectRatio"],
    });
  };
  el("resume").onclick = () => {
    el<HTMLInputElement>("history-checked").checked = false;
    if (connected && !connecting) void panel.resume(key.value, project.value.trim());
  };
  el("insert").onclick = () => {
    if (connected && !connecting) void panel.insert(key.value);
  };
  addEventListener(
    "pagehide",
    () => {
      key.value = "";
      connectionAbort?.abort();
      panel.dispose();
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
    { once: true }
  );
}

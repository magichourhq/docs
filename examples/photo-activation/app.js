const $ = (id) => document.getElementById(id);
let handle;
let previewUrl;
let resultUrl;
let resultFile;
async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
request("/campaign")
  .then((campaign) => {
    $("name").textContent = campaign.name;
  })
  .catch(() => {
    $("status").textContent = "Server unavailable. Refresh after starting the server.";
  });
$("photo").addEventListener("change", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const photo = $("photo").files[0];
  $("preview").hidden = !photo;
  if (photo) {
    previewUrl = URL.createObjectURL(photo);
    $("preview").src = previewUrl;
  }
});
async function poll() {
  $("resume").hidden = true;
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      const project = await request(`/jobs/${handle}`);
      if (["error", "canceled"].includes(project.status))
        throw new Error(
          project.error || `Generation ${project.status}. Ask the operator to check the project.`
        );
      if (project.ready) {
        const response = await fetch(`/jobs/${handle}/download`);
        if (!response.ok)
          throw new Error("Result exists, but download failed. Check existing result to retry.");
        const blob = await response.blob();
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(blob);
        resultFile = new File([blob], "portrait.png", { type: blob.type });
        $("result").src = resultUrl;
        $("result").hidden = false;
        $("download").href = resultUrl;
        $("download").download = "portrait.png";
        $("download").hidden = false;
        $("share").hidden = !navigator.canShare?.({ files: [resultFile] });
        $("status").textContent = "Your portrait is ready. Download to keep or share it.";
        return;
      }
      $("status").textContent = `Portrait ${project.status}. Keep this page open.`;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error("Still processing. Check existing result; don't create another paid job.");
  } catch (error) {
    $("status").textContent = error.message;
    $("resume").hidden = false;
  }
}
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("generate").disabled) return;
  const photo = $("photo").files[0];
  if (!photo || photo.size > 10 * 1024 * 1024) {
    $("status").textContent = "Choose a photo smaller than 10 MB.";
    return;
  }
  $("generate").disabled = true;
  $("status").textContent = "Uploading your photo…";
  try {
    const job = await request("/generate", {
      method: "POST",
      headers: { "Content-Type": photo.type },
      body: photo,
    });
    handle = job.handle;
    $("status").textContent = `Generation accepted: ${job.credits} credits charged.`;
    await poll();
  } catch (error) {
    // A lost create response may still mean a paid job exists. Never retry automatically.
    $("status").textContent = `${error.message} Ask the operator before creating another portrait.`;
  }
});
$("resume").addEventListener("click", poll);
$("share").addEventListener("click", async () => {
  try {
    await navigator.share({ files: [resultFile], title: $("name").textContent });
  } catch (error) {
    if (error.name !== "AbortError")
      $("status").textContent = "Sharing unavailable. Download your portrait to share it.";
  }
});

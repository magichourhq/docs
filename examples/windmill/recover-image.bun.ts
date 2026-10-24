//native

type magic_hour = { api_key: string };

export async function main(magic_hour: magic_hour, project_id: string) {
  if (!project_id.trim()) throw new Error("Enter an accepted image project ID.");
  let response: Response;
  try {
    response = await fetch(
      `https://api.magichour.ai/v1/image-projects/${encodeURIComponent(project_id)}`,
      { headers: { Authorization: `Bearer ${magic_hour.api_key}` }, redirect: "error" },
    );
  } catch {
    throw new Error("Status request failed. Keep the accepted ID and recover it again later.");
  }
  if (!response.ok) throw new Error(`Magic Hour status returned HTTP ${response.status}.`);
  const project = await response.json();
  if (project.id !== project_id) throw new Error("Unexpected image project response.");
  if (project.status !== "complete") {
    return {
      id: project.id,
      status: project.status,
      credits_charged: project.credits_charged ?? null,
      ...("credits_refunded" in project ? { credits_refunded: project.credits_refunded } : {}),
      ...("error" in project ? { error: project.error } : {}),
    };
  }

  const url = project.downloads?.[0]?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error("The completed project has no HTTPS download. Recover the same ID again later.");
  }
  let download: Response;
  try {
    download = await fetch(url, { redirect: "error" });
  } catch {
    throw new Error("Image download failed. Recover the same project ID again later.");
  }
  if (download.status !== 200) throw new Error(`Image download returned HTTP ${download.status}.`);
  const limit = 8 * 1024 * 1024;
  if (Number(download.headers.get("content-length")) > limit) {
    await download.body?.cancel();
    throw new Error("Image download exceeds the 8 MiB limit.");
  }
  const reader = download.body?.getReader();
  if (!reader) throw new Error("The image download has no body.");
  let size = 0;
  let binary = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Image download exceeds the 8 MiB limit.");
      }
      for (let offset = 0; offset < value.length; offset += 8192) {
        binary += String.fromCharCode(...value.subarray(offset, offset + 8192));
      }
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error("Image download failed or exceeded 8 MiB. Recover the same project ID again later.");
  } finally {
    reader.releaseLock();
  }
  if (!binary.startsWith("\x89PNG\r\n\x1a\n")) {
    throw new Error("The downloaded file is not PNG. This example supports PNG output only.");
  }
  return {
    file: {
      content: btoa(binary),
      filename: `magic-hour-${project_id.replace(/[^A-Za-z0-9_-]/g, "_")}.png`,
    },
  };
}

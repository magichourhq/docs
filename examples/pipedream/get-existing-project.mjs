import { apiKey, request } from "./common.mjs";

export default {
  key: "magic_hour-get-existing-project",
  name: "Magic Hour — Get Existing Project",
  description:
    "Check an existing project once and return fresh download URLs when complete. Never creates or polls a generation. [API reference](https://docs.magichour.ai/api-reference/video-projects/get-video-details)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: true },
  props: {
    apiKey,
    projectId: { type: "string", label: "Project ID", description: "The saved ID of an existing Magic Hour project." },
    projectType: { type: "string", label: "Project Type", options: ["image", "video", "audio"] },
  },
  async run({ $ }) {
    const projectId = this.projectId?.trim();
    if (!projectId || !["image", "video", "audio"].includes(this.projectType))
      throw new Error("Enter a project ID and choose image, video, or audio.");
    const project = await request({
      $,
      key: this.apiKey,
      path: `${this.projectType}-projects/${encodeURIComponent(projectId)}`,
    });
    if (!project || project.id !== projectId || project.enabled !== true)
      throw new Error("Magic Hour did not return the requested active project.");
    if (["error", "canceled"].includes(project.status))
      throw new Error(`Magic Hour project ended with status ${project.status}. Inspect the saved project before creating another generation.`);
    if (!["draft", "queued", "rendering", "complete"].includes(project.status))
      throw new Error("Magic Hour returned an unexpected project status.");
    const downloads = project.status === "complete" ? project.downloads : [];
    if (!Array.isArray(downloads) || (project.status === "complete" && !downloads.length))
      throw new Error("Completed project has no downloads. Retrieve this same project again; do not recreate it.");
    for (const download of downloads) {
      let url;
      try { url = new URL(download?.url); } catch { /* Reject below without exposing the URL. */ }
      if (!url || url.protocol !== "https:" || url.username || url.password ||
          !(Date.parse(download?.expires_at) > Date.now()))
        throw new Error("Project has an invalid or expired download. Retrieve this same project again; do not recreate it.");
    }
    const outputUrls = downloads.map((download) => download.url);
    $.export("$summary", `Project is ${project.status}; ${outputUrls.length} file(s) ready.`);
    return {
      project_id: projectId,
      project_type: this.projectType,
      status: project.status,
      downloads,
      output_url: outputUrls[0] ?? null,
      output_urls: outputUrls,
    };
  },
};

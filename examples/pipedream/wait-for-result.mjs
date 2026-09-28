import { apiKey, request } from "./common.mjs";

export default {
  key: "magic_hour-wait-for-result",
  name: "Magic Hour — Wait for Result",
  description:
    "Wait for an existing generation and return its download URLs. [API reference](https://docs.magichour.ai/api-reference/video-projects/get-video-details)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: true },
  props: {
    apiKey,
    projectId: {
      type: "string",
      label: "Project ID",
      description:
        "Map project_id from the generation step. This action never creates a new generation.",
    },
    projectType: { type: "string", label: "Project Type", options: ["image", "video", "audio"] },
  },
  async run({ $ }) {
    const project = await request({
      $,
      key: this.apiKey,
      path: `${this.projectType}-projects/${encodeURIComponent(this.projectId)}`,
    });
    if (["error", "canceled"].includes(project.status)) {
      throw new Error(
        `Magic Hour project ${this.projectId} ended with status ${project.status}. Inspect the project before retrying generation.`
      );
    }
    if (project.status === "complete") {
      const outputUrls = project.downloads?.map((download) => download.url).filter(Boolean);
      if (!outputUrls?.length)
        throw new Error(`Project ${this.projectId} completed without a download URL.`);
      $.export(
        "$summary",
        `Completed project ${this.projectId}; ${outputUrls.length} file(s) ready.`
      );
      return {
        ...project,
        project_id: this.projectId,
        output_url: outputUrls[0],
        output_urls: outputUrls,
      };
    }
    if (!["queued", "rendering"].includes(project.status))
      throw new Error(`Project ${this.projectId} has unexpected status ${project.status}.`);
    if ($.context.JIT)
      throw new Error(
        `Project ${this.projectId} is ${project.status}. Test this step again after completion, or deploy the workflow to enable scheduled polling.`
      );
    if ($.context.run.runs >= 21)
      throw new Error(
        `Project ${this.projectId} did not complete after 20 minutes. Reuse this ID in Wait for Result; do not resubmit the generation.`
      );
    $.flow.rerun(60000, null, 20);
  },
};

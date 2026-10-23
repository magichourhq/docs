import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { MCPAdapter } from "@langchain/mcp-adapters";
import { randomUUID } from "node:crypto";

export const operations = {
  generate: "ai_image_generator_create_image",
  edit: "ai_image_editor_create_image",
  animate: "image_to_video_create_video",
};

export function connectMagicHour(apiKey) {
  if (!apiKey?.trim()) throw new Error("Set MAGIC_HOUR_API_KEY.");
  return new MCPAdapter({
    // One fixed first-party server; retain its canonical tool names.
    prefixToolNameWithServerName: false,
    servers: {
      magic_hour: {
        url: "https://mcp.magichour.ai/",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        defaultToolTimeout: 90000,
      },
    },
  });
}

export function projectData(result) {
  // Adapter 2 returns failed agent calls as ToolMessages, rather than throwing.
  if (result?.status === "error" || result?.isError) {
    const blocks = result.content;
    const detail =
      typeof blocks === "string"
        ? blocks
        : Array.isArray(blocks)
          ? blocks
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join(" ")
          : "";
    throw new Error(
      `Magic Hour rejected the tool call: ${detail || "check authentication, credits and inputs"}`
    );
  }
  const artifact = result?.artifact?.find((item) => item.type === "mcp_structured_content");
  if (artifact) return artifact.data;
  if (result?.structuredContent) return result.structuredContent;
  const content = result?.content ?? result;
  if (content?.structuredContent) return content.structuredContent;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.find((item) => item.type === "text")?.text
        : content?.text;
  if (text) return JSON.parse(text);
  throw new Error("MCP returned no structured project data.");
}

const State = Annotation.Root({
  mode: Annotation(),
  prompt: Annotation(),
  image: Annotation(),
  projectId: Annotation(),
  outputUrls: Annotation(),
  creditsCharged: Annotation(),
  submitOnly: Annotation(),
});

// There is one create node and no edge back to it. Resume by supplying projectId.
export function mediaWorkflow({ tools, saveProject }) {
  const invoke = async (name, args) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error(`Magic Hour tool is unavailable: ${name}`);
    return projectData(await tool.invoke({ type: "tool_call", id: randomUUID(), name, args }));
  };
  return new StateGraph(State)
    .addNode("prepare", async (state) => {
      if (!Object.hasOwn(operations, state.mode)) throw new Error("Use generate, edit or animate.");
      if (state.projectId) return {};
      if (typeof saveProject !== "function")
        throw new Error("Provide a durable saveProject callback before creating a paid job.");
      if (!state.prompt?.trim()) throw new Error("Provide a prompt.");
      if (state.mode !== "generate" && !state.image?.trim())
        throw new Error("Provide a public image URL or uploaded Magic Hour file_path.");
      return {};
    })
    .addNode("create", async (state) => {
      const args =
        state.mode === "animate"
          ? {
              model: "ltx-2.5",
              resolution: "480p",
              end_seconds: 1,
              audio: false,
              style: { prompt: state.prompt },
              assets: { image_file_path: state.image },
            }
          : {
              model: "flux-2-klein",
              resolution: "640px",
              image_count: 1,
              aspect_ratio: "1:1",
              style: { prompt: state.prompt },
              ...(state.mode === "edit" ? { assets: { image_file_paths: [state.image] } } : {}),
            };
      let project;
      try {
        project = await invoke(operations[state.mode], args);
      } catch (error) {
        throw new Error(
          `Generation request failed or its response was lost: ${error.message}. Check Magic Hour project history before retrying: the job may already exist.`
        );
      }
      if (!project.id)
        throw new Error(
          "No project ID returned. Check Magic Hour project history before retrying."
        );
      // Persist the ID before waiting so a timeout can be resumed without paying again.
      try {
        await saveProject({
          mode: state.mode,
          projectId: project.id,
          creditsCharged: project.credits_charged,
        });
      } catch {
        throw new Error(
          `Could not save project ${project.id}. Keep this ID and resume it; do not create another generation.`
        );
      }
      return { projectId: project.id, creditsCharged: project.credits_charged };
    })
    .addNode("wait", async (state) => {
      const type = state.mode === "animate" ? "video" : "image";
      const project = await invoke(`wait_for_${type}_project`, {
        id: state.projectId,
        timeout_seconds: 60,
        poll_interval_seconds: 2,
        include_inline_downloads: false,
        max_inline_downloads: 0,
      });
      if (["error", "canceled"].includes(project.status))
        throw new Error(
          `Project ${state.projectId} is ${project.status}. Inspect its history; do not recreate automatically.`
        );
      if (project.status !== "complete")
        throw new Error(
          `Project ${state.projectId} is ${project.status ?? "unknown"}. Resume with the saved project ID to check again.`
        );
      const urls = project.exact_download_urls ?? project.downloads?.map((item) => item.url);
      if (
        !urls?.length ||
        urls.some((url) => typeof url !== "string" || !url.startsWith("https://"))
      )
        throw new Error(`Completed project ${state.projectId} has no usable download URLs.`);
      return { outputUrls: urls, creditsCharged: project.credits_charged };
    })
    .addEdge(START, "prepare")
    .addConditionalEdges("prepare", (state) => (state.projectId ? "wait" : "create"))
    .addConditionalEdges("create", (state) => (state.submitOnly ? END : "wait"))
    .addEdge("wait", END)
    .compile();
}

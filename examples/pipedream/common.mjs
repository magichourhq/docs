import { axios } from "@pipedream/platform";

export const apiKey = {
  type: "string",
  label: "Magic Hour API Key",
  secret: true,
  description:
    "Create a key in [Developer Hub](https://magichour.ai/developer?utm_source=pipedream&utm_medium=integration&utm_campaign=api_distribution). API calls use your Magic Hour credits.",
};

export const name = { type: "string", label: "Project Name", optional: true };
export const prompt = {
  type: "string",
  label: "Prompt",
  description: "Describe the media you want to generate.",
};
export const image = {
  type: "string",
  label: "Image URL or File Path",
  description:
    "A public image URL or file_path from Magic Hour's upload endpoint. Private Drive share links must be uploaded first.",
};
export const duration = {
  type: "integer",
  label: "Duration (Seconds)",
  default: 5,
  min: 1,
  max: 60,
};
export const model = {
  type: "string",
  label: "Model",
  default: "default",
  description:
    "Use default for Magic Hour's recommendation, or a model ID supported by this endpoint. Availability and credit cost vary by model and account tier.",
};

export async function request({ $, key, path, method = "GET", data }) {
  if (!key?.trim()) throw new Error("Enter a Magic Hour API key.");
  try {
    return await axios($, {
      url: `https://api.magichour.ai/v1/${path}`,
      method,
      headers: { Authorization: `Bearer ${key.trim()}` },
      data,
      timeout: 25000,
      maxRedirects: 0,
    });
  } catch (error) {
    const status = error.response?.status;
    throw new Error(
      `Magic Hour request failed (${status ? `HTTP ${status}` : "network error"}). Check the account and project history before retrying a generation; the request may already have been accepted.`
    );
  }
}

export async function create({ $, key, operation, projectType, data }) {
  const result = await request({ $, key, path: operation, method: "POST", data });
  if (!result.id)
    throw new Error(
      "Magic Hour did not return a project ID. Check the account before retrying to avoid duplicate generation charges."
    );
  $.export(
    "$summary",
    `Created ${projectType} project ${result.id}. Add Wait for Result before downloading.`
  );
  return { ...result, project_id: result.id, project_type: projectType };
}

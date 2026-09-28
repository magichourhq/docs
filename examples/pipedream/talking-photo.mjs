import { apiKey, name, image, duration, create } from "./common.mjs";

export default {
  key: "magic_hour-talking-photo",
  name: "Magic Hour — Talking Photo",
  description:
    "Create a video project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: {
    apiKey,
    name,
    image,
    duration,
    audio: {
      type: "string",
      label: "Audio URL or File Path",
      description: "Use a portrait and voice you have permission to use.",
    },
  },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "ai-talking-photo",
      projectType: "video",
      data: {
        name: this.name,
        start_seconds: 0,
        end_seconds: this.duration,
        assets: { image_file_path: this.image, audio_file_path: this.audio },
        style: { generation_mode: "realistic" },
      },
    });
  },
};

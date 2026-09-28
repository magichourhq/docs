import { apiKey, name, duration, create } from "./common.mjs";

export default {
  key: "magic_hour-lip-sync",
  name: "Magic Hour — Lip Sync",
  description:
    "Create a video project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: {
    apiKey,
    name,
    duration,
    video: { type: "string", label: "Video URL or File Path" },
    audio: {
      type: "string",
      label: "Audio URL or File Path",
      description: "Use video and audio you have permission to use.",
    },
  },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "lip-sync",
      projectType: "video",
      data: {
        name: this.name,
        start_seconds: 0,
        end_seconds: this.duration,
        assets: { video_source: "file", video_file_path: this.video, audio_file_path: this.audio },
        style: { generation_mode: "lite" },
      },
    });
  },
};

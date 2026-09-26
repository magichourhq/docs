import { apiKey, name, prompt, image, duration, model, create } from "./common.mjs";

export default {
  key: "magic_hour-animate-image",
  name: "Magic Hour — Animate Image",
  description:
    "Create a video project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: { apiKey, name, prompt, image, duration, model },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "image-to-video",
      projectType: "video",
      data: {
        name: this.name,
        model: this.model,
        end_seconds: this.duration,
        assets: { image_file_path: this.image },
        style: { prompt: this.prompt },
      },
    });
  },
};

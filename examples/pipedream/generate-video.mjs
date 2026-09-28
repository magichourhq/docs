import { apiKey, name, prompt, duration, model, create } from "./common.mjs";

export default {
  key: "magic_hour-generate-video",
  name: "Magic Hour — Generate Video",
  description:
    "Create a video project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: { apiKey, name, prompt, duration, model },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "text-to-video",
      projectType: "video",
      data: {
        name: this.name,
        model: this.model,
        end_seconds: this.duration,
        style: { prompt: this.prompt },
      },
    });
  },
};

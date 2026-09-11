import { apiKey, name, prompt, model, create } from "./common.mjs";

export default {
  key: "magic_hour-generate-image",
  name: "Magic Hour — Generate Image",
  description:
    "Create an image project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: {
    apiKey,
    name,
    prompt,
    model,
    resolution: {
      type: "string",
      label: "Resolution",
      optional: true,
      options: ["640px", "1k", "2k", "4k"],
    },
    aspectRatio: {
      type: "string",
      label: "Aspect Ratio",
      default: "1:1",
      options: ["1:1", "16:9", "9:16"],
    },
  },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "ai-image-generator",
      projectType: "image",
      data: {
        name: this.name,
        image_count: 1,
        model: this.model,
        resolution: this.resolution,
        aspect_ratio: this.aspectRatio,
        style: { prompt: this.prompt },
      },
    });
  },
};

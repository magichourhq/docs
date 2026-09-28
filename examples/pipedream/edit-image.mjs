import { apiKey, name, prompt, image, model, create } from "./common.mjs";

export default {
  key: "magic_hour-edit-image",
  name: "Magic Hour — Edit Image",
  description:
    "Create an image project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: { apiKey, name, prompt, image, model },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "ai-image-editor",
      projectType: "image",
      data: {
        name: this.name,
        model: this.model,
        image_count: 1,
        style: { prompt: this.prompt },
        assets: { image_file_paths: [this.image] },
      },
    });
  },
};

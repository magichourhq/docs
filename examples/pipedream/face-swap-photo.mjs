import { apiKey, name, create } from "./common.mjs";

export default {
  key: "magic_hour-face-swap-photo",
  name: "Magic Hour — Face Swap Photo",
  description:
    "Create an image project. Follow with Wait for Result. [API reference](https://docs.magichour.ai/api-reference)",
  version: "0.0.1",
  type: "action",
  annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false },
  props: {
    apiKey,
    name,
    sourceFace: {
      type: "string",
      label: "Source Face URL or File Path",
      description: "Use a face you have permission to use.",
    },
    targetImage: { type: "string", label: "Target Image URL or File Path" },
  },
  async run({ $ }) {
    return create({
      $,
      key: this.apiKey,
      operation: "face-swap-photo",
      projectType: "image",
      data: {
        name: this.name,
        assets: {
          face_swap_mode: "all-faces",
          source_file_path: this.sourceFace,
          target_file_path: this.targetImage,
        },
      },
    });
  },
};

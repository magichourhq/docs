import sandbox from "add-on-sdk-document-sandbox";
import { editor, CreateRenditionFormat } from "express-document-sdk";
import type { SelectionSandbox } from "./host";
// This entrypoint is bundled only in the explicitly experimental development build.
sandbox.instance.runtime.exposeApi<SelectionSandbox>({
  async captureSelection() {
    const selection = editor.context.selection;
    if (selection.length !== 1) throw new Error("Select exactly one visual element.");
    const result = await selection[0].createRendition({
      format: CreateRenditionFormat.png,
      scale: 1,
    });
    if (!result.blob) throw new Error("Could not export the selected element.");
    return result.blob;
  },
});

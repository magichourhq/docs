import type sdk from "@adobe/ccweb-add-on-sdk-types/iframe-ui";
import type { EditorHost } from "../../shared/video";
export type SelectionSandbox = { captureSelection(): Promise<Blob> };
export function adobeHost(api: typeof sdk, selection?: SelectionSandbox): EditorHost {
  const key = "magic-hour-video-project-v1";
  return {
    name: "Adobe Express",
    selectionLabel: selection ? "Use selected element (development)" : "Use current page",
    store: {
      load: async () => {
        const value = await api.instance.clientStorage.getItem(key);
        return typeof value === "string" ? value : null;
      },
      save: async (id) => {
        if (id) await api.instance.clientStorage.setItem(key, id);
        else await api.instance.clientStorage.removeItem(key);
      },
    },
    async captureImage() {
      if (!(await api.app.document.exportAllowed()))
        throw new Error(
          "This design is not approved for export. Choose your own image file instead."
        );
      if (selection)
        return {
          blob: await selection.captureSelection(),
          label: "Selected Adobe Express element",
        };
      const renditions = await api.app.document.createRenditions(
        { range: api.constants.Range.currentPage, format: api.constants.RenditionFormat.png },
        api.constants.RenditionIntent.export
      );
      if (renditions.length !== 1 || !renditions[0].blob)
        throw new Error("Could not export the current Adobe Express page.");
      return { blob: renditions[0].blob, label: "Current Adobe Express page" };
    },
    async insertVideo(result) {
      await api.app.document.addVideo(result.blob, {
        title: "Magic Hour video",
        author: "Magic Hour",
      });
    },
  };
}

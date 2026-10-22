import type * as Asset from "@canva/asset";
import type * as Design from "@canva/design";
import type * as Platform from "@canva/platform";
import type { EditorHost } from "../../shared/video";
import { videoPoster } from "../../shared/media";
export type CanvaPort = {
  asset: Pick<typeof Asset, "upload" | "getTemporaryUrl">;
  design: Pick<typeof Design, "addElementAtPoint" | "addElementAtCursor" | "selection">;
  features: typeof Platform.features;
};
export function canvaHost(
  api: CanvaPort,
  store: EditorHost["store"],
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  poster = videoPoster
): { host: EditorHost; dispose: () => void } {
  let selected: Design.SelectionEvent<"image"> | undefined;
  const unsubscribe = api.features.isSupported(api.design.selection.registerOnChange)
    ? api.design.selection.registerOnChange({
        scope: "image",
        onChange: (event) => {
          selected = event;
        },
      })
    : () => {};
  const uploaded = new Map<string, Asset.VideoRef>();
  const host: EditorHost = {
    name: "Canva",
    selectionLabel: "Use selected image",
    store,
    async prepareGeneration() {
      if (
        !api.features.isSupported(api.design.addElementAtPoint) &&
        !api.features.isSupported(api.design.addElementAtCursor)
      )
        throw new Error(
          "Open a Canva editing context that supports video insertion before generating."
        );
    },
    async captureImage() {
      if (!selected || selected.count !== 1)
        throw new Error("Select one image in Canva, or upload an image file.");
      const draft = await selected.read();
      if (draft.contents.length !== 1) throw new Error("Select exactly one image in Canva.");
      const { url } = await api.asset.getTemporaryUrl({
        type: "image",
        ref: draft.contents[0].ref,
      });
      // Canva returns the full underlying image, including areas outside its crop.
      const response = await fetcher(url, { credentials: "omit" });
      if (!response.ok) throw new Error("Could not read the selected Canva image.");
      return { blob: await response.blob(), label: "Selected Canva image (full original)" };
    },
    async insertVideo(result) {
      const add = api.features.isSupported(api.design.addElementAtPoint)
        ? api.design.addElementAtPoint
        : api.features.isSupported(api.design.addElementAtCursor)
          ? api.design.addElementAtCursor
          : null;
      if (!add) throw new Error("This Canva editing context does not support video insertion.");
      let ref = uploaded.get(result.id);
      if (!ref) {
        const asset = await api.asset.upload({
          type: "video",
          mimeType: "video/mp4",
          url: result.url,
          name: "Magic Hour video",
          thumbnailImageUrl: await poster(result.blob),
          aiDisclosure: "app_generated",
        });
        // Cache successful ingestion so explicit insertion retries reuse the native asset.
        await asset.whenUploaded();
        ref = asset.ref;
        uploaded.set(result.id, ref);
      }
      await add({
        type: "video",
        ref,
        altText: { text: "Video generated with Magic Hour", decorative: false },
      });
    },
  };
  return { host, dispose: unsubscribe };
}

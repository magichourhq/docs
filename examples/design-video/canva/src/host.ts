import { englishMessage, type MessageFormatter } from "../../../vercel-ai-sdk/src/client";
import type * as Asset from "@canva/asset";
import type * as Design from "@canva/design";
import type * as Platform from "@canva/platform";
import { EditorInsertionError, type EditorHost } from "../../shared/video";
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
  poster = (blob: Blob) => videoPoster(blob, formatMessage),
  formatMessage: MessageFormatter = englishMessage
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
    selectionLabel: formatMessage({
      defaultMessage: "Use selected image",
      description: "Label or error for reading a Canva image or inserting a generated video.",
    }),
    store,
    async prepareGeneration() {
      if (
        !api.features.isSupported(api.design.addElementAtPoint) &&
        !api.features.isSupported(api.design.addElementAtCursor)
      )
        throw new Error(
          formatMessage({
            defaultMessage:
              "Open a Canva editing context that supports video insertion before generating.",
            description: "Label or error for reading a Canva image or inserting a generated video.",
          })
        );
    },
    async captureImage() {
      if (!selected || selected.count !== 1)
        throw new Error(
          formatMessage({
            defaultMessage: "Select one image in Canva, or upload an image file.",
            description: "Label or error for reading a Canva image or inserting a generated video.",
          })
        );
      const draft = await selected.read();
      if (draft.contents.length !== 1)
        throw new Error(
          formatMessage({
            defaultMessage: "Select exactly one image in Canva.",
            description: "Label or error for reading a Canva image or inserting a generated video.",
          })
        );
      const { url } = await api.asset.getTemporaryUrl({
        type: "image",
        ref: draft.contents[0].ref,
      });
      // Canva returns the full underlying image, including areas outside its crop.
      const response = await fetcher(url, { credentials: "omit" });
      if (!response.ok)
        throw new Error(
          formatMessage({
            defaultMessage: "Could not read the selected Canva image.",
            description: "Label or error for reading a Canva image or inserting a generated video.",
          })
        );
      return {
        blob: await response.blob(),
        label: formatMessage({
          defaultMessage: "Selected Canva image (full original)",
          description: "Label or error for reading a Canva image or inserting a generated video.",
        }),
      };
    },
    async insertVideo(result) {
      let thumbnailImageUrl: string | undefined;
      try {
        const add = api.features.isSupported(api.design.addElementAtPoint)
          ? api.design.addElementAtPoint
          : api.features.isSupported(api.design.addElementAtCursor)
            ? api.design.addElementAtCursor
            : null;
        if (!add)
          throw new Error(
            formatMessage({
              defaultMessage: "This Canva editing context does not support video insertion.",
              description:
                "Label or error for reading a Canva image or inserting a generated video.",
            })
          );
        let ref = uploaded.get(result.id);
        if (!ref) {
          thumbnailImageUrl = await poster(result.blob);
          const asset = await api.asset.upload({
            type: "video",
            mimeType: "video/mp4",
            url: result.url,
            name: formatMessage({
              defaultMessage: "Magic Hour video",
              description:
                "Label or error for reading a Canva image or inserting a generated video.",
            }),
            thumbnailImageUrl,
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
          altText: {
            text: formatMessage({
              defaultMessage: "Video generated with Magic Hour",
              description:
                "Label or error for reading a Canva image or inserting a generated video.",
            }),
            decorative: false,
          },
        });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (
          typeof code === "string" &&
          [
            "bad_external_service_response",
            "bad_request",
            "failed_precondition",
            "internal_error",
            "not_found",
            "not_allowed",
            "permission_denied",
            "missing_permission",
            "quota_exceeded",
            "rate_limited",
            "timeout",
            "unsupported_surface",
            "unsupported_page_type",
            "user_offline",
          ].includes(code)
        ) {
          let detail: string | undefined;
          if (code === "bad_request" && error instanceof Error) {
            detail = error.message.replaceAll(result.url, "[video URL]");
            if (thumbnailImageUrl) detail = detail.replaceAll(thumbnailImageUrl, "[video preview]");
            detail = detail
              .replace(/(?:https?:\/\/|data:)[^\s"'<>)]*/gi, "[media URL]")
              .slice(0, 300);
          }
          throw new EditorInsertionError(code, detail);
        }
        throw error;
      }
    },
  };
  return { host, dispose: unsubscribe };
}

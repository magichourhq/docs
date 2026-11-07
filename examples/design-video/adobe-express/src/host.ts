import type sdk from "@adobe/ccweb-add-on-sdk-types/iframe-ui";
import type { EditorHost } from "../../shared/video";
export type SelectionSandbox = { captureSelection(): Promise<Blob> };
export function adobeHost(api: typeof sdk, selection?: SelectionSandbox): EditorHost {
  const key = "magic-hour-video-project-v1";
  const explainPremiumContent = async (): Promise<never> => {
    const { buttonType } = await api.app
      .showModalDialog({
        variant: api.constants.Variant.error,
        title: "Adobe Express Premium content",
        description:
          "This page contains Adobe Express Premium assets. Replace them or upgrade Adobe Express to use this page.",
        buttonLabels: { primary: "Close", secondary: "Upgrade" },
      })
      .catch(() => {
        throw new Error(
          "Replace Adobe Express Premium assets or upgrade Adobe Express to use this page."
        );
      });
    if (buttonType === api.constants.ButtonType.secondary) {
      const upgraded = await api.app.startPremiumUpgradeIfFreeUser().catch(() => {
        throw new Error(
          "Could not open the Adobe Express upgrade. Replace Premium assets or upgrade in Adobe Express before trying again."
        );
      });
      if (upgraded)
        throw new Error("Adobe Express is upgraded. Choose Use current page to continue.");
    }
    throw new Error(
      "Replace Adobe Express Premium assets or upgrade Adobe Express to use this page."
    );
  };
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
      if (
        !(await api.app.document.exportAllowed().catch(() => {
          throw new Error(
            "Could not check this design's export permission. Try again or upload your own image."
          );
        }))
      )
        throw new Error(
          "This design is not approved for export. Choose your own image file instead."
        );
      if (selection)
        return {
          blob: await selection.captureSelection(),
          label: "Selected Adobe Express element",
        };
      const pages = await api.app.document
        .getPagesMetadata({
          range: api.constants.Range.currentPage,
        })
        .catch(() => {
          throw new Error(
            "Could not check the current Adobe Express page. Try again or upload your own image."
          );
        });
      if (pages.length !== 1) throw new Error("Could not check the current Adobe Express page.");
      if (
        pages[0].hasPremiumContent &&
        !(await api.app.currentUser.isPremiumUser().catch(() => {
          throw new Error(
            "Could not check your Adobe Express Premium access. Try again or upload your own image."
          );
        }))
      )
        await explainPremiumContent();
      const renditions = await api.app.document
        .createRenditions(
          { range: api.constants.Range.currentPage, format: api.constants.RenditionFormat.png },
          api.constants.RenditionIntent.export
        )
        .catch(async (error: unknown) => {
          const message =
            typeof error === "string"
              ? error
              : error &&
                  typeof error === "object" &&
                  "message" in error &&
                  typeof error.message === "string"
                ? error.message
                : "";
          if (message.includes("USER_NOT_ENTITLED_TO_PREMIUM_CONTENT"))
            return explainPremiumContent();
          throw new Error(
            "Could not export the current Adobe Express page. Try again or upload your own image."
          );
        });
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

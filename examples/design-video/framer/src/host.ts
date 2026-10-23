import type { framer as sdk } from "@framer/plugin";
import type { EditorHost } from "../../shared/video";
import { videoMetadata } from "../../shared/media";
type FramerPort = Pick<
  typeof sdk,
  "getImage" | "getPluginData" | "setPluginData" | "uploadFile" | "addComponentInstance"
> &
  Partial<Pick<typeof sdk, "isAllowedTo" | "getCurrentUser" | "getProjectInfo">>;
export function framerHost(api: FramerPort, metadata = videoMetadata): EditorHost {
  const uploaded = new Map<string, Awaited<ReturnType<FramerPort["uploadFile"]>>>();
  const recoveryKey = async () => {
    const [user, project] = await Promise.all([api.getCurrentUser?.(), api.getProjectInfo?.()]);
    if (!user?.id || !project?.id) throw new Error("Framer recovery identity is unavailable.");
    return `magic-hour-video-project-v2:${user.id}:${project.id}`;
  };
  return {
    name: "Framer",
    selectionLabel: "Use selected image",
    async prepareGeneration() {
      if (api.isAllowedTo && !api.isAllowedTo("addComponentInstance"))
        throw new Error("Enable editing in Framer before generating a video.");
    },
    store: {
      async load() {
        if (api.isAllowedTo?.("setPluginData"))
          await api.setPluginData("magic-hour-video-project-v1", null);
        return sessionStorage.getItem(await recoveryKey());
      },
      async save(id) {
        const key = await recoveryKey();
        if (id === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, id);
      },
    },
    async captureImage() {
      const image = await api.getImage();
      if (!image) throw new Error("Select one image in Framer first.");
      const data = await image.getData();
      return {
        blob: new Blob([data.bytes as BlobPart], { type: data.mimeType }),
        label: "Selected Framer image",
      };
    },
    async insertVideo(result) {
      const dimensions = await metadata(result.blob);
      let file = uploaded.get(result.id);
      if (!file) {
        file = await api.uploadFile({
          file: new File([result.blob], `magic-hour-${result.id}.mp4`, { type: "video/mp4" }),
          name: "Magic Hour video",
        });
        uploaded.set(result.id, file);
      }
      await api.addComponentInstance({
        url: "https://framer.com/m/framer/Video.js#Video",
        attributes: {
          width: "640px",
          height: `${Math.round((640 * dimensions.height) / dimensions.width)}px`,
          controls: {
            srcType: "Upload",
            srcFile: file,
            playing: true,
            loop: true,
            muted: true,
            controls: false,
          },
        },
      });
    },
  };
}

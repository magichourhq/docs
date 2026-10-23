import { englishMessage, type MessageFormatter } from "../../vercel-ai-sdk/src/client";
export async function videoMetadata(
  blob: Blob,
  formatMessage: MessageFormatter = englishMessage
): Promise<{ poster: string; width: number; height: number }> {
  const url = URL.createObjectURL(blob),
    video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              formatMessage({
                defaultMessage: "Video preview timed out. Resume and try again.",
                description: "Error when preparing a preview thumbnail from the generated video.",
              })
            )
          ),
        15000
      );
      const done = () => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
      };
      video.onloadeddata = () => {
        done();
        resolve();
      };
      video.onerror = () => {
        done();
        reject(
          new Error(
            formatMessage({
              defaultMessage: "Could not decode the MP4 preview.",
              description: "Error when preparing a preview thumbnail from the generated video.",
            })
          )
        );
      };
      video.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
    if (!canvas.width || !canvas.height)
      throw new Error(
        formatMessage({
          defaultMessage: "Video dimensions are missing.",
          description: "Error when preparing a preview thumbnail from the generated video.",
        })
      );
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      poster: canvas.toDataURL("image/jpeg", 0.85),
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
export async function videoPoster(
  blob: Blob,
  formatMessage: MessageFormatter = englishMessage
): Promise<string> {
  return (await videoMetadata(blob, formatMessage)).poster;
}

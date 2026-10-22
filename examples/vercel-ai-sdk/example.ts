import { writeFile } from "node:fs/promises";
import { generateImage, experimental_generateVideo as generateVideo } from "ai";
import { createMagicHour } from "./src/index.js";
const magichour = createMagicHour({
  onProjectCreated: ({ id, kind }) => console.log(`Accepted ${kind} project: ${id}`),
});
const { image } = await generateImage({
  model: magichour.image("flux-2-klein"),
  prompt: "A blue ceramic mug on a plain warm gray studio background",
  aspectRatio: "1:1",
  maxRetries: 0,
  providerOptions: { magichour: { resolution: "640px" } },
});
await writeFile("magic-hour-image.png", image.uint8Array);
if (process.argv.includes("--video")) {
  const { video } = await generateVideo({
    model: magichour.video("ltx-2.5"),
    prompt: { image: image.uint8Array, text: "A slow camera push toward the mug" },
    duration: 1,
    maxRetries: 0,
    providerOptions: { magichour: { resolution: "480p" } },
  });
  await writeFile("magic-hour-video.mp4", video.uint8Array);
}

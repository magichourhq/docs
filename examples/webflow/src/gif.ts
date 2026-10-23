import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrame, parseGIF, type ParsedFrame } from "gifuct-js";

export async function fitGif(bytes: Uint8Array, signal: AbortSignal) {
  if (bytes.length <= 4_000_000) return bytes;
  const gif = parseGIF(bytes.slice().buffer);
  const frames = gif.frames.filter((frame) => "image" in frame);
  const { width, height } = gif.lsd;
  if (!frames.length || width * height * frames.length > 32_000_000)
    throw new Error("This GIF is too large to resize locally. The original remains in Magic Hour.");
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d")!;
  const patch = document.createElement("canvas");
  const patchContext = patch.getContext("2d")!;
  const scaled = document.createElement("canvas");
  const scaledContext = scaled.getContext("2d")!;
  const application = gif.frames.find(
    (frame) =>
      "application" in frame && ["NETSCAPE2.0", "ANIMEXTS1.0"].includes(frame.application.id)
  );
  const loop = application && "application" in application ? application.application.blocks : [];
  const repeat = loop[0] === 1 ? loop[1] | (loop[2] << 8) : -1;
  function clear(frame?: ParsedFrame) {
    const dims = frame?.dims ?? { left: 0, top: 0, width, height };
    context.clearRect(dims.left, dims.top, dims.width, dims.height);
    const transparent = frame
      ? frame.transparentIndex !== undefined
      : frames[0].gce?.extras.transparentColorGiven;
    const background = gif.gct?.[gif.lsd.backgroundColorIndex];
    if (!transparent && background) {
      context.fillStyle = `rgb(${background.join(",")})`;
      context.fillRect(dims.left, dims.top, dims.width, dims.height);
    }
  }
  for (const maxSide of [512, 384, 256]) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    scaled.width = Math.max(1, Math.round(width * scale));
    scaled.height = Math.max(1, Math.round(height * scale));
    const encoder = GIFEncoder();
    let previous: ParsedFrame | undefined;
    let restore: ImageData | undefined;
    clear();
    for (const raw of frames) {
      signal.throwIfAborted();
      if (previous?.disposalType === 2) clear(previous);
      if (previous?.disposalType === 3 && restore) context.putImageData(restore, 0, 0);
      const frame = decompressFrame(raw, gif.gct, true);
      restore = frame.disposalType === 3 ? context.getImageData(0, 0, width, height) : undefined;
      patch.width = frame.dims.width;
      patch.height = frame.dims.height;
      patchContext.putImageData(
        new ImageData(frame.patch.slice(), patch.width, patch.height),
        0,
        0
      );
      context.drawImage(patch, frame.dims.left, frame.dims.top);
      scaledContext.clearRect(0, 0, scaled.width, scaled.height);
      scaledContext.drawImage(source, 0, 0, scaled.width, scaled.height);
      const rgba = scaledContext.getImageData(0, 0, scaled.width, scaled.height).data;
      const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: true });
      const transparentIndex = palette.findIndex((color) => color[3] === 0);
      encoder.writeFrame(applyPalette(rgba, palette, "rgba4444"), scaled.width, scaled.height, {
        palette,
        delay: frame.delay,
        repeat,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(0, transparentIndex),
        dispose: 2,
      });
      previous = frame;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    encoder.finish();
    const output = encoder.bytes();
    if (output.length <= 4_000_000) return output;
  }
  throw new Error(
    "This GIF still exceeds Webflow’s 4 MB limit. The original remains in Magic Hour."
  );
}

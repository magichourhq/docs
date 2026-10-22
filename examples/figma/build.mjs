import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/code.ts"],
  outfile: "dist/code.js",
  bundle: true,
  target: "es2017",
  format: "iife",
});
const ui = await build({
  entryPoints: ["src/ui.ts"],
  bundle: true,
  write: false,
  target: "es2022",
  format: "iife",
});
const html = await readFile("src/ui.html", "utf8");
await writeFile(
  "dist/ui.html",
  html.replace(
    "<!-- APP_SCRIPT -->",
    `<script>${ui.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`
  )
);

if (process.argv.includes("--release")) {
  const id = process.env.FIGMA_PLUGIN_ID;
  if (!id || !/^\d+$/.test(id)) {
    throw new Error("Set FIGMA_PLUGIN_ID to the publisher-owned ID assigned by Figma Desktop.");
  }
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  await mkdir("release", { recursive: true });
  await writeFile(
    "release/manifest.json",
    JSON.stringify({ ...manifest, id, main: "code.js", ui: "ui.html" }, null, 2) + "\n"
  );
  await writeFile("release/code.js", await readFile("dist/code.js"));
  await writeFile("release/ui.html", await readFile("dist/ui.html"));
  console.log("Publisher-owned Figma bundle prepared in release/.");
}

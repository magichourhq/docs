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

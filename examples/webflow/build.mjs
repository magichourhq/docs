import { build } from "esbuild";
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(dirname(fileURLToPath(import.meta.url)));
const review = resolve(process.env.WEBFLOW_REVIEW_DIR ?? "review");
await rm("public", { recursive: true, force: true });
await mkdir("public", { recursive: true });
await mkdir(review, { recursive: true });
const built = await build({
  entryPoints: ["src/index.ts", "src/style.css"],
  outdir: "public",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: "external",
  sourcesContent: true,
  write: false,
});
for (const file of built.outputFiles) {
  const name = basename(file.path);
  await writeFile(resolve(name.endsWith(".map") ? review : "public", name), file.contents);
}
await copyFile("src/index.html", "public/index.html");
for (const file of ["package.json", "package-lock.json", "webflow.json"])
  await copyFile(file, resolve(review, file));
await writeFile(
  resolve(review, "README.md"),
  "Private review files for the exact generated public/index.js and public/style.css. Source content is embedded in their external source maps. The production bundle excludes all source maps. Build with npm ci, then npm run build using Node 22.13 or later.\n"
);
console.log("Production assets: public/. Private source maps and manifests: " + review);

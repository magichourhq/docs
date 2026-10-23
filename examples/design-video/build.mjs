import { build } from "esbuild";
import { transform } from "@formatjs/unplugin/transform";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
process.chdir(dirname(fileURLToPath(import.meta.url)));
const html = (title) =>
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script type="module" src="app.js"></script></body></html>`;
const options = {
  bundle: true,
  target: "es2022",
  format: "esm",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
};
for (const platform of ["adobe-express", "canva"]) {
  await rm(`${platform}/dist`, { recursive: true, force: true });
  await mkdir(`${platform}/dist`, { recursive: true });
  await build({
    ...options,
    entryPoints: [`${platform}/src/main.${platform === "canva" ? "tsx" : "ts"}`],
    outfile: `${platform}/dist/app.js`,
    format: platform === "canva" ? "iife" : "esm",
    plugins:
      platform === "canva"
        ? [
            {
              name: "formatjs",
              setup(build) {
                build.onLoad({ filter: /\.tsx?$/, namespace: "file" }, async ({ path }) => {
                  if (path.includes("/node_modules/")) return;
                  const result = transform(await readFile(path, "utf8"), path, {
                    idInterpolationPattern: "[sha512:contenthash:base64:6]",
                  });
                  if (result)
                    return {
                      contents: result.code,
                      loader: path.endsWith(".tsx") ? "tsx" : "ts",
                      resolveDir: dirname(path),
                    };
                });
              },
            },
          ]
        : [],
    define: { ADOBE_SELECTION_DEVELOPMENT: "false", "process.env.NODE_ENV": '"production"' },
    external: ["https://express.adobe.com/static/add-on-sdk/sdk.js"],
    jsx: "automatic",
  });
  await writeFile(`${platform}/dist/index.html`, html(`Magic Hour for ${platform}`));
  if (platform === "canva") {
    execFileSync(
      process.execPath,
      [
        "node_modules/@formatjs/cli/bin/formatjs",
        "extract",
        "canva/src/**/*.{ts,tsx}",
        "shared/{video,media}.ts",
        "../vercel-ai-sdk/src/client.ts",
        "--out-file",
        "canva/dist/messages_en.json",
        "--id-interpolation-pattern",
        "[sha512:contenthash:base64:6]",
      ],
      { stdio: "inherit" }
    );
    // The Canva Developer Portal accepts one JS bundle. Inline its generated UI Kit CSS.
    const css = await readFile(`${platform}/dist/app.css`, "utf8");
    const js = await readFile(`${platform}/dist/app.js`, "utf8");
    await writeFile(
      `${platform}/dist/app.js`,
      `(()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n${js}`
    );
  }
}
const { build: viteBuild } = await import("vite");
await viteBuild({ configFile: resolve("framer/vite.config.ts") });
const framer = JSON.parse(await readFile("framer/framer.json", "utf8"));
if (process.env.FRAMER_PLUGIN_ID) framer.id = process.env.FRAMER_PLUGIN_ID;
if (process.argv.includes("--release") && !process.env.FRAMER_PLUGIN_ID)
  throw new Error(
    "Set FRAMER_PLUGIN_ID from the authorized publisher's Framer project before preparing a release."
  );
await writeFile("framer/dist/framer.json", JSON.stringify(framer, null, 2) + "\n");
await copyFile("framer/icon.svg", "framer/dist/icon.svg");
const adobe = JSON.parse(await readFile("adobe-express/manifest.json", "utf8"));
await writeFile("adobe-express/dist/manifest.json", JSON.stringify(adobe, null, 2) + "\n");
// An isolated development bundle supports Adobe's experimental selected-element export.
await rm("adobe-express/selection-dist", { recursive: true, force: true });
await mkdir("adobe-express/selection-dist", { recursive: true });
await build({
  ...options,
  entryPoints: ["adobe-express/src/main.ts"],
  outfile: "adobe-express/selection-dist/app.js",
  define: { ADOBE_SELECTION_DEVELOPMENT: "true" },
  external: ["https://express.adobe.com/static/add-on-sdk/sdk.js"],
});
await build({
  ...options,
  entryPoints: ["adobe-express/src/sandbox.ts"],
  outfile: "adobe-express/selection-dist/code.js",
  external: ["add-on-sdk-document-sandbox", "express-document-sdk"],
});
await writeFile(
  "adobe-express/selection-dist/index.html",
  html("Magic Hour — selection development")
);
await writeFile(
  "adobe-express/selection-dist/manifest.json",
  JSON.stringify(
    {
      ...adobe,
      testId: `${adobe.testId}-selection-dev`,
      requirements: { ...adobe.requirements, experimentalApis: true },
      entryPoints: adobe.entryPoints.map((p) => ({ ...p, documentSandbox: "code.js" })),
    },
    null,
    2
  ) + "\n"
);
console.log("Built Framer, Canva, Adobe stable, and Adobe selection-development bundles.");

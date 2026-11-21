import { transform } from "@formatjs/unplugin/transform";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const idInterpolationPattern = "[sha512:contenthash:base64:6]";
execFileSync(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("@formatjs/cli/bin/formatjs")),
    "extract",
    "src/index.ts",
    "--out-file",
    "dist/messages_en.json",
    "--id-interpolation-pattern",
    idInterpolationPattern,
  ],
  { stdio: "inherit" }
);

const compiled = await readFile("dist/index.js", "utf8");
const result = transform(compiled, "dist/index.js", { idInterpolationPattern });
if (!result) throw new Error("Failed to assign translation IDs to the browser client");
await writeFile("dist/index.js", result.code);

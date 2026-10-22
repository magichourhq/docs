import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const platform = process.argv[2] ?? "framer";
if (!["framer", "adobe-express", "canva"].includes(platform))
  throw Error("Choose framer, adobe-express, or canva.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), platform, "dist");
const handler = async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const path = resolve(root, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
    if (!path.startsWith(root + sep)) throw Error("Invalid path");
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
        }[extname(path)] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
};
const server =
  process.env.LOCAL_TLS_KEY && process.env.LOCAL_TLS_CERT
    ? https.createServer(
        {
          key: await readFile(process.env.LOCAL_TLS_KEY),
          cert: await readFile(process.env.LOCAL_TLS_CERT),
        },
        handler
      )
    : http.createServer(handler);
const port = Number(process.env.PORT ?? 5173);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `${platform} development bundle at ${server instanceof https.Server ? "https" : "http"}://localhost:${port}`
  )
);

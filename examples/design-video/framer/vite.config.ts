import { defineConfig } from "vite";
import framer from "vite-plugin-framer";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: "public",
  plugins: [framer()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    ...(process.env.LOCAL_TLS_KEY && process.env.LOCAL_TLS_CERT
      ? {
          https: {
            key: readFileSync(process.env.LOCAL_TLS_KEY),
            cert: readFileSync(process.env.LOCAL_TLS_CERT),
          },
        }
      : {}),
  },
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});

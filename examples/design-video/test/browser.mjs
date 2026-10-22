import { build } from "esbuild";
import { chromium } from "playwright";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const live = process.argv.includes("--live");
const key = live
  ? (await readFile(process.env.MAGIC_HOUR_TEST_KEY_FILE, "utf8")).trim()
  : "controlled-key";
const output = resolve(process.env.MAGIC_HOUR_TEST_OUTPUT ?? "artifacts/browser");
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ["test/harness.tsx"],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  outfile: "harness.js",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = bundle.outputFiles.find((f) => f.path.endsWith(".js")).text,
  css = bundle.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
const source = await readFile("test/fixtures/source.png"),
  video = await readFile("test/fixtures/video.mp4");
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Magic Hour editor UI validation</title><style>${css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = url.pathname === "/source.png" ? source : url.pathname === "/harness.js" ? js : html;
  res.setHeader(
    "Content-Type",
    url.pathname === "/source.png"
      ? "image/png"
      : url.pathname === "/harness.js"
        ? "text/javascript"
        : "text/html"
  );
  res.end(file);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
const receipts = [];
const saved = process.env.MAGIC_HOUR_RESUME_RECEIPTS
  ? JSON.parse(await readFile(process.env.MAGIC_HOUR_RESUME_RECEIPTS, "utf8"))
  : [];
const platforms =
  process.env.MAGIC_HOUR_TEST_PLATFORMS?.split(",") ??
  (live ? ["framer", "adobe", "canva"] : ["framer", "adobe", "adobe-selection", "canva"]);
try {
  for (const platform of platforms) {
    const context = await browser.newContext({ viewport: { width: 400, height: 1000 } }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let posts = 0,
      creditError = false,
      pending = false,
      acceptedId = "";
    if (!live) {
      await page.route("https://api.magichour.ai/**", async (route) => {
        const request = route.request(),
          url = request.url();
        assert.equal(request.headers().authorization, `Bearer ${key}`);
        if (url.endsWith("upload-urls"))
          return route.fulfill({
            json: {
              items: [
                { upload_url: "https://storage.example/upload", file_path: "api-assets/test.png" },
              ],
            },
          });
        if (request.method() === "POST") {
          posts++;
          if (creditError) return route.fulfill({ status: 402, body: "No credits" });
          return route.fulfill({ json: { id: "controlled-video-project" } });
        }
        return route.fulfill({
          json: {
            id: "controlled-video-project",
            status: pending ? "rendering" : "complete",
            credits_charged: 24,
            downloads: [
              { url: "https://storage.example/output.mp4", expires_at: "2030-01-01T00:00:00Z" },
            ],
          },
        });
      });
      await page.route("https://storage.example/**", (route) => {
        assert.equal(route.request().headers().authorization, undefined);
        return route.fulfill({
          status: 200,
          contentType: route.request().method() === "PUT" ? "text/plain" : "video/mp4",
          body: route.request().method() === "PUT" ? "" : video,
        });
      });
    } else {
      page.on("response", async (response) => {
        if (
          response.url().match(/api\.magichour\.ai\/v1\/(image-to-video|text-to-video)$/) &&
          response.request().method() === "POST" &&
          response.ok()
        ) {
          const data = await response.json();
          acceptedId = data.id;
          const existing = receipts.find((r) => r.platform === platform);
          if (!existing)
            receipts.push({ platform, id: acceptedId, accepted: true, completed: false });
          await writeFile(
            resolve(output, "receipts.json"),
            JSON.stringify(receipts, null, 2) + "\n"
          );
        }
      });
    }
    await page.goto(`${base}/?platform=${platform}`);
    await page.getByLabel("Magic Hour API key", { exact: true }).fill(key);
    const prior = saved.find((r) => r.platform === platform)?.id;
    if (prior) {
      if (platform !== "canva")
        await page.getByText("Resume an existing generation", { exact: true }).click();
      await page.getByLabel("Video project ID", { exact: true }).fill(prior);
      await page.getByRole("button", { name: "Resume generation", exact: true }).click();
    } else {
      await page
        .getByRole("button", {
          name:
            platform === "adobe"
              ? "Use current page"
              : platform === "adobe-selection"
                ? "Use selected element (development)"
                : "Use selected image",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Motion or creative brief", { exact: true })
        .fill(
          "A gentle camera push toward the ceramic mug. Keep the mug shape, colors, and background steady."
        );
      if (platform === "canva") {
        await page.getByText("5 seconds", { exact: true }).click();
        await page.getByText("1 second", { exact: true }).click();
      } else await page.locator("#duration").selectOption("1");
      await page.getByRole("button", { name: "Generate video", exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Add video to design", exact: true })
      .waitFor({ state: "visible", timeout: live ? 650000 : 30000 });
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return v?.readyState >= 2 && v.videoWidth > 0;
      },
      {},
      { timeout: 30000 }
    );
    await page.getByRole("button", { name: "Add video to design", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Video added to your design." })
      .waitFor({ timeout: live ? 90000 : 30000 });
    const events = await page.evaluate(() => window.__host.events);
    assert(
      events.some((e) =>
        e.event.includes(
          platform === "canva"
            ? "canva.addElement"
            : platform.startsWith("adobe")
              ? "adobe.addVideo"
              : "framer.addComponentInstance"
        )
      )
    );
    if (platform === "canva")
      assert(
        events.some(
          (e) =>
            e.event === "canva.upload" && e.aiDisclosure === "app_generated" && e.thumbnailIsDataURL
        )
      );
    const id = await page.getByLabel("Video project ID", { exact: true }).inputValue();
    const dimensions = await page
      .locator("video")
      .evaluate((v) => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }));
    await page.getByLabel("Magic Hour API key", { exact: true }).fill("");
    await page.screenshot({
      path: resolve(output, `${platform}-${live ? "live" : "controlled"}.png`),
      fullPage: true,
    });
    const persistent = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    assert(!persistent.includes(key));
    if (!live) {
      assert.equal(posts, 1);
      await page.reload();
      await page.getByLabel("Magic Hour API key", { exact: true }).fill(key);
      if (platform !== "canva")
        await page.getByText("Resume an existing generation", { exact: true }).click();
      await page.getByRole("button", { name: "Resume generation", exact: true }).click();
      await page.getByRole("button", { name: "Add video to design", exact: true }).waitFor();
      assert.equal(posts, 1);
      await page.getByRole("button", { name: "New generation", exact: true }).click();
      creditError = true;
      await page
        .getByLabel("Motion or creative brief", { exact: true })
        .fill("A calm studio video");
      await page.getByRole("button", { name: "Generate video", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "HTTP 402" }).waitFor();
      assert.equal(posts, 2);
      creditError = false;
      pending = true;
      await page.getByRole("button", { name: "Generate video", exact: true }).click();
      await page.getByRole("button", { name: "Stop waiting", exact: true }).waitFor();
      await page.getByLabel("Video project ID", { exact: true }).waitFor({ state: "attached" });
      await page.waitForFunction(() => localStorage.length > 0);
      await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "controlled-video-project" }).waitFor();
      pending = false;
      await page.getByRole("button", { name: "Resume generation", exact: true }).click();
      await page.getByRole("button", { name: "Add video to design", exact: true }).waitFor();
      assert.equal(posts, 3);
    }
    assert.deepEqual(errors, []);
    const receipt = {
      platform,
      id,
      completed: true,
      liveMagicHour: live,
      hostBridge: "simulated",
      dimensions,
      assertions:
        "preview, explicit native adapter insertion, no stored API key" +
        (live ? "" : ", reopen/resume GET-only, 402, stop/resume"),
    };
    const old = receipts.findIndex((r) => r.platform === platform);
    if (old >= 0) receipts[old] = receipt;
    else receipts.push(receipt);
    await writeFile(resolve(output, "receipts.json"), JSON.stringify(receipts, null, 2) + "\n");
    console.log(
      `${platform}: ${live ? "live Magic Hour" : "controlled HTTP"} UI passed; editor bridge simulated; project ${id}`
    );
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

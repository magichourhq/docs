/** Browser integration harness; Figma's canvas bridge is simulated. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const screenshotsOnly = process.argv.includes("--screenshots");
const live = process.argv.includes("--live") || screenshotsOnly;
const savedReceipts = screenshotsOnly
  ? JSON.parse(await readFile("test-output/live-receipts.json", "utf8"))
  : [];
if (live && !process.env.MAGIC_HOUR_TEST_KEY_FILE)
  throw new Error("Set MAGIC_HOUR_TEST_KEY_FILE for opt-in paid tests.");
const key = live
  ? (await readFile(process.env.MAGIC_HOUR_TEST_KEY_FILE, "utf8")).trim()
  : "test-key";
const png =
  live && process.env.MAGIC_HOUR_TEST_IMAGE_FILE
    ? await readFile(process.env.MAGIC_HOUR_TEST_IMAGE_FILE)
    : Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64"
      );
const ui = await readFile("dist/ui.html");
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    req.url === "/ui.html"
      ? ui
      : '<!doctype html><body style="margin:0;background:#eee"><iframe sandbox="allow-scripts" style="border:0;width:380px;height:850px" src="/ui.html"></iframe></body>'
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 380, height: 850 } });
const calls = [],
  receipts = [],
  failures = [];
let status = "complete",
  failStatus;
if (!live)
  await context.route("https://**/*", async (route) => {
    const req = route.request(),
      url = req.url();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    calls.push({ url, method: req.method(), headers: req.headers(), body: req.postData() });
    if (url.startsWith("https://api.magichour.ai")) {
      assert.equal(req.headers().authorization, "Bearer test-key");
      if (failStatus)
        return route.fulfill({
          status: failStatus,
          headers,
          json: { code: "insufficient_credits" },
        });
      if (url.endsWith("/files/upload-urls"))
        return route.fulfill({
          headers,
          json: {
            items: [
              {
                upload_url: "https://storage.example/input.png",
                file_path: "api-assets/test/source.png",
              },
            ],
          },
        });
      if (req.method() === "POST")
        return route.fulfill({ headers, json: { id: "project-ui", credits_charged: 5 } });
      return route.fulfill({
        headers,
        json: {
          id: "project-ui",
          status,
          credits_charged: 5,
          downloads: status === "complete" ? [{ url: "https://storage.example/output.png" }] : [],
        },
      });
    }
    assert.equal(req.headers().authorization, undefined);
    if (req.method() === "PUT") return route.fulfill({ status: 200, headers });
    return route.fulfill({ headers: { ...headers, "content-type": "image/png" }, body: png });
  });
await mkdir("test-output", { recursive: true });
if (live)
  context.on("response", async (response) => {
    if (!response.url().startsWith("https://api.magichour.ai") || !response.ok()) return;
    try {
      const value = await response.json();
      if (value.id && value.credits_charged !== undefined) {
        receipts.push({
          projectId: value.id,
          creditsCharged: value.credits_charged,
          ...(value.status ? { status: value.status } : {}),
        });
        await writeFile("test-output/live-receipts.json", JSON.stringify(receipts, null, 2));
      }
    } catch {}
  });
const page = await context.newPage();
page.on("pageerror", (error) => failures.push(error.message));
await page.addInitScript(
  ({ image }) => {
    window.bridgeMessages = [];
    window.addEventListener("message", (event) => {
      const message = event.data?.pluginMessage;
      if (!message) return;
      window.bridgeMessages.push(message);
      const send = (pluginMessage) => event.source.postMessage({ pluginMessage }, "*");
      if (message.type === "ready")
        send({ type: "selection", name: "Product photo", canExport: true, id: "original-layer" });
      if (message.type === "export-selection")
        send({
          type: "selection-exported",
          requestId: message.requestId,
          bytes: image,
          targetId: "original-layer",
        });
      if (message.type === "insert-image") send({ type: "inserted" });
    });
  },
  { image: Array.from(png) }
);
await page.goto(`http://127.0.0.1:${server.address().port}/`);
const frame = page.frameLocator("iframe");
async function generate(edit = false) {
  if (edit) await frame.getByRole("tab", { name: "Edit selection" }).click();
  await frame.locator("#api-key").fill(key);
  await frame
    .locator("#prompt")
    .fill(
      edit
        ? "Change the mug to a rich emerald green. Keep the composition and lighting unchanged."
        : "A sculptural blue ceramic mug on a warm gray studio background, soft directional light, no text"
    );
  if (edit) await frame.locator("#replace").check();
  await frame.locator("#run").click();
  await frame.locator("#preview").waitFor({ state: "visible", timeout: live ? 600_000 : 10_000 });
  await frame.locator("#insert").click();
  await frame.getByText("Added to your Figma canvas.", { exact: true }).waitFor();
  await frame.locator("#api-key").fill("");
  await page.locator("iframe").evaluate((el) => (el.style.height = "1300px"));
  await page.setViewportSize({ width: 380, height: 1300 });
  await frame.locator("body").evaluate(() => window.scrollTo(0, 0));
  await frame.locator("main").screenshot({
    path: `test-output/${live ? "live" : "fixture"}-${edit ? "edit" : "generate"}.png`,
  });
  const message = await page.evaluate(() =>
    window.bridgeMessages.filter((m) => m.type === "insert-image").at(-1)
  );
  assert.ok(message.bytes.length);
  if (edit) {
    assert.equal(message.targetId, "original-layer");
    assert.equal(message.replace, true);
  }
}
try {
  if (screenshotsOnly) {
    const ids = [...new Set(savedReceipts.map((r) => r.projectId))];
    for (const [index, id] of ids.entries()) {
      if (index) await frame.locator("#new").click();
      if (index) await frame.getByRole("tab", { name: "Edit selection" }).click();
      await frame
        .locator("#prompt")
        .fill(
          index
            ? "Change the mug to a rich emerald green. Keep the composition and lighting unchanged."
            : "A sculptural blue ceramic mug on a warm gray studio background, soft directional light, no text"
        );
      await frame.locator("#api-key").fill(key);
      await page.evaluate(
        (id) =>
          document
            .querySelector("iframe")
            .contentWindow.postMessage({ pluginMessage: { type: "saved-project", id } }, "*"),
        id
      );
      await frame.locator("#resume").click();
      await frame.locator("#preview").waitFor({ state: "visible", timeout: 60_000 });
      await frame.locator("#api-key").fill("");
      await page.locator("iframe").evaluate((el) => (el.style.height = "1300px"));
      await page.setViewportSize({ width: 380, height: 1300 });
      await frame.locator("body").evaluate(() => window.scrollTo(0, 0));
      await frame
        .locator("main")
        .screenshot({ path: `test-output/live-${index ? "edit" : "generate"}.png` });
    }
    console.log("Screenshots captured from existing live projects without new generations.");
  } else {
    await generate();
    await frame.locator("#new").click();
    await generate(true);
    if (!live) {
      assert.ok(calls.some((c) => c.method === "PUT"));
      assert.equal(
        JSON.parse(calls.find((c) => c.url.endsWith("/ai-image-editor")).body).assets
          .image_file_paths[0],
        "api-assets/test/source.png"
      );
      await frame.locator("#new").click();
      await frame.getByRole("tab", { name: "Generate image" }).click();
      await frame.locator("#api-key").fill(key);
      status = "rendering";
      await frame.locator("#run").click();
      await frame.locator("#project").waitFor({ state: "visible" });
      await frame.locator("#stop").click();
      await frame.locator("#resume").waitFor({ state: "visible" });
      const count = calls.filter(
        (c) => c.method === "POST" && !c.url.endsWith("/files/upload-urls")
      ).length;
      status = "complete";
      await frame.locator("#resume").click();
      await frame.locator("#preview").waitFor({ state: "visible" });
      assert.equal(
        calls.filter((c) => c.method === "POST" && !c.url.endsWith("/files/upload-urls")).length,
        count
      );
      await frame.locator("#new").click();
      failStatus = 402;
      await frame.locator("#run").click();
      await frame.getByText("Magic Hour API returned HTTP 402.", { exact: true }).waitFor();
      assert.equal(await frame.locator("#preview").isVisible(), false);
    }
  }
  assert.deepEqual(failures, []);
  if (!screenshotsOnly)
    console.log(
      `${live ? "Live" : "Controlled"} iframe UI generation, editing, preview, and bridge insertion passed.`
    );
  if (live) console.log("Receipts saved without credentials or signed download URLs.");
} catch (error) {
  console.error("UI status:", await frame.locator("#status").textContent());
  console.error("Page errors:", failures);
  console.error(
    "Request paths:",
    calls.map((c) => c.method + " " + new URL(c.url).pathname)
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
  server.close();
}

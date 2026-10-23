import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const image = async (path) =>
  `data:image/png;base64,${(await readFile(`publishing/${path}`)).toString("base64")}`;
const [icon, generate, edit] = await Promise.all(
  ["icon.png", "generate-preview.png", "edit-preview.png"].map(image)
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#f7f4ef;color:#25221e;font-family:Arial,sans-serif}main{width:1920px;height:1080px;padding:90px;display:grid;grid-template-columns:1fr 760px;gap:50px;align-items:center}.brand{display:flex;align-items:center;gap:20px;font-size:34px;font-weight:700}.brand img{width:64px;height:64px;border-radius:16px}h1{font-size:92px;line-height:1.06;letter-spacing:-5px;margin:70px 0 30px;max-width:850px}p{font-size:29px;line-height:1.5;max-width:680px;color:#655f56}.pill{display:inline-block;padding:14px 22px;background:#fff;border-radius:99px;border:1px solid #ded8d0;font-size:19px;margin:30px 0 14px}.previews{display:flex;gap:28px;align-items:center}.panel{width:340px;height:850px;overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 18px 50px #312b2220;border:1px solid #e2ded7}.panel img{width:100%;display:block}.panel:last-child{transform:translateY(40px)}small{font-size:18px;color:#756f66;display:block;margin-top:25px}</style></head><body><main><section><div class="brand"><img src="${icon}" alt="">Magic Hour</div><h1>Generate. Edit.<br>Keep designing.</h1><p>Create images from a prompt or transform a selected layer, then bring the result into your canvas.</p><div class="pill">Magic Hour for Figma</div><small>Requires a Magic Hour account, API key, and API credits.<br>Live output shown in plugin UI previews.</small></section><section class="previews"><div class="panel"><img src="${generate}" alt="Generation preview"></div><div class="panel"><img src="${edit}" alt="Edit preview"></div></section></main></body></html>`
  );
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((i) => i.decode())));
  await page.screenshot({ path: "publishing/cover.png" });
  await page.setViewportSize({ width: 128, height: 128 });
  await page.setContent(
    `<html><body style="margin:0"><img src="${icon}" style="display:block;width:128px;height:128px"></body></html>`
  );
  await page.locator("img").evaluate((i) => i.decode());
  await page.screenshot({ path: "publishing/icon-128.png" });
  console.log("Publishing cover and icon rendered.");
} finally {
  await browser.close();
}

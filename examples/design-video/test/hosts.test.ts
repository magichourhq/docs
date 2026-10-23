import { test } from "node:test";
import assert from "node:assert/strict";
import { framerHost } from "../framer/src/host";
import { adobeHost } from "../adobe-express/src/host";
import { canvaHost } from "../canva/src/host";
import type { VideoResult } from "../shared/video";
const result: VideoResult = {
  id: "existing-video",
  blob: new Blob(["video"], { type: "video/mp4" }),
  url: "https://media.example/video.mp4",
  expiresAt: "2030-01-01T00:00:00Z",
  credits: 24,
};
test("Framer copies output bytes into a native file asset and inserts a muted looping video", async () => {
  let uploads = 0;
  const inserts: any[] = [];
  const host = framerHost(
    {
      getImage: async () => null,
      getPluginData: async () => null,
      setPluginData: async () => {},
      uploadFile: async (input) => {
        uploads++;
        assert.equal((input as any).file instanceof File, true);
        return { id: "file-id" } as any;
      },
      addComponentInstance: async (input) => {
        inserts.push(input);
        return {} as any;
      },
    },
    async () => ({ poster: "data:image/jpeg;base64,aA==", width: 640, height: 640 })
  );
  await assert.rejects(host.captureImage!(), /Select one image/);
  await host.insertVideo(result);
  await host.insertVideo(result);
  assert.equal(uploads, 1);
  assert.equal(inserts[0].attributes.controls.srcFile.id, "file-id");
  assert.equal(inserts[0].attributes.controls.loop, true);
  assert.equal(inserts[0].attributes.controls.muted, true);
});
test("Adobe rejects restricted exports before capturing selected or page content", async () => {
  let capture = 0;
  const sdk: any = {
    instance: { clientStorage: {} },
    app: { document: { exportAllowed: async () => false } },
  };
  const host = adobeHost(sdk, {
    captureSelection: async () => {
      capture++;
      return new Blob();
    },
  });
  await assert.rejects(host.captureImage!(), /not approved for export/);
  assert.equal(capture, 0);
});
test("Adobe stable export explicitly captures current page with export intent and imports video Blob", async () => {
  let options: any;
  const png = new Blob(["png"], { type: "image/png" });
  const sdk: any = {
    instance: { clientStorage: {} },
    constants: {
      Range: { currentPage: "current-page" },
      RenditionFormat: { png: "image/png" },
      RenditionIntent: { export: "export" },
    },
    app: {
      document: {
        exportAllowed: async () => true,
        createRenditions: async (...args: any[]) => {
          options = args;
          return [{ blob: png }];
        },
        addVideo: async (blob: Blob) => assert.equal(blob, result.blob),
      },
    },
  };
  const host = adobeHost(sdk);
  const source = await host.captureImage!();
  assert.equal(source.blob, png);
  assert.deepEqual(options, [{ range: "current-page", format: "image/png" }, "export"]);
  await host.insertVideo(result);
});
test("Canva waits for asset ingestion, discloses generated AI, and retries insertion using cached ref", async () => {
  let uploads = 0,
    ingested = false,
    adds = 0;
  const add = async (input: any) => {
    assert.equal(ingested, true);
    assert.equal(input.ref, "native-video-ref");
    adds++;
  };
  const api: any = {
    features: { isSupported: () => true },
    asset: {
      upload: async (input: any) => {
        uploads++;
        assert.equal(input.aiDisclosure, "app_generated");
        assert.equal(input.url, result.url);
        assert.match(input.thumbnailImageUrl, /^data:image/);
        return {
          ref: "native-video-ref",
          whenUploaded: async () => {
            ingested = true;
          },
        };
      },
    },
    design: {
      selection: { registerOnChange: () => () => {} },
      addElementAtPoint: add,
      addElementAtCursor: async () => assert.fail("wrong context"),
    },
  };
  const { host } = canvaHost(
    api,
    { load: async () => null, save: async () => {} },
    fetch,
    async () => "data:image/jpeg;base64,aGVsbG8="
  );
  await host.insertVideo(result);
  await host.insertVideo(result);
  assert.equal(uploads, 1);
  assert.equal(adds, 2);
});
test("Canva uses cursor insertion in a context without point insertion", async () => {
  const point = async () => assert.fail("point insertion unsupported"),
    cursor = async () => {};
  let cursorCalled = false;
  const api: any = {
    features: { isSupported: (f: any) => f !== point },
    asset: { upload: async () => ({ ref: "r", whenUploaded: async () => {} }) },
    design: {
      selection: { registerOnChange: () => () => {} },
      addElementAtPoint: point,
      addElementAtCursor: async () => {
        cursorCalled = true;
        await cursor();
      },
    },
  };
  await canvaHost(
    api,
    { load: async () => null, save: async () => {} },
    fetch,
    async () => "data:image/jpeg;base64,aA=="
  ).host.insertVideo(result);
  assert.equal(cursorCalled, true);
});
test("Canva downloads only the user-chosen original image, without API credentials", async () => {
  let change: any;
  const api: any = {
    features: { isSupported: () => true },
    asset: { getTemporaryUrl: async () => ({ url: "https://canva.example/original.png" }) },
    design: {
      selection: {
        registerOnChange: ({ onChange }: any) => {
          change = onChange;
          return () => {};
        },
      },
    },
  };
  const { host } = canvaHost(
    api,
    { load: async () => null, save: async () => {} },
    async (url, init) => {
      assert.equal(url, "https://canva.example/original.png");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.headers, undefined);
      return new Response("image", { headers: { "Content-Type": "image/png" } });
    }
  );
  await assert.rejects(host.captureImage!(), /Select one image/);
  change({ count: 1, read: async () => ({ contents: [{ ref: "image-ref" }] }) });
  const source = await host.captureImage!();
  assert.equal(source.label, "Selected Canva image (full original)");
});

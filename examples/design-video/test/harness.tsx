// Test entrypoint only. Never bundled into a distributable editor app.
import { createRoot } from "react-dom/client";
import { TestAppUiProvider } from "../node_modules/@canva/app-ui-kit/dist/esm/ui/apps/developing/ui_kit/components/app_ui_provider/test_app_ui_provider";
import "@canva/app-ui-kit/styles.css";
import { App } from "../canva/src/app";
import { mountPanel } from "../shared/panel";
import { VideoPanel } from "../shared/video";
import { framerHost } from "../framer/src/host";
import { adobeHost } from "../adobe-express/src/host";
import { canvaHost } from "../canva/src/host";
declare global {
  interface Window {
    __host: { events: Record<string, unknown>[] };
  }
}
window.__host = { events: [] };
const platform = new URLSearchParams(location.search).get("platform") ?? "framer";
const key = `test-host-${platform}`;
const store = {
  load: async () => localStorage.getItem(key),
  save: async (id: string | null) => {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  },
};
const image = async () => await (await fetch("/source.png")).blob();
const record = (event: string, data: Record<string, unknown> = {}) =>
  window.__host.events.push({ event, ...data });
if (platform === "framer") {
  const host = framerHost({
    getPluginData: async () => store.load(),
    setPluginData: async (_, id) => store.save(id),
    getImage: async () =>
      ({
        getData: async () => ({
          bytes: new Uint8Array(await (await image()).arrayBuffer()),
          mimeType: "image/png",
        }),
      }) as any,
    uploadFile: async (input) => {
      record("framer.uploadFile", { bytes: (input as any).file.size });
      return { id: "test-framer-file" } as any;
    },
    addComponentInstance: async (input) => {
      record("framer.addComponentInstance", { controls: input.attributes?.controls });
      return {} as any;
    },
  });
  mountPanel(host);
} else if (platform.startsWith("adobe")) {
  const sdk: any = {
    instance: {
      clientStorage: {
        getItem: () => store.load(),
        setItem: (_: string, id: string) => store.save(id),
        removeItem: () => store.save(null),
      },
    },
    constants: {
      Range: { currentPage: "currentPage" },
      RenditionFormat: { png: "image/png" },
      RenditionIntent: { export: "export" },
    },
    app: {
      document: {
        exportAllowed: async () => true,
        createRenditions: async () => [{ blob: await image() }],
        addVideo: async (blob: Blob) => {
          record("adobe.addVideo", { bytes: blob.size, type: blob.type });
        },
      },
    },
  };
  mountPanel(
    adobeHost(
      sdk,
      platform === "adobe-selection"
        ? {
            captureSelection: async () => {
              record("adobe.captureSelection");
              return image();
            },
          }
        : undefined
    )
  );
} else {
  const add = async (input: any) => {
    record("canva.addElement", { type: input.type, ref: input.ref });
  };
  const api: any = {
    features: { isSupported: () => true },
    asset: {
      getTemporaryUrl: async () => ({ url: location.origin + "/source.png" }),
      upload: async (input: any) => {
        record("canva.upload", {
          aiDisclosure: input.aiDisclosure,
          thumbnailIsDataURL: input.thumbnailImageUrl.startsWith("data:image/"),
          signedUrlIsHttps: input.url.startsWith("https://"),
        });
        return {
          ref: "test-canva-video-ref",
          whenUploaded: async () => {
            record("canva.ingested");
          },
        };
      },
    },
    design: {
      selection: {
        registerOnChange: ({ onChange }: any) => {
          onChange({ count: 1, read: async () => ({ contents: [{ ref: "test-canva-image" }] }) });
          return () => {};
        },
      },
      addElementAtPoint: add,
      addElementAtCursor: add,
    },
  };
  const { host } = canvaHost(api, store);
  const panel = new VideoPanel(host);
  createRoot(document.getElementById("root")!).render(
    <TestAppUiProvider>
      <App panel={panel} openLink={() => {}} />
    </TestAppUiProvider>
  );
}

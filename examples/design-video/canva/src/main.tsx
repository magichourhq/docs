import { createRoot } from "react-dom/client";
import { AppUiProvider } from "@canva/app-ui-kit";
import "@canva/app-ui-kit/styles.css";
import * as asset from "@canva/asset";
import * as design from "@canva/design";
import { features, requestOpenExternalUrl } from "@canva/platform";
import { prepareDesignEditor } from "@canva/intents/design";
import { canvaHost } from "./host";
import { App } from "./app";
import { VideoPanel } from "../../shared/video";
prepareDesignEditor({
  render: () => {
    const key = "magic-hour-canva-video-project-v1";
    const { host, dispose } = canvaHost(
      { asset, design, features },
      {
        load: async () => localStorage.getItem(key),
        save: async (id) => {
          if (id) localStorage.setItem(key, id);
          else localStorage.removeItem(key);
        },
      }
    );
    const panel = new VideoPanel(host);
    createRoot(document.getElementById("root")!).render(
      <AppUiProvider>
        <App
          panel={panel}
          openLink={(url) => {
            void requestOpenExternalUrl({ url }).catch(() => {});
          }}
        />
      </AppUiProvider>
    );
    addEventListener(
      "pagehide",
      () => {
        dispose();
        panel.dispose();
      },
      { once: true }
    );
  },
});

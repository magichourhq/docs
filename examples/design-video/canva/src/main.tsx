import { createRoot } from "react-dom/client";
import { AppI18nProvider, initIntl } from "@canva/app-i18n-kit";
import { AppUiProvider } from "@canva/app-ui-kit";
import "@canva/app-ui-kit/styles.css";
import * as asset from "@canva/asset";
import * as design from "@canva/design";
import { features, requestOpenExternalUrl } from "@canva/platform";
import { prepareDesignEditor } from "@canva/intents/design";
import { canvaHost } from "./host";
import { App } from "./app";
import { VideoPanel } from "../../shared/video";
const intl = initIntl();
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
      },
      undefined,
      undefined,
      intl.formatMessage
    );
    const panel = new VideoPanel(host, { formatMessage: intl.formatMessage });
    createRoot(document.getElementById("root")!).render(
      <AppI18nProvider>
        <AppUiProvider>
          <App
            panel={panel}
            formatMessage={intl.formatMessage}
            openLink={(url) => {
              void requestOpenExternalUrl({ url }).catch(() => {});
            }}
          />
        </AppUiProvider>
      </AppI18nProvider>
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

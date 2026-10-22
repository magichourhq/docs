import { framer } from "@framer/plugin";
import { framerHost } from "./host";
import { mountPanel } from "../../shared/panel";
await framer.showUI({ width: 380, height: 760 });
mountPanel(framerHost(framer));

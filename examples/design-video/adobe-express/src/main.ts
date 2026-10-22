import sdk, { RuntimeType } from "https://express.adobe.com/static/add-on-sdk/sdk.js";
import { adobeHost, type SelectionSandbox } from "./host";
import { mountPanel } from "../../shared/panel";
declare const ADOBE_SELECTION_DEVELOPMENT: boolean;
await sdk.ready;
if (ADOBE_SELECTION_DEVELOPMENT && !sdk.instance.runtime.apiProxy)
  throw new Error("Adobe document sandbox is unavailable.");
const selection = ADOBE_SELECTION_DEVELOPMENT
  ? await sdk.instance.runtime.apiProxy!<SelectionSandbox>(RuntimeType.documentSandbox)
  : undefined;
mountPanel(adobeHost(sdk, selection));

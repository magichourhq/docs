# Magic Hour browser client

`@magichourhq/browser-client` submits media generation jobs, uploads inputs, waits for results, and returns media bytes. It uses Fetch and browser file types and has no runtime dependencies. Host plugins supply their own API key and handle editor-specific input and output.

Use a browser or JavaScript runtime with Fetch, File, and AbortSignal support.

```ts
import { MagicHourClient } from "@magichourhq/browser-client";

const client = new MagicHourClient({ apiKey });
const project = await client.getProject(projectId, "video");
```

Build and package from the repository root:

```sh
npm ci --prefix examples
npm pack --prefix examples --workspace @magichourhq/browser-client
```

The package also exports `@magichourhq/browser-client/messages_en.json` for apps that localize client errors. Add the exported messages to the app's catalog and pass its formatter when creating the client.

Publish the browser client before publishing a provider that depends on it. The editor examples currently link to the local package for builds from this checkout.

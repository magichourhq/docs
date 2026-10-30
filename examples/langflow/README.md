# Magic Hour for Langflow

A first-party custom component that exposes Magic Hour's hosted image, video, and audio tools through Langflow's canonical `MCPToolsComponent`. It connects to `https://mcp.magichour.ai/` over Streamable HTTP. There is no second REST wrapper or hosted service to maintain. This integrates **Langflow**; it does not add Langfuse tracing.

## Use in Langflow

Tested with `lfx==1.12.7` (Langflow's component runtime). Recheck compatibility before using other versions.

1. In a Langflow flow, add a **Custom Component**, open its code editor, replace the scaffold with [magic_hour.py](magic_hour.py), and save.
2. Enter your [Magic Hour API key](https://magichour.ai/developer?utm_source=langflow&utm_medium=integration) in the secret input. Use a Langflow secret/global variable for shared flows; do not hard-code the value in source or exported flow JSON.
3. Enable **Tool Mode** and connect the Toolset output to an Agent's Tools input. The component discovers the hosted server's current tools and schemas at runtime.
4. Ask the Agent to generate an image using `flux-2-klein`, resolution `640px`, and `image_count=1`. Have it retain the returned project ID, then use `get_image_project` or the hosted wait helper to retrieve the completed output. Generations consume your Magic Hour credits.
5. Alternatively, select one tool in the component's Tool dropdown, refresh its schema, fill its generated inputs, and run the component directly.

Tool discovery alone is not proof that a key can generate. Creation returns an accepted project ID; completion requires retrieving that project. Never automatically repeat a generation after a lost response or a waiting timeout.

The API key is a `SecretStrInput`. Runtime authentication headers participate in Langflow's hashed tool-cache key, including before Tool Mode cache lookup, so rotating the key does not reuse tools bound to the old key. The wrapper returns a credential-free server configuration to the editor and keeps the static API-key field when switching tools. Existing Langflow execution, tool schemas, and timeout controls remain inherited.

## Runnable example

Requires Python 3.10–3.14 and a Magic Hour API key.

```sh
cd examples/langflow
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
# Set MAGIC_HOUR_API_KEY in your environment without committing it.
.venv/bin/python example.py --generate
```

The example uses the component's real Tool Mode discovery, submits one small image generation, saves the ID to `magic-hour-project.json`, polls through the discovered MCP retrieval tool, and downloads the PNG. It handles MCP `CallToolResult` objects as well as JSON text. Resume an interrupted wait without a second paid generation:

```sh
.venv/bin/python example.py --resume YOUR_PROJECT_ID
```

## Verification

```sh
.venv/bin/pytest -q tests
.venv/bin/ruff check magic_hour.py example.py tests
```

The automated compatibility tests instantiate the actual lfx component and check inputs, credential rotation, cache isolation, parent discovery delegation, and Tool Mode configuration. The hosted MCP server was also tested with an authenticated image generation and completion retrieval; see [validation](../../integration/creative-integrations-validation.md). The component was then verified in the full Langflow 1.12.7 editor: a global secret refreshed 46 tools, selecting image-project retrieval created its dynamic ID field, and Run component returned the completed project in the output inspector. A portable imported copy also passed the authenticated flow-run API. Upstream component-catalog acceptance remains pending.

## Importable editor example

Import `retrieve-image.flow.json` into Langflow, create a credential global variable named `MAGIC_HOUR_API_KEY`, select it in the component, and enter an existing image project ID. Run the component and inspect its Response output. This flow performs retrieval only, so importing or running it does not submit a generation. It embeds component source and has no dependency on the temporary custom-component directory used during validation.

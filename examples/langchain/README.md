# Magic Hour with LangChain and LangGraph

Generate product images, edit a catalog photo, or animate an image using the
official hosted Magic Hour MCP server. This example loads real LangChain tools
through `@langchain/mcp-adapters` and runs them in a LangGraph workflow. An optional
LangChain chat model improves the prompt before generation.

The graph creates one project, saves its ID, waits for completion, and returns the
exact signed download URLs. The command-line runner downloads the files. A saved
project can be resumed without another generation request.

## Install

Use Node.js 22 or newer. From this directory:

```sh
npm ci
```

Create a Magic Hour API key in the [Developer Hub](https://magichour.ai/developer?utm_source=langchain&utm_medium=integration&utm_campaign=api_distribution)
and provide it through the `MAGIC_HOUR_API_KEY` environment variable. Keep it out
of prompts, source files, commits, and shared execution traces.

## Three workflows

Generate a product image:

```sh
node run.mjs --mode generate --prompt "A blue ceramic mug on a cream studio background, ecommerce photography, no text"
```

Edit an existing photo:

```sh
node run.mjs --mode edit --image "https://YOUR_PUBLIC_HOST/product.png" --prompt "Change only the mug color to forest green; preserve the shape and background"
```

Animate a photo:

```sh
node run.mjs --mode animate --image "https://YOUR_PUBLIC_HOST/product.png" --prompt "A gentle camera orbit around the product, consistent shape and lighting"
```

Replace the sample image URL with a directly accessible image, or pass a Magic
Hour `file_path` obtained through the [upload API](https://docs.magichour.ai/api-reference/files/generate-asset-upload-urls).
A local filename or a private Google Drive sharing page is not a public image URL.

Each new run writes a recovery record under `outputs/<unique-run-id>/project.json`
before waiting. Generated files are saved in that directory after completion.
If rendering takes longer than the 60-second wait window, use the printed record:

```sh
node run.mjs --resume outputs/YOUR_RUN_ID/project.json
```

Resume accepts the saved mode and project ID and skips both the language model and
generation. Download failures can also be retried with this command; the server
returns fresh output links. Error or canceled projects need investigation, not
repeated polling. If a creation response is lost before an ID is available, check
your Magic Hour project history before rerunning the creation command.

## LLM → prompt → Magic Hour → saved media

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to a chat model your account can access, then
add `--improve-prompt` to any new-generation command:

```sh
node run.mjs --mode generate --improve-prompt --prompt "Studio product shot of our blue ceramic mug"
```

Only the textual prompt is sent to the language model. The graph selects the
generation operation and its parameters; the model rewrites the prompt. To use a
different LangChain chat provider, pass its chat model as `promptModel` to
`mediaWorkflow`. Omit it to use your prompt directly.

## Cost and execution behavior

- Image generation/editing request one Flux 2 Klein image at 640px. These settings
  used 5 credits per successful image in the September 7, 2026 API validation.
- Animation requests one second of LTX 2.5 video at 480p with audio disabled. Those
  settings used 24 credits in that validation. Confirm current costs and model
  availability in your account before running.
- Prompt improvement incurs a separate language-model charge.
- The workflow does not retry generation or route back to the create node. Avoid
  wrapping the entire graph in an automatic retry policy.
- The runner sends the Magic Hour key only to the fixed MCP endpoint. Downloads
  receive no bearer header; signed URLs and their query strings are preserved.
- `outputs/` is ignored by Git. It contains private project references and generated
  media. The script prints local file paths instead of signed URLs.

## Validation and limits

```sh
npm test       # Local MCP server and deterministic prompt model; no paid API calls
npm run smoke # Live tool discovery, ping and invalid-key rejection; no generation
```

Eleven tests exercise the installed LangGraph engine and MCP adapter through a
real local HTTP transport. They cover all three workflows, OpenAPI-derived input
constraints, preserving multi-block structured results and signed URLs, saving
the ID before waiting, recovery without creation, failure/cancellation/timeout,
missing downloads, and ambiguous creation errors. The schemas were captured from
the live server on September 7, 2026; smoke checks verify current tool availability.

The live smoke check loaded 44 tools, received `pong`, and confirmed account access
rejects an invalid key with HTTP 401. This is connectivity/authentication evidence,
not authenticated media-generation validation of this LangChain example. Earlier
real generation tests used Pipedream components and the compiled n8n node. The
OpenAI prompt step is tested with a deterministic LangChain test model, not a paid
OpenAI request. Hosted LangGraph deployment and third-party publish destinations
are not covered.

This is a runnable example, not a separately published LangChain integration
package or an approved LangChain catalog listing. See the official
[LangChain MCP guide](https://docs.langchain.com/oss/javascript/langchain/mcp)
and [Magic Hour API docs](https://docs.magichour.ai/) for the underlying interfaces.

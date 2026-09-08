# Magic Hour agent skill

Create media from a coding-agent session, recover an existing generation, and save finished assets into a project. The skill uses Magic Hour's existing MCP or API; it does not run a model locally.

## Install

With the [Agent Skills CLI](https://skills.sh/docs/cli):

```sh
npx skills add magichourhq/docs --skill magic-hour-media
```

Choose the client and project scope in the installer. Alternatively, copy the entire `magic-hour-media` folder into your client's skills directory. The included MIT license covers the skill; hosted generation remains subject to Magic Hour's service terms and credit pricing.

Connect the [Magic Hour MCP](https://magichour.ai/mcp) or provide `MAGIC_HOUR_API_KEY` securely to your runtime. Installing the skill does not create an account, provide credits, or configure credentials.

## Try it

- "Use Magic Hour to make one 16:9 hero image of a ceramic coffee cup, with space on the left for a headline. Save the result in my app's public assets folder."
- "Animate this product photo with a gentle camera push-in. Keep the logo and packaging unchanged, and use the smallest supported preview within my credit budget."
- "This Magic Hour video project already exists: `<project-id>`. Retrieve its finished video without starting another generation."

The skill reads current models and parameters, uploads input bytes when necessary, waits for completion, and preserves signed download links. It does not imply approval for public posting or unrequested generation costs.

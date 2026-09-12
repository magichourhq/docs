# Magic Hour agent skills

The official [Magic Hour skills cookbook](https://github.com/magichourhq/skills) contains tested workflows for general media creation, product visuals, and image-to-video generation. The MCP or API supplies the generation tools; the skills teach an agent how to choose and sequence them, inspect the result, and recover without creating duplicate paid jobs.

## Install

Install the full cookbook with the [Agent Skills CLI](https://skills.sh/docs/cli):

```sh
npx skills add magichourhq/skills --skill '*'
```

Or [choose one focused skill](https://github.com/magichourhq/skills#choose-your-workflow). Choose the client and project scope in the installer. The included MIT license covers the skills; hosted generation remains subject to Magic Hour's service terms and credit pricing.

Connect the [Magic Hour MCP](https://magichour.ai/mcp) or provide `MAGIC_HOUR_API_KEY` securely to your runtime. Installing the skill does not create an account, provide credits, or configure credentials.

See the cookbook's [validation evidence](https://github.com/magichourhq/skills/blob/main/docs/evidence.md) for the output-quality comparisons behind the focused skills.

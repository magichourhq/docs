# Creative integration checks

Source implementations and installation instructions:

- [Vercel AI SDK](vercel-ai-sdk/README.md)
- [Langflow](langflow/README.md)
- [Figma](figma/README.md)

The CI configuration is supplied as `creative-integrations.workflow.yml`. To enable automatic checks, copy it to `.github/workflows/creative-integrations.yml` with a GitHub credential permitted to write workflows. It runs the provider, Figma controller/browser, and Langflow suites without live API credentials. The current execution credential has repository access but lacks workflow scope, so the template is not installed automatically.

See `integration/creative-integrations-validation.md` for the verified live results and release gates.

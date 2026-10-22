"""Run with --generate for a paid image, or --resume PROJECT_ID for an existing job."""

import argparse
import asyncio
import json
import os
from pathlib import Path

import httpx
from magic_hour import MagicHourMCPComponent


def unwrap(value):
    """Langflow's canonical MCP tools can return MCP CallToolResult objects."""
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if isinstance(value, dict) and value.get("isError"):
        raise RuntimeError("The MCP tool returned an error. Check your key, credits, and inputs.")
    if isinstance(value, dict) and "content" in value:
        return unwrap(value["content"])
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("type") == "text":
                return unwrap(item["text"])
    if isinstance(value, str):
        return json.loads(value)
    return value


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--generate", action="store_true")
    action.add_argument("--resume", metavar="PROJECT_ID")
    parser.add_argument("--prompt", default="A cobalt blue ceramic vase on a warm studio background, no text")
    parser.add_argument("--output", type=Path, default=Path("magic-hour.png"))
    args = parser.parse_args()
    component = MagicHourMCPComponent()
    component.set(api_key=os.environ.get("MAGIC_HOUR_API_KEY", ""))
    tools = {tool.name: tool for tool in await component._get_tools()}
    print(f"Discovered {len(tools)} Magic Hour tools.")
    receipt = {"projectId": args.resume}
    if args.generate:
        # Exactly one paid submission. Never retry this operation automatically.
        created = unwrap(await tools["ai_image_generator_create_image"].ainvoke({
            "name": "Langflow example", "image_count": 1, "model": "flux-2-klein",
            "resolution": "640px", "aspect_ratio": "1:1", "style": {"prompt": args.prompt},
        }))
        receipt = {"projectId": created["id"], "creditsCharged": created["credits_charged"]}
    project_id = receipt["projectId"]
    # Persist the accepted ID before waiting so the generation can be resumed.
    Path("magic-hour-project.json").write_text(json.dumps(receipt, indent=2))
    print(f"Project: {project_id}. Resume with --resume {project_id} if interrupted.")
    for _ in range(300):
        project = unwrap(await tools["image_projects_retrieve_details"].ainvoke({"id": project_id}))
        if project["status"] == "complete":
            if not project.get("downloads"):
                raise RuntimeError(f"No output is available for {project_id}.")
            # Download without forwarding Magic Hour's API key to media storage.
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                response = await client.get(project["downloads"][0]["url"])
                response.raise_for_status()
                args.output.write_bytes(response.content)
            print(f"Saved {args.output} ({len(response.content)} bytes).")
            return
        if project["status"] in {"error", "canceled"}:
            raise RuntimeError(f"Generation {project['status']}: {project_id}.")
        await asyncio.sleep(2)
    raise TimeoutError(f"Waiting timed out. Resume project {project_id}; do not generate again.")


if __name__ == "__main__":
    asyncio.run(main())

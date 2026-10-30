"""Create once and recover Magic Hour images through native BeeAI MCPTool objects."""

import argparse
import asyncio
from datetime import timedelta
import json
import logging
import os
from pathlib import Path
from urllib.parse import urlsplit

logging.disable(logging.CRITICAL)
os.environ["OTEL_SDK_DISABLED"] = "true"

import httpx
from beeai_framework.tools.mcp import MCPTool
from beeai_framework.tools.types import RetryOptions, ToolRunOptions
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("account", help="Check authorization without printing account fields.")
    create = commands.add_parser("create", help="Submit one paid 640px image job; do not wait.")
    create.add_argument("--prompt", required=True)
    create.add_argument("--id-file", type=Path, required=True)
    get = commands.add_parser("get", help="Read the status of a saved image project.")
    get.add_argument("id")
    download = commands.add_parser("download", help="Recover a completed saved image.")
    download.add_argument("id")
    download.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


async def main(args):
    key = os.environ["MAGIC_HOUR_API_KEY"]
    options = ToolRunOptions(retry_options=RetryOptions(max_retries=0), timeout=60)
    async with asyncio.timeout(120):
        async with streamablehttp_client(
            "https://mcp.magichour.ai/",
            headers={"Authorization": "Bearer " + key},
            timeout=timedelta(seconds=30),
            sse_read_timeout=timedelta(seconds=60),
        ) as (read, write, _):
            async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=60)) as session:
                await session.initialize()
                inventory = await MCPTool.from_session(session)
                tools = {tool.name: tool for tool in inventory}
                if args.command == "account":
                    await tools["get_account_info"].run({}, options)
                    print(json.dumps({"status": "authorized", "tools": len(inventory), "tool_calls": 1}))
                elif args.command == "create":
                    # Keep an unknown-outcome marker if a response is lost; never replay creation.
                    with args.id_file.open("x+", encoding="utf-8") as state:
                        state.write("Creation outcome unknown. Check Magic Hour before another create.\n")
                        state.flush()
                        os.fsync(state.fileno())
                        result = await tools["generate_image"].run(
                            {
                                "image_count": 1,
                                "model": "flux-2-klein",
                                "resolution": "640px",
                                "aspect_ratio": "1:1",
                                "style": {"prompt": args.prompt},
                            },
                            options,
                        )
                        project_id = result.result["id"]
                        try:
                            state.seek(0)
                            state.truncate()
                            state.write(project_id + "\n")
                            state.flush()
                            os.fsync(state.fileno())
                        except OSError:
                            print(json.dumps({"id": project_id, "status": "accepted", "id_file_saved": False}), flush=True)
                            raise
                        print(json.dumps({"id": project_id, "status": "accepted", "id_file": str(args.id_file), "tool_calls": 1}), flush=True)
                else:
                    result = await tools["get_image_project"].run({"id": args.id}, options)
                    project = result.result
                    if project.get("id") != args.id:
                        raise RuntimeError("The returned project ID does not match the saved ID.")
                    if args.command == "get":
                        print(json.dumps({"id": project["id"], "status": project["status"], "tool_calls": 1}))
                        return
                    if project.get("status") != "complete":
                        print(json.dumps({"id": args.id, "status": project.get("status", "unknown"), "tool_calls": 1}))
                        raise RuntimeError("The saved image is not complete.")
                    # Use the exact returned URL, without forwarding the Magic Hour API key.
                    url = project["downloads"][0]["url"]
                    if urlsplit(url).scheme != "https":
                        raise RuntimeError("Expected an HTTPS image download.")
                    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
                        response = await client.get(url)
                        response.raise_for_status()
                        if not response.headers.get("content-type", "").startswith("image/"):
                            raise RuntimeError("The download was not an image.")
                        with args.output.open("xb") as output:
                            output.write(response.content)
                    print(json.dumps({"id": args.id, "status": "complete", "output": str(args.output), "tool_calls": 1}))


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except KeyboardInterrupt:
        raise SystemExit("Stopped. Keep any accepted project ID; no creation was repeated.")
    except Exception:
        raise SystemExit("Command failed. Keep the saved ID or unknown-outcome file; check Magic Hour before another create.")

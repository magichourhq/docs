"""Create once and recover Magic Hour images through mcp-agent's native Agent."""

import argparse
import asyncio
import base64
import json
import logging
import os
from pathlib import Path

logging.disable(logging.CRITICAL)
os.environ["OTEL_SDK_DISABLED"] = "true"

from mcp_agent.agents.agent import Agent
from mcp_agent.app import MCPApp
from mcp_agent.config import Settings


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


def tool_json(result):
    if result.isError:
        raise RuntimeError("Magic Hour tool failed.")
    if isinstance(result.structuredContent, dict):
        return result.structuredContent
    for item in result.content:
        if item.type == "text":
            value = json.loads(item.text)
            if isinstance(value, dict):
                return value
    raise RuntimeError("Magic Hour returned no project JSON.")


async def main(args):
    key = os.environ["MAGIC_HOUR_API_KEY"]
    settings = Settings(
        execution_engine="asyncio",
        mcp={"servers": {"magic_hour": {
            "transport": "streamable_http",
            "url": "https://mcp.magichour.ai/",
            "headers": {"Authorization": "Bearer " + key},
            "http_timeout_seconds": 30,
            "read_timeout_seconds": 60,
        }}},
        usage_telemetry={"enabled": False},
        otel={"enabled": False},
        logger={"type": "none", "transports": ["none"]},
        agents={"enabled": False},
    )
    app = MCPApp(name="magic_hour_images", settings=settings)
    async with asyncio.timeout(120):
        async with app.run() as running:
            async with Agent(
                name="magic_hour_images",
                server_names=["magic_hour"],
                context=running.context,
            ) as agent:
                inventory = await agent.list_tools()
                if args.command == "account":
                    tool_json(await agent.call_tool("magic_hour_get_account_info", {}))
                    print(json.dumps({"status": "authorized", "tools": len(inventory.tools), "tool_calls": 1}))
                elif args.command == "create":
                    # Exclusive creation prevents accidental resubmission with the same ID file.
                    with args.id_file.open("x+", encoding="utf-8") as state:
                        state.write("Creation outcome unknown. Check Magic Hour before another create.\n")
                        state.flush()
                        os.fsync(state.fileno())
                        result = tool_json(await agent.call_tool(
                            "magic_hour_generate_image",
                            {
                                "image_count": 1,
                                "model": "flux-2-klein",
                                "resolution": "640px",
                                "aspect_ratio": "1:1",
                                "style": {"prompt": args.prompt},
                            },
                        ))
                        project_id = result["id"]
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
                elif args.command == "get":
                    project = tool_json(await agent.call_tool(
                        "magic_hour_get_image_project", {"id": args.id}
                    ))
                    if project.get("id") != args.id:
                        raise RuntimeError("The returned project ID does not match the saved ID.")
                    print(json.dumps({"id": project["id"], "status": project["status"], "tool_calls": 1}))
                else:
                    result = await agent.call_tool("magic_hour_wait_for_image_project", {
                        "id": args.id,
                        "timeout_seconds": 30,
                        "include_inline_downloads": True,
                        "max_inline_downloads": 1,
                        "max_bytes_per_download": 8388608,
                    })
                    project = tool_json(result)
                    if project.get("id") != args.id:
                        raise RuntimeError("The returned project ID does not match the saved ID.")
                    if project.get("status") != "complete":
                        print(json.dumps({"id": args.id, "status": project.get("status", "unknown"), "tool_calls": 1}))
                        raise RuntimeError("The saved image is not complete.")
                    image = next((item for item in result.content if item.type == "image"), None)
                    if image is None:
                        raise RuntimeError("No inline image was returned within the 8 MiB limit.")
                    data = base64.b64decode(image.data, validate=True)
                    with args.output.open("xb") as output:
                        output.write(data)
                    print(json.dumps({"id": args.id, "status": "complete", "output": str(args.output), "tool_calls": 1}))


if __name__ == "__main__":
    try:
        asyncio.run(main(parse_args()))
    except KeyboardInterrupt:
        raise SystemExit("Stopped. Keep any accepted project ID; no creation was repeated.")
    except Exception:
        raise SystemExit("Command failed. Keep the saved ID or unknown-outcome file; check Magic Hour before another create.")

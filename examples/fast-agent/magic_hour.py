"""Use Fast Agent's native MCP client to create and recover Magic Hour images."""

import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
import time

os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["FASTMCP_TELEMETRY_MODE"] = "off"
os.environ["FASTMCP_CHECK_FOR_UPDATES"] = "off"

import httpx2
from fast_agent.agents.agent_types import AgentConfig
from fast_agent.agents.mcp_agent import McpAgent
from fast_agent.config import (
    LoggerSettings,
    MCPServerAuthSettings,
    MCPServerSettings,
    MCPSettings,
    OpenTelemetrySettings,
    Settings,
)
from fast_agent.core.core_app import Core


async def call(agent, name, arguments):
    result = await agent.call_tool(f"magic_hour__{name}", arguments)
    if result.is_error:
        raise RuntimeError(f"Magic Hour rejected {name}; keep any saved project ID.")
    payload = result.structured_content
    if payload is None:
        payload = json.loads(next(part.text for part in result.content if part.type == "text"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected result from {name}.")
    return payload


async def run(args):
    token = os.environ.get("MAGIC_HOUR_API_KEY", "").strip()
    if not token:
        raise RuntimeError("Set MAGIC_HOUR_API_KEY through your secret manager.")
    if args.command == "create" and not args.prompt.strip():
        raise RuntimeError("Provide a nonempty image prompt.")

    settings = Settings(
        _env_file=None,
        session_history=False,
        logger=LoggerSettings(type="none", progress_display=False, show_chat=False, show_tools=False),
        otel=OpenTelemetrySettings(enabled=False),
        mcp=MCPSettings(servers={
            "magic_hour": MCPServerSettings(
                transport="http",
                protocol_mode="legacy",
                url="https://mcp.magichour.ai/?client=fast-agent",
                headers={"Authorization": f"Bearer {token}"},
                auth=MCPServerAuthSettings(oauth=False, persist="memory"),
                reconnect_on_disconnect=False,
                ping_interval_seconds=0,
                http_timeout_seconds=30,
                http_read_timeout_seconds=60,
            ),
        }),
    )
    core = Core(settings=settings)
    config = AgentConfig(
        name="magic_hour",
        servers=["magic_hour"],
        use_history=False,
        skills=[],
        shell=False,
        subagents=False,
        human_input=False,
    )
    async with core.run():
        async with McpAgent(config, context=core.context) as agent:
            available = await agent.list_tools()
            names = {tool.name for tool in available.tools}
            required = {
                "account": "get_account_info",
                "create": "generate_image",
                "get": "get_image_project",
                "download": "get_image_project",
            }[args.command]
            if f"magic_hour__{required}" not in names:
                raise RuntimeError("The required Magic Hour tool was not discovered.")
            if args.command == "account":
                account = await call(agent, required, {})
                if not isinstance(account.get("id"), str) or type(account.get("credits")) is not int:
                    raise RuntimeError("Unexpected account response.")
                print(json.dumps({"authenticated": True, "tools": len(names)}))
                return

            if args.command == "create":
                # Reserve the state file first. Even an uncertain submission must not be replayed.
                with args.state.open("x", encoding="utf-8") as saved:
                    saved.write('{"status":"submission_pending"}\n')
                    saved.flush()
                    os.fsync(saved.fileno())
                    created = await call(agent, required, {
                        "name": "Fast Agent image",
                        "image_count": 1,
                        "model": "flux-2-klein",
                        "resolution": "640px",
                        "aspect_ratio": "1:1",
                        "style": {"prompt": args.prompt.strip(), "tool": "general"},
                    })
                    if not isinstance(created.get("id"), str):
                        raise RuntimeError("Creation returned no ID; do not repeat it automatically.")
                    print(json.dumps(created), flush=True)
                    saved.seek(0)
                    json.dump(created, saved)
                    saved.write("\n")
                    saved.truncate()
                    saved.flush()
                    os.fsync(saved.fileno())
                return

            project_id = args.id
            if not project_id:
                project_id = json.loads(args.state.read_text(encoding="utf-8")).get("id")
            if not isinstance(project_id, str) or not project_id:
                raise RuntimeError("No saved ID. Resolve the original submission before creating again.")
            deadline = time.monotonic() + args.wait
            while True:
                project = await call(agent, required, {"id": project_id})
                if project.get("id") != project_id:
                    raise RuntimeError("Retrieved project does not match the saved ID.")
                status = project.get("status")
                print(json.dumps({
                    "id": project_id,
                    "status": status,
                    "credits_charged": project.get("credits_charged"),
                }), flush=True)
                if status in {"complete", "error", "canceled"} or time.monotonic() >= deadline:
                    break
                await asyncio.sleep(min(5, max(0, deadline - time.monotonic())))
            if status in {"error", "canceled"}:
                raise RuntimeError(f"Project {project_id} is {status}; no replacement was created.")
            if args.command == "download":
                downloads = project.get("downloads", [])
                if status != "complete" or not downloads:
                    raise RuntimeError("Image is not ready. Retry this saved ID later.")
                # Storage receives no API authorization header. Keep the returned signed URL intact.
                async with httpx2.AsyncClient(timeout=60, follow_redirects=True) as client:
                    async with client.stream("GET", downloads[0]["url"]) as response:
                        response.raise_for_status()
                        with args.output.open("xb") as output:
                            async for chunk in response.aiter_bytes():
                                output.write(chunk)
                print(json.dumps({"saved": str(args.output), "bytes": args.output.stat().st_size}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=Path("magic-hour-project.json"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("account", help="Check API authorization without printing account fields.")
    create = commands.add_parser("create", help="Create exactly one image and save its accepted ID.")
    create.add_argument("--prompt", required=True)
    for name in ("get", "download"):
        command = commands.add_parser(name, help="Recover an existing project; never create another.")
        command.add_argument("--id", help="Existing image project ID; otherwise read --state.")
        command.add_argument("--wait", type=int, choices=range(0, 301), default=0, metavar="0..300")
        if name == "download":
            command.add_argument("--output", type=Path, default=Path("magic-hour-image.png"))
    args = parser.parse_args()
    try:
        asyncio.run(asyncio.wait_for(run(args), timeout=420))
        return 0
    except (RuntimeError, FileExistsError) as exc:
        print(str(exc), file=sys.stderr)
    except Exception as exc:
        print(f"{type(exc).__name__}: request failed; keep the saved ID and recover it.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

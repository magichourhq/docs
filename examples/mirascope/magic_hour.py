"""Create once and recover Magic Hour images with Mirascope's native tools."""
import argparse
import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit

import httpx

logging.disable(logging.CRITICAL)
ENDPOINT = "https://mcp.magichour.ai/"


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("account")
    create = commands.add_parser("create")
    create.add_argument("--prompt", required=True)
    create.add_argument("--state", type=Path, required=True)
    create.add_argument("--confirm-create", action="store_true", required=True)
    for command in ("get", "download"):
        child = commands.add_parser(command)
        child.add_argument("--id", required=True)
        if command == "download":
            child.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if hasattr(args, "id") and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", args.id):
        parser.error("Invalid project ID")
    return args


def reserve_creation(path):
    # Exclusive creation records an unknown outcome before any paid request.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as file:
        json.dump({"status": "pending_outcome"}, file)
        file.flush()
        os.fsync(file.fileno())
    sync_directory(path.parent)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def save_id(path, project_id):
    descriptor, temporary = tempfile.mkstemp(prefix=".magic-hour-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as file:
            json.dump({"status": "accepted", "id": project_id}, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def project_id(value):
    identifier = value.get("id")
    if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", identifier):
        raise ValueError("The tool did not return a valid project ID")
    return identifier


def emit(value):
    print(json.dumps(value), flush=True)


def download_image(project, output):
    if project.get("status") != "complete":
        raise ValueError("Project is not complete; retrieve the same ID later")
    url = project["downloads"][0]["url"]
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Expected an HTTPS download URL")
    digest = hashlib.sha256()
    size = 0
    created = False
    try:
        # Storage requests deliberately have no API credentials and no redirects.
        with httpx.Client(follow_redirects=False, trust_env=False, timeout=120) as storage:
            with storage.stream("GET", url) as response:
                response.raise_for_status()
                with output.open("xb") as file:
                    created = True
                    for chunk in response.iter_bytes():
                        file.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
                    file.flush()
                    os.fsync(file.fileno())
        if not size:
            raise ValueError("Empty download")
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    emit({"id": project["id"], "downloaded": True, "bytes": size, "sha256": digest.hexdigest()})

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mirascope.llm.mcp import MCPClient


def response_json(blocks):
    for block in blocks:
        if block.get("type") == "text":
            result = json.loads(block["text"])
            if not isinstance(result, dict) or result.get("error"):
                raise ValueError("Tool request failed")
            return result
    raise ValueError("No JSON tool result")


async def run(args):
    key = os.environ["MAGIC_HOUR_API_KEY"]
    async with (
        httpx.AsyncClient(
            headers={"Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(120),
            follow_redirects=False,
            trust_env=False,
        ) as http,
        streamable_http_client(ENDPOINT, http_client=http) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        client = MCPClient(session)
        tools = {tool.name: tool for tool in await client.list_tools()}

        async def call(name, **kwargs):
            return response_json(await tools[name](**kwargs))

        if args.command == "account":
            account = await call("get_account_info")
            if not isinstance(account.get("id"), str) or not isinstance(account.get("credits"), int):
                raise ValueError("Account authorization was not confirmed")
            emit({"authorized": True, "tools": len(tools)})
        elif args.command == "create":
            reserve_creation(args.state)
            result = await call(
                "generate_image",
                image_count=1,
                model="flux-2-klein",
                resolution="640px",
                aspect_ratio="1:1",
                style={"prompt": args.prompt},
            )
            identifier = project_id(result)
            try:
                save_id(args.state, identifier)
            except BaseException:
                emit({"id": identifier, "saved": False})
                raise
            emit({"id": identifier, "saved": True})
        else:
            project = await call("get_image_project", id=args.id)
            if project_id(project) != args.id:
                raise ValueError("Returned project ID does not match the requested ID")
            if args.command == "get":
                emit({"id": args.id, "status": project.get("status")})
            else:
                download_image(project, args.output)


if __name__ == "__main__":
    args = arguments()
    try:
        asyncio.run(run(args))
    except (Exception, KeyboardInterrupt):
        print(
            "Request did not finish. Keep any saved project ID. If creation was attempted, "
            "check the pending state and Magic Hour projects before creating again.",
            file=sys.stderr,
        )
        sys.exit(1)

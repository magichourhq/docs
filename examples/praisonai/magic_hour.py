"""Create once and recover Magic Hour images with PraisonAI's native tools."""
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

# Disable the SDK's optional telemetry before importing it.
os.environ["PRAISONAI_TELEMETRY_DISABLED"] = "true"
os.environ["DO_NOT_TRACK"] = "true"

from contextlib import contextmanager
import threading
from praisonaiagents.mcp.mcp_http_stream import HTTPStreamMCPClient, get_event_loop


@contextmanager
def native_tools(key):
    # This standalone process owns the SDK event loop and its worker thread.
    loop = get_event_loop()
    ready = threading.Event()

    def run_loop():
        asyncio.set_event_loop(loop)
        loop.call_soon(ready.set)
        loop.run_forever()

    worker = threading.Thread(target=run_loop, name="magic-hour-praison-mcp", daemon=True)
    worker.start()
    client = None
    try:
        if not ready.wait(10):
            raise RuntimeError("MCP worker did not start")
        client = HTTPStreamMCPClient(
            ENDPOINT,
            debug=False,
            timeout=120,
            options={"headers": {"Authorization": f"Bearer {key}"}},
        )
        yield {tool.name: tool for tool in client.tools}
    finally:
        async def close_client():
            if client is not None:
                await client.aclose()

        async def cancel_remaining():
            current = asyncio.current_task()
            pending = [task for task in asyncio.all_tasks() if task is not current]
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

        try:
            try:
                asyncio.run_coroutine_threadsafe(close_client(), loop).result(timeout=10)
            finally:
                asyncio.run_coroutine_threadsafe(cancel_remaining(), loop).result(timeout=10)
        finally:
            loop.call_soon_threadsafe(loop.stop)
            worker.join(timeout=10)
            if worker.is_alive():
                raise RuntimeError("MCP worker did not stop")
            loop.close()


def response_json(text):
    result = json.loads(text)
    if not isinstance(result, dict) or result.get("error"):
        raise ValueError("Tool request failed")
    return result


def run(args):
    with native_tools(os.environ["MAGIC_HOUR_API_KEY"]) as tools:
        def call(name, **kwargs):
            return response_json(tools[name](**kwargs))

        if args.command == "account":
            account = call("account_retrieve")
            if not isinstance(account.get("id"), str) or not isinstance(account.get("credits"), int):
                raise ValueError("Account authorization was not confirmed")
            emit({"authorized": True, "tools": len(tools)})
        elif args.command == "create":
            reserve_creation(args.state)
            result = call(
                "ai_image_generator_create_image",
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
            project = call("image_projects_retrieve_details", id=args.id)
            if project_id(project) != args.id:
                raise ValueError("Returned project ID does not match the requested ID")
            if args.command == "get":
                emit({"id": args.id, "status": project.get("status")})
            else:
                download_image(project, args.output)


if __name__ == "__main__":
    args = arguments()
    try:
        run(args)
    except (Exception, KeyboardInterrupt):
        print(
            "Request did not finish. Keep any saved project ID. If creation was attempted, "
            "check the pending state and Magic Hour projects before creating again.",
            file=sys.stderr,
        )
        sys.exit(1)

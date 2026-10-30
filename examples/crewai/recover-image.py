import json
import os

os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["CREWAI_DISABLE_TELEMETRY"] = "true"

def recover_image() -> dict[str, str]:
    from crewai_tools import MCPServerAdapter

    api_key = os.environ["MAGIC_HOUR_API_KEY"]
    project_id = os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"]
    server_params = {
        "url": "https://mcp.magichour.ai/",
        "transport": "streamable-http",
        "headers": {"Authorization": f"Bearer {api_key}"},
    }
    with MCPServerAdapter(
        server_params,
        "get_account_info",
        "get_image_project",
        connect_timeout=60,
    ) as tools:
        if len(tools) != 2:
            raise ValueError("Required tools unavailable")
        account = json.loads(tools["get_account_info"].run())
        if (
            not isinstance(account, dict)
            or not isinstance(account.get("id"), str)
            or not isinstance(account.get("credits"), (int, float))
            or isinstance(account.get("credits"), bool)
        ):
            raise ValueError("Unexpected account metadata")
        project = json.loads(
            tools["get_image_project"].run(id=project_id)
        )
        if (
            not isinstance(project, dict)
            or project.get("id") != project_id
            or not isinstance(project.get("status"), str)
        ):
            raise ValueError("Unexpected project metadata")
        print({"filtered_tools": len(tools), "authenticated_account": True})
        return {"id": project["id"], "status": project["status"]}


if __name__ == "__main__":
    try:
        result = recover_image()
    except Exception:
        print({"error": "Magic Hour recovery failed; keep the saved project ID."})
        raise SystemExit(1)
    print(result)

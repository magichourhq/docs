import asyncio
import json
import os


async def main():
    phase = "configure"
    try:
        import dspy
        import httpx2
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client

        dspy.configure(callbacks=[])
        dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
        project_id = os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"]
        phase = "connect"
        async with httpx2.AsyncClient(
            headers={"Authorization": f"Bearer {os.environ['MAGIC_HOUR_API_KEY']}"},
            follow_redirects=False,
            timeout=60,
        ) as http_client:
            async with streamable_http_client(
                "https://mcp.magichour.ai/", http_client=http_client
            ) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    phase = "convert_tools"
                    available = await session.list_tools()
                    tools = {
                        tool.name: dspy.Tool.from_mcp_tool(
                            session, tool, result_mode="structured"
                        )
                        for tool in available.tools
                    }
                    print({"tool_count": len(tools)})
                    phase = "account"
                    account = await tools["get_account_info"].acall()
                    if isinstance(account, str):
                        account = json.loads(account)
                    if not isinstance(account, dict):
                        raise ValueError("Unexpected account result type")
                    if not isinstance(account["id"], str) or type(account["credits"]) not in (int, float):
                        raise ValueError("Unexpected account field types")
                    print({"account_authenticated": True})
                    phase = "project"
                    project = await tools["wait_for_image_project"].acall(
                        id=project_id,
                        timeout_seconds=30,
                        include_inline_downloads=False,
                    )
                    if isinstance(project, str):
                        project = json.loads(project)
                    if not isinstance(project, dict):
                        raise ValueError("Unexpected project result type")
                    if project["id"] != project_id or not isinstance(project["status"], str):
                        raise ValueError("Unexpected project fields")
                    print({"id": project["id"], "status": project["status"]})
                    phase = "cleanup"
        return 0
    except Exception:
        print({"error": "DSPy MCP example failed", "phase": phase})
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

import json
import os

os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["CREWAI_DISABLE_TELEMETRY"] = "true"


def recover_with_crew() -> dict[str, str]:
    project_id = os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"]
    from crewai import Agent, Crew, LLM, Task
    from crewai_tools import MCPServerAdapter

    llm = LLM(
        model="ollama/qwen2.5:7b-instruct-q4_K_M",
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
        api_key="ollama",
        timeout=120,
        max_retries=0,
        max_tokens=1024,
        temperature=0,
    )
    with MCPServerAdapter(
        {
            "url": "https://mcp.magichour.ai/",
            "transport": "streamable-http",
            "headers": {"Authorization": f"Bearer {os.environ['MAGIC_HOUR_API_KEY']}"},
        },
        "image_projects_retrieve_details",
        connect_timeout=30,
    ) as tools:
        if len(tools) != 1:
            raise ValueError("Required retrieval tool unavailable")
        tool = tools["image_projects_retrieve_details"]
        tool.result_as_answer = True
        tool.max_usage_count = 1
        agent = Agent(
            role="Saved image status reader",
            goal="Retrieve the saved image project through the provided tool.",
            backstory="Use the retrieval result; never invent a project status.",
            llm=llm,
            tools=[tool],
            max_iter=3,
            max_retry_limit=0,
            max_execution_time=180,
            allow_delegation=False,
            verbose=False,
            cache=False,
            memory=False,
        )
        task = Task(
            description=f"Call image_projects_retrieve_details exactly once with id={project_id}. Return its result.",
            expected_output="The unmodified retrieval tool result.",
            agent=agent,
        )
        output = Crew(
            agents=[agent], tasks=[task], planning=False,
            verbose=False, share_crew=False, tracing=False,
            memory=False, cache=False,
        ).kickoff()
        if tool.current_usage_count != 1:
            raise ValueError("The native retrieval tool did not execute exactly once")
        project = json.loads(output.raw)
        if (
            not isinstance(project, dict)
            or project.get("id") != project_id
            or not isinstance(project.get("status"), str)
        ):
            raise ValueError("Unexpected retrieval result")
        return {"id": project["id"], "status": project["status"]}


if __name__ == "__main__":
    try:
        result = recover_with_crew()
    except Exception:
        print({"error": "Crew recovery failed; keep the saved project ID."})
        raise SystemExit(1)
    print(result)

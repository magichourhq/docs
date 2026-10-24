import os

import httpx
from prefect import flow, task


@task(name="recover-magic-hour-image", retries=0, persist_result=False, log_prints=False)
def get_image_project(project_id: str) -> dict[str, str]:
    api_key = os.getenv("MAGIC_HOUR_API_KEY")
    try:
        if not api_key or not project_id:
            raise ValueError("Missing configuration")
        with httpx.Client(timeout=30, follow_redirects=False) as client:
            response = client.get(
                f"https://api.magichour.ai/v1/image-projects/{project_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            response.raise_for_status()
            project = response.json()
        if (
            not isinstance(project, dict)
            or project.get("id") != project_id
            or not isinstance(project.get("status"), str)
        ):
            raise ValueError("Unexpected project metadata")
        return {"id": project["id"], "status": project["status"]}
    except Exception:
        raise RuntimeError(
            "Magic Hour image recovery failed; keep the saved project ID."
        ) from None


@flow(name="magic-hour-image-recovery", retries=0, persist_result=False, log_prints=False)
def recover_image(project_id: str) -> dict[str, str]:
    return get_image_project(project_id)


if __name__ == "__main__":
    try:
        result = recover_image(os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"])
    except Exception:
        print({"error": "Magic Hour image recovery failed; keep the saved project ID."})
        raise SystemExit(1)
    print(result)

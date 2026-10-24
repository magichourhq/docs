import os
from urllib.parse import quote

import requests
from dagster import DagsterInstance, Failure, MaterializeResult, asset, materialize_to_memory


@asset
def magic_hour_image_status():
    try:
        api_key = os.environ["MAGIC_HOUR_API_KEY"].strip()
        project_id = os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"].strip()
        with requests.get(
            f"https://api.magichour.ai/v1/image-projects/{quote(project_id, safe='')}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
            allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                raise ValueError("Unexpected Magic Hour response status")
            project = response.json()
        if (
            not isinstance(project, dict)
            or project.get("id") != project_id
            or not isinstance(project.get("status"), str)
        ):
            raise ValueError("Unexpected Magic Hour project metadata")
        return MaterializeResult(
            metadata={"project_id": project_id, "status": project["status"]}
        )
    except Exception:
        raise Failure(
            description="Magic Hour saved-project retrieval failed; no generation was requested."
        ) from None


def main():
    with DagsterInstance.ephemeral() as instance:
        result = materialize_to_memory(
            [magic_hour_image_status], instance=instance, raise_on_error=False
        )
        for event in result.get_asset_materialization_events():
            metadata = event.event_specific_data.materialization.metadata
            print({"id": metadata["project_id"].value, "status": metadata["status"].value})
        print({"materialization_success": result.success})
        return 0 if result.success else 1


if __name__ == "__main__":
    raise SystemExit(main())

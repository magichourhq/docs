import http.client
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
from urllib.parse import urlsplit


def get_bytes(host, path, limit, headers):
    connection = http.client.HTTPSConnection(host, timeout=20)
    try:
        connection.request("GET", path, headers=headers)
        with connection.getresponse() as response:
            if response.status != 200:
                raise ValueError(f"{host} returned HTTP {response.status}")
            body = response.read(limit + 1)
            if len(body) > limit:
                raise ValueError(f"{host} exceeded the response limit")
            return body, response.headers.get_content_type()
    finally:
        connection.close()


def recover():
    project_id = os.environ["MAGIC_HOUR_IMAGE_PROJECT_ID"]
    if not project_id.isascii() or not project_id.isalnum():
        raise ValueError("Invalid image project ID")

    output = Path("output/magic-hour-image.png")
    if output.exists():
        raise ValueError(f"{output} already exists")

    key_path = os.environ["MAGIC_HOUR_API_KEY_FILE"]
    fd = os.open(key_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(fd, encoding="ascii") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid():
            raise ValueError("Use a credential file owned by your user with permissions 0600")
        key = source.read(513).strip()
    if not key or len(key) > 512 or any(char.isspace() for char in key):
        raise ValueError("Invalid API key file contents")
    project, _ = get_bytes(
        "api.magichour.ai",
        f"/v1/image-projects/{project_id}",
        131072,
        {"Authorization": "Bearer " + key, "Accept": "application/json"},
    )
    del key
    result = json.loads(project)
    if result.get("id") != project_id or result.get("status") != "complete":
        raise ValueError("The requested image project is not complete")
    downloads = result.get("downloads", [])
    if len(downloads) != 1:
        raise ValueError("Choose a completed project with one image")
    url = urlsplit(downloads[0]["url"])
    if url.scheme != "https" or url.netloc != "videos.magichour.ai" or not url.path.startswith("/") or url.fragment:
        raise ValueError("The download URL is outside the expected Magic Hour media origin")
    target = url.path + ("?" + url.query if url.query else "")
    image, mime = get_bytes("videos.magichour.ai", target, 64 * 1024 * 1024, {"Accept": "image/png"})
    if mime != "image/png" or not image.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("The downloaded file is not a PNG")

    output.parent.mkdir(mode=0o700, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent) as stream:
        stream.write(image)
        stream.flush()
        os.link(stream.name, output)


if __name__ == "__main__":
    try:
        recover()
    except (KeyError, OSError, ValueError, http.client.HTTPException) as error:
        detail = str(error) if type(error) is ValueError else type(error).__name__
        print(f"Recovery stopped: {detail}", file=sys.stderr)
        sys.exit(1)

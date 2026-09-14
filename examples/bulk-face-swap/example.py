# Python 3.10+. Standard library only. Run on your server.
import http.client, json, os, time, urllib.error, urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

API = "https://api.magichour.ai/v1"
token = os.environ["MAGIC_HOUR_API_KEY"]

# Edit these request settings first.
# Set PROJECT_ID to resume polling a submitted job without paying twice.
project_id = os.environ.get("PROJECT_ID")
if not project_id:
    payload = json.loads('''{
  "assets": {
    "face_swap_mode": "all-faces",
    "source_file_path": "",
    "target_file_path": ""
  },
  "name": "Batch Face Swap photo"
}''')
    payload["assets"]["source_file_path"] = os.environ["SOURCE_FACE_URL"]
    payload["assets"]["target_file_path"] = os.environ["TARGET_IMAGE_URL"]

class TransientPollError(RuntimeError):
    def __init__(self, message, retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after

def retry_after_seconds(value):
    if not value:
        return None
    try:
        return max(0, float(value))
    except ValueError:
        try:
            return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError):
            return None

def request(path, body=None, retry_transient=False):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        message = f"HTTP {error.code}: {error.reason}"
        if retry_transient and (error.code in (408, 429) or error.code >= 500):
            raise TransientPollError(message, retry_after_seconds(error.headers.get("Retry-After"))) from error
        raise RuntimeError(message) from error
    except (OSError, http.client.HTTPException, json.JSONDecodeError, UnicodeDecodeError) as error:
        if retry_transient:
            raise TransientPollError(str(error)) from error
        raise

if not project_id:
    # Do not automatically retry this POST after a connection timeout.
    job = request("/face-swap-photo", payload)
    project_id = job["id"]
print("PROJECT_ID=" + project_id, flush=True)

deadline = time.monotonic() + 900
delay = 2
while time.monotonic() < deadline:
    try:
        result = request("/image-projects/" + project_id, retry_transient=True)
        if not isinstance(result, dict) or not isinstance(result.get("status"), str):
            raise TransientPollError("Polling response is missing a valid status")
    except TransientPollError as error:
        wait = error.retry_after if error.retry_after is not None else delay
        time.sleep(min(wait, max(0, deadline - time.monotonic())))
        delay = min(delay * 2, 15)
        continue
    if result["status"] == "complete":
        if not result.get("downloads"):
            raise RuntimeError("Complete job has no downloads: " + project_id)
        print("Credits charged:", result["credits_charged"])
        for download in result["downloads"]:
            print("Download:", download["url"])
            print("Expires:", download["expires_at"])
        break
    if result["status"] in ("error", "canceled"):
        raise RuntimeError(f"{project_id}: {result['status']}; {result.get('error')}")
    time.sleep(delay)
    delay = min(delay * 2, 15)
else:
    raise TimeoutError("Still processing. Resume with PROJECT_ID=" + project_id)

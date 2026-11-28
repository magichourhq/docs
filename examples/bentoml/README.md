# Recover an existing Magic Hour image with BentoML

This local BentoML service returns the PNG from one completed Magic Hour image project. It runs on a private Unix socket and uses Linux and Python 3.12.

## Set up the service

From this directory, create a virtual environment and install the example's dependencies.

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Set the ID of a completed project with one PNG in your Magic Hour account. Store your API key in a regular file outside this repository, owned by your user with permissions `0600`. Use its path below.

```sh
export MAGIC_HOUR_IMAGE_PROJECT_ID='<completed-image-project-id>'
export MAGIC_HOUR_API_KEY_FILE='/path/to/private/key-file'
socket_dir="$(mktemp -d)"
printf 'Socket path: %s\n' "$socket_dir/bentoml.sock"
BENTOML_HOME="$socket_dir/bentoml" .venv/bin/python -m uvicorn service:app --uds "$socket_dir/bentoml.sock"
```

## Retrieve the PNG

In another terminal, use the socket path printed above.

```sh
curl --fail-with-body --unix-socket '/path/printed/above/bentoml.sock' \
  --json '{}' http://localhost/retrieve_image -o recovered.png
```

Open `recovered.png` to see the original image. The service also saves a copy to `output/magic-hour-image.png`. Move that file before retrieving another image. Stop the server with Ctrl+C when you're done.

# Recover a Magic Hour image in Digdag

Run this workflow on Linux or macOS with [Digdag](https://docs.digdag.io/getting_started.html), Python 3, and FFmpeg. It retrieves one existing PNG and checks that it decodes. The API requests are read-only and spend no credits.

1. Save your [Magic Hour API key](https://magichour.ai/developer?tab=api-keys) in a private file outside this folder. Give the file mode `0600`.
2. In this folder, point to that file and set the ID of a completed, single-image PNG project from the same account.

   ```sh
   export MAGIC_HOUR_API_KEY_FILE="$HOME/.config/magic-hour/key"
   export MAGIC_HOUR_IMAGE_PROJECT_ID="YOUR_IMAGE_PROJECT_ID"
   digdag run recover.dig
   ```

3. Open `output/magic-hour-image.png` after both tasks succeed. Move the existing output before running another project.

The workflow sends the API key only to `api.magichour.ai`. It downloads the image directly from `videos.magichour.ai` without the API key. [Image project API](https://docs.magichour.ai/api-reference/image-projects/get-image-details)

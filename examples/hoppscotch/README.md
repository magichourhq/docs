# Recover Magic Hour media in Hoppscotch

Use the [Hoppscotch collection](./magic-hour-media-recovery.hoppscotch.json) to check an existing image or video project and get its download URL. Both requests are read-only and spend no credits.

1. In the Hoppscotch desktop app, open **Collections → Import → Import from Hoppscotch** and import the JSON file.
2. Create and select a personal environment. Add `magic_hour_api_key` as a **Secret** and set it to your [Magic Hour API key](https://magichour.ai/developer?tab=api-keys). Use the desktop app's built-in interceptor so the request goes directly to Magic Hour.
3. Add `magic_hour_image_project_id` or `magic_hour_video_project_id` and set it to the ID of an existing project from the same account.
4. Open the matching request and click **Send**. When `status` is `complete`, open a `downloads[].url` link to save the file. Open the signed link directly without adding your API key.

The [image project](https://docs.magichour.ai/api-reference/image-projects/get-image-details) and [video project](https://docs.magichour.ai/api-reference/video-projects/get-video-details) references describe the response fields.

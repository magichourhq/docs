# Recover a Magic Hour image in Apache NiFi

Import the [NiFi 2.12 flow](./magic-hour-image-recovery.json) to download one existing Magic Hour image. It uses read-only requests and spends no credits. All five processors start disabled.

1. Add a process group to your private NiFi canvas and choose **Upload flow definition**. Select the JSON file.
2. Replace `YOUR_IMAGE_PROJECT_ID` in **Get completed Magic Hour image project → HTTP URL** and in the **approved** property on **Allow only the completed project and Magic Hour media host**. Use the same completed, single-image project ID in both places.
3. In **Get completed Magic Hour image project**, set the sensitive dynamic `Authorization` property to `Bearer YOUR_MAGIC_HOUR_API_KEY`. Use a [Magic Hour API key](https://magichour.ai/developer?tab=api-keys) from the account that owns the project.
4. In **Save the image privately**, set **Directory** to a private folder the NiFi service can write to. Use an empty destination when checking the flow.
5. Enable each processor and use **Run Once** in order from **Get completed Magic Hour image project** to **Save the image privately**. Open the saved file.

The flow checks the project ID and status and only downloads from `videos.magichour.ai`. The download processor sends no API key. Keep your project IDs and signed download links private.

See the [Magic Hour image project API](https://docs.magichour.ai/api-reference/image-projects/get-image-details) and [NiFi InvokeHTTP](https://nifi.apache.org/components/org.apache.nifi.processors.standard.InvokeHTTP/).

//native

type magic_hour = { api_key: string };

export async function main(
  magic_hour: magic_hour,
  prompt: string = "A studio product photograph of a matte teal ceramic cube beside a copper sphere, soft daylight, no text or logos.",
) {
  let response: Response;
  try {
    response = await fetch("https://api.magichour.ai/v1/ai-image-generator", {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${magic_hour.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_count: 1,
        style: { prompt },
        model: "flux-2-klein",
        resolution: "640px",
        aspect_ratio: "1:1",
      }),
    });
  } catch {
    throw new Error("Creation request failed or timed out. Confirm its status with Magic Hour before resubmitting.");
  }
  if (!response.ok) {
    throw new Error(`Magic Hour creation returned HTTP ${response.status}. No automatic retry was made.`);
  }
  let accepted;
  try {
    accepted = await response.json();
  } catch {
    throw new Error("Creation response could not be read. It may have been accepted. Do not resubmit until Magic Hour confirms its status.");
  }
  if (typeof accepted.id !== "string" || !accepted.id) {
    throw new Error("No accepted project ID was returned. Confirm the request status before resubmitting.");
  }
  return {
    id: accepted.id,
    credits_charged: accepted.credits_charged ?? null,
    ...("credits_refunded" in accepted ? { credits_refunded: accepted.credits_refunded } : {}),
  };
}

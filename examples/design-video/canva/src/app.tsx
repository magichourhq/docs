import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Button,
  FormField,
  TextInput,
  MultilineInput,
  Select,
  Text,
  Title,
  Alert,
} from "@canva/app-ui-kit";
import type { VideoPanel, VideoOptions } from "../../shared/video";
export function App({ panel, openLink }: { panel: VideoPanel; openLink: (url: string) => void }) {
  const s = useSyncExternalStore(panel.subscribe, panel.snapshot);
  const [key, setKey] = useState(""),
    [prompt, setPrompt] = useState(""),
    [duration, setDuration] = useState(5),
    [resolution, setResolution] = useState<VideoOptions["resolution"]>("480p"),
    [ratio, setRatio] = useState<VideoOptions["aspectRatio"]>("16:9"),
    [id, setId] = useState("");
  const [sourceUrl, setSourceUrl] = useState(""),
    [videoUrl, setVideoUrl] = useState("");
  useEffect(() => {
    void panel.init();
    const clear = () => {
      setKey("");
      panel.dispose();
    };
    addEventListener("pagehide", clear);
    return () => removeEventListener("pagehide", clear);
  }, [panel]);
  useEffect(() => {
    setId(s.savedId);
  }, [s.savedId]);
  useEffect(() => {
    const url = s.source ? URL.createObjectURL(s.source.blob) : "";
    setSourceUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [s.source]);
  useEffect(() => {
    const url = s.result ? URL.createObjectURL(s.result.blob) : "";
    setVideoUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [s.result]);
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <Title size="medium">Magic Hour</Title>
      <Text>Animate an image or start from a creative brief.</Text>
      <FormField
        label="Magic Hour API key"
        control={(props) => (
          <input
            id={props.id}
            aria-label="Magic Hour API key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={{ width: "100%", padding: 12, border: "1px solid #888", borderRadius: 4 }}
          />
        )}
      />
      <Text size="small">
        Your key stays in this session. Generations use your Magic Hour API credits.
      </Text>
      <Button variant="secondary" disabled={s.busy} onClick={() => void panel.capture()}>
        Use selected image
      </Button>
      <Text size="small">
        Canva provides the full original image, including areas outside the visible crop.
      </Text>
      <label style={{ display: "grid", gap: 8 }}>
        Or upload an image
        <input
          aria-label="Upload image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={s.busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void panel.selectFile(file);
          }}
        />
      </label>
      {sourceUrl && (
        <>
          <img
            alt="Starting image"
            src={sourceUrl}
            style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain" }}
          />
          <Text size="small">{s.source?.label}</Text>
          <Button variant="tertiary" disabled={s.busy} onClick={() => panel.removeImage()}>
            Remove image
          </Button>
        </>
      )}
      <FormField
        label="Motion or creative brief"
        control={(props) => (
          <MultilineInput
            {...props}
            value={prompt}
            onChange={setPrompt}
            maxLength={2000}
            disabled={s.busy}
            placeholder="A gentle camera push in. Keep the product steady."
          />
        )}
      />
      <FormField
        label="Duration"
        control={(props) => (
          <Select
            {...props}
            value={duration}
            onChange={setDuration}
            disabled={s.busy}
            options={[1, 3, 5, 10].map((value) => ({
              value,
              label: `${value} second${value === 1 ? "" : "s"}`,
            }))}
          />
        )}
      />
      <FormField
        label="Resolution"
        control={(props) => (
          <Select
            {...props}
            value={resolution}
            onChange={setResolution}
            disabled={s.busy}
            options={[
              { value: "480p", label: "480p" },
              { value: "720p", label: "720p" },
            ]}
          />
        )}
      />
      {!s.source && (
        <FormField
          label="Aspect ratio"
          control={(props) => (
            <Select
              {...props}
              value={ratio}
              onChange={setRatio}
              disabled={s.busy}
              options={[
                { value: "16:9", label: "Landscape · 16:9" },
                { value: "1:1", label: "Square · 1:1" },
                { value: "9:16", label: "Portrait · 9:16" },
              ]}
            />
          )}
        />
      )}
      <Text size="small">
        LTX 2.5 · muted video. Image inputs keep their original aspect ratio.
      </Text>
      <Button
        variant="primary"
        disabled={!s.ready || s.busy || !!s.savedId}
        onClick={() =>
          void panel.generate(key, { prompt, duration, resolution, aspectRatio: ratio })
        }
      >
        Generate video
      </Button>
      {s.busy && (
        <Button variant="secondary" onClick={() => panel.stop()}>
          Stop waiting
        </Button>
      )}
      <div role="status" aria-live="polite">
        <Alert tone={s.error ? "critical" : "info"}>{s.message}</Alert>
      </div>
      {videoUrl && (
        <>
          <video
            src={videoUrl}
            controls
            muted
            loop
            playsInline
            style={{ width: "100%", maxHeight: 300 }}
          />
          <Button variant="primary" disabled={s.busy} onClick={() => void panel.insert(key)}>
            Add video to design
          </Button>
        </>
      )}
      <FormField
        label="Video project ID"
        control={(props) => <TextInput {...props} value={id} onChange={setId} disabled={s.busy} />}
      />
      <Button
        variant="secondary"
        disabled={s.busy || !id}
        onClick={() => void panel.resume(key, id.trim())}
      >
        Resume generation
      </Button>
      <Text size="small">
        Resume retrieves an existing project without another generation charge. Stop waiting leaves
        the server job running.
      </Text>
      {s.savedId && (
        <Button variant="tertiary" disabled={s.busy} onClick={() => void panel.reset()}>
          New generation
        </Button>
      )}
      <Button
        variant="tertiary"
        onClick={() =>
          openLink("https://magichour.ai/developer?utm_source=canva&utm_medium=integration")
        }
      >
        Get API key
      </Button>
      <Button variant="tertiary" onClick={() => openLink("https://docs.magichour.ai/pricing")}>
        API pricing
      </Button>
      <Button variant="tertiary" onClick={() => openLink("https://magichour.ai/privacy-policy")}>
        Privacy and support
      </Button>
      <Text size="small">
        Your prompt and chosen image go to Magic Hour. The finished video is copied to your Canva
        media library when you click Add. Support: support@magichour.ai.
      </Text>
    </div>
  );
}

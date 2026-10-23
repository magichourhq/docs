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
import { englishMessage, type MessageFormatter } from "../../../vercel-ai-sdk/src/client";
import type { VideoPanel, VideoOptions } from "../../shared/video";
export function App({
  panel,
  openLink,
  formatMessage = englishMessage,
}: {
  panel: VideoPanel;
  openLink: (url: string) => void;
  formatMessage?: MessageFormatter;
}) {
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
      <Text>
        {formatMessage({
          defaultMessage: "Animate an image or start from a creative brief.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
      <FormField
        label={formatMessage({
          defaultMessage: "Magic Hour API key",
          description: "Label or instruction in the Magic Hour video generation form.",
        })}
        control={(props) => (
          <input
            id={props.id}
            aria-label={formatMessage({
              defaultMessage: "Magic Hour API key",
              description: "Label or instruction in the Magic Hour video generation form.",
            })}
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
        {formatMessage({
          defaultMessage:
            "Your key stays in this session. Generations use your Magic Hour API credits.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
      <Button variant="secondary" disabled={s.busy} onClick={() => void panel.capture()}>
        {formatMessage({
          defaultMessage: "Use selected image",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      <Text size="small">
        {formatMessage({
          defaultMessage:
            "Canva provides the full original image, including areas outside the visible crop.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
      <label style={{ display: "grid", gap: 8 }}>
        {formatMessage({
          defaultMessage: "Or upload an image",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
        <input
          aria-label={formatMessage({
            defaultMessage: "Upload image",
            description: "Label or instruction in the Magic Hour video generation form.",
          })}
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
            alt={formatMessage({
              defaultMessage: "Starting image",
              description: "Label or instruction in the Magic Hour video generation form.",
            })}
            src={sourceUrl}
            style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain" }}
          />
          <Text size="small">{s.source?.label}</Text>
          <Button variant="tertiary" disabled={s.busy} onClick={() => panel.removeImage()}>
            {formatMessage({
              defaultMessage: "Remove image",
              description: "Text or action in the Magic Hour video generation panel.",
            })}
          </Button>
        </>
      )}
      <FormField
        label={formatMessage({
          defaultMessage: "Motion or creative brief",
          description: "Label or instruction in the Magic Hour video generation form.",
        })}
        control={(props) => (
          <MultilineInput
            {...props}
            value={prompt}
            onChange={setPrompt}
            maxLength={2000}
            disabled={s.busy}
            placeholder={formatMessage({
              defaultMessage: "A gentle camera push in. Keep the product steady.",
              description: "Label or instruction in the Magic Hour video generation form.",
            })}
          />
        )}
      />
      <FormField
        label={formatMessage({
          defaultMessage: "Duration",
          description: "Label or instruction in the Magic Hour video generation form.",
        })}
        control={(props) => (
          <Select
            {...props}
            value={duration}
            onChange={setDuration}
            disabled={s.busy}
            options={[
              {
                value: 1,
                label: formatMessage({
                  defaultMessage: "1 second",
                  description: "Video duration option in seconds.",
                }),
              },
              {
                value: 3,
                label: formatMessage({
                  defaultMessage: "3 seconds",
                  description: "Video duration option in seconds.",
                }),
              },
              {
                value: 5,
                label: formatMessage({
                  defaultMessage: "5 seconds",
                  description: "Video duration option in seconds.",
                }),
              },
              {
                value: 10,
                label: formatMessage({
                  defaultMessage: "10 seconds",
                  description: "Video duration option in seconds.",
                }),
              },
            ]}
          />
        )}
      />
      <FormField
        label={formatMessage({
          defaultMessage: "Resolution",
          description: "Label or instruction in the Magic Hour video generation form.",
        })}
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
          label={formatMessage({
            defaultMessage: "Aspect ratio",
            description: "Label or instruction in the Magic Hour video generation form.",
          })}
          control={(props) => (
            <Select
              {...props}
              value={ratio}
              onChange={setRatio}
              disabled={s.busy}
              options={[
                {
                  value: "16:9",
                  label: formatMessage({
                    defaultMessage: "Landscape · 16:9",
                    description: "Video aspect ratio option.",
                  }),
                },
                {
                  value: "1:1",
                  label: formatMessage({
                    defaultMessage: "Square · 1:1",
                    description: "Video aspect ratio option.",
                  }),
                },
                {
                  value: "9:16",
                  label: formatMessage({
                    defaultMessage: "Portrait · 9:16",
                    description: "Video aspect ratio option.",
                  }),
                },
              ]}
            />
          )}
        />
      )}
      <Text size="small">
        {formatMessage({
          defaultMessage: "LTX 2.5 · muted video. Image inputs keep their original aspect ratio.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
      <Button
        variant="primary"
        disabled={!s.ready || s.busy || !!s.savedId}
        onClick={() =>
          void panel.generate(key, { prompt, duration, resolution, aspectRatio: ratio })
        }
      >
        {formatMessage({
          defaultMessage: "Generate video",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      {s.busy && (
        <Button variant="secondary" onClick={() => panel.stop()}>
          {formatMessage({
            defaultMessage: "Stop waiting",
            description: "Text or action in the Magic Hour video generation panel.",
          })}
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
            {formatMessage({
              defaultMessage: "Add video to design",
              description: "Text or action in the Magic Hour video generation panel.",
            })}
          </Button>
        </>
      )}
      <FormField
        label={formatMessage({
          defaultMessage: "Video project ID",
          description: "Label or instruction in the Magic Hour video generation form.",
        })}
        control={(props) => <TextInput {...props} value={id} onChange={setId} disabled={s.busy} />}
      />
      <Button
        variant="secondary"
        disabled={s.busy || !id}
        onClick={() => void panel.resume(key, id.trim())}
      >
        {formatMessage({
          defaultMessage: "Resume generation",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      <Text size="small">
        {formatMessage({
          defaultMessage:
            "Resume retrieves an existing project without another generation charge. Stop waiting leaves the server job running.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
      {s.savedId && (
        <Button variant="tertiary" disabled={s.busy} onClick={() => void panel.reset()}>
          {formatMessage({
            defaultMessage: "New generation",
            description: "Text or action in the Magic Hour video generation panel.",
          })}
        </Button>
      )}
      <Button
        variant="tertiary"
        onClick={() =>
          openLink("https://magichour.ai/developer?utm_source=canva&utm_medium=integration")
        }
      >
        {formatMessage({
          defaultMessage: "Get API key",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      <Button variant="tertiary" onClick={() => openLink("https://docs.magichour.ai/pricing")}>
        {formatMessage({
          defaultMessage: "API pricing",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      <Button variant="tertiary" onClick={() => openLink("https://magichour.ai/privacy-policy")}>
        {formatMessage({
          defaultMessage: "Privacy and support",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Button>
      <Text size="small">
        {formatMessage({
          defaultMessage:
            "Your prompt and chosen image go to Magic Hour. The finished video and its preview image are copied to your Canva media library when you click Add. Support: support@magichour.ai.",
          description: "Text or action in the Magic Hour video generation panel.",
        })}
      </Text>
    </div>
  );
}

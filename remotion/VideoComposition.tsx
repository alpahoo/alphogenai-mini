import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";

interface SubtitleSegment {
  index: number;
  start: number;
  end: number;
  text: string;
}

interface VideoCompositionProps {
  clips: { video_url: string; duration?: number }[];
  audioUrl: string;
  srt?: string;
  logoUrl?: string;
}

// Parse SRT content
function parseSRT(srt: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = srt.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );

    if (!timeMatch) continue;

    const start =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const end =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const text = lines.slice(2).join(" ");

    segments.push({ index, start, end, text });
  }

  return segments;
}

// Subtitle component
const Subtitles: React.FC<{ srt: string; fps: number }> = ({ srt, fps }) => {
  const frame = useCurrentFrame();
  const currentTime = frame / fps;
  const segments = parseSRT(srt);

  const currentSubtitle = segments.find(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  if (!currentSubtitle) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 100,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          padding: "12px 24px",
          borderRadius: 8,
          maxWidth: "80%",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 42,
            fontWeight: 600,
            color: "white",
            textAlign: "center",
            lineHeight: 1.3,
            fontFamily: "Arial, sans-serif",
          }}
        >
          {currentSubtitle.text}
        </p>
      </div>
    </div>
  );
};

// Fade transition component
const FadeTransition: React.FC<{ children: React.ReactNode; durationInFrames: number }> = ({
  children,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const fadeDuration = 10; // 10 frames pour le fade

  // Fade in au début
  const fadeIn = interpolate(frame, [0, fadeDuration], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out à la fin
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fadeDuration, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return <div style={{ opacity, width: "100%", height: "100%" }}>{children}</div>;
};

// Main composition
export default function VideoComposition({
  clips,
  audioUrl,
  srt,
  logoUrl,
}: VideoCompositionProps): JSX.Element {
  const { fps } = useVideoConfig();

  let currentFrame = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Clips vidéo avec fondus */}
      {clips.map((clip, index) => {
        const durationInFrames = Math.round((clip.duration || 6) * fps);
        const from = currentFrame;
        currentFrame += durationInFrames;

        return (
          <Sequence key={index} from={from} durationInFrames={durationInFrames}>
            <FadeTransition durationInFrames={durationInFrames}>
              <Video
                src={clip.video_url}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </FadeTransition>
          </Sequence>
        );
      })}

      {/* Audio */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* Sous-titres */}
      {srt && <Subtitles srt={srt} fps={fps} />}

      {/* Logo watermark */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Logo"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 120,
            height: "auto",
            opacity: 0.7,
            zIndex: 20,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

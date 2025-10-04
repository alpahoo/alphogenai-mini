import { Audio, Composition, Sequence, Video, staticFile } from "remotion";

export type InputProps = {
  clips: { url: string; durationSec: number }[];
  audioUrl: string;
  srt?: string;
  logoUrl?: string;
  fps?: number;
  width?: number;
  height?: number;
  stretchTo?: number;
};

export const VideoComposition: React.FC<InputProps> = ({
  clips,
  audioUrl,
  srt,
  logoUrl,
  fps = 30,
  width = 1080,
  height = 1920,
  stretchTo = 12,
}) => {
  const totalDuration = clips.reduce(
    (acc, c) => acc + Math.round((stretchTo || c.durationSec) * fps),
    0
  );

  let start = 0;
  return (
    <div style={{ flex: 1, backgroundColor: "black" }}>
      {clips.map((clip, i) => {
        const durationFrames = Math.round((stretchTo || clip.durationSec) * fps);
        const seq = (
          <Sequence key={i} from={start} durationInFrames={durationFrames}>
            <Video src={clip.url} />
          </Sequence>
        );
        start += durationFrames;
        return seq;
      })}
      <Audio src={audioUrl} />
      {logoUrl && (
        <img
          src={logoUrl}
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 120,
            opacity: 0.7,
          }}
        />
      )}
    </div>
  );
};

export const AGM_Video = () => (
  <Composition
    id="AGM_Video"
    component={VideoComposition}
    durationInFrames={30 * 48}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      clips: [],
      audioUrl: "",
    }}
  />
);
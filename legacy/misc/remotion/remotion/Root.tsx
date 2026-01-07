import { Composition } from "remotion";
import VideoComposition from "./VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        durationInFrames={30 * 24} // 24 secondes par défaut (4 clips × 6s)
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          clips: [],
          audioUrl: "",
          srt: undefined,
          logoUrl: undefined,
        }}
      />
    </>
  );
};
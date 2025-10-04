import { Composition } from "remotion";
import { VideoComposition, InputProps } from "./VideoComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition<InputProps>
        id="AGM_Video"
        component={VideoComposition}
        durationInFrames={30 * 48}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [],
          audioUrl: "",
          fps: 30,
          width: 1080,
          height: 1920,
        }}
      />
    </>
  );
};
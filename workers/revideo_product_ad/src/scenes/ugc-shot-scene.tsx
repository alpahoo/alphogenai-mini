import { Audio, Rect, Txt, Video, makeScene2D } from "@revideo/2d";
import { useScene, waitFor } from "@revideo/core";
import { DEFAULT_MANIFEST, type UGCEditManifest } from "../manifest";

export function makeUGCShotScene(index: 0 | 1 | 2) {
  return makeScene2D(`ugc-shot-${index + 1}`, function* (view) {
    const manifest = useScene().variables.get<UGCEditManifest>(
      "manifest",
      DEFAULT_MANIFEST
    )();
    const shot = manifest.shots[index];
    const audioOffset = manifest.shots
      .slice(0, index)
      .reduce((sum, item) => sum + item.durationSeconds, 0);

    view.add(
      <Rect width={1080} height={1920} fill="#090b10">
        <Video
          src={shot.videoUrl}
          width={1080}
          height={1920}
          play
          decoder="ffmpeg"
        />
        <Rect
          y={650}
          width={1080}
          height={620}
          fill="rgba(3, 7, 18, 0.56)"
        />
        <Txt
          x={-390}
          y={-835}
          width={220}
          text={manifest.brand ?? "AlphoGen"}
          fill="#ffffff"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight={800}
          fontSize={34}
          textAlign="left"
        />
        {shot.eyebrow ? (
          <Txt
            x={-370}
            y={565}
            width={260}
            text={shot.eyebrow}
            fill={manifest.accentColor ?? "#36d399"}
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={800}
            fontSize={26}
            textAlign="left"
          />
        ) : null}
        {shot.headline ? (
          <Txt
            y={685}
            width={900}
            text={shot.headline}
            fill="#ffffff"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={800}
            fontSize={66}
            lineHeight={78}
            textAlign="center"
            textWrap
          />
        ) : null}
        {shot.cta ? (
          <Rect
            y={840}
            width={330}
            height={92}
            radius={10}
            fill={manifest.accentColor ?? "#36d399"}
          >
            <Txt
              text={shot.cta}
              fill="#07110c"
              fontFamily="Inter, Arial, sans-serif"
              fontWeight={900}
              fontSize={34}
            />
          </Rect>
        ) : null}
        {manifest.voiceoverUrl ? (
          <Audio src={manifest.voiceoverUrl} time={audioOffset} play />
        ) : null}
      </Rect>
    );

    yield* waitFor(shot.durationSeconds);
  });
}

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
          y={760}
          width={1080}
          height={400}
          fill="rgba(3, 7, 18, 0.72)"
        />
        <Rect
          x={-390}
          y={-825}
          width={220}
          height={58}
          radius={8}
          fill="rgba(3, 7, 18, 0.68)"
        >
          <Txt
            text={manifest.brand ?? "AlphoGen"}
            fill="#ffffff"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={800}
            fontSize={28}
          />
        </Rect>
        {shot.eyebrow ? (
          <Txt
            x={-350}
            y={630}
            width={320}
            text={shot.eyebrow}
            fill={manifest.accentColor ?? "#36d399"}
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={800}
            fontSize={24}
            textAlign="left"
          />
        ) : null}
        {shot.caption || shot.headline ? (
          <Txt
            y={720}
            width={860}
            text={shot.caption ?? shot.headline}
            fill="#ffffff"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={700}
            fontSize={44}
            lineHeight={52}
            textAlign="center"
            textWrap
          />
        ) : null}
        {shot.cta ? (
          <Rect
            y={880}
            width={300}
            height={72}
            radius={10}
            fill={manifest.accentColor ?? "#36d399"}
          >
            <Txt
              text={shot.cta}
              fill="#07110c"
              fontFamily="Inter, Arial, sans-serif"
              fontWeight={900}
              fontSize={30}
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

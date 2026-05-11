import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph image for the root site.
 *
 * Renders a 1200×630 branded card matching the homepage hero language:
 * dark background, two soft gradient orbs, AlphoGen wordmark with the
 * accent gradient on the tagline keyword. Generated at build/edge time
 * via Satori — no static PNG to maintain.
 *
 * Twitter cards fall back to this image automatically because we don't
 * ship a separate twitter-image.* file.
 *
 * If you need per-route OG images later (e.g. /technology with a
 * different headline), drop another opengraph-image.tsx into that
 * route segment — Next.js will route each request to the closest one.
 */
export const runtime = "edge";

export const alt = "AlphoGen — AI Video Generation Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#08080c",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "80px",
        }}
      >
        {/* Background gradient orbs — Satori supports radial-gradient */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "-120px",
            width: "640px",
            height: "640px",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-160px",
            right: "-160px",
            width: "720px",
            height: "720px",
            background:
              "radial-gradient(circle, rgba(168,85,247,0.32) 0%, rgba(168,85,247,0) 70%)",
            display: "flex",
          }}
        />

        {/* Logo + brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginBottom: 60,
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              background: "rgba(99, 102, 241, 0.18)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 46,
              color: "#a5b4fc",
              lineHeight: 1,
            }}
          >
            ✦
          </div>
          <div
            style={{
              fontSize: 60,
              fontWeight: 800,
              color: "white",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            AlphoGen
          </div>
        </div>

        {/* Headline with gradient accent on key word */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 18,
            fontSize: 88,
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            letterSpacing: -3,
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          <span>Text to Video,</span>
          <span
            style={{
              background:
                "linear-gradient(90deg, #818cf8 0%, #c084fc 50%, #e879f9 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Instantly
          </span>
        </div>

        {/* Subhead */}
        <div
          style={{
            marginTop: 36,
            fontSize: 30,
            color: "rgba(255,255,255,0.65)",
            textAlign: "center",
            maxWidth: 880,
            lineHeight: 1.35,
            zIndex: 1,
          }}
        >
          AI video generation for creators, marketers, and content teams
        </div>

        {/* Bottom URL chip */}
        <div
          style={{
            position: "absolute",
            bottom: 44,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 18px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 999,
            fontSize: 22,
            color: "rgba(255,255,255,0.7)",
            zIndex: 1,
          }}
        >
          alphogen.com
        </div>
      </div>
    ),
    { ...size },
  );
}

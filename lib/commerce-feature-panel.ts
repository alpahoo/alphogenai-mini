import path from "path";

function escapeMarkup(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character]!);
}

export async function addFeaturePanel(buffer: Buffer, productName: string, features: string[]) {
  const sharp = (await import("sharp")).default;
  const fontfile = path.join(process.cwd(), "public", "fonts", "noto-sans-latin-regular.ttf");
  const panel = Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="690" width="944" height="294" rx="18" fill="#ffffff" fill-opacity="0.96"/>
  </svg>`);
  const overlays: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [
    { input: panel },
    {
      input: {
        text: {
          text: `<span foreground="#2563eb" weight="700">${escapeMarkup(productName.toUpperCase())}</span>`,
          font: "Noto Sans",
          fontfile,
          width: 840,
          height: 34,
          rgba: true,
        },
      },
      left: 90,
      top: 712,
    },
  ];

  features.slice(0, 3).forEach((feature, index) => {
    const top = 770 + index * 66;
    overlays.push(
      {
        input: Buffer.from(`<svg width="34" height="34" xmlns="http://www.w3.org/2000/svg">
          <circle cx="17" cy="17" r="15" fill="#2563eb"/>
          <path d="M9 17l6 6 11-13" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`),
        left: 85,
        top,
      },
      {
        input: {
          text: {
            text: `<span foreground="#19202a" weight="600">${escapeMarkup(feature)}</span>`,
            font: "Noto Sans",
            fontfile,
            width: 800,
            height: 42,
            rgba: true,
          },
        },
        left: 134,
        top: top - 4,
      },
    );
  });

  return sharp(buffer).resize(1024, 1024, { fit: "cover" }).composite(overlays).jpeg({ quality: 92 }).toBuffer();
}

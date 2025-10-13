import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { videoIdOrUrl, title, description, tags, privacy } = body;

    if (!videoIdOrUrl || !title) {
      return NextResponse.json(
        { error: "videoIdOrUrl and title are required" },
        { status: 400 }
      );
    }

    console.log("[YouTube Publish] Request received:", {
      videoIdOrUrl,
      title,
      description: description?.substring(0, 50),
      tags,
      privacy,
    });

    return NextResponse.json({
      success: true,
      message: "YouTube publishing is not yet implemented. This is a stub endpoint.",
      videoIdOrUrl,
      title,
      privacy: privacy || "private",
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

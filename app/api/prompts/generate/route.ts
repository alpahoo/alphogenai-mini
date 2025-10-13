import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userInput, style, tone } = body;

    if (!userInput || userInput.length < 3) {
      return NextResponse.json(
        { error: "userInput is required (min 3 chars)" },
        { status: 400 }
      );
    }

    const enhancedPrompt = `${userInput}${style ? `, ${style} style` : ""}${tone ? `, ${tone} tone` : ""}`;

    return NextResponse.json({
      success: true,
      prompt: enhancedPrompt,
      original: userInput,
      style: style || "default",
      tone: tone || "neutral",
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

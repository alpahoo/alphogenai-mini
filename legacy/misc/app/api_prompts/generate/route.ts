import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { task, user_input, style, duration, model } = body;

    if (!user_input || user_input.length < 3) {
      return NextResponse.json(
        { error: "user_input is required (min 3 chars)" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const contextParts = [];
    if (task) contextParts.push(`Task: ${task}`);
    if (style) contextParts.push(`Style: ${style}`);
    if (duration) contextParts.push(`Duration: ${duration}s`);
    const context = contextParts.length > 0 ? contextParts.join(", ") + "\n\n" : "";

    const completion = await openai.chat.completions.create({
      model: model || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a prompt engineer specialized in SVI (Stable Video Infinity). Produce vivid, concrete prompts for video generation. Respond in JSON format with two fields: 'prompt' (the enhanced video generation prompt) and 'hints' (array of helpful tips for the user)."
        },
        {
          role: "user",
          content: `${context}User input: ${user_input}\n\nGenerate an enhanced SVI video prompt and helpful hints.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(responseText);
    
    return NextResponse.json({
      prompt: parsed.prompt || user_input,
      negative_prompt: parsed.negative_prompt || "",
      hints: parsed.hints || [],
    });
  } catch (e: unknown) {
    console.error("OpenAI prompt generation error:", e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

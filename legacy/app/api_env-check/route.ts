import { NextResponse } from "next/server";

export async function GET() {
  const envVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing',
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE ? '✓ Set' : '✗ Missing',
    QWEN_API_KEY: process.env.QWEN_API_KEY ? '✓ Set' : '✗ Missing',
    WAN_IMAGE_API_KEY: process.env.WAN_IMAGE_API_KEY ? '✓ Set' : '✗ Missing',
    PIKA_API_KEY: process.env.PIKA_API_KEY ? '✓ Set' : '✗ Missing',
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ? '✓ Set' : '✗ Missing',
    REMOTION_RENDERER_URL: process.env.REMOTION_RENDERER_URL ? '✓ Set' : '✗ Missing',
  };

  const allSet = Object.values(envVars).every(v => v === '✓ Set');

  return NextResponse.json({
    status: allSet ? 'OK' : 'MISSING_VARS',
    message: allSet 
      ? 'All environment variables are properly configured!' 
      : 'Some environment variables are missing',
    variables: envVars,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Email service using Resend.
 *
 * Notifies users when video generation completes (success or failure).
 * Respects user preferences (email_notifications column on profiles).
 */
import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  _resend = new Resend(apiKey);
  return _resend;
}

const FROM = process.env.RESEND_FROM_EMAIL || "AlphoGenAI <noreply@alphogenai.com>";
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nextjs-with-supabase-l5zv.vercel.app";

export interface JobNotification {
  to: string;
  jobId: string;
  prompt: string;
  videoUrl?: string | null;
  errorMessage?: string | null;
}

/**
 * Send "video ready" email when job completes successfully.
 */
export async function sendVideoReadyEmail(notification: JobNotification): Promise<void> {
  const { to, jobId, prompt, videoUrl } = notification;
  const jobLink = `${APP_URL}/jobs/${jobId}`;
  const promptShort = prompt.length > 100 ? prompt.slice(0, 100) + "..." : prompt;

  const html = renderVideoReadyHtml({ jobLink, videoUrl: videoUrl ?? "", promptShort });

  await getResend().emails.send({
    from: FROM,
    to,
    subject: "🎬 Your video is ready!",
    html,
  });
}

/**
 * Send "video failed" email when job fails.
 */
export async function sendVideoFailedEmail(notification: JobNotification): Promise<void> {
  const { to, jobId, prompt, errorMessage } = notification;
  const jobLink = `${APP_URL}/jobs/${jobId}`;
  const promptShort = prompt.length > 100 ? prompt.slice(0, 100) + "..." : prompt;

  const html = renderVideoFailedHtml({
    jobLink,
    promptShort,
    errorMessage: errorMessage || "An unknown error occurred",
  });

  await getResend().emails.send({
    from: FROM,
    to,
    subject: "❌ Video generation failed",
    html,
  });
}

// ----------------------------------------------------------------------------
// HTML templates (inline for simplicity — could move to react-email later)
// ----------------------------------------------------------------------------

function renderVideoReadyHtml({
  jobLink,
  videoUrl,
  promptShort,
}: {
  jobLink: string;
  videoUrl: string;
  promptShort: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;background:#141414;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 16px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;color:white;">✨ AlphoGenAI</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;">🎬 Your video is ready!</h1>
              <p style="margin:0;color:#a0a0a0;font-size:14px;line-height:1.5;">
                We've finished generating your video. Click below to view and download it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="background:#1c1c1c;border:1px solid #2a2a2a;border-radius:12px;padding:16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Prompt</p>
                <p style="margin:0;color:#d0d0d0;font-size:13px;line-height:1.5;">${escapeHtml(promptShort)}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;" align="center">
              <a href="${jobLink}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">View your video →</a>
            </td>
          </tr>
          ${
            videoUrl
              ? `<tr><td style="padding:0 32px 32px;text-align:center;">
              <a href="${videoUrl}" style="color:#8b5cf6;font-size:12px;text-decoration:none;">Or download directly ↓</a>
            </td></tr>`
              : ""
          }
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #2a2a2a;text-align:center;">
              <p style="margin:0;color:#666;font-size:11px;">
                You're receiving this because you generated a video on AlphoGenAI.<br>
                <a href="${APP_URL}/account/settings" style="color:#888;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function renderVideoFailedHtml({
  jobLink,
  promptShort,
  errorMessage,
}: {
  jobLink: string;
  promptShort: string;
  errorMessage: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;background:#141414;border-radius:16px;border:1px solid #2a2a2a;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 16px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;color:white;">✨ AlphoGenAI</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;">❌ Video generation failed</h1>
              <p style="margin:0;color:#a0a0a0;font-size:14px;line-height:1.5;">
                Sorry, we couldn't complete your video. You can try again anytime.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <div style="background:#1c1c1c;border:1px solid #2a2a2a;border-radius:12px;padding:16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Prompt</p>
                <p style="margin:0 0 12px;color:#d0d0d0;font-size:13px;line-height:1.5;">${escapeHtml(promptShort)}</p>
                <p style="margin:0 0 4px;font-size:11px;color:#dc2626;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Error</p>
                <p style="margin:0;color:#fca5a5;font-size:12px;line-height:1.5;font-family:monospace;">${escapeHtml(errorMessage)}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;" align="center">
              <a href="${APP_URL}/create" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Try again →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #2a2a2a;text-align:center;">
              <p style="margin:0;color:#666;font-size:11px;">
                You're receiving this because you generated a video on AlphoGenAI.<br>
                <a href="${APP_URL}/account/settings" style="color:#888;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

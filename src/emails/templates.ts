/**
 * Transactional email templates. Plain HTML strings so they render everywhere
 * (Gmail strips <style>, so critical styles are inlined) with no runtime deps.
 * A `text` fallback is provided for every template for deliverability.
 */

type Rendered = { subject: string; html: string; text: string };

const BRAND = "Commerce";
const ACCENT = "#4f46e5";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:${ACCENT};padding:20px 32px;color:#fff;font-size:18px;font-weight:600;">${BRAND}</td></tr>
        <tr><td style="padding:32px;color:#18181b;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;color:#71717a;font-size:12px;">
          You received this email because an action was requested for your ${BRAND} account. If this wasn't you, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">${label}</a>`;
}

export function verificationEmail({ link }: { link: string }): Rendered {
  return {
    subject: `Verify your ${BRAND} email`,
    html: layout(
      "Confirm your email address",
      `<p>Thanks for signing up. Please confirm your email address to activate your account.</p>
       <p style="margin:24px 0;">${button(link, "Verify email")}</p>
       <p style="color:#71717a;font-size:13px;">Or paste this link into your browser:<br/><a href="${link}" style="color:${ACCENT};word-break:break-all;">${link}</a></p>
       <p style="color:#71717a;font-size:13px;">This link expires in 24 hours.</p>`,
    ),
    text: `Confirm your email address for ${BRAND}: ${link} (expires in 24 hours)`,
  };
}

export function otpEmail({ code }: { code: string }): Rendered {
  return {
    subject: `Your ${BRAND} verification code`,
    html: layout(
      "Your one-time code",
      `<p>Use the code below to continue signing in. It expires in 10 minutes.</p>
       <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;">${code}</p>
       <p style="color:#71717a;font-size:13px;">Never share this code with anyone.</p>`,
    ),
    text: `Your ${BRAND} verification code is ${code}. It expires in 10 minutes.`,
  };
}

export function passwordResetEmail({ link }: { link: string }): Rendered {
  return {
    subject: `Reset your ${BRAND} password`,
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password. Click below to choose a new one.</p>
       <p style="margin:24px 0;">${button(link, "Reset password")}</p>
       <p style="color:#71717a;font-size:13px;">Or paste this link into your browser:<br/><a href="${link}" style="color:${ACCENT};word-break:break-all;">${link}</a></p>
       <p style="color:#71717a;font-size:13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
    ),
    text: `Reset your ${BRAND} password: ${link} (expires in 1 hour)`,
  };
}

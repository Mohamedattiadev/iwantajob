import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendAPI } from "resend";

function generateOTP(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

// Plain-text OTP email. The FINENTIAL version used @react-email/render with
// a branded template; we keep this minimal here (no extra deps) and can
// upgrade to a React Email template later if richer styling is wanted.
function plainHtml(brand: string, code: string, expiresInMin: number, kind: "verify" | "reset"): string {
  const heading =
    kind === "verify" ? "Verify your email" : "Reset your password";
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#fafafa;padding:32px;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:13px;letter-spacing:0.08em;color:#a3a8af;text-transform:uppercase;margin-bottom:24px;">${brand}</div>
    <h1 style="font-size:24px;font-weight:500;margin:0 0 12px;">${heading}</h1>
    <p style="font-size:14px;color:#a3a8af;line-height:1.6;margin:0 0 24px;">Type this code in the app to continue.</p>
    <div style="font-family:ui-monospace,'JetBrains Mono',Menlo,monospace;font-size:28px;letter-spacing:0.16em;background:#111;border:1px solid #222;border-radius:10px;padding:20px;text-align:center;">${code}</div>
    <p style="font-size:12px;color:#5e636b;margin-top:20px;">Expires in ${expiresInMin} minutes. If you didn't request this, ignore this email.</p>
  </div>
</body></html>`;
}

export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, provider, token, expires }) {
    const apiKey = provider.apiKey ?? process.env.AUTH_RESEND_KEY;
    if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");
    const from =
      process.env.AUTH_EMAIL_FROM ?? "IWANTAJOB <noreply@iwantajob.app>";

    const expiresInMin = Math.max(
      1,
      Math.round((expires.getTime() - Date.now()) / 60000),
    );
    const html = plainHtml("W/ORK", token, expiresInMin, "verify");

    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Your W/ORK code: ${token}`,
      html,
      text: `Your W/ORK verification code is ${token}. It expires in ${expiresInMin} minutes.`,
    });
    if (error) throw new Error(JSON.stringify(error));
  },
});

export const ResendOTPPasswordReset = Email({
  id: "resend-otp-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP();
  },
  async sendVerificationRequest({ identifier: email, provider, token, expires }) {
    const apiKey = provider.apiKey ?? process.env.AUTH_RESEND_KEY;
    if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");
    const from =
      process.env.AUTH_EMAIL_FROM ?? "IWANTAJOB <noreply@iwantajob.app>";

    const expiresInMin = Math.max(
      1,
      Math.round((expires.getTime() - Date.now()) / 60000),
    );
    const html = plainHtml("W/ORK", token, expiresInMin, "reset");

    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Reset your W/ORK password: ${token}`,
      html,
      text: `Your W/ORK password reset code is ${token}. It expires in ${expiresInMin} minutes.`,
    });
    if (error) throw new Error(JSON.stringify(error));
  },
});

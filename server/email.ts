import { Resend } from "resend";

const FROM_EMAIL = "BMV.parts <noreply@email.bmv.parts>";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  return new Resend(key);
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[Email] Send error:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Sent "${options.subject}" to ${options.to} (id: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Email] Exception:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, username: string): Promise<{ success: boolean; id?: string; error?: string }> {
  return sendEmail({
    to,
    subject: "BMV.parts - Reset your password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #1a73e8;">
          <h1 style="margin: 0; color: #1a73e8; font-size: 24px;">BMV.parts</h1>
        </div>
        <div style="padding: 30px 0;">
          <h2 style="color: #333; margin-top: 0;">Reset your password</h2>
          <p style="color: #555; line-height: 1.6;">
            Hi ${username}, we received a request to reset the password on your BMV.parts account.
            Click the button below to choose a new password. This link is valid for 1 hour and can only be used once.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #1a73e8; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Reset password</a>
          </div>
          <p style="color: #777; font-size: 13px; line-height: 1.5;">
            If the button does not work, paste this link into your browser:<br>
            <span style="word-break: break-all; color: #1a73e8;">${resetUrl}</span>
          </p>
          <p style="color: #777; font-size: 13px; line-height: 1.5;">
            If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">BMW Parts Catalog &bull; bmv.parts</p>
        </div>
      </div>
    `,
    text: `Reset your BMV.parts password\n\nHi ${username},\n\nWe received a request to reset the password on your BMV.parts account. Use the link below to choose a new password. The link is valid for 1 hour and can only be used once.\n\n${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.`,
  });
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; id?: string; error?: string }> {
  return sendEmail({
    to,
    subject: "BMV.parts - Test Email",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #1a73e8;">
          <h1 style="margin: 0; color: #1a73e8; font-size: 24px;">BMV.parts</h1>
        </div>
        <div style="padding: 30px 0;">
          <h2 style="color: #333; margin-top: 0;">Email Configuration Verified</h2>
          <p style="color: #555; line-height: 1.6;">
            This is a test email from BMV.parts confirming that the Resend email service is properly configured and working.
          </p>
          <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #1a73e8; font-weight: 600;">All systems operational</p>
            <p style="margin: 4px 0 0 0; color: #666; font-size: 14px;">Sent at ${new Date().toISOString()}</p>
          </div>
        </div>
        <div style="border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0;">BMW Parts Catalog &bull; bmv.parts</p>
        </div>
      </div>
    `,
    text: `BMV.parts - Email Configuration Verified\n\nThis is a test email confirming that the Resend email service is properly configured.\n\nSent at ${new Date().toISOString()}`,
  });
}

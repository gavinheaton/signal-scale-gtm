import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL = "admin@signal2scale.com.au";
const SENDER_NAME = "Signal + Scale";

interface AuthEmailPayload {
  user: {
    email: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    confirmation_url?: string;
    email_action_type: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

function getEmailContent(
  emailType: string,
  data: AuthEmailPayload["email_data"],
  userEmail: string
): { subject: string; html: string; text: string } {
  const confirmationUrl = data.confirmation_url || "";

  const baseStyles = `
    font-family: 'Poppins', Arial, sans-serif;
    background-color: #f8f8fc;
    padding: 40px 0;
  `;

  const cardStyles = `
    background-color: #ffffff;
    max-width: 560px;
    margin: 0 auto;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(15, 40, 76, 0.08);
  `;

  const headerStyles = `
    background-color: #0f284c;
    padding: 32px 40px;
    text-align: center;
  `;

  const bodyStyles = `
    padding: 40px;
  `;

  const buttonStyles = `
    display: inline-block;
    background-color: #8833ff;
    color: #ffffff;
    padding: 14px 32px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 16px;
    margin: 24px 0;
  `;

  const footerStyles = `
    padding: 24px 40px;
    text-align: center;
    color: #888888;
    font-size: 12px;
    border-top: 1px solid #eee;
  `;

  const wrap = (subject: string, heading: string, body: string, buttonText: string, buttonUrl: string, plainText: string) => ({
    subject,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="${baseStyles}">
  <div style="${cardStyles}">
    <div style="${headerStyles}">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-family: 'Poppins', Arial, sans-serif;">Signal + Scale</h1>
      <p style="color: #e33e23; margin: 8px 0 0; font-size: 14px; font-family: 'Poppins', Arial, sans-serif;">AI-Powered GTM Platform</p>
    </div>
    <div style="${bodyStyles}">
      <h2 style="color: #0f284c; font-size: 22px; margin: 0 0 16px; font-family: 'Poppins', Arial, sans-serif;">${heading}</h2>
      <p style="color: #555555; font-size: 15px; line-height: 1.6; font-family: 'Poppins', Arial, sans-serif;">${body}</p>
      ${buttonUrl ? `<div style="text-align: center;"><a href="${buttonUrl}" style="${buttonStyles}">${buttonText}</a></div>` : `<div style="text-align: center; margin: 24px 0;"><div style="background-color: #f0f0f5; border-radius: 8px; padding: 16px; display: inline-block;"><span style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f284c; font-family: 'Poppins', monospace;">${buttonText}</span></div></div>`}
      <p style="color: #999999; font-size: 13px; line-height: 1.5; font-family: 'Poppins', Arial, sans-serif;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div style="${footerStyles}">
      <p style="margin: 0; font-family: 'Poppins', Arial, sans-serif;">&copy; ${new Date().getFullYear()} Signal + Scale. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
    text: plainText,
  });

  switch (emailType) {
    case "signup":
      return wrap(
        "Confirm your email — Signal + Scale",
        "Welcome aboard! 🚀",
        "Thanks for signing up for Signal + Scale. Please confirm your email to get started.",
        "Confirm Email",
        confirmationUrl,
        `Welcome to Signal + Scale! Confirm your email: ${confirmationUrl}`
      );

    case "magiclink":
      return wrap(
        "Your magic link — Signal + Scale",
        "Sign in securely ✨",
        "Click the button below to sign in to your Signal + Scale account. This link expires in 1 hour.",
        "Sign In",
        confirmationUrl,
        `Sign in to Signal + Scale: ${confirmationUrl}`
      );

    case "recovery":
      return wrap(
        "Reset your password — Signal + Scale",
        "Reset your password 🔑",
        "We received a request to reset your password. Click the button below to set a new one.",
        "Reset Password",
        confirmationUrl,
        `Reset your Signal + Scale password: ${confirmationUrl}`
      );

    case "invite":
      return wrap(
        "You're invited to Signal + Scale",
        "You've been invited! 🎉",
        "You've been invited to join Signal + Scale, the AI-powered GTM platform for deep tech startups.",
        "Accept Invitation",
        confirmationUrl,
        `You've been invited to Signal + Scale: ${confirmationUrl}`
      );

    case "email_change":
      return wrap(
        "Confirm your new email — Signal + Scale",
        "Confirm email change 📧",
        "Please confirm your new email address by clicking the button below.",
        "Confirm New Email",
        confirmationUrl,
        `Confirm your new email for Signal + Scale: ${confirmationUrl}`
      );

    case "reauthentication":
      return wrap(
        "Your verification code — Signal + Scale",
        "Verification code 🔐",
        "Use the code below to complete your action. This code expires in 10 minutes.",
        data.token || "000000",
        "",
        `Your Signal + Scale verification code: ${data.token}`
      );

    default:
      return wrap(
        "Signal + Scale",
        "Hello from Signal + Scale",
        "You have a notification from Signal + Scale.",
        "Visit Signal + Scale",
        confirmationUrl || "https://signal2scale.com.au",
        `Notification from Signal + Scale: ${confirmationUrl || "https://signal2scale.com.au"}`
      );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is not configured");
    }

    const payload: AuthEmailPayload = await req.json();
    const { user, email_data } = payload;

    if (!user?.email || !email_data?.email_action_type) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: missing user email or email_action_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html, text } = getEmailContent(
      email_data.email_action_type,
      email_data,
      user.email
    );

    const brevoPayload = {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: user.email }],
      subject,
      htmlContent: html,
      textContent: text,
    };

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(brevoPayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("Brevo API error:", JSON.stringify(responseData));
      throw new Error(`Brevo API error [${response.status}]: ${JSON.stringify(responseData)}`);
    }

    console.log(`Auth email sent: type=${email_data.email_action_type}, to=${user.email}`);

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auth email hook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

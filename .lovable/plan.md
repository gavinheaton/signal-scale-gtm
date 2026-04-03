

# Set Up Brevo as Email Provider for Auth & Transactional Emails

## Overview
Configure Brevo (formerly Sendinblue) as the email provider for all Supabase auth emails (magic links, signup confirmations, password reset) and future transactional emails, using a Supabase Edge Function as an auth email hook.

## What you need ready
- Your Brevo API key (v3 API key from Brevo dashboard → SMTP & API → API Keys)
- A verified sender email in Brevo (e.g., `noreply@signal2scale.com.au`)

## Changes

### 1. Store Brevo API key as a secret
- Add `BREVO_API_KEY` as a runtime secret using the secrets tool

### 2. Create the auth email hook Edge Function
**File: `supabase/functions/auth-email-hook/index.ts`**

- Receives auth email events from Supabase (magic link, signup, recovery, etc.)
- Renders branded HTML email content inline (Signal + Scale branding: navy #0f284c, purple #8833ff, orange #e33e23, Poppins font)
- Calls Brevo's transactional email API (`https://api.brevo.com/v3/smtp/email`) with the rendered HTML
- Handles all auth email types: `signup`, `magiclink`, `recovery`, `invite`, `email_change`, `reauthentication`
- Includes CORS headers and input validation
- Uses `verify_jwt = false` in config since it's called by Supabase internals

### 3. Create a send-transactional-email Edge Function
**File: `supabase/functions/send-transactional-email/index.ts`**

- Generic sender for app/transactional emails (future use: notifications, confirmations)
- Accepts `templateName`, `recipientEmail`, `subject`, `htmlContent`, and optional `templateData`
- Calls Brevo's API with the provided content
- Validates JWT for authenticated requests from the frontend

### 4. Configure Supabase Auth Hook (manual step)
In **Supabase Dashboard → Authentication → Hooks**:
- Enable the "Send Email" hook
- Point it to the `auth-email-hook` Edge Function
- This intercepts all auth emails and routes them through Brevo

### 5. Deploy Edge Functions
- Deploy `auth-email-hook` and `send-transactional-email`

## Email templates included
All templates will be branded with Signal + Scale styling:
- **Signup confirmation** — "Confirm your email to get started"
- **Magic link** — "Click to sign in securely"
- **Password recovery** — "Reset your password"
- **Email change** — "Confirm your new email address"
- **Invite** — "You've been invited to Signal + Scale"
- **Reauthentication** — OTP code for sensitive actions

## Manual steps required
1. Verify `noreply@signal2scale.com.au` (or your preferred sender) in Brevo dashboard
2. In Supabase Dashboard → Auth → Hooks → enable "Send Email" hook pointing to the Edge Function
3. Optionally configure Brevo domain authentication (DKIM/SPF) for better deliverability

## Technical details
- Brevo API endpoint: `POST https://api.brevo.com/v3/smtp/email`
- Auth header: `api-key: {BREVO_API_KEY}`
- Edge Functions use Deno runtime with CORS support
- All emails sent as HTML with plain-text fallback


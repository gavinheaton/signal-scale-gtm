

# Email This Content to a Recipient

## What you'll get

A new **"Email content"** button in the asset detail drawer (next to "Push to Notion") that opens a small dialog letting you send the asset's generated content to any email address.

```text
┌─ Send Asset by Email ──────────────────┐
│  To:       [ jane@example.com       ]  │
│  Subject:  [ The Lens — Week 3      ]  │
│  ─ Preview ─────────────────────────   │
│  (rendered HTML of the asset content)  │
│                                        │
│  [ Cancel ]              [ Send email ]│
└────────────────────────────────────────┘
```

- **To** — defaults to the signed-in user's email (so "send it to me" is one click); editable.
- **Subject** — defaults to the asset title; editable.
- **Body** — the asset's markdown content rendered to branded HTML (Signal + Scale header bar, white body, Poppins, navy headings, purple CTA accents). Read-only preview in the dialog.
- Disabled when the asset has no content yet, with tooltip "Generate content first".
- Sends via the existing `send-transactional-email` edge function (Brevo, already wired up with sender `admin@signal2scale.com.au`).

## Technical changes

**1. New helper: `src/lib/assetEmailHtml.ts`**
- `markdownToEmailHtml(markdown, { title, assetType }) → string`
- Converts markdown → HTML using a tiny dependency-free converter (or `marked` if we add it — leaning toward adding `marked` for fidelity, ~30KB).
- Wraps output in a brand-styled HTML email shell: white background `#ffffff`, navy `#0f284c` header with "Signal + Scale", Poppins/Arial fallback, asset-type chip, content section with serif-free typography, footer with project context.
- Returns a complete `<!doctype html>…</html>` string ready for Brevo.

**2. New component: `src/components/campaigns/EmailAssetDialog.tsx`**
- Props: `asset`, `open`, `onOpenChange`.
- Local state: `recipientEmail` (defaults to `useAuth().user.email`), `subject` (defaults to `asset.title`), `sending`.
- Renders the HTML preview inside an iframe (sandboxed, srcDoc) so styles don't leak into the app.
- "Send email" calls `supabase.functions.invoke('send-transactional-email', { body: { recipientEmail, subject, htmlContent, textContent: asset.content } })`.
- Toast success/error; closes on success.

**3. Modify `src/components/campaigns/AssetDetailDrawer.tsx`**
- Add `Mail` icon import (lucide-react).
- Add `emailOpen` state.
- Add a new `<Button variant="outline">` "Email content" in the action button stack, positioned right after "Push to Notion". Disabled when `!asset.content`.
- Render `<EmailAssetDialog asset={asset} open={emailOpen} onOpenChange={setEmailOpen} />` at the bottom of the sheet.

**4. Add dependency**
- `marked` (~30KB) for reliable markdown → HTML conversion. Lightweight, no React.

## Files

**New**
- `src/lib/assetEmailHtml.ts` — markdown → branded HTML email shell
- `src/components/campaigns/EmailAssetDialog.tsx` — dialog with recipient/subject inputs + iframe preview + send

**Modified**
- `src/components/campaigns/AssetDetailDrawer.tsx` — new "Email content" button + dialog mount
- `package.json` — add `marked`

## Notes

- No edge function changes — `send-transactional-email` already accepts arbitrary `subject` + `htmlContent` and verifies the caller's JWT, so only signed-in users in the org can send.
- No schema changes.
- No domain setup needed — Brevo + `admin@signal2scale.com.au` is already in production use.
- Future enhancement (not in this round): multi-recipient, "send to ICP contact list", or scheduled sends — easy to layer on later.


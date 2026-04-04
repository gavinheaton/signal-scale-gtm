

# Document Upload for Brand Voice Wizard

Allow users to upload an existing tone of voice document (PDF, DOCX, or plain text), have it analyzed by AI, and use it to pre-populate the brand voice wizard sections.

## User Flow

1. On the **Brand Voice index page** (empty state), show two CTAs side by side:
   - "Start Brand Voice Wizard" (existing) — guided chat from scratch
   - "Upload Existing Document" — new option with an Upload icon

2. User clicks "Upload Existing Document" → file picker opens (accepts `.pdf`, `.docx`, `.txt`, `.md`)

3. File is uploaded to a Supabase Storage bucket (`brand-voice-uploads`), then the wizard opens with a special first message: the edge function receives the file content and the system prompt instructs Claude to analyze it and pre-populate as many brand voice sections as possible.

4. Claude responds with its analysis, pre-fills the draft panel on the right, and asks follow-up questions about any sections that couldn't be inferred from the document.

5. From there, the normal wizard conversation continues — but with a head start.

## Implementation

### 1. Storage Bucket

Migration to create a `brand-voice-uploads` bucket with RLS policies scoped to authenticated users via org membership.

### 2. Edge Function Changes (`brand-voice-wizard`)

- Accept an optional `file_url` parameter in the request body
- When `file_url` is provided, fetch the file content from Supabase Storage (using service role key)
- For PDF files: extract text server-side (basic text extraction)
- For DOCX: extract raw text content
- For TXT/MD: use content directly
- Prepend the extracted document content to the system prompt context, with instructions like: "The user has uploaded their existing brand voice document. Analyze it thoroughly and extract as much structured brand voice data as possible into the draft. Then ask about any gaps."
- The first AI turn will analyze the document and output a heavily pre-filled `<draft>` block

### 3. Frontend Changes

**BrandVoice.tsx** (index page):
- Add "Upload Existing Document" button next to the existing wizard CTA
- On click: open a file input dialog (accept PDF, DOCX, TXT, MD; max 10MB)
- Upload to `brand-voice-uploads/{project_id}/{filename}`
- Get the public/signed URL
- Navigate to the wizard page, passing the file URL as state

**BrandVoiceWizard.tsx**:
- Accept optional `fileUrl` from router location state
- On init, if `fileUrl` is present, call the edge function with `file_url` parameter instead of the default empty init
- Show a "Analyzing your document..." loading state with a document icon

### 4. File Processing (Edge Function)

For PDF extraction in Deno, use a lightweight approach:
- Fetch the file as ArrayBuffer from storage
- For PDFs: use basic text extraction (regex-based from the raw content, or a Deno-compatible PDF library)
- For DOCX: unzip and parse `word/document.xml` for text nodes
- Truncate to ~8000 chars to stay within context limits
- Pass as additional context in the user's first message

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create `brand-voice-uploads` storage bucket + RLS |
| `supabase/functions/brand-voice-wizard/index.ts` | Add `file_url` parameter handling and document text extraction |
| `src/pages/BrandVoice.tsx` | Add "Upload Existing Document" button |
| `src/pages/BrandVoiceWizard.tsx` | Accept file URL from router state, pass to edge function |

## Limitations to Note

- PDF text extraction will be basic (no OCR for scanned documents)
- Very large documents will be truncated to fit context limits
- The AI analysis is a best-effort mapping — some sections may still need manual input


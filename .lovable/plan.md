

# Fix: React Error #31 in Brand Voice Preview Panel

## Problem
React error #31: "Objects are not valid as a React child (keys: {phrase, alternative})". The AI sometimes returns `preferred_vocabulary` items as `{phrase, alternative}` instead of the expected `{use, instead_of}`. Similarly, `banned_phrases` items may come back as objects instead of strings. When the preview panel tries to render these directly, React crashes.

## Fix

**File: `src/components/brand-voice-wizard/BrandVoicePreviewPanel.tsx`**

Make the `SectionContent` renderer defensive against varying AI output shapes:

1. **`preferred_vocabulary`** (line ~183): Accept both `{use, instead_of}` and `{phrase, alternative}` key names:
   ```
   v.use || v.phrase  →  display text
   v.instead_of || v.alternative  →  strikethrough text
   ```

2. **`banned_phrases`** (line ~177): Handle items that are objects (stringify them) instead of only expecting strings.

3. **General fallback** (bottom of `SectionContent`): The JSON fallback is fine, but add a safety wrapper so any section with unexpected object items won't crash React — convert objects to strings before rendering in Badge/text contexts.

Single file change, no backend modifications needed.


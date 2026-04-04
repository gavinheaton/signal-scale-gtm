

# Fix: `generate-campaign-content` crash on writing samples

## Root Cause
Edge function logs show: `TypeError: Cannot read properties of undefined (reading 'substring')` at line 150.

Line 151 does `s.sample.substring(0, 500)` but the writing sample objects stored in `brand_voices.writing_samples` may not have a `sample` property — the field could be named `content`, `text`, or the object structure may vary. When `s.sample` is `undefined`, calling `.substring()` crashes the function.

## Fix

**File: `supabase/functions/generate-campaign-content/index.ts`** — line 151

Add defensive access with a fallback:

```typescript
samples.forEach((s: any) => {
  const text = s.sample || s.content || s.text || '';
  if (text) {
    systemPrompt += `[${s.type || 'sample'}]: "${text.substring(0, 500)}"\n`;
  }
});
```

This guards against:
1. `sample` property being undefined (tries `content`, `text` as fallbacks)
2. `type` property being undefined (falls back to `'sample'`)
3. Empty/null values (skips the entry entirely)

Single line change, no other files affected.


/**
 * Strip <draft>...</draft> blocks and stray ```json fences from assistant messages.
 * Handles well-formed pairs, orphan opening tags (truncated responses), and
 * orphan ```json fences. Always returns a trimmed string.
 */
export function stripDraft(text: string): string {
  if (!text) return text;
  let out = text;
  // 1. Strip well-formed <draft>...</draft> blocks (across multiple)
  out = out.replace(/<draft>[\s\S]*?<\/draft>/g, '');
  // 2. Strip orphan <draft> with no closer — everything from the tag to end
  out = out.replace(/<draft>[\s\S]*$/g, '');
  // 3. Strip stray ```json ... ``` fences that sometimes appear outside <draft>
  out = out.replace(/```json[\s\S]*?```/g, '');
  // 4. Strip orphan ```json with no closer
  out = out.replace(/```json[\s\S]*$/g, '');
  return out.trim();
}

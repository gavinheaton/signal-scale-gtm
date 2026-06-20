// Property mapping helpers for adopting an existing Notion workspace.
// The app stores a per-project map of "app field name" -> "user's actual Notion property name"
// for each adopted database (calendar, pillars, foundations).

export type NotionPropertyMap = Record<string, string>;

export interface ProjectNotionMap {
  calendar?: NotionPropertyMap;
  pillars?: NotionPropertyMap;
  foundations?: NotionPropertyMap;
}

// Expected app fields per database. The key is the canonical app field name.
// Each entry lists likely Notion property names to try when auto-matching.
export const EXPECTED_CALENDAR_FIELDS: Record<string, { type: string; aliases: string[] }> = {
  Title: { type: "title", aliases: ["Content", "Name", "Title", "Post", "Asset"] },
  Status: { type: "select", aliases: ["Status", "Stage", "State"] },
  Channel: { type: "select", aliases: ["Channel", "Platform", "Network"] },
  "Content Type": { type: "select", aliases: ["Content Type", "Type", "Format"] },
  "Demand Type": { type: "select", aliases: ["Demand Type", "Demand", "Track"] },
  "Publish Date": { type: "date", aliases: ["Publish Date", "Date", "Scheduled", "Publish", "Publish Time"] },
  "Production Due": { type: "date", aliases: ["Production Due", "Due", "Deadline"] },
  Campaign: { type: "rich_text", aliases: ["Campaign", "Campaign Name"] },
  Persona: { type: "rich_text", aliases: ["Persona", "Audience", "Personas"] },
  Pillar: { type: "relation", aliases: ["Pillar", "Pillars", "Content Pillar"] },
};

export const EXPECTED_PILLAR_FIELDS: Record<string, { type: string; aliases: string[] }> = {
  Title: { type: "title", aliases: ["Pillar", "Name", "Title"] },
  Description: { type: "rich_text", aliases: ["Description", "Detail", "Notes"] },
};

export const EXPECTED_FOUNDATION_FIELDS: Record<string, { type: string; aliases: string[] }> = {
  Title: { type: "title", aliases: ["Foundation", "Name", "Title"] },
  Type: { type: "select", aliases: ["Type", "Category"] },
  Detail: { type: "rich_text", aliases: ["Detail", "Description", "Notes"] },
};

export function autoMatchProperties(
  expected: Record<string, { type: string; aliases: string[] }>,
  notionProperties: Record<string, { type: string }>,
): NotionPropertyMap {
  const result: NotionPropertyMap = {};
  const propNames = Object.keys(notionProperties);
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const [appField, spec] of Object.entries(expected)) {
    // Find a notion property of the right type whose name matches one of the aliases.
    const candidates = propNames.filter((n) => notionProperties[n].type === spec.type);
    let matched: string | undefined;
    for (const alias of spec.aliases) {
      const aliasNorm = normalize(alias);
      matched = candidates.find((n) => normalize(n) === aliasNorm);
      if (matched) break;
    }
    if (matched) result[appField] = matched;
  }
  return result;
}

/**
 * Build a Notion `properties` object using the user's property map.
 * `values` is keyed by canonical app field names. Unmapped fields are silently skipped.
 */
export function buildNotionProperties(
  map: NotionPropertyMap | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!map) return out;
  for (const [appField, value] of Object.entries(values)) {
    const userProp = map[appField];
    if (!userProp || value === undefined || value === null) continue;
    out[userProp] = value;
  }
  return out;
}

export function extractNotionId(input: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) return input;
  const match = input.match(/([0-9a-f]{32})/i);
  if (match) {
    const h = match[1];
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return input;
}

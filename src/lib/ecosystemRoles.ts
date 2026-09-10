// Shared vocabulary for ecosystem stakeholders: what a player IS (roles) and
// how it RELATES to other players (edge kinds). One organisation can hold
// several roles at once — e.g. a telco that is both a client and an
// infrastructure owner.

export const STAKEHOLDER_ROLES: { value: string; label: string }[] = [
  { value: 'client', label: 'Client / buyer' },
  { value: 'funder', label: 'Funder / investor' },
  { value: 'infrastructure_owner', label: 'Infrastructure owner' },
  { value: 'research_body', label: 'Applied research body' },
  { value: 'regulator', label: 'Regulator / policy' },
  { value: 'partner', label: 'Delivery partner' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'channel', label: 'Channel / reseller' },
  { value: 'community', label: 'Community / association' },
  { value: 'influencer', label: 'Influencer / advisor' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'media', label: 'Media' },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  STAKEHOLDER_ROLES.map((r) => [r.value, r.label]),
);

export const EDGE_KINDS: { value: string; label: string }[] = [
  { value: 'serves', label: 'serves' },
  { value: 'buys_from', label: 'buys from' },
  { value: 'partners_with', label: 'partners with' },
  { value: 'funds', label: 'funds' },
  { value: 'owns_infrastructure', label: 'owns infrastructure for' },
  { value: 'supplies', label: 'supplies' },
  { value: 'collaborates_with', label: 'collaborates with' },
  { value: 'advocates_for', label: 'advocates for' },
  { value: 'regulates', label: 'regulates' },
  { value: 'influences', label: 'influences' },
  { value: 'competes_with', label: 'competes with' },
  { value: 'belongs_to', label: 'belongs to' },
  { value: 'evidences', label: 'evidences' },
  { value: 'custom', label: 'other (describe)' },
];

export const EDGE_LABEL: Record<string, string> = Object.fromEntries(
  EDGE_KINDS.map((e) => [e.value, e.label]),
);

export const STAKEHOLDER_NODE_KINDS: { value: string; label: string }[] = [
  { value: 'stakeholder', label: 'Stakeholder (multi-role)' },
  { value: 'funder', label: 'Funder' },
  { value: 'infrastructure_owner', label: 'Infrastructure owner' },
  { value: 'research_body', label: 'Research body' },
  { value: 'partner', label: 'Partner' },
  { value: 'regulator', label: 'Regulator' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'channel', label: 'Channel' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'community', label: 'Community' },
  { value: 'company', label: 'Company' },
  { value: 'segment', label: 'Segment' },
  { value: 'role', label: 'Role' },
  { value: 'person', label: 'Person' },
  { value: 'theme', label: 'Theme' },
  { value: 'insight', label: 'Insight' },
  { value: 'custom', label: 'Other' },
];

export interface DraftOutput {
  firmographics?: Record<string, any>;
  psychographics?: Record<string, any>;
  operational_readiness?: Record<string, any>;
  alignment_urgency?: Record<string, any>;
  buyer_roles_behaviour?: Record<string, any>;
  anti_icp_signals?: Record<string, any>;
  segment_name?: string;
  fit_score?: number | null;
  access_score?: number | null;
  matrix_category?: string | null;
  sections_complete?: string[];
  is_complete?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const ICP_SECTIONS = [
  { key: 'firmographics', label: 'Firmographics', desc: 'Industry, size, geography, stage', icon: '🏢' },
  { key: 'psychographics', label: 'Psychographics', desc: 'Values, risk tolerance, culture', icon: '🧠' },
  { key: 'operational_readiness', label: 'Ops Readiness', desc: 'Tech maturity, team, tools', icon: '⚙️' },
  { key: 'alignment_urgency', label: 'Alignment', desc: 'Strategic fit, drivers, timing', icon: '🎯' },
  { key: 'buyer_roles_behaviour', label: 'Buyer Roles', desc: 'Decision makers, committee', icon: '👥' },
  { key: 'anti_icp_signals', label: 'Anti-ICP', desc: 'Red flags, poor fit indicators', icon: '🚫' },
] as const;

export type SectionStatus = 'empty' | 'partial' | 'complete';

export function getSectionStatus(draft: DraftOutput, key: string): SectionStatus {
  const completeSections = draft.sections_complete || [];
  if (completeSections.includes(key)) return 'complete';
  const section = (draft as any)[key];
  if (!section || (typeof section === 'object' && Object.keys(section).length === 0)) return 'empty';
  return 'partial';
}

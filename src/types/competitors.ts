// Competitive landscape shared types

export type CompetitorType = 'direct' | 'adjacent' | 'in_house' | 'do_nothing';
export type CompetitorArchetype = 'capital_coalition' | 'engineering_systems' | 'applied_research' | 'place_alliance' | 'other';
export type CompetitorStatus = 'suggested' | 'confirmed' | 'dismissed';
export type CompetitorRating = 'strong' | 'parity' | 'weak';
export type WhitespaceKind = 'unowned' | 'commoditised' | 'counter_position';

export interface CompetitorEvidence {
  kind?: string;
  url: string;
  captured_at?: string;
}

export interface CompetitorProofPoint {
  text: string;
  source_url: string | null;
}

export interface Competitor {
  id: string;
  project_id: string;
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  type: CompetitorType;
  archetype: CompetitorArchetype | null;
  status: CompetitorStatus;
  why_suggested: string | null;
  positioning: string | null;
  target_segments: string[];
  claims: string[];
  proof_points: CompetitorProofPoint[];
  pricing_signals: string | null;
  strengths: string[];
  weaknesses: string[];
  evidence: CompetitorEvidence[];
  confidence: string | null;
  notes: string | null;
  identity_verdict: 'match' | 'unsure' | 'mismatch' | null;
  identity_reason: string | null;
  source: 'ai' | 'manual' | 'own_site' | 'search';
  domain_locked: boolean;
  researched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorDimension {
  id: string;
  project_id: string;
  label: string;
  description: string | null;
  position: number;
  importance: number;
}

export interface CompetitorScore {
  id: string;
  project_id: string;
  dimension_id: string;
  competitor_id: string | null; // null = us
  claim: string | null;
  rating: CompetitorRating | null;
}

export interface MarketPosition {
  id: string;
  project_id: string;
  competitor_id: string | null; // null = us
  persona_id: string | null;    // null = all personas
  leadership: number;
  differentiation: number;
  rationale: string | null;
  cited_dimension_ids: string[];
}

export const QUADRANT_LABELS = {
  leaders: 'Leaders — distinct and dominant',
  challengers: 'Challengers — big but interchangeable',
  visionaries: 'Visionaries — distinct, smaller',
  niche: 'Niche players — narrow and quiet',
};


export interface CompetitiveWhitespace {
  id: string;
  project_id: string;
  kind: WhitespaceKind;
  title: string;
  rationale: string | null;
  evidence: string[];
  applied_to: { target: string; at: string }[];
  created_at: string;
}

export interface CompetitorRun {
  id: string;
  project_id: string;
  kind: string;
  status: 'running' | 'complete' | 'error';
  target_id: string | null;
  result: any;
  saved_count: number;
  error: string | null;
  created_at: string;
}

export const TYPE_LABELS: Record<CompetitorType, string> = {
  direct: 'Direct rival',
  adjacent: 'Adjacent player',
  in_house: 'In-house / DIY',
  do_nothing: 'Do nothing',
};

export const TYPE_BADGE: Record<CompetitorType, string> = {
  direct: 'bg-rose-100 text-rose-800',
  adjacent: 'bg-amber-100 text-amber-800',
  in_house: 'bg-sky-100 text-sky-800',
  do_nothing: 'bg-muted text-muted-foreground',
};

export const ARCHETYPE_ORDER: CompetitorArchetype[] = [
  'capital_coalition', 'engineering_systems', 'applied_research', 'place_alliance', 'other',
];

export const ARCHETYPE_LABELS: Record<CompetitorArchetype, string> = {
  capital_coalition: 'Scale & capital coalitions',
  engineering_systems: 'Engineering & systems maturity',
  applied_research: 'Applied research organisations',
  place_alliance: 'Hazard & place-specific alliances',
  other: 'Other',
};

export const ARCHETYPE_HINTS: Record<CompetitorArchetype, string> = {
  capital_coalition: 'Coalitions, funds and global initiatives mobilising capital and scale.',
  engineering_systems: 'Engineering, design and advisory firms delivering the technical work.',
  applied_research: 'Research institutes and public science agencies producing applied methods.',
  place_alliance: 'Hazard or place-based alliances, city networks and partnership programmes.',
  other: 'In-house teams, doing nothing, and anything unclassified.',
};

export const ARCHETYPE_BADGE: Record<CompetitorArchetype, string> = {
  capital_coalition: 'bg-violet-100 text-violet-800',
  engineering_systems: 'bg-blue-100 text-blue-800',
  applied_research: 'bg-emerald-100 text-emerald-800',
  place_alliance: 'bg-orange-100 text-orange-800',
  other: 'bg-muted text-muted-foreground',
};

export const RATING_LABELS: Record<CompetitorRating, string> = {
  strong: 'Strong',
  parity: 'Parity',
  weak: 'Weak',
};

export const RATING_BADGE: Record<CompetitorRating, string> = {
  strong: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  parity: 'bg-amber-100 text-amber-800 border-amber-200',
  weak: 'bg-rose-100 text-rose-800 border-rose-200',
};

export const WHITESPACE_LABELS: Record<WhitespaceKind, string> = {
  unowned: 'Nobody owns this',
  commoditised: 'Everyone says this',
  counter_position: 'Your angle',
};

export interface NarrativeSection {
  key: string;
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface CompetitiveNarrative {
  id: string;
  project_id: string;
  persona_id: string | null;
  sections: NarrativeSection[];
  markdown: string | null;
  model: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

// Discovery module shared types

export type DiscoveryCampaignStatus = 'active' | 'paused' | 'archived';
export type DiscoveryOrgSource = 'firecrawl' | 'manual';
export type DiscoveryOrgStatus = 'researching' | 'targeted' | 'in_conversation' | 'validated' | 'disqualified';
export type DiscoveryRoleStatus = 'identified' | 'enriched' | 'skipped';
export type DiscoveryEnrichmentSource = 'apollo' | 'manual';
export type DiscoveryOutreachStatus =
  | 'not_started'
  | 'connection_sent'
  | 'connected'
  | 'dm_sent'
  | 'email_sent'
  | 'responded'
  | 'closed_no_response';
export type DiscoveryInsightKind = 'observation' | 'interpretation';
export type DiscoveryThemeStatus = 'emerging' | 'confirmed' | 'discarded';

export interface DiscoveryTier {
  label: string;
  criteria: string;
}

export interface OutreachSequence {
  step_1: string;
  step_2_trigger_hours: number;
  step_2: string;
  step_3_trigger_days: number;
  step_3: string;
  close_after_days: number;
}

export const DEFAULT_OUTREACH_SEQUENCE: OutreachSequence = {
  step_1: 'LinkedIn connection request, personalised note, no pitch',
  step_2_trigger_hours: 48,
  step_2: 'Follow-up DM referencing a relevant case study',
  step_3_trigger_days: 7,
  step_3: 'Single follow-up email, one attempt only',
  close_after_days: 7,
};

export interface DiscoveryCampaign {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_segment: string | null;
  icp_ids: string[];
  persona_ids: string[];
  qualifying_signals: string[];
  disqualifying_signals: string[];
  tiers: DiscoveryTier[];
  outreach_sequence: OutreachSequence;
  status: DiscoveryCampaignStatus;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryOrganization {
  id: string;
  campaign_id: string;
  name: string;
  domain: string | null;
  segment: string | null;
  tier: string | null;
  signals_matched: string[];
  fit_notes: string | null;
  source: DiscoveryOrgSource;
  source_url: string | null;
  status: DiscoveryOrgStatus;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryOrgRole {
  id: string;
  organization_id: string;
  persona_id: string | null;
  role_title: string;
  source_url: string | null;
  source_snippet: string | null;
  status: DiscoveryRoleStatus;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryContact {
  id: string;
  organization_id: string;
  org_role_id: string | null;
  persona_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  enrichment_source: DiscoveryEnrichmentSource;
  apollo_person_id: string | null;
  outreach_status: DiscoveryOutreachStatus;
  connection_sent_at: string | null;
  connection_accepted_at: string | null;
  dm_sent_at: string | null;
  email_sent_at: string | null;
  reminder_date: string | null;
  reminder_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryConversation {
  id: string;
  contact_id: string;
  date: string | null;
  duration_minutes: number | null;
  objective: string | null;
  key_topics: string[];
  guiding_questions: string[];
  customer_profile_snapshot: string | null;
  raw_notes: string | null;
  next_steps: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryInsight {
  id: string;
  conversation_id: string;
  campaign_id: string;
  text: string;
  kind: DiscoveryInsightKind;
  is_quote: boolean;
  theme_id: string | null;
  created_at: string;
}

export interface DiscoveryTheme {
  id: string;
  campaign_id: string;
  label: string;
  description: string | null;
  status: DiscoveryThemeStatus;
  created_at: string;
  updated_at: string;
}

export const CONVERSATIONS_SYNTHESIS_THRESHOLD = 20;

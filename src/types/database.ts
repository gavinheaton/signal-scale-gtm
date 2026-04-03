export type OrgType = 'disruptors_own' | 'disruptors_client' | 'independent';
export type OrgRole = 'superadmin' | 'owner' | 'admin' | 'manager' | 'analyst' | 'client';
export type ProjectStatus = 'setup' | 'active' | 'review' | 'complete';
export type MatrixCategory = 'now_account' | 'strategic_nurture' | 'trap_account' | 'no_go';
export type RoleInBuying = 'champion' | 'economic_buyer' | 'influencer' | 'end_user' | 'blocker';
export type CampaignTrack = 'demand_capture' | 'demand_creation';
export type CampaignStatus = 'brief' | 'planning' | 'active' | 'complete';
export type AssetType = 'blog' | 'video' | 'podcast' | 'linkedin_post' | 'email' | 'webinar' | 'whitepaper';
export type AssetStatus = 'brief' | 'draft' | 'review' | 'approved' | 'published';
export type MethodologyPhase = 'icp' | 'personas' | 'customer_conversations' | 'competitor_mapping' | 'ecosystem_map' | 'value_proposition' | 'campaign_strategy' | 'execution';
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete';
export type WizardSessionType = 'icp' | 'persona' | 'competitor';
export type WizardSessionStatus = 'in_progress' | 'complete';

export interface Organisation {
  id: string;
  name: string;
  type: OrgType;
  created_at: string;
}

export interface OrgMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  status: ProjectStatus;
  methodology_progress: Record<MethodologyPhase, PhaseStatus>;
  created_at: string;
}

export interface ICP {
  id: string;
  project_id: string;
  segment_name: string;
  firmographics: Record<string, any>;
  psychographics: Record<string, any>;
  buyer_roles: Record<string, any>;
  anti_icp_signals: Record<string, any>;
  fit_score: number;
  access_score: number;
  matrix_category: MatrixCategory;
}

export interface Persona {
  id: string;
  project_id: string;
  icp_id: string;
  persona_name: string;
  role_in_buying: RoleInBuying;
  goals: Record<string, any>;
  pain_points: Record<string, any>;
  channel_preferences: Record<string, any>;
  how_we_help: string;
  organisational_context: Record<string, any>;
  buying_behaviour: Record<string, any>;
  ai_readiness_score: number;
  is_current: boolean;
}

export interface Campaign {
  id: string;
  project_id: string;
  name: string;
  track: CampaignTrack;
  status: CampaignStatus;
  target_icp_ids: string[];
  channel_mix: Record<string, any>;
  objective: string;
  launch_date: string;
  end_date: string;
}

export interface CampaignAsset {
  id: string;
  campaign_id: string;
  asset_type: AssetType;
  title: string;
  status: AssetStatus;
  publish_date: string;
  persona_target_ids: string[];
}

export interface CampaignMetric {
  id: string;
  campaign_id: string;
  date: string;
  brand_search_volume: number;
  inbound_referrals: number;
  pipeline_influenced: number;
  share_of_voice_pct: number;
  community_engagement: number;
  conversion_rate_pct: number;
}

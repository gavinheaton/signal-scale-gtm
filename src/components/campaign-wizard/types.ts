export interface CampaignDraft {
  campaign_name?: string;
  track?: 'demand_capture' | 'demand_creation';
  target_audience?: Record<string, any>;
  campaign_insight?: Record<string, any>;
  objective?: Record<string, any>;
  channel_mix?: Record<string, any>;
  content_calendar?: ContentCalendarItem[];
  success_metrics?: Record<string, any>;
  is_complete?: boolean;
  notion_brief_ready?: boolean;
  sections_complete?: string[];
}

export interface ContentCalendarItem {
  title: string;
  format: string;
  persona: string;
  week: string;
  track?: 'demand_capture' | 'demand_creation';
}

export const CAMPAIGN_SECTIONS = [
  { key: 'target_audience', label: 'Target Audience', icon: '🎯' },
  { key: 'campaign_insight', label: 'Campaign Insight', icon: '💡' },
  { key: 'objective', label: 'Objective', icon: '📌' },
  { key: 'channel_mix', label: 'Channel Mix', icon: '📡' },
  { key: 'content_calendar', label: 'Content Calendar', icon: '📅' },
  { key: 'success_metrics', label: 'Success Metrics', icon: '📊' },
] as const;

export type CampaignSectionStatus = 'empty' | 'partial' | 'complete';

export function getCampaignSectionStatus(draft: CampaignDraft, key: string): CampaignSectionStatus {
  const completeSections = draft.sections_complete || [];
  if (completeSections.includes(key)) return 'complete';
  if (key === 'content_calendar') {
    return draft.content_calendar && draft.content_calendar.length > 0 ? 'partial' : 'empty';
  }
  const section = (draft as any)[key];
  if (!section || (typeof section === 'object' && Object.keys(section).length === 0)) return 'empty';
  return 'partial';
}

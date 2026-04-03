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

function hasContent(val: any): boolean {
  if (!val) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return true;
}

function isSectionDataComplete(draft: CampaignDraft, key: string): boolean {
  const section = (draft as any)[key];
  switch (key) {
    case 'target_audience':
      return hasContent(section?.icp_ids) || hasContent(section?.personas) || hasContent(section?.segments);
    case 'campaign_insight':
      return typeof section === 'string' ? section.trim().length > 0 : hasContent(section?.text) || hasContent(section?.insight) || (typeof section === 'object' && Object.keys(section).length >= 1);
    case 'objective':
      return typeof section === 'string' ? section.trim().length > 0 : hasContent(section?.primary) || hasContent(section?.goal) || (typeof section === 'object' && Object.keys(section).length >= 1);
    case 'channel_mix':
      return typeof section === 'object' && !Array.isArray(section) && Object.keys(section).length >= 1;
    case 'content_calendar':
      return Array.isArray(draft.content_calendar) && draft.content_calendar.length >= 3;
    case 'success_metrics':
      return hasContent(section?.primary) || hasContent(section?.secondary) || hasContent(section?.kpis) || (typeof section === 'object' && Object.keys(section).length >= 2);
    default:
      return false;
  }
}

export function getCampaignSectionStatus(draft: CampaignDraft, key: string): CampaignSectionStatus {
  const completeSections = draft.sections_complete || [];
  if (completeSections.includes(key)) return 'complete';
  if (isSectionDataComplete(draft, key)) return 'complete';
  if (key === 'content_calendar') {
    return draft.content_calendar && draft.content_calendar.length > 0 ? 'partial' : 'empty';
  }
  const section = (draft as any)[key];
  if (!section || (typeof section === 'object' && Object.keys(section).length === 0)) return 'empty';
  return 'partial';
}

export type CanvasVariant = 'standard' | 'shared_value' | 'business_model';
export type CanvasEntryStatus = 'assumption' | 'hypothesis' | 'validated';
export type CanvasEntrySource = 'user' | 'auto' | 'ai_suggestion';

export interface Canvas {
  id: string;
  project_id: string;
  variant: CanvasVariant;
  narrative_md: string | null;
  narrative_generated_at: string | null;
  critique: any | null;
  critique_generated_at: string | null;
}

export interface CanvasEntry {
  id: string;
  canvas_id: string;
  box: string;
  content: string;
  status: CanvasEntryStatus;
  source: CanvasEntrySource;
  source_ref: any | null;
  position: number;
  is_stale: boolean;
}

export const STANDARD_BOXES: { key: string; label: string; hint: string }[] = [
  { key: 'problem', label: 'Problem', hint: 'What is the problem you are solving?' },
  { key: 'solution', label: 'Solution', hint: 'Your solution in ≤50 words.' },
  { key: 'usp', label: 'Unique Selling Proposition', hint: 'Analogy — "AirBnB for satellite time".' },
  { key: 'unfair_advantage', label: 'Unfair Advantage', hint: 'What competitors cannot copy.' },
  { key: 'customer_segments', label: 'Customer Segments', hint: 'Initial target customers.' },
  { key: 'metrics', label: 'Key Metrics', hint: 'How you know this solves the problem.' },
  { key: 'channels', label: 'Channels', hint: 'How you reach & communicate.' },
  { key: 'cost_structure', label: 'Cost Structure', hint: 'Immediate and ongoing costs.' },
  { key: 'revenue_streams', label: 'Revenue Streams', hint: 'How you make money.' },
];

export const SHARED_VALUE_BOXES: { key: string; label: string; hint: string }[] = [
  { key: 'problem', label: 'Problem', hint: 'The problem being solved.' },
  { key: 'solution', label: 'Solution', hint: 'Your solution.' },
  { key: 'vp_stakeholder', label: 'Value: Stakeholder/Investor', hint: 'Value to investors & stakeholders.' },
  { key: 'vp_community', label: 'Value: Community', hint: 'Value to the wider community.' },
  { key: 'vp_customer', label: 'Value: Customer', hint: 'Value to end customers.' },
  { key: 'unfair_advantage', label: 'Unfair Advantage', hint: 'What competitors cannot copy.' },
  { key: 'metrics', label: 'Key Metrics', hint: 'Success measurements.' },
  { key: 'channels', label: 'Channels', hint: 'How you reach customers.' },
  { key: 'customer_segments', label: 'Customer Segments', hint: 'Target customers.' },
  { key: 'cost_structure', label: 'Cost Structure', hint: 'Costs.' },
  { key: 'revenue_streams', label: 'Revenue Streams', hint: 'Revenue.' },
  { key: 'social_impact', label: 'Social Impact', hint: 'Measurable social/environmental impact.' },
];

export const STATUS_COLOR: Record<CanvasEntryStatus, string> = {
  assumption: 'bg-muted text-muted-foreground',
  hypothesis: 'bg-amber-100 text-amber-800',
  validated: 'bg-green-100 text-green-800',
};

export interface BrandVoiceDraft {
  personality_adjectives?: string[];
  tone_description?: string;
  writing_principles?: Array<{
    principle: string;
    explanation: string;
    bad_example: string;
    good_example: string;
  }>;
  banned_phrases?: string[];
  preferred_vocabulary?: Array<{ use: string; instead_of: string }>;
  formatting_rules?: string[];
  content_type_guidance?: Record<string, string>;
  writing_samples?: Array<{ type: string; sample: string }>;
  target_audiences?: Array<{ segment: string; tone_adjustment: string }>;
  brand_identity?: {
    brand_name?: string;
    brand_name_rules?: string;
    primary_colour?: string;
    accent_colour?: string;
    font?: string;
    locale?: string;
  };
  sections_complete?: string[];
  is_complete?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const BRAND_VOICE_SECTIONS = [
  { key: 'personality_adjectives', label: 'Personality', desc: 'Brand personality traits', icon: '✨' },
  { key: 'tone_description', label: 'Tone', desc: 'How the brand sounds', icon: '🎵' },
  { key: 'writing_principles', label: 'Writing Principles', desc: 'Rules for writing', icon: '📝' },
  { key: 'banned_phrases', label: 'Banned Phrases', desc: 'Words to avoid', icon: '🚫' },
  { key: 'preferred_vocabulary', label: 'Vocabulary', desc: 'Preferred word choices', icon: '📖' },
  { key: 'formatting_rules', label: 'Formatting', desc: 'Style & formatting rules', icon: '📐' },
  { key: 'content_type_guidance', label: 'Content Types', desc: 'Per-channel guidance', icon: '📋' },
  { key: 'writing_samples', label: 'Writing Samples', desc: 'Example content', icon: '✍️' },
  { key: 'target_audiences', label: 'Audiences', desc: 'Tone per audience', icon: '🎯' },
  { key: 'brand_identity', label: 'Brand Identity', desc: 'Name, colours, font', icon: '🏷️' },
] as const;

export type SectionStatus = 'empty' | 'partial' | 'complete';

export function getSectionStatus(draft: BrandVoiceDraft, key: string): SectionStatus {
  const completeSections = draft.sections_complete || [];
  if (completeSections.includes(key)) return 'complete';
  const section = (draft as any)[key];
  if (!section) return 'empty';
  if (Array.isArray(section) && section.length === 0) return 'empty';
  if (typeof section === 'string' && section.length === 0) return 'empty';
  if (typeof section === 'object' && !Array.isArray(section) && Object.keys(section).length === 0) return 'empty';
  return 'partial';
}

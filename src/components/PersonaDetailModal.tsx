import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Target, Zap, Building2, ShoppingCart, Radio, FileCheck, Handshake, Brain, RefreshCw, Loader2, ArrowRightLeft, Copy, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Persona, ICP, RoleInBuying } from '@/types/database';

const roleColors: Record<RoleInBuying, string> = {
  champion: 'bg-purple-100 text-purple-800',
  economic_buyer: 'bg-green-100 text-green-800',
  influencer: 'bg-blue-100 text-blue-800',
  end_user: 'bg-amber-100 text-amber-800',
  blocker: 'bg-red-100 text-red-800',
};

interface PersonaDetailModalProps {
  persona: Persona | null;
  icp: ICP | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (persona: Persona) => void;
  onDelete: (persona: Persona) => void;
  onMove?: (persona: Persona) => void;
  onDuplicate?: (persona: Persona) => void;
  onRefreshed?: (updatedPersona: Persona) => void;
}

function renderContent(data: any): React.ReactNode {
  if (!data) return <p className="text-muted-foreground italic text-xs">Not captured yet</p>;

  if (typeof data === 'string') {
    return <p className="text-sm text-foreground leading-relaxed">{data}</p>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-muted-foreground italic text-xs">Not captured yet</p>;
    return (
      <ul className="space-y-1.5">
        {data.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--orange))] shrink-0" />
            <span>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) return <p className="text-muted-foreground italic text-xs">Not captured yet</p>;
    return (
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <span className="text-xs font-medium text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
            <div className="mt-0.5">{renderContent(value)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-foreground">{String(data)}</p>;
}

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  data: any;
}

function SectionCard({ icon, title, subtitle, data }: SectionCardProps) {
  const hasData = data && (typeof data === 'string' ? data.length > 0 : Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0);

  return (
    <div className={`rounded-xl border p-4 transition-colors ${hasData ? 'bg-card border-border' : 'bg-muted/20 border-border/50'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[hsl(var(--orange))]">{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--orange))' }}>{title}</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{subtitle}</p>
      {renderContent(data)}
    </div>
  );
}

function hasEmptySections(persona: Persona): boolean {
  const fields = [persona.goals, persona.pain_points, persona.organisational_context, persona.buying_behaviour, persona.channel_preferences];
  return fields.filter(f => !f || (typeof f === 'object' && Object.keys(f).length === 0)).length >= 2;
}

export default function PersonaDetailModal({ persona, icp, open, onOpenChange, onEdit, onDelete, onMove, onDuplicate, onRefreshed }: PersonaDetailModalProps) {
  const [refreshing, setRefreshing] = useState(false);

  if (!persona) return null;

  const channelPrefs = persona.channel_preferences || {};
  const { preferred_evidence, ...channels } = channelPrefs as Record<string, any>;

  const sections: SectionCardProps[] = [
    { icon: <Target className="h-4 w-4" />, title: 'Goals', subtitle: 'What they are trying to achieve', data: persona.goals },
    { icon: <Zap className="h-4 w-4" />, title: 'Pain Points', subtitle: 'Frustrations and blockers', data: persona.pain_points },
    { icon: <Building2 className="h-4 w-4" />, title: 'Organisational Context', subtitle: 'Structure, culture and decision-making', data: persona.organisational_context },
    { icon: <ShoppingCart className="h-4 w-4" />, title: 'Buying Behaviour', subtitle: 'How they evaluate and purchase', data: persona.buying_behaviour },
    { icon: <Radio className="h-4 w-4" />, title: 'Channel Preferences', subtitle: 'Where they consume content', data: Object.keys(channels).length > 0 ? channels : null },
    { icon: <FileCheck className="h-4 w-4" />, title: 'Preferred Evidence', subtitle: 'What convinces them to act', data: preferred_evidence },
    { icon: <Handshake className="h-4 w-4" />, title: 'How We Help', subtitle: 'Our value to this persona', data: persona.how_we_help },
  ];

  const refreshFromSession = async () => {
    if (!persona) return;
    setRefreshing(true);
    try {
      const { data: sessions } = await supabase
        .from('wizard_sessions')
        .select('draft_output')
        .eq('project_id', persona.project_id)
        .eq('session_type', 'persona')
        .eq('status', 'complete')
        .order('created_at', { ascending: false });

      // Find matching session by persona name
      const match = sessions?.find(s => {
        const draft = s.draft_output as Record<string, any>;
        return draft?.persona_name === persona.persona_name;
      });

      if (!match) {
        toast.error('No matching wizard session found');
        return;
      }

      const draft = match.draft_output as Record<string, any>;

      const extractJson = (...keys: string[]): Record<string, any> => {
        for (const key of keys) {
          const val = draft[key];
          if (val && typeof val === 'object' && Object.keys(val).length > 0) return val;
        }
        return {};
      };

      const channelPrefs = extractJson('channel_preferences', 'channels');
      const evidence = extractJson('preferred_evidence', 'evidence');

      const updateData: Record<string, any> = {};
      
      // Only update fields that are currently empty
      const isEmpty = (v: any) => !v || (typeof v === 'object' && Object.keys(v).length === 0) || v === '';
      
      if (isEmpty(persona.goals)) updateData.goals = extractJson('goals');
      if (isEmpty(persona.pain_points)) updateData.pain_points = extractJson('pain_points', 'painpoints');
      if (isEmpty(persona.organisational_context)) updateData.organisational_context = extractJson('organisational_context', 'org_context', 'context');
      if (isEmpty(persona.buying_behaviour)) updateData.buying_behaviour = extractJson('buying_behaviour', 'buying_behavior');
      if (isEmpty(persona.channel_preferences)) updateData.channel_preferences = { ...channelPrefs, preferred_evidence: evidence };
      if (isEmpty(persona.how_we_help) && draft.how_we_help) updateData.how_we_help = draft.how_we_help;

      if (Object.keys(updateData).length === 0) {
        toast.info('No new data found in wizard session');
        return;
      }

      const { error } = await supabase
        .from('personas')
        .update(updateData as never)
        .eq('id', persona.id);

      if (error) throw error;

      toast.success('Persona refreshed with wizard data');
      
      // Notify parent to refresh
      if (onRefreshed) {
        onRefreshed({ ...persona, ...updateData } as Persona);
      }
    } catch (err: any) {
      toast.error('Failed to refresh: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const showRefresh = hasEmptySections(persona);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-6 pt-6 pb-4">
          <DialogHeader className="pr-8">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-2xl font-bold">{persona.persona_name}</DialogTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={roleColors[persona.role_in_buying]}>
                    {persona.role_in_buying.replace('_', ' ')}
                  </Badge>
                  {icp && (
                    <Badge variant="outline" className="text-xs">
                      {icp.segment_name}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); onEdit(persona); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { onOpenChange(false); onMove?.(persona); }}>
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> Move to ICP…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { onOpenChange(false); onDuplicate?.(persona); }}>
                      <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate to ICP…
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { onOpenChange(false); onDelete(persona); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogHeader>

          {/* AI Readiness + Refresh */}
          <div className="flex items-center gap-2 mt-3">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">AI Readiness</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className={`w-3 h-3 rounded-full transition-colors ${n <= (persona.ai_readiness_score || 0) ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
            <span className="text-xs font-medium text-foreground ml-1">{persona.ai_readiness_score || 0}/5</span>
            
            {showRefresh && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                onClick={refreshFromSession}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Refresh from wizard data
              </Button>
            )}
          </div>
        </div>

        {/* Body: 2-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
          {sections.map((section, i) => (
            <div key={section.title} className={i === sections.length - 1 && sections.length % 2 !== 0 ? 'md:col-span-2' : ''}>
              <SectionCard {...section} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

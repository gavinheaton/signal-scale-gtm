import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Target, Zap, Building2, ShoppingCart, Radio, FileCheck, Handshake, Brain } from 'lucide-react';
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

export default function PersonaDetailModal({ persona, icp, open, onOpenChange, onEdit, onDelete }: PersonaDetailModalProps) {
  if (!persona) return null;

  const channelPrefs = persona.channel_preferences || {};
  const { preferred_evidence, ...channels } = channelPrefs as Record<string, any>;

  const sections: SectionCardProps[] = [
    { icon: <Target className="h-4 w-4" />, title: 'Goals', subtitle: 'What they're trying to achieve', data: persona.goals },
    { icon: <Zap className="h-4 w-4" />, title: 'Pain Points', subtitle: 'Frustrations and blockers', data: persona.pain_points },
    { icon: <Building2 className="h-4 w-4" />, title: 'Organisational Context', subtitle: 'Structure, culture & decision-making', data: persona.organisational_context },
    { icon: <ShoppingCart className="h-4 w-4" />, title: 'Buying Behaviour', subtitle: 'How they evaluate and purchase', data: persona.buying_behaviour },
    { icon: <Radio className="h-4 w-4" />, title: 'Channel Preferences', subtitle: 'Where they consume content', data: Object.keys(channels).length > 0 ? channels : null },
    { icon: <FileCheck className="h-4 w-4" />, title: 'Preferred Evidence', subtitle: 'What convinces them to act', data: preferred_evidence },
    { icon: <Handshake className="h-4 w-4" />, title: 'How We Help', subtitle: 'Our value to this persona', data: persona.how_we_help },
  ];

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
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onDelete(persona); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* AI Readiness */}
          <div className="flex items-center gap-2 mt-3">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">AI Readiness</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className={`w-3 h-3 rounded-full transition-colors ${n <= (persona.ai_readiness_score || 0) ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>
            <span className="text-xs font-medium text-foreground ml-1">{persona.ai_readiness_score || 0}/5</span>
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

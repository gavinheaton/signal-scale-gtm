import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, Lightbulb, Quote, MessageSquareDashed } from 'lucide-react';
import { toast } from 'sonner';
import { DiscoveryCampaign, DiscoveryInsight, DiscoveryTheme, CONVERSATIONS_SYNTHESIS_THRESHOLD } from '@/types/discovery';

interface ProposedTheme {
  label: string;
  description: string;
  supporting_insight_ids: string[];
  conflicts_with_theme_label?: string;
}

type Filter = 'all' | 'observation' | 'interpretation' | 'quote';

export default function InsightsTab({ campaign }: { campaign: DiscoveryCampaign }) {
  const [insights, setInsights] = useState<DiscoveryInsight[]>([]);
  const [themes, setThemes] = useState<DiscoveryTheme[]>([]);
  const [conversationCount, setConversationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [running, setRunning] = useState(false);
  const [proposals, setProposals] = useState<ProposedTheme[]>([]);

  const refresh = async () => {
    setLoading(true);
    const [insRes, themesRes, convRes] = await Promise.all([
      (supabase as any).from('discovery_insights').select('*').eq('campaign_id', campaign.id),
      (supabase as any).from('discovery_themes').select('*').eq('campaign_id', campaign.id),
      (supabase as any).from('discovery_conversations').select('id, discovery_contacts!inner(discovery_organizations!inner(campaign_id))').eq('discovery_contacts.discovery_organizations.campaign_id', campaign.id),
    ]);
    setInsights((insRes.data || []) as DiscoveryInsight[]);
    setThemes((themesRes.data || []) as DiscoveryTheme[]);
    setConversationCount((convRes.data || []).length);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [campaign.id]);

  const filtered = useMemo(() => {
    return insights.filter((i) => {
      if (filter === 'all') return true;
      if (filter === 'quote') return i.is_quote;
      return i.kind === filter;
    });
  }, [insights, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, DiscoveryInsight[]>();
    for (const i of filtered) {
      const key = i.theme_id || '__unclustered';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return map;
  }, [filtered]);

  const runSynthesis = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('discovery-run-synthesis', { body: { campaign_id: campaign.id } });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    setProposals((data?.themes || []) as ProposedTheme[]);
  };

  const confirmTheme = async (p: ProposedTheme) => {
    const { data, error } = await (supabase as any).from('discovery_themes').insert({
      campaign_id: campaign.id, label: p.label, description: p.description, status: 'confirmed',
    }).select().maybeSingle();
    if (error || !data) { toast.error(error?.message || 'Failed'); return; }
    if (p.supporting_insight_ids.length) {
      await (supabase as any).from('discovery_insights').update({ theme_id: data.id }).in('id', p.supporting_insight_ids);
    }
    toast.success(`Theme "${p.label}" confirmed`);
    setProposals(proposals.filter((x) => x.label !== p.label));
    refresh();
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>;

  const ready = conversationCount >= CONVERSATIONS_SYNTHESIS_THRESHOLD;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          {ready ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Ready for synthesis</p>
                <p className="text-xs text-muted-foreground mt-1">{conversationCount} conversations logged · cluster observations into themes.</p>
              </div>
              <Button onClick={runSynthesis} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Run synthesis
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">{conversationCount} of {CONVERSATIONS_SYNTHESIS_THRESHOLD} conversations logged</p>
              <p className="text-xs text-muted-foreground mb-2">The methodology unlocks cross-conversation synthesis at {CONVERSATIONS_SYNTHESIS_THRESHOLD}+ conversations — enough signal for reliable patterns.</p>
              <Progress value={(conversationCount / CONVERSATIONS_SYNTHESIS_THRESHOLD) * 100} />
            </div>
          )}
        </CardContent>
      </Card>

      {proposals.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Proposed themes</h3>
            {proposals.map((p) => (
              <div key={p.label} className="border rounded p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    <p className="text-xs mt-1">{p.supporting_insight_ids.length} supporting insights{p.conflicts_with_theme_label ? ` · conflicts with "${p.conflicts_with_theme_label}"` : ''}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setProposals(proposals.filter((x) => x.label !== p.label))}>Discard</Button>
                    <Button size="sm" onClick={() => confirmTheme(p)}>Confirm</Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {(['all', 'observation', 'interpretation', 'quote'] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>{f}</Button>
        ))}
      </div>

      {insights.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <MessageSquareDashed className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No insights yet. Log a conversation and use <strong>Summarise</strong> to extract them.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([themeId, items]) => {
            const theme = themes.find((t) => t.id === themeId);
            return (
              <Card key={themeId}>
                <CardContent className="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{theme ? theme.label : 'Unclustered'} <Badge variant="outline" className="ml-1">{items.length}</Badge></p>
                  <ul className="space-y-1 text-sm">
                    {items.map((i) => (
                      <li key={i.id} className="flex gap-2">
                        {i.is_quote ? <Quote className="h-3.5 w-3.5 mt-0.5 text-purple-600 shrink-0" /> : <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />}
                        <span className={i.is_quote ? 'italic' : ''}>{i.text}</span>
                        {i.kind === 'interpretation' && <Badge variant="outline" className="text-[10px] ml-auto">interp.</Badge>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

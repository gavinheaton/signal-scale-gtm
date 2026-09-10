import { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABEL, EDGE_LABEL } from '@/lib/ecosystemRoles';

interface Suggestion {
  id: string; name: string; subtitle: string | null; node_kind: string;
  roles: string[]; relationships: { target: string; kind: string; note: string | null }[];
  rationale: string | null; evidence: string[]; status: string;
}

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  mapId: string; projectId: string; onChanged: () => void;
}

export function StakeholderSuggestions({ open, onOpenChange, mapId, projectId, onChanged }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('ecosystem_stakeholder_suggestions').select('*')
      .eq('map_id', mapId).eq('status', 'pending')
      .order('created_at', { ascending: false });
    setItems((data || []) as Suggestion[]);
    setPicked(new Set());
    setLoading(false);
  }, [mapId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function suggest() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ecosystem-suggest-stakeholders', {
        body: { map_id: mapId },
      });
      if (error) throw error;
      const n = (data as any)?.suggested ?? 0;
      toast[n ? 'success' : 'info'](n ? `${n} stakeholders suggested` : 'No new stakeholders found');
      await load();
    } catch (e: any) {
      toast.error(`Suggestion failed: ${e.message || e}`);
    } finally {
      setRunning(false);
    }
  }

  async function addSelected() {
    const chosen = items.filter((i) => picked.has(i.id));
    if (!chosen.length) return;
    setAdding(true);
    try {
      const { data: nodeRows } = await (supabase as any)
        .from('ecosystem_nodes').select('id, label, kind').eq('map_id', mapId);
      const byLabel = new Map<string, string>();
      let projectNodeId: string | null = null;
      for (const n of (nodeRows || []) as any[]) {
        byLabel.set(String(n.label).toLowerCase().trim(), n.id);
        if (n.kind === 'project') projectNodeId = n.id;
      }

      let added = 0, links = 0;
      for (let i = 0; i < chosen.length; i++) {
        const s = chosen[i];
        const angle = (2 * Math.PI * i) / chosen.length;
        const ins = await (supabase as any).from('ecosystem_nodes').insert({
          map_id: mapId, project_id: projectId,
          kind: s.node_kind || 'stakeholder',
          label: s.name, subtitle: s.subtitle,
          cluster: 'stakeholders',
          x: 1500 * Math.cos(angle), y: 1500 * Math.sin(angle),
          meta: {
            roles: s.roles || [], rationale: s.rationale,
            evidence: s.evidence || [], source: 'ai_suggestion',
          },
        }).select('id').single();
        if (ins.error) { toast.error(ins.error.message); continue; }
        const nodeId = ins.data.id as string;
        added++;

        for (const rel of s.relationships || []) {
          const key = String(rel.target || '').toLowerCase().trim();
          const targetId = key === 'project' || key === 'us' || key === 'you'
            ? projectNodeId
            : byLabel.get(key) || projectNodeId;
          if (!targetId) continue;
          const { error } = await (supabase as any).from('ecosystem_edges').insert({
            map_id: mapId, project_id: projectId,
            source_node_id: nodeId, target_node_id: targetId,
            kind: rel.kind || 'influences', note: rel.note,
            meta: { source: 'ai_suggestion' },
          });
          if (!error) links++;
        }
        await (supabase as any).from('ecosystem_stakeholder_suggestions')
          .update({ status: 'added', node_id: nodeId }).eq('id', s.id);
      }
      toast.success(`Added ${added} stakeholders · ${links} relationships`);
      onChanged();
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function dismiss(id: string) {
    await (supabase as any).from('ecosystem_stakeholder_suggestions')
      .update({ status: 'dismissed' }).eq('id', id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Suggested stakeholders</SheetTitle>
          <SheetDescription>
            Organisations that shape this market — infrastructure owners, funders, research bodies,
            regulators and alliances. Each can hold several roles at once.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-4">
          <Button size="sm" onClick={suggest} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Suggest stakeholders
          </Button>
          <Button size="sm" variant="outline" onClick={addSelected} disabled={adding || picked.size === 0}>
            {adding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Add selected ({picked.size})
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {loading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No suggestions waiting. Run “Suggest stakeholders” to find who else shapes this market.
            </p>
          )}
          {items.map((s) => (
            <div key={s.id} className="border rounded-md p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  className="mt-1"
                  checked={picked.has(s.id)}
                  onCheckedChange={(v) => {
                    const next = new Set(picked);
                    v ? next.add(s.id) : next.delete(s.id);
                    setPicked(next);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{s.name}</div>
                  {s.subtitle && <div className="text-xs text-muted-foreground">{s.subtitle}</div>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(s.roles || []).map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">{ROLE_LABEL[r] || r}</Badge>
                    ))}
                  </div>
                  {(s.relationships || []).length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {s.relationships.map((rel, idx) => (
                        <li key={idx} className="text-[11px] text-muted-foreground">
                          <span className="font-medium">{EDGE_LABEL[rel.kind] || rel.kind}</span>{' '}
                          {rel.target}{rel.note ? ` — ${rel.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.rationale && <p className="text-xs mt-2">{s.rationale}</p>}
                  {(s.evidence || []).length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1 break-all">{s.evidence.join(' · ')}</p>
                  )}
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => dismiss(s.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

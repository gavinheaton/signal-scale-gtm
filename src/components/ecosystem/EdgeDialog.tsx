import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import { EDGE_KINDS, EDGE_LABEL } from '@/lib/ecosystemRoles';

export interface EdgePair {
  sourceId: string; targetId: string;
  sourceLabel: string; targetLabel: string;
}

interface ExistingEdge { id: string; kind: string; note: string | null; source_node_id: string; target_node_id: string }

interface Props {
  pair: EdgePair | null;
  onClose: () => void;
  mapId: string;
  projectId: string;
  onChanged: () => void;
}

export function EdgeDialog({ pair, onClose, mapId, projectId, onChanged }: Props) {
  const [kind, setKind] = useState('partners_with');
  const [note, setNote] = useState('');
  const [existing, setExisting] = useState<ExistingEdge[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pair) { setExisting([]); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('ecosystem_edges')
        .select('id, kind, note, source_node_id, target_node_id')
        .eq('map_id', mapId)
        .or(
          `and(source_node_id.eq.${pair.sourceId},target_node_id.eq.${pair.targetId}),` +
          `and(source_node_id.eq.${pair.targetId},target_node_id.eq.${pair.sourceId})`,
        );
      setExisting((data || []) as ExistingEdge[]);
    })();
  }, [pair, mapId]);

  if (!pair) return null;

  async function add() {
    setSaving(true);
    const { error } = await (supabase as any).from('ecosystem_edges').insert({
      map_id: mapId, project_id: projectId,
      source_node_id: pair!.sourceId, target_node_id: pair!.targetId,
      kind, note: note.trim() || null, meta: { manual: true },
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Relationship added');
    setNote('');
    onChanged();
    const { data } = await (supabase as any)
      .from('ecosystem_edges').select('id, kind, note, source_node_id, target_node_id')
      .eq('map_id', mapId)
      .or(
        `and(source_node_id.eq.${pair!.sourceId},target_node_id.eq.${pair!.targetId}),` +
        `and(source_node_id.eq.${pair!.targetId},target_node_id.eq.${pair!.sourceId})`,
      );
    setExisting((data || []) as ExistingEdge[]);
  }

  async function remove(id: string) {
    await (supabase as any).from('ecosystem_edges').delete().eq('id', id);
    setExisting((es) => es.filter((e) => e.id !== id));
    onChanged();
  }

  return (
    <Dialog open={!!pair} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relationships</DialogTitle>
          <DialogDescription>
            {pair.sourceLabel} → {pair.targetLabel}. An organisation can hold several roles at once, so
            add one relationship per role.
          </DialogDescription>
        </DialogHeader>

        {existing.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Already linked</Label>
            {existing.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1">
                <Badge variant="secondary" className="text-[10px]">{EDGE_LABEL[e.kind] || e.kind}</Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {e.source_node_id === pair.sourceId ? '→ forward' : '← reverse'}{e.note ? ` · ${e.note}` : ''}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Relationship</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EDGE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. owns the water network we design for" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={add} disabled={saving}><Plus className="h-4 w-4 mr-1" /> Add relationship</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

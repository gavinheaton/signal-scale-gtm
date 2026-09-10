import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { STAKEHOLDER_NODE_KINDS, STAKEHOLDER_ROLES } from '@/lib/ecosystemRoles';

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  mapId: string; projectId: string; onCreated: () => void;
}

export function AddNodeDialog({ open, onOpenChange, mapId, projectId, onCreated }: Props) {
  const [label, setLabel] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [kind, setKind] = useState('stakeholder');
  const [roles, setRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from('ecosystem_nodes').insert({
      map_id: mapId, project_id: projectId, kind,
      label: label.trim(), subtitle: subtitle.trim() || null,
      cluster: roles.length > 1 ? 'stakeholders' : null,
      meta: { roles, source: 'manual' },
      x: Math.random() * 400 - 200, y: Math.random() * 400 - 200,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Node added');
    setLabel(''); setSubtitle(''); setKind('stakeholder'); setRoles([]);
    onCreated(); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add ecosystem node</DialogTitle>
          <DialogDescription>
            Manual nodes are preserved across syncs. Drag from one card to another on the map to
            label how they relate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAKEHOLDER_NODE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sydney Water" />
          </div>
          <div>
            <Label>Subtitle (optional)</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="short description" />
          </div>
          <div>
            <Label>Roles</Label>
            <p className="text-[11px] text-muted-foreground mb-1">Tick every role that applies.</p>
            <div className="grid grid-cols-2 gap-1">
              {STAKEHOLDER_ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={roles.includes(r.value)}
                    onCheckedChange={(v) => setRoles((rs) => (v ? [...rs, r.value] : rs.filter((x) => x !== r.value)))}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !label.trim()}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

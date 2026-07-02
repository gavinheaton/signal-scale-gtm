import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const KINDS = [
  'partner','regulator','competitor','channel','influencer','community',
  'company','role','person','segment','theme','insight','custom',
];

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  mapId: string; projectId: string; onCreated: () => void;
}

export function AddNodeDialog({ open, onOpenChange, mapId, projectId, onCreated }: Props) {
  const [label, setLabel] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [kind, setKind] = useState('partner');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).from('ecosystem_nodes').insert({
      map_id: mapId, project_id: projectId, kind,
      label: label.trim(), subtitle: subtitle.trim() || null,
      x: Math.random() * 400 - 200, y: Math.random() * 400 - 200,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Node added');
    setLabel(''); setSubtitle(''); setKind('partner');
    onCreated(); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add ecosystem node</DialogTitle>
          <DialogDescription>Manual nodes are preserved across syncs.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. AWS Partner Network" />
          </div>
          <div>
            <Label>Subtitle (optional)</Label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="short description" />
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

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Persona, ICP, MatrixCategory } from '@/types/database';

const matrixColors: Record<MatrixCategory, string> = {
  now_account: 'bg-green-100 text-green-800',
  strategic_nurture: 'bg-blue-100 text-blue-800',
  trap_account: 'bg-amber-100 text-amber-800',
  no_go: 'bg-red-100 text-red-800',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'move' | 'duplicate';
  persona: Persona | null;
  icps: ICP[];
  onDone: () => void;
}

export default function MovePersonaDialog({ open, onOpenChange, mode, persona, icps, onDone }: Props) {
  const [targetIcpId, setTargetIcpId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const currentIcp = icps.find(i => i.id === persona?.icp_id);
  const availableIcps = icps.filter(i => i.id !== persona?.icp_id);

  useEffect(() => {
    if (open && persona) {
      setTargetIcpId('');
      setNewName(persona.persona_name);
    }
  }, [open, persona]);

  useEffect(() => {
    if (mode === 'duplicate' && targetIcpId && persona) {
      const target = icps.find(i => i.id === targetIcpId);
      if (target) setNewName(`${persona.persona_name} (${target.segment_name})`);
    }
  }, [targetIcpId, mode, persona, icps]);

  if (!persona) return null;

  const handleConfirm = async () => {
    if (!targetIcpId) return;
    setSaving(true);
    try {
      if (mode === 'move') {
        const { error } = await supabase
          .from('personas')
          .update({ icp_id: targetIcpId } as never)
          .eq('id', persona.id);
        if (error) throw error;
        toast.success('Persona moved');
      } else {
        const { id, ...rest } = persona as any;
        const insertPayload = {
          project_id: rest.project_id,
          icp_id: targetIcpId,
          persona_name: newName.trim() || persona.persona_name,
          role_in_buying: rest.role_in_buying,
          goals: rest.goals ?? {},
          pain_points: rest.pain_points ?? {},
          channel_preferences: rest.channel_preferences ?? {},
          how_we_help: rest.how_we_help ?? '',
          organisational_context: rest.organisational_context ?? {},
          buying_behaviour: rest.buying_behaviour ?? {},
          ai_readiness_score: rest.ai_readiness_score ?? 0,
          is_current: true,
        };
        const { error } = await supabase.from('personas').insert(insertPayload as never);
        if (error) throw error;
        toast.success('Persona duplicated');
      }
      onDone();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Failed to ${mode}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'move' ? 'Move persona' : 'Duplicate persona'}</DialogTitle>
          <DialogDescription>
            {mode === 'move'
              ? `Reassign "${persona.persona_name}" to a different ICP segment.`
              : `Create a copy of "${persona.persona_name}" under another ICP segment.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Current ICP</Label>
            <div className="mt-1">
              {currentIcp ? (
                <Badge variant="outline" className="gap-1">
                  {currentIcp.segment_name}
                  <span className={`ml-1 px-1.5 rounded text-[9px] ${matrixColors[currentIcp.matrix_category]}`}>
                    {currentIcp.matrix_category.replace('_', ' ')}
                  </span>
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground italic">Unknown</span>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Target ICP</Label>
            <Select value={targetIcpId} onValueChange={setTargetIcpId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose an ICP segment…" />
              </SelectTrigger>
              <SelectContent>
                {availableIcps.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.segment_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableIcps.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                No other ICPs available. Create another ICP first.
              </p>
            )}
          </div>

          {mode === 'duplicate' && (
            <div>
              <Label className="text-xs text-muted-foreground">New persona name</Label>
              <Input
                className="mt-1"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Persona name"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={saving || !targetIcpId || (mode === 'duplicate' && !newName.trim())}
          >
            {saving ? 'Saving…' : mode === 'move' ? 'Move persona' : 'Duplicate persona'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

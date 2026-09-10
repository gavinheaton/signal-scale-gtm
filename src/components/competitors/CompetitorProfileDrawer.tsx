import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, RefreshCw, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Competitor, CompetitorType, TYPE_LABELS } from '@/types/competitors';

interface Props {
  competitor: Competitor | null;
  onClose: () => void;
  onChanged: () => void;
  onResearch: (c: Competitor) => void;
  researching: boolean;
}

function linesToArray(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function CompetitorProfileDrawer({ competitor, onClose, onChanged, onResearch, researching }: Props) {
  const [form, setForm] = useState<Partial<Competitor>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(competitor ? { ...competitor } : {}); }, [competitor]);

  if (!competitor) return null;

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from('competitors').update({
      name: form.name,
      domain: form.domain || null,
      linkedin_url: form.linkedin_url || null,
      type: form.type,
      positioning: form.positioning || null,
      pricing_signals: form.pricing_signals || null,
      target_segments: form.target_segments || [],
      claims: form.claims || [],
      strengths: form.strengths || [],
      weaknesses: form.weaknesses || [],
      notes: form.notes || null,
    }).eq('id', competitor.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    onChanged();
  }

  async function remove() {
    const { error } = await (supabase as any).from('competitors').delete().eq('id', competitor.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removed');
    onClose();
    onChanged();
  }

  return (
    <Sheet open={!!competitor} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{competitor.name}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{TYPE_LABELS[competitor.type]}</Badge>
            {competitor.confidence && <Badge variant="outline">Confidence: {competitor.confidence}</Badge>}
            {competitor.researched_at && (
              <span className="text-xs text-muted-foreground">
                Researched {new Date(competitor.researched_at).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onResearch(competitor)} disabled={researching}>
              {researching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {competitor.researched_at ? 'Re-research' : 'Research this competitor'}
            </Button>
            {competitor.domain && (
              <Button size="sm" variant="ghost" asChild>
                <a href={`https://${competitor.domain}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> Website
                </a>
              </Button>
            )}
            {competitor.linkedin_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={competitor.linkedin_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> LinkedIn
                </a>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CompetitorType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CompetitorType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Web address</Label>
              <Input placeholder="acme.com" value={form.domain || ''} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">LinkedIn page</Label>
              <Input value={form.linkedin_url || ''} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
            </div>
          </div>

          <div>
            <Label className="text-xs">How they position themselves</Label>
            <Textarea rows={3} value={form.positioning || ''} onChange={(e) => setForm({ ...form, positioning: e.target.value })} />
          </div>

          <div>
            <Label className="text-xs">Who they target (one per line)</Label>
            <Textarea rows={3} value={(form.target_segments || []).join('\n')}
              onChange={(e) => setForm({ ...form, target_segments: linesToArray(e.target.value) })} />
          </div>

          <div>
            <Label className="text-xs">Their claims (one per line)</Label>
            <Textarea rows={4} value={(form.claims || []).join('\n')}
              onChange={(e) => setForm({ ...form, claims: linesToArray(e.target.value) })} />
          </div>

          {competitor.proof_points?.length > 0 && (
            <div>
              <Label className="text-xs">Proof points found</Label>
              <ul className="mt-1 space-y-1 text-sm">
                {competitor.proof_points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>
                      {p.text}
                      {p.source_url && (
                        <a href={p.source_url} target="_blank" rel="noreferrer" className="ml-1 text-primary underline text-xs">source</a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label className="text-xs">Pricing signals</Label>
            <Textarea rows={2} value={form.pricing_signals || ''} onChange={(e) => setForm({ ...form, pricing_signals: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Strengths (one per line)</Label>
              <Textarea rows={4} value={(form.strengths || []).join('\n')}
                onChange={(e) => setForm({ ...form, strengths: linesToArray(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Weaknesses (one per line)</Label>
              <Textarea rows={4} value={(form.weaknesses || []).join('\n')}
                onChange={(e) => setForm({ ...form, weaknesses: linesToArray(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Your notes</Label>
            <Textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {competitor.evidence?.length > 0 && (
            <div>
              <Label className="text-xs">Where this came from</Label>
              <ul className="mt-1 space-y-1">
                {competitor.evidence.map((e, i) => (
                  <li key={i} className="text-xs">
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-primary underline break-all">{e.url}</a>
                    {e.captured_at && <span className="text-muted-foreground ml-1">({new Date(e.captured_at).toLocaleDateString()})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between pt-2 pb-6">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save changes
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

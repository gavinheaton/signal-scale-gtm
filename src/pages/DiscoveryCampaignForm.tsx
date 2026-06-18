import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, X, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DEFAULT_OUTREACH_SEQUENCE,
  DiscoveryCampaign,
  DiscoveryTier,
  OutreachSequence,
} from '@/types/discovery';
import { ICP, Persona } from '@/types/database';

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add}>Add</Button>
      </div>
    </div>
  );
}

export default function DiscoveryCampaignForm() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [icpIds, setIcpIds] = useState<string[]>([]);
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [qualifying, setQualifying] = useState<string[]>([]);
  const [disqualifying, setDisqualifying] = useState<string[]>([]);
  const [tiers, setTiers] = useState<DiscoveryTier[]>([
    { label: 'Tier 1', criteria: 'High fit, high access' },
    { label: 'Tier 2', criteria: 'High fit, lower access' },
    { label: 'Tier 3', criteria: 'Adjacent / aspirational' },
  ]);
  const [seq, setSeq] = useState<OutreachSequence>(DEFAULT_OUTREACH_SEQUENCE);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProject) return;
    (async () => {
      setLoading(true);
      const [icpsRes, personasRes, existing] = await Promise.all([
        supabase.from('icps').select('*').eq('project_id', currentProject.id),
        supabase.from('personas').select('*').eq('project_id', currentProject.id),
        isEdit ? (supabase as any).from('discovery_campaigns').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (icpsRes.data) setIcps(icpsRes.data as unknown as ICP[]);
      if (personasRes.data) setPersonas(personasRes.data as unknown as Persona[]);
      if (existing.data) {
        const c = existing.data as DiscoveryCampaign;
        setName(c.name);
        setDescription(c.description || '');
        setTargetSegment(c.target_segment || '');
        setIcpIds(c.icp_ids || []);
        setPersonaIds(c.persona_ids || []);
        setQualifying(c.qualifying_signals || []);
        setDisqualifying(c.disqualifying_signals || []);
        if (Array.isArray(c.tiers) && c.tiers.length) setTiers(c.tiers);
        if (c.outreach_sequence) setSeq({ ...DEFAULT_OUTREACH_SEQUENCE, ...c.outreach_sequence });
      }
      setLoading(false);
    })();
  }, [currentProject, id, isEdit]);

  // Seed signals from selected ICPs (only when creating new + first selection)
  useEffect(() => {
    if (isEdit) return;
    if (qualifying.length || disqualifying.length) return;
    if (icpIds.length === 0) return;
    const seeded: string[] = [];
    const antiSeeded: string[] = [];
    for (const icp of icps.filter((x) => icpIds.includes(x.id))) {
      const anti = icp.anti_icp_signals as any;
      if (Array.isArray(anti)) antiSeeded.push(...anti.filter((s) => typeof s === 'string'));
      else if (anti && typeof anti === 'object') {
        for (const v of Object.values(anti)) if (typeof v === 'string') antiSeeded.push(v);
      }
    }
    if (antiSeeded.length) setDisqualifying(Array.from(new Set(antiSeeded)));
    if (seeded.length) setQualifying(Array.from(new Set(seeded)));
  }, [icpIds, icps, isEdit, qualifying.length, disqualifying.length]);

  const save = async () => {
    if (!currentProject) return;
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    setSaving(true);
    const payload = {
      project_id: currentProject.id,
      name: name.trim(),
      description: description || null,
      target_segment: targetSegment || null,
      icp_ids: icpIds,
      persona_ids: personaIds,
      qualifying_signals: qualifying,
      disqualifying_signals: disqualifying,
      tiers,
      outreach_sequence: seq,
    };
    const res = isEdit
      ? await (supabase as any).from('discovery_campaigns').update(payload).eq('id', id).select().maybeSingle()
      : await (supabase as any).from('discovery_campaigns').insert(payload).select().maybeSingle();
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(isEdit ? 'Campaign updated' : 'Campaign created');
    navigate(`/project/discovery/${res.data.id}`);
  };

  if (!currentProject) return <div className="p-6">Select a project first.</div>;
  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/project/discovery')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Discovery
      </Button>

      <Card>
        <CardHeader><CardTitle>{isEdit ? 'Edit campaign' : 'New discovery campaign'}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mutual banks — P&C risk leaders" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Why are we running this discovery? What are we trying to validate?" />
          </div>
          <div>
            <Label>Target segment</Label>
            <Input value={targetSegment} onChange={(e) => setTargetSegment(e.target.value)} placeholder="e.g. Australian mutual banks, P&C leaders" />
          </div>

          <div>
            <Label className="mb-2 block">Target ICPs</Label>
            {icps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ICPs defined yet. Create one in ICP & Personas first.</p>
            ) : (
              <div className="space-y-2 border rounded p-3 max-h-48 overflow-auto">
                {icps.map((icp) => (
                  <label key={icp.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={icpIds.includes(icp.id)}
                      onCheckedChange={(v) => setIcpIds(v ? [...icpIds, icp.id] : icpIds.filter((x) => x !== icp.id))}
                    />
                    {icp.segment_name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Target personas (roles to find)</Label>
            {personas.length === 0 ? (
              <p className="text-xs text-muted-foreground">No personas defined yet.</p>
            ) : (
              <div className="space-y-2 border rounded p-3 max-h-48 overflow-auto">
                {personas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={personaIds.includes(p.id)}
                      onCheckedChange={(v) => setPersonaIds(v ? [...personaIds, p.id] : personaIds.filter((x) => x !== p.id))}
                    />
                    {p.persona_name} <span className="text-muted-foreground text-xs">· {p.role_in_buying}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Qualifying signals</Label>
            <p className="text-xs text-muted-foreground mb-2">Indicators an org is a good fit.</p>
            <TagInput value={qualifying} onChange={setQualifying} placeholder="e.g. APRA-regulated" />
          </div>

          <div>
            <Label>Disqualifying signals</Label>
            <p className="text-xs text-muted-foreground mb-2">Red flags. Seeded from selected ICPs' anti-ICP signals.</p>
            <TagInput value={disqualifying} onChange={setDisqualifying} placeholder="e.g. <50 employees" />
          </div>

          <div>
            <Label className="mb-2 block">Tiers</Label>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    className="w-32"
                    value={t.label}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Input
                    value={t.criteria}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, criteria: e.target.value } : x)))}
                    placeholder="Criteria"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { label: `Tier ${tiers.length + 1}`, criteria: '' }])}>
                <Plus className="h-4 w-4 mr-1" /> Add tier
              </Button>
            </div>
          </div>

          <div className="space-y-3 border rounded p-4 bg-muted/30">
            <h3 className="font-semibold text-sm">Outreach sequence</h3>
            <div>
              <Label className="text-xs">Step 1 — connection request</Label>
              <Textarea rows={2} value={seq.step_1} onChange={(e) => setSeq({ ...seq, step_1: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">Step 2 — DM (hours after connection accepted)</Label>
                <Input type="number" value={seq.step_2_trigger_hours} onChange={(e) => setSeq({ ...seq, step_2_trigger_hours: Number(e.target.value) || 0 })} />
              </div>
              <div className="flex-[3]">
                <Label className="text-xs">Step 2 message</Label>
                <Textarea rows={2} value={seq.step_2} onChange={(e) => setSeq({ ...seq, step_2: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs">Step 3 — email (days after DM)</Label>
                <Input type="number" value={seq.step_3_trigger_days} onChange={(e) => setSeq({ ...seq, step_3_trigger_days: Number(e.target.value) || 0 })} />
              </div>
              <div className="flex-[3]">
                <Label className="text-xs">Step 3 message (single attempt only)</Label>
                <Textarea rows={2} value={seq.step_3} onChange={(e) => setSeq({ ...seq, step_3: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Close as no-response after (days from email sent)</Label>
              <Input type="number" value={seq.close_after_days} onChange={(e) => setSeq({ ...seq, close_after_days: Number(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => navigate('/project/discovery')}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {isEdit ? 'Save changes' : 'Create campaign'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

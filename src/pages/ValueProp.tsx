import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Sparkles, Star, StarOff, Trash2, Save, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';

type Format = 'memory_dart' | 'elevator_pitch';
type Status = 'draft' | 'active' | 'archived';

interface ValueProp {
  id: string;
  project_id: string;
  icp_id: string | null;
  persona_id: string | null;
  segment_label: string | null;
  format: Format;
  fields: Record<string, string>;
  statement: string | null;
  status: Status;
  is_primary: boolean;
  ai_rationale: string | null;
  created_at: string;
  updated_at: string;
}

interface Problem {
  id?: string;
  problem: string;
  has_owner: boolean;
  tried_and_failed: boolean;
  saves_or_makes_money: boolean;
  broader_impact: boolean;
  worth_solving_score: number;
  source?: string;
}

const MEMORY_DART_FIELDS = [
  { key: 'i_am', label: "I'm", placeholder: 'Your name / business' },
  { key: 'i_help', label: 'I help', placeholder: 'Your bullseye customer' },
  { key: 'impact_metric', label: 'reduce / increase', placeholder: 'The pain point + measurement' },
  { key: 'impact_size', label: 'by', placeholder: 'The size / comparison of your impact' },
];

const ELEVATOR_FIELDS = [
  { key: 'solution', label: 'Our [solution]', placeholder: 'The solution from your canvas' },
  { key: 'segment', label: 'helps [segment]', placeholder: 'Customer segments and personas' },
  { key: 'jtbd', label: 'who want to', placeholder: 'The job to be done / pressing need' },
  { key: 'reduction_pain', label: 'by reducing', placeholder: 'The pain point you solve' },
  { key: 'improvement_benefit', label: 'and improving', placeholder: 'The customer benefit you create' },
  { key: 'unlike', label: 'unlike', placeholder: 'Competitor positioning contrast' },
];

export default function ValueProp() {
  const { currentProject } = useProject();
  const [items, setItems] = useState<ValueProp[]>([]);
  const [icps, setIcps] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [variations, setVariations] = useState<{ label: string; statement: string; angle: string }[]>([]);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    if (!currentProject) return;
    const pid = currentProject.id;
    setLoading(true);
    Promise.all([
      (supabase.from('value_propositions' as any).select('*').eq('project_id', pid).order('updated_at', { ascending: false })) as any,
      supabase.from('icps').select('id, segment_name').eq('project_id', pid),
      supabase.from('personas').select('id, persona_name, icp_id, role_in_buying').eq('project_id', pid),
    ]).then(([vpRes, icpRes, personaRes]: any[]) => {
      const list = (vpRes.data || []) as ValueProp[];
      setItems(list);
      setIcps(icpRes.data || []);
      setPersonas(personaRes.data || []);
      if (list.length && !selectedId) setSelectedId(list[0].id);
      setLoading(false);
    });
  }, [currentProject]);

  useEffect(() => {
    if (!selectedId) { setProblems([]); return; }
    (supabase.from('value_prop_problems' as any).select('*').eq('value_prop_id', selectedId).order('worth_solving_score', { ascending: false }) as any)
      .then(({ data }: any) => setProblems(data || []));
  }, [selectedId]);

  if (!currentProject) return <Navigate to="/projects" replace />;

  const createNew = async () => {
    const { data, error } = await (supabase.from('value_propositions' as any).insert({
      project_id: currentProject.id,
      format: 'memory_dart',
      status: 'draft',
      fields: {},
    }).select('*').single() as any);
    if (error) { toast.error(error.message); return; }
    setItems([data as ValueProp, ...items]);
    setSelectedId((data as ValueProp).id);
    toast.success('New value proposition created');
  };

  const updateSelected = (patch: Partial<ValueProp>) => {
    if (!selected) return;
    setItems((prev) => prev.map((v) => (v.id === selected.id ? { ...v, ...patch } : v)));
  };

  const saveSelected = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await (supabase.from('value_propositions' as any).update({
      icp_id: selected.icp_id,
      persona_id: selected.persona_id,
      segment_label: selected.segment_label,
      format: selected.format,
      fields: selected.fields,
      statement: selected.statement,
      status: selected.status,
      is_primary: selected.is_primary,
      ai_rationale: selected.ai_rationale,
    }).eq('id', selected.id) as any);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Saved');
  };

  const deleteSelected = async () => {
    if (!selected || !confirm('Delete this value proposition?')) return;
    const { error } = await (supabase.from('value_propositions' as any).delete().eq('id', selected.id) as any);
    if (error) { toast.error(error.message); return; }
    const remaining = items.filter((v) => v.id !== selected.id);
    setItems(remaining);
    setSelectedId(remaining[0]?.id || null);
  };

  const togglePrimary = async () => {
    if (!selected) return;
    // Unset other primaries first if setting this one primary
    if (!selected.is_primary) {
      await (supabase.from('value_propositions' as any).update({ is_primary: false }).eq('project_id', currentProject.id) as any);
    }
    const { error } = await (supabase.from('value_propositions' as any).update({ is_primary: !selected.is_primary }).eq('id', selected.id) as any);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((v) => ({ ...v, is_primary: v.id === selected.id ? !selected.is_primary : (selected.is_primary ? v.is_primary : false) })));
  };

  const callAI = async (action: string, extra: any = {}) => {
    if (!selected) return null;
    setAiBusy(action);
    const { data, error } = await supabase.functions.invoke('value-prop-assist', {
      body: {
        action,
        project_id: currentProject.id,
        icp_id: selected.icp_id,
        persona_id: selected.persona_id,
        format: selected.format,
        fields: selected.fields,
        statement: selected.statement,
        problems: problems.map((p) => p.problem),
        ...extra,
      },
    });
    setAiBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || 'AI failed');
      return null;
    }
    return (data as any).result;
  };

  const brainstormProblems = async () => {
    const res = await callAI('brainstorm_problems');
    if (!res?.problems?.length || !selected) return;
    const rows = res.problems.map((p: any) => ({
      project_id: currentProject.id,
      value_prop_id: selected.id,
      icp_id: selected.icp_id,
      persona_id: selected.persona_id,
      problem: p.problem,
      has_owner: !!p.has_owner,
      tried_and_failed: !!p.tried_and_failed,
      saves_or_makes_money: !!p.saves_or_makes_money,
      broader_impact: !!p.broader_impact,
      worth_solving_score: [p.has_owner, p.tried_and_failed, p.saves_or_makes_money, p.broader_impact].filter(Boolean).length,
      source: 'ai',
      notes: p.rationale || null,
    }));
    const { data, error } = await (supabase.from('value_prop_problems' as any).insert(rows).select('*') as any);
    if (error) { toast.error(error.message); return; }
    setProblems([...(data || []), ...problems]);
    toast.success(`Added ${rows.length} suggested problems`);
  };

  const draftWithAI = async () => {
    const res = await callAI('draft_statement');
    if (!res) return;
    updateSelected({ fields: { ...(selected!.fields || {}), ...(res.fields || {}) }, statement: res.statement || selected!.statement, ai_rationale: res.rationale || null });
    toast.success('AI draft applied — review and save');
  };

  const suggestVariations = async () => {
    const res = await callAI('variations');
    if (!res?.variations) return;
    setVariations(res.variations);
  };

  const toggleProblemChar = async (p: Problem, key: keyof Problem) => {
    if (!p.id) return;
    const updated: any = { ...p, [key]: !p[key] };
    updated.worth_solving_score = [updated.has_owner, updated.tried_and_failed, updated.saves_or_makes_money, updated.broader_impact].filter(Boolean).length;
    await (supabase.from('value_prop_problems' as any).update({
      has_owner: updated.has_owner,
      tried_and_failed: updated.tried_and_failed,
      saves_or_makes_money: updated.saves_or_makes_money,
      broader_impact: updated.broader_impact,
      worth_solving_score: updated.worth_solving_score,
    }).eq('id', p.id) as any);
    setProblems(problems.map((x) => (x.id === p.id ? updated : x)));
  };

  const addManualProblem = async () => {
    const text = prompt('Describe the customer problem:');
    if (!text?.trim() || !selected) return;
    const { data, error } = await (supabase.from('value_prop_problems' as any).insert({
      project_id: currentProject.id,
      value_prop_id: selected.id,
      icp_id: selected.icp_id,
      persona_id: selected.persona_id,
      problem: text.trim(),
      source: 'manual',
    }).select('*').single() as any);
    if (error) { toast.error(error.message); return; }
    setProblems([data, ...problems]);
    setEditingProblemId(data.id);
    setEditingText(data.problem);
  };

  const startEditProblem = (p: Problem) => {
    if (!p.id) return;
    setEditingProblemId(p.id);
    setEditingText(p.problem);
  };

  const cancelEditProblem = () => {
    setEditingProblemId(null);
    setEditingText('');
  };

  const saveProblemText = async (id: string) => {
    const text = editingText.trim();
    if (!text) { toast.error('Problem cannot be empty'); return; }
    const { error } = await (supabase.from('value_prop_problems' as any).update({ problem: text }).eq('id', id) as any);
    if (error) { toast.error(error.message); return; }
    setProblems(problems.map((p) => (p.id === id ? { ...p, problem: text } : p)));
    setEditingProblemId(null);
    setEditingText('');
    toast.success('Problem updated');
  };

  const deleteProblem = async (id: string) => {
    await (supabase.from('value_prop_problems' as any).delete().eq('id', id) as any);
    setProblems(problems.filter((p) => p.id !== id));
  };

  const fieldDefs = selected?.format === 'elevator_pitch' ? ELEVATOR_FIELDS : MEMORY_DART_FIELDS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Value Proposition</h1>
          <p className="text-sm" style={{ color: 'hsl(var(--orange))' }}>Design pitches that resonate with each ICP</p>
        </div>
        <Button onClick={createNew}><Plus className="h-4 w-4 mr-2" />New Value Prop</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left rail */}
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Your Value Props</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-3">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">None yet. Click "New Value Prop".</p>}
            {items.map((v) => {
              const icp = icps.find((i) => i.id === v.icp_id);
              return (
                <button key={v.id} onClick={() => setSelectedId(v.id)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${selectedId === v.id ? 'bg-accent border-primary' : 'hover:bg-accent/50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium truncate">{v.segment_label || icp?.segment_name || 'Untitled'}</span>
                    {v.is_primary && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-[9px]">{v.format.replace('_', ' ')}</Badge>
                    <Badge variant="secondary" className="text-[9px]">{v.status}</Badge>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Editor */}
        <div className="space-y-4">
          {!selected && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              Select or create a value proposition to get started.
            </CardContent></Card>
          )}

          {selected && (
            <Tabs defaultValue="target" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="target">1. Target & Problems</TabsTrigger>
                  <TabsTrigger value="draft">2. Draft</TabsTrigger>
                  <TabsTrigger value="refine">3. Refine</TabsTrigger>
                </TabsList>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={togglePrimary}>
                    {selected.is_primary ? <><StarOff className="h-4 w-4 mr-1" />Unset primary</> : <><Star className="h-4 w-4 mr-1" />Mark primary</>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={deleteSelected}><Trash2 className="h-4 w-4" /></Button>
                  <Button size="sm" onClick={saveSelected} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Save
                  </Button>
                </div>
              </div>

              <TabsContent value="target" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Who are you targeting?</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label>ICP</Label>
                        <Select value={selected.icp_id || ''} onValueChange={(v) => updateSelected({ icp_id: v || null })}>
                          <SelectTrigger><SelectValue placeholder="Select ICP" /></SelectTrigger>
                          <SelectContent>
                            {icps.map((i) => <SelectItem key={i.id} value={i.id}>{i.segment_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Persona (optional)</Label>
                        <Select value={selected.persona_id || ''} onValueChange={(v) => updateSelected({ persona_id: v || null })}>
                          <SelectTrigger><SelectValue placeholder="Select persona" /></SelectTrigger>
                          <SelectContent>
                            {personas.filter((p) => !selected.icp_id || p.icp_id === selected.icp_id).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.persona_name} · {p.role_in_buying}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Segment label</Label>
                        <Input value={selected.segment_label || ''} onChange={(e) => updateSelected({ segment_label: e.target.value })} placeholder="e.g. Series-B fintech CTOs" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Problems worth solving</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Score each against 4 criteria: owner, tried &amp; failed, saves/makes money, broader impact.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={addManualProblem}><Plus className="h-4 w-4 mr-1" />Add</Button>
                      <Button size="sm" onClick={brainstormProblems} disabled={aiBusy === 'brainstorm_problems' || !selected.icp_id}>
                        {aiBusy === 'brainstorm_problems' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Brainstorm with AI
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {problems.length === 0 && <p className="text-sm text-muted-foreground">No problems yet. Add one manually or brainstorm with AI (needs ICP selected).</p>}
                    <div className="space-y-2">
                      {problems.map((p) => (
                        <div key={p.id} className="border rounded-md p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm">{p.problem}</p>
                            <Badge variant={p.worth_solving_score >= 3 ? 'default' : 'secondary'} className="shrink-0">{p.worth_solving_score}/4</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs">
                            {(['has_owner', 'tried_and_failed', 'saves_or_makes_money', 'broader_impact'] as const).map((k) => (
                              <label key={k} className="flex items-center gap-1 cursor-pointer">
                                <Checkbox checked={!!p[k]} onCheckedChange={() => toggleProblemChar(p, k)} />
                                <span>{k.replace(/_/g, ' ')}</span>
                              </label>
                            ))}
                            <button className="text-destructive ml-auto" onClick={() => p.id && deleteProblem(p.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="draft" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Choose your format</CardTitle>
                      <Button size="sm" onClick={draftWithAI} disabled={aiBusy === 'draft_statement'}>
                        {aiBusy === 'draft_statement' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Draft with AI
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs value={selected.format} onValueChange={(v) => updateSelected({ format: v as Format, fields: {} })}>
                      <TabsList>
                        <TabsTrigger value="memory_dart">Memory Dart</TabsTrigger>
                        <TabsTrigger value="elevator_pitch">Elevator Pitch</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <div className="space-y-3">
                      {fieldDefs.map((f) => (
                        <div key={f.key}>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                          <Input
                            value={selected.fields[f.key] || ''}
                            onChange={(e) => updateSelected({ fields: { ...selected.fields, [f.key]: e.target.value } })}
                            placeholder={f.placeholder}
                          />
                        </div>
                      ))}
                    </div>

                    {selected.ai_rationale && (
                      <div className="text-xs text-muted-foreground border-l-2 border-primary pl-3">
                        <strong>AI rationale:</strong> {selected.ai_rationale}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="refine" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Final statement</CardTitle>
                      <div className="flex gap-2">
                        <Select value={selected.status} onValueChange={(v) => updateSelected({ status: v as Status })}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={suggestVariations} disabled={aiBusy === 'variations'}>
                          {aiBusy === 'variations' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          3 variations
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      rows={5}
                      value={selected.statement || ''}
                      onChange={(e) => updateSelected({ statement: e.target.value })}
                      placeholder="Your assembled value proposition statement…"
                    />

                    {variations.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">AI Variations</p>
                        {variations.map((v, i) => (
                          <div key={i} className="border rounded-md p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">{v.label || v.angle}</Badge>
                              <Button size="sm" variant="ghost" onClick={() => updateSelected({ statement: v.statement })}>Use this</Button>
                            </div>
                            <p className="text-sm">{v.statement}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}

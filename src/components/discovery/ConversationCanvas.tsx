import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Save, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DiscoveryCampaign, DiscoveryConversation, DiscoveryContact } from '@/types/discovery';
import { Persona } from '@/types/database';

interface SummariseResult {
  insights: { text: string; is_quote: boolean }[];
  next_steps: string;
}

export default function ConversationCanvas({ conversationId, campaign, personas, onClose }: { conversationId: string; campaign: DiscoveryCampaign; personas: Persona[]; onClose: () => void }) {
  const [conv, setConv] = useState<DiscoveryConversation | null>(null);
  const [contact, setContact] = useState<(DiscoveryContact & { discovery_organizations: { name: string } }) | null>(null);
  const [objective, setObjective] = useState('');
  const [keyTopics, setKeyTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [profile, setProfile] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [summarising, setSummarising] = useState(false);
  const [summary, setSummary] = useState<SummariseResult | null>(null);
  const [interpretation, setInterpretation] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('discovery_conversations')
        .select('*, discovery_contacts(*, discovery_organizations(name))')
        .eq('id', conversationId)
        .maybeSingle();
      if (data) {
        setConv(data as DiscoveryConversation);
        setContact(data.discovery_contacts as any);
        setObjective(data.objective || '');
        setKeyTopics(data.key_topics || []);
        setQuestions(data.guiding_questions || []);
        const persona = personas.find((p) => p.id === data.discovery_contacts?.persona_id);
        setProfile(data.customer_profile_snapshot || (persona ? `${persona.persona_name} — ${persona.role_in_buying}` : ''));
        setRawNotes(data.raw_notes || '');
        setNextSteps(data.next_steps || '');
        setDate(data.date || '');
        setDuration(data.duration_minutes ?? '');
      }
      setLoading(false);
    })();
  }, [conversationId, personas]);

  const save = async () => {
    setSaving(true);
    const { error } = await (supabase as any).from('discovery_conversations').update({
      objective: objective || null,
      key_topics: keyTopics,
      guiding_questions: questions,
      customer_profile_snapshot: profile || null,
      raw_notes: rawNotes || null,
      next_steps: nextSteps || null,
      date: date || null,
      duration_minutes: typeof duration === 'number' ? duration : null,
    }).eq('id', conversationId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
  };

  const suggestQuestions = async () => {
    setSuggesting(true);
    const { data, error } = await supabase.functions.invoke('discovery-suggest-questions', { body: { conversation_id: conversationId } });
    setSuggesting(false);
    if (error) { toast.error(error.message); return; }
    setQuestions(data?.questions || []);
  };

  const summarise = async () => {
    if (!rawNotes.trim()) { toast.error('Add some raw notes first'); return; }
    // Save raw notes first
    await (supabase as any).from('discovery_conversations').update({ raw_notes: rawNotes }).eq('id', conversationId);
    setSummarising(true);
    const { data, error } = await supabase.functions.invoke('discovery-summarise-notes', { body: { conversation_id: conversationId } });
    setSummarising(false);
    if (error) { toast.error(error.message); return; }
    setSummary(data as SummariseResult);
    if (data?.next_steps && !nextSteps) setNextSteps(data.next_steps);
  };

  const persistInsights = async () => {
    if (!summary) return;
    const rows = summary.insights.map((i) => ({
      conversation_id: conversationId,
      campaign_id: campaign.id,
      text: i.text,
      kind: 'observation',
      is_quote: i.is_quote,
    }));
    const { error } = await (supabase as any).from('discovery_insights').insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved ${rows.length} insights`);
    setSummary(null);
  };

  const addInterpretation = async () => {
    if (!interpretation.trim()) return;
    const { error } = await (supabase as any).from('discovery_insights').insert({
      conversation_id: conversationId,
      campaign_id: campaign.id,
      text: interpretation.trim(),
      kind: 'interpretation',
      is_quote: false,
    });
    if (error) { toast.error(error.message); return; }
    setInterpretation('');
    toast.success('Interpretation added');
  };

  if (loading || !conv) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>Conversation Canvas</SheetTitle>
        {contact && <p className="text-sm text-muted-foreground">{contact.name} · {contact.discovery_organizations.name}</p>}
      </SheetHeader>

      <div className="grid grid-cols-2 gap-3">
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : '')} /></div>
      </div>

      <div>
        <Label>Objective</Label>
        <Textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Why this conversation?" />
      </div>

      <div>
        <Label>Key topics</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {keyTopics.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">{t}<button onClick={() => setKeyTopics(keyTopics.filter((x) => x !== t))}><X className="h-3 w-3" /></button></Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={topicDraft} onChange={(e) => setTopicDraft(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter' && topicDraft.trim()) { e.preventDefault(); setKeyTopics([...keyTopics, topicDraft.trim()]); setTopicDraft(''); }
          }} placeholder="Add topic and press Enter" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Guiding questions</Label>
          <Button size="sm" variant="outline" onClick={suggestQuestions} disabled={suggesting}>
            {suggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Suggest questions
          </Button>
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <Textarea rows={1} value={q} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? e.target.value : x)))} />
              <Button variant="ghost" size="icon" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setQuestions([...questions, ''])}><Plus className="h-3 w-3 mr-1" /> Add question</Button>
        </div>
      </div>

      <div>
        <Label>Customer profile snapshot</Label>
        <Textarea rows={2} value={profile} onChange={(e) => setProfile(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Raw notes / transcript</Label>
          <Button size="sm" variant="outline" onClick={summarise} disabled={summarising}>
            {summarising ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Summarise
          </Button>
        </div>
        <Textarea rows={8} value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} placeholder="Paste notes or transcript here" />
      </div>

      {summary && (
        <div className="border rounded p-3 bg-muted/30 space-y-2">
          <h4 className="font-semibold text-sm">Proposed insights (observations only)</h4>
          <ul className="space-y-1 text-sm">
            {summary.insights.map((i, idx) => (
              <li key={idx} className="flex gap-2">
                {i.is_quote && <Badge variant="outline" className="text-[10px]">quote</Badge>}
                <span className={i.is_quote ? 'italic' : ''}>{i.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setSummary(null)}>Discard</Button>
            <Button size="sm" onClick={persistInsights}>Save {summary.insights.length} insights</Button>
          </div>
        </div>
      )}

      <div>
        <Label>Next steps</Label>
        <Textarea rows={3} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} />
      </div>

      <div className="border-t pt-3">
        <Label className="text-xs">Add an interpretation (your own takeaway — kept separate from observations)</Label>
        <div className="flex gap-2 mt-1">
          <Input value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="Your interpretation…" />
          <Button variant="outline" size="sm" onClick={addInterpretation}>Add</Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background pt-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save</Button>
      </div>
    </div>
  );
}

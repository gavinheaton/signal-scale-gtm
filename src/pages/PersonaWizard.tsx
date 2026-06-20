import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Sparkles, Loader2, Check, Save, Users, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { RoleInBuying } from '@/types/database';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PersonaDraft {
  persona_name?: string;
  role_in_buying?: string;
  organisational_context?: Record<string, any>;
  goals?: Record<string, any>;
  pain_points?: Record<string, any>;
  buying_behaviour?: Record<string, any>;
  channel_preferences?: Record<string, any>;
  preferred_evidence?: Record<string, any>;
  ai_readiness_score?: number;
  how_we_help?: string;
  sections_complete?: string[];
  is_complete?: boolean;
}

const PERSONA_SECTIONS = [
  { key: 'persona_name', label: 'Name & Role', icon: '👤' },
  { key: 'organisational_context', label: 'Org Context', icon: '🏢' },
  { key: 'goals', label: 'Goals', icon: '🎯' },
  { key: 'pain_points', label: 'Pain Points', icon: '⚡' },
  { key: 'buying_behaviour', label: 'Buying Behaviour', icon: '💳' },
  { key: 'channel_preferences', label: 'Channels & Evidence', icon: '📡' },
  { key: 'how_we_help', label: 'How We Help', icon: '🤝' },
];

function getSectionStatus(draft: PersonaDraft, key: string): 'empty' | 'partial' | 'complete' {
  if (draft.sections_complete?.includes(key)) return 'complete';
  const val = (draft as any)[key];
  if (!val) return 'empty';
  if (typeof val === 'string' && val.length > 0) return 'partial';
  if (typeof val === 'object' && Object.keys(val).length > 0) return 'partial';
  return 'empty';
}

export default function PersonaWizard() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const icpId = searchParams.get('icp_id');
  const editPersonaId = searchParams.get('edit_persona_id');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonaDraft>({});
  const [saving, setSaving] = useState(false);
  const [savedPersonaId, setSavedPersonaId] = useState<string | null>(null);
  const [initStage, setInitStage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentPhase = PERSONA_SECTIONS.find(s => getSectionStatus(draft, s.key) !== 'complete');
  const completedCount = PERSONA_SECTIONS.filter(s => getSectionStatus(draft, s.key) === 'complete').length;
  const completionPct = Math.round((completedCount / PERSONA_SECTIONS.length) * 100);
  const isComplete = draft.is_complete === true;
  const hasAnyData = PERSONA_SECTIONS.some(s => getSectionStatus(draft, s.key) !== 'empty');

  useEffect(() => {
    if (!currentProject) return;
    initSession();
  }, [currentProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const INIT_STAGES = editPersonaId
    ? [
        { text: 'Loading persona data…', delay: 0 },
        { text: 'Reading current profile…', delay: 1500 },
        { text: 'Preparing edit session…', delay: 3000 },
      ]
    : [
        { text: 'Reading your ICP…', delay: 0 },
        { text: 'Analysing buyer roles…', delay: 1500 },
        { text: 'Identifying target personas…', delay: 3000 },
        { text: 'Building recommendations…', delay: 5000 },
      ];

  const initSession = async () => {
    setLoading(true);
    setInitStage(INIT_STAGES[0].text);

    // Start progressive stage updates
    const stageTimers = INIT_STAGES.slice(1).map(stage =>
      setTimeout(() => setInitStage(stage.text), stage.delay)
    );

    try {
      // In edit mode, skip resuming existing sessions
      if (!editPersonaId) {
        const { data: existingSessions } = await supabase
          .from('wizard_sessions')
          .select('*')
          .eq('project_id', currentProject!.id)
          .eq('session_type', 'persona')
          .eq('status', 'in_progress')
          .order('created_at', { ascending: false })
          .limit(1);

        if (existingSessions && existingSessions.length > 0) {
          const session = existingSessions[0];
          setSessionId(session.id);
          const sessionMessages = session.messages as Array<{ role: string; content: string }>;
          setMessages(
            sessionMessages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.role === 'assistant'
                ? m.content.replace(/<draft>[\s\S]*?<\/draft>/g, '').trim()
                : m.content,
            }))
          );
          if (session.draft_output && Object.keys(session.draft_output as object).length > 0) {
            setDraft(session.draft_output as PersonaDraft);
          }
          toast.info('Resumed your previous persona session');
          stageTimers.forEach(clearTimeout);
          return;
        }
      }

      const res = await supabase.functions.invoke('persona-wizard', {
        body: {
          project_id: currentProject!.id,
          icp_id: icpId,
          ...(editPersonaId ? { edit_persona_id: editPersonaId } : {}),
        },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.reply }]);
      if (data.updated_draft) setDraft(data.updated_draft);
    } catch (err: any) {
      toast.error('Failed to start wizard: ' + (err.message || 'Unknown error'));
    } finally {
      stageTimers.forEach(clearTimeout);
      setInitStage(null);
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !sessionId) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await supabase.functions.invoke('persona-wizard', {
        body: {
          message: userMsg,
          session_id: sessionId,
          project_id: currentProject!.id,
          icp_id: icpId,
          ...(editPersonaId ? { edit_persona_id: editPersonaId } : {}),
        },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updated_draft) setDraft(data.updated_draft);
      if (data.draft_warning) toast.warning(data.draft_warning);
    } catch (err: any) {
      toast.error('AI error: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const savePersona = async () => {
    if (!currentProject || !draft) return;
    setSaving(true);

    try {
      const validRoles: RoleInBuying[] = ['champion', 'economic_buyer', 'influencer', 'end_user', 'blocker'];
      const roleInBuying = validRoles.includes(draft.role_in_buying as RoleInBuying)
        ? (draft.role_in_buying as RoleInBuying)
        : 'influencer';

      // Defensive extraction: AI drafts may nest data under variant keys
      const extractJson = (...keys: string[]): Record<string, any> => {
        for (const key of keys) {
          const val = (draft as any)[key];
          if (val && typeof val === 'object' && Object.keys(val).length > 0) return val;
        }
        return {};
      };

      const channelPrefs = extractJson('channel_preferences', 'channels');
      const evidence = extractJson('preferred_evidence', 'evidence');

      console.log('[PersonaWizard] Full draft before save:', JSON.stringify(draft, null, 2));

      const personaData = {
        project_id: currentProject.id,
        icp_id: icpId || null,
        persona_name: draft.persona_name || 'New Persona',
        role_in_buying: roleInBuying,
        goals: extractJson('goals'),
        pain_points: extractJson('pain_points', 'painpoints'),
        channel_preferences: {
          ...channelPrefs,
          preferred_evidence: evidence,
        },
        how_we_help: draft.how_we_help || '',
        organisational_context: extractJson('organisational_context', 'org_context', 'context'),
        buying_behaviour: extractJson('buying_behaviour', 'buying_behavior'),
        ai_readiness_score: draft.ai_readiness_score || 3,
        is_current: true,
      };

      let savedId: string;

      if (editPersonaId) {
        const { error } = await supabase.from('personas').update(personaData).eq('id', editPersonaId);
        if (error) throw error;
        savedId = editPersonaId;
      } else {
        const { data: insertedData, error } = await supabase.from('personas').insert(personaData).select('id').single();
        if (error) throw error;
        savedId = insertedData.id;
      }

      if (sessionId) {
        await supabase
          .from('wizard_sessions')
          .update({ status: 'complete' })
          .eq('id', sessionId);
      }

      toast.success(editPersonaId ? 'Persona updated!' : 'Persona saved to platform!');
      setSavedPersonaId(savedId);
      setSaving(false);
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
      setSaving(false);
    }
  };

  const handlePostSaveAction = (action: 'another_persona' | 'done') => {
    if (action === 'another_persona') {
      setMessages([]);
      setDraft({});
      setSessionId(null);
      setSavedPersonaId(null);
      initSession();
    } else {
      navigate('/project/icp-personas');
    }
  };

  if (!currentProject) {
    navigate('/projects');
    return null;
  }

  // Post-save success state
  if (savedPersonaId && !saving) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="h-20 w-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center animate-scale-in">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Persona Saved!</h3>
            <p className="text-sm text-muted-foreground mb-6">What would you like to do next?</p>
          </div>
          <div className="space-y-3 max-w-xs mx-auto">
            <Button onClick={() => handlePostSaveAction('another_persona')} className="w-full" size="lg">
              <Plus className="h-4 w-4 mr-2" /> Build Another Persona
            </Button>
            <Button onClick={() => handlePostSaveAction('done')} variant="outline" className="w-full" size="lg">
              <Users className="h-4 w-4 mr-2" /> Back to ICP & Personas
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/icp-personas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: 'hsl(var(--purple))' }} />
            Persona Wizard
          </h1>
          <p className="text-xs text-muted-foreground">AI-guided buyer persona builder</p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Chat */}
        <div className="w-1/2 flex flex-col border rounded-lg bg-card">
          {currentPhase && (
            <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Currently exploring:</span>
              <Badge variant="outline" className="text-[10px] border-primary/30">
                {currentPhase.icon} {currentPhase.label}
              </Badge>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  {initStage && (
                    <span className="text-sm text-muted-foreground animate-pulse">{initStage}</span>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={loading}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 flex flex-col border rounded-lg bg-card p-4 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {draft.persona_name || 'New Persona'}
              </h2>
              {draft.role_in_buying && (
                <Badge variant="outline" className="text-[10px] mt-1">
                  {draft.role_in_buying.replace('_', ' ')}
                </Badge>
              )}
            </div>

            {/* Completion bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{completedCount} of {PERSONA_SECTIONS.length} sections</span>
                <span>{completionPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${completionPct}%`,
                    background: 'linear-gradient(90deg, hsl(var(--purple)), hsl(var(--orange)))',
                  }}
                />
              </div>
            </div>

            {/* Section cards */}
            {PERSONA_SECTIONS.map(section => {
              const status = getSectionStatus(draft, section.key);
              const data = (draft as any)[section.key];
              return (
                <div key={section.key} className={`rounded-lg border p-3 transition-colors ${
                  status === 'complete' ? 'border-green-500/30 bg-green-500/5' :
                  status === 'partial' ? 'border-primary/20 bg-primary/5' :
                  'border-border/50 bg-muted/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{section.icon}</span>
                    <span className="text-xs font-medium text-foreground">{section.label}</span>
                    {status === 'complete' && <Check className="h-3 w-3 text-green-500 ml-auto" />}
                  </div>
                  {data && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {typeof data === 'string' ? (
                        <p className="line-clamp-3">{data}</p>
                      ) : typeof data === 'object' ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(data).slice(0, 5).map(([k, v]) => (
                            <Badge key={k} variant="secondary" className="text-[9px] font-normal">
                              {k}: {String(v).slice(0, 40)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Readiness */}
            {draft.ai_readiness_score && (
              <div className="flex items-center gap-2 px-3">
                <span className="text-xs text-muted-foreground">AI Readiness:</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <div key={n} className={`w-3 h-3 rounded-full ${n <= draft.ai_readiness_score! ? 'bg-primary' : 'bg-muted'}`} />
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="sticky bottom-0 pt-4 mt-auto bg-gradient-to-t from-background via-background to-transparent">
            {isComplete ? (
              <Button onClick={savePersona} disabled={saving} className="w-full animate-[pulse_2s_ease-in-out_infinite] shadow-lg shadow-primary/25" size="lg">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Check className="h-4 w-4 mr-2" /> Save Persona to Platform</>}
              </Button>
            ) : (
              <Button onClick={savePersona} disabled={saving || !hasAnyData} variant="outline" className="w-full" size="lg">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : hasAnyData ? <><Save className="h-4 w-4 mr-2" /> Save Draft</> : <span className="text-muted-foreground">Chat to start building your persona</span>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

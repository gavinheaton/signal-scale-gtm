import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Send, Sparkles, Check, Circle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { MatrixCategory } from '@/types/database';

interface DraftOutput {
  firmographics?: Record<string, any>;
  psychographics?: Record<string, any>;
  operational_readiness?: Record<string, any>;
  alignment_urgency?: Record<string, any>;
  buyer_roles_behaviour?: Record<string, any>;
  anti_icp_signals?: Record<string, any>;
  segment_name?: string;
  fit_score?: number | null;
  access_score?: number | null;
  matrix_category?: string | null;
  sections_complete?: string[];
  is_complete?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ICP_SECTIONS = [
  { key: 'firmographics', label: 'Firmographics', desc: 'Industry, size, geography, stage' },
  { key: 'psychographics', label: 'Psychographics', desc: 'Values, risk tolerance, culture' },
  { key: 'operational_readiness', label: 'Operational Readiness', desc: 'Tech maturity, team, tools' },
  { key: 'alignment_urgency', label: 'Alignment & Urgency', desc: 'Strategic fit, drivers, timing' },
  { key: 'buyer_roles_behaviour', label: 'Key Buyer Roles', desc: 'Decision makers, committee' },
  { key: 'anti_icp_signals', label: 'Anti-ICP Signals', desc: 'Red flags, poor fit indicators' },
];

function getSectionStatus(draft: DraftOutput, key: string): 'empty' | 'partial' | 'complete' {
  const completeSections = draft.sections_complete || [];
  if (completeSections.includes(key)) return 'complete';

  const section = (draft as any)[key];
  if (!section || (typeof section === 'object' && Object.keys(section).length === 0)) return 'empty';
  return 'partial';
}

function StatusIcon({ status }: { status: 'empty' | 'partial' | 'complete' }) {
  if (status === 'complete') return <Check className="h-4 w-4 text-green-500" />;
  if (status === 'partial') return <div className="h-4 w-4 rounded-full border-2 border-amber-400 bg-amber-400/30" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export default function ICPWizard() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftOutput>({});
  const [saving, setSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session with first message from Claude
  useEffect(() => {
    if (!currentProject) return;
    initSession();
  }, [currentProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initSession = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('icp-wizard', {
        body: { project_id: currentProject!.id },
      });

      if (res.error) throw res.error;
      const data = res.data;
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.reply }]);
      if (data.updated_draft) setDraft(data.updated_draft);
    } catch (err: any) {
      toast.error('Failed to start wizard: ' + (err.message || 'Unknown error'));
    } finally {
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
      const res = await supabase.functions.invoke('icp-wizard', {
        body: { message: userMsg, session_id: sessionId, project_id: currentProject!.id },
      });

      if (res.error) throw res.error;
      const data = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updated_draft) setDraft(data.updated_draft);
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

  const saveICP = async () => {
    if (!currentProject || !draft) return;
    setSaving(true);

    try {
      // Map draft to ICP table structure
      const matrixCategory = draft.matrix_category || 'now_account';
      const { error } = await supabase.from('icps').insert({
        project_id: currentProject.id,
        segment_name: draft.segment_name || 'New ICP Segment',
        firmographics: draft.firmographics || {},
        psychographics: {
          ...(draft.psychographics || {}),
          operational_readiness: draft.operational_readiness || {},
          alignment_urgency: draft.alignment_urgency || {},
        },
        buyer_roles: draft.buyer_roles_behaviour || {},
        anti_icp_signals: draft.anti_icp_signals || {},
        fit_score: draft.fit_score || 5,
        access_score: draft.access_score || 5,
        matrix_category: matrixCategory as MatrixCategory,
      });

      if (error) throw error;

      // Mark session complete
      if (sessionId) {
        await supabase
          .from('wizard_sessions')
          .update({ status: 'complete' })
          .eq('id', sessionId);
      }

      toast.success('ICP saved to platform!');
      navigate('/project/icp-personas');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) {
    navigate('/projects');
    return null;
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/icp-personas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'hsl(var(--orange))' }} />
            ICP Wizard
          </h1>
          <p className="text-xs text-muted-foreground">AI-guided ICP builder</p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Chat (60%) */}
        <div className="w-[60%] flex flex-col border rounded-lg bg-card">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
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
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Textarea
              ref={textareaRef}
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

        {/* Right: Live ICP Preview (40%) */}
        <div className="w-[40%] flex flex-col gap-4 overflow-y-auto">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>ICP Draft</span>
                {draft.segment_name && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {draft.segment_name}
                  </Badge>
                )}
              </CardTitle>
              {(draft.fit_score || draft.access_score) && (
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  {draft.fit_score && <span>Fit: <strong className="text-foreground">{draft.fit_score}</strong>/10</span>}
                  {draft.access_score && <span>Access: <strong className="text-foreground">{draft.access_score}</strong>/10</span>}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {ICP_SECTIONS.map(section => {
                const status = getSectionStatus(draft, section.key);
                const sectionData = (draft as any)[section.key];
                const hasData = sectionData && typeof sectionData === 'object' && Object.keys(sectionData).length > 0;

                return (
                  <div key={section.key} className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusIcon status={status} />
                      <span className="text-sm font-medium">{section.label}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ml-auto ${
                          status === 'complete'
                            ? 'border-green-500/50 text-green-600'
                            : status === 'partial'
                            ? 'border-amber-400/50 text-amber-600'
                            : 'border-muted text-muted-foreground'
                        }`}
                      >
                        {status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{section.desc}</p>
                    {hasData && (
                      <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
                        {Object.entries(sectionData).slice(0, 4).map(([k, v]) => (
                          <p key={k}>
                            <span className="text-muted-foreground">{k.replace(/_/g, ' ')}:</span>{' '}
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </p>
                        ))}
                        {Object.keys(sectionData).length > 4 && (
                          <p className="text-muted-foreground">+{Object.keys(sectionData).length - 4} more</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Save button when complete */}
          {draft.is_complete && (
            <Button
              onClick={saveICP}
              disabled={saving}
              className="w-full"
              size="lg"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Check className="h-4 w-4 mr-2" /> Save ICP to Platform</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

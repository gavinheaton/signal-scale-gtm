import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Sparkles, Loader2, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import ReactMarkdown from 'react-markdown';
import { ICPPreviewPanel } from '@/components/icp-wizard/ICPPreviewPanel';
import { ICP_SECTIONS, getSectionStatus, type DraftOutput, type ChatMessage } from '@/components/icp-wizard/types';
import type { MatrixCategory } from '@/types/database';
import { stripDraft } from '@/lib/stripDraft';
import { triggerStrategySync } from '@/lib/syncStrategyToNotion';


export default function ICPWizard() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftOutput>({});
  const [saving, setSaving] = useState(false);
  const [prevDraft, setPrevDraft] = useState<DraftOutput>({});
  const [savedIcpId, setSavedIcpId] = useState<string | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [existingIcpCount, setExistingIcpCount] = useState(0);
  const [staleResume, setStaleResume] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Detect newly completed sections for inline celebrations
  useEffect(() => {
    if (!draft.sections_complete || !prevDraft.sections_complete) return;
    const newlyComplete = draft.sections_complete.filter(
      s => !prevDraft.sections_complete?.includes(s)
    );
    newlyComplete.forEach(key => {
      const section = ICP_SECTIONS.find(s => s.key === key);
      if (section) toast.success(`${section.icon} ${section.label} complete!`);
    });
  }, [draft.sections_complete]);

  const currentPhase = ICP_SECTIONS.find(s => getSectionStatus(draft, s.key) !== 'complete');

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
      // Check current ICP count first — drives diff-mode logic
      const { count: icpCount } = await supabase
        .from('icps')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', currentProject!.id);
      const priorIcps = icpCount || 0;
      setExistingIcpCount(priorIcps);

      const { data: existingSessions } = await supabase
        .from('wizard_sessions')
        .select('*')
        .eq('project_id', currentProject!.id)
        .eq('session_type', 'icp')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingSessions && existingSessions.length > 0) {
        const session = existingSessions[0];
        const draftOut = (session.draft_output as any) || {};
        const sessionMode = draftOut?._meta?.mode as string | undefined;
        // If the project now has ICPs but the session predates diff mode, flag as stale
        const isStale = priorIcps > 0 && sessionMode !== 'diff';

        setSessionId(session.id);
        const sessionMessages = session.messages as Array<{ role: string; content: string }>;
        setMessages(
          sessionMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.role === 'assistant' ? stripDraft(m.content) : m.content,
          }))
        );
        if (session.draft_output && Object.keys(session.draft_output as object).length > 0) {
          setDraft(session.draft_output as DraftOutput);
        }
        setStaleResume(isStale);
        if (isStale) {
          toast.info('You have saved ICPs — start fresh to use diff mode, or continue this draft.');
        } else {
          // Re-surface diff chips if this is an ongoing diff session
          if (sessionMode === 'diff') {
            setSuggestedReplies(await buildDiffChips(currentProject!.id));
          }
          toast.info('Resumed your previous session');
        }
        return;
      }

      const res = await supabase.functions.invoke('icp-wizard', {
        body: { project_id: currentProject!.id },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.reply }]);
      if (data.updated_draft) setDraft(data.updated_draft);
      setSuggestedReplies(Array.isArray(data.suggested_replies) ? data.suggested_replies : []);
      if (typeof data.existing_icp_count === 'number') setExistingIcpCount(data.existing_icp_count);
      setStaleResume(false);
    } catch (err: any) {
      toast.error('Failed to start wizard: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const buildDiffChips = async (projectId: string): Promise<string[]> => {
    const { data: icps } = await supabase
      .from('icps')
      .select('segment_name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(3);
    return [
      ...(icps || []).map((i: any) => `Variation of ${i.segment_name}`),
      'Different segment',
      'Ask me everything',
    ];
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !sessionId) return;
    const userMsg = input.trim();
    setInput('');
    setSuggestedReplies([]);
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await supabase.functions.invoke('icp-wizard', {
        body: { message: userMsg, session_id: sessionId, project_id: currentProject!.id },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updated_draft) {
        setPrevDraft(draft);
        setDraft(data.updated_draft);
      }
      if (data.draft_warning) {
        toast.warning(data.draft_warning);
      }
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
      const matrixCategory = draft.matrix_category || 'now_account';
      const { data: insertedData, error } = await supabase.from('icps').insert({
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
      }).select('id').single();

      if (error) throw error;

      if (sessionId) {
        await supabase
          .from('wizard_sessions')
          .update({ status: 'complete' })
          .eq('id', sessionId);
      }
      // Cancel any other stray in-progress ICP sessions so next visit starts clean
      await supabase
        .from('wizard_sessions')
        .update({ status: 'cancelled' })
        .eq('project_id', currentProject.id)
        .eq('session_type', 'icp')
        .eq('status', 'in_progress');

      toast.success('ICP saved to platform!');
      setSavedIcpId(insertedData.id);
      triggerStrategySync(currentProject.id, (currentProject as any).notion_strategy_page_id);
      setSaving(false);

    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
      setSaving(false);
    }
  };

  const handlePostSaveAction = (action: 'another_icp' | 'personas') => {
    if (action === 'another_icp') {
      restartWizard();
    } else {
      navigate(`/project/persona-wizard?icp_id=${savedIcpId}`);
    }
  };

  const restartWizard = async () => {
    if (sessionId) {
      try {
        await supabase
          .from('wizard_sessions')
          .update({ status: 'cancelled' })
          .eq('id', sessionId);
      } catch {}
    }
    setMessages([]);
    setDraft({});
    setPrevDraft({});
    setSessionId(null);
    setSavedIcpId(null);
    setSuggestedReplies([]);
    setInput('');
    initSession();
    toast.success('Started a fresh ICP');
  };


  if (!currentProject) {
    navigate('/projects');
    return null;
  }

  const hasAnyData = ICP_SECTIONS.some(s => {
    const section = (draft as any)[s.key];
    return section && typeof section === 'object' && Object.keys(section).length > 0;
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/icp-personas')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'hsl(var(--orange))' }} />
            ICP Wizard
          </h1>
          <p className="text-xs text-muted-foreground">AI-guided ICP builder</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading}>
              <RotateCcw className="h-4 w-4 mr-2" /> Start Over
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a fresh ICP?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard your current in-progress ICP draft and begin a new conversation. Already-saved ICPs are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={restartWizard}>Start Over</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
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

          {suggestedReplies.length > 0 && !loading && (
            <div className="border-t px-3 pt-3 flex flex-wrap gap-2">
              {suggestedReplies.map((chip) => (
                <Button
                  key={chip}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setInput(chip); setSuggestedReplies([]); }}
                >
                  {chip}
                </Button>
              ))}
            </div>
          )}
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

        <div className="w-1/2 flex flex-col border rounded-lg bg-card p-4">
          <ICPPreviewPanel
            draft={draft}
            saving={saving}
            onSave={saveICP}
            hasAnyData={hasAnyData}
            onPostSaveAction={handlePostSaveAction}
            savedIcpId={savedIcpId}
          />
        </div>
      </div>
    </div>
  );
}

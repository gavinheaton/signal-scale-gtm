import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Sparkles, Loader2, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
import { BrandVoicePreviewPanel } from '@/components/brand-voice-wizard/BrandVoicePreviewPanel';
import { BRAND_VOICE_SECTIONS, getSectionStatus, type BrandVoiceDraft, type ChatMessage } from '@/components/brand-voice-wizard/types';
import { stripDraft } from '@/lib/stripDraft';
import { triggerStrategySync } from '@/lib/syncStrategyToNotion';


export default function BrandVoiceWizard() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const fileUrl = (location.state as any)?.fileUrl as string | undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BrandVoiceDraft>({});
  const [saving, setSaving] = useState(false);
  const [prevDraft, setPrevDraft] = useState<BrandVoiceDraft>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draft.sections_complete || !prevDraft.sections_complete) return;
    const newlyComplete = draft.sections_complete.filter(
      s => !prevDraft.sections_complete?.includes(s)
    );
    newlyComplete.forEach(key => {
      const section = BRAND_VOICE_SECTIONS.find(s => s.key === key);
      if (section) toast.success(`${section.icon} ${section.label} complete!`);
    });
  }, [draft.sections_complete]);

  const currentPhase = BRAND_VOICE_SECTIONS.find(s => getSectionStatus(draft, s.key) !== 'complete');

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
      const { data: existingSessions } = await supabase
        .from('wizard_sessions')
        .select('*')
        .eq('project_id', currentProject!.id)
        .eq('session_type', 'brand_voice')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingSessions && existingSessions.length > 0 && !fileUrl) {
        const session = existingSessions[0];
        setSessionId(session.id);
        const sessionMessages = session.messages as Array<{ role: string; content: string }>;
        setMessages(
          sessionMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.role === 'assistant' ? stripDraft(m.content) : m.content,
          }))
        );
        if (session.draft_output && Object.keys(session.draft_output as object).length > 0) {
          setDraft(session.draft_output as BrandVoiceDraft);
        }
        toast.info('Resumed your previous session');
        return;
      }

      if (fileUrl) {
        setMessages([{ role: 'assistant', content: 'Analysing your document and mapping it to the Signal+Scale brand voice sections…' }]);
      }

      const res = await supabase.functions.invoke('brand-voice-wizard', {
        body: { project_id: currentProject!.id, ...(fileUrl ? { file_url: fileUrl } : {}) },
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
      const res = await supabase.functions.invoke('brand-voice-wizard', {
        body: { message: userMsg, session_id: sessionId, project_id: currentProject!.id },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updated_draft) {
        setPrevDraft(draft);
        setDraft(data.updated_draft);
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

  const saveBrandVoice = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      toast.success('Brand voice saved!');
      triggerStrategySync(currentProject.id, (currentProject as any).notion_strategy_page_id);
      navigate('/project/brand-voice');

    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startOver = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      // Cancel any in-progress brand_voice sessions for this project
      const { error: cancelErr } = await supabase
        .from('wizard_sessions')
        .update({ status: 'cancelled' as any })
        .eq('project_id', currentProject.id)
        .eq('session_type', 'brand_voice')
        .eq('status', 'in_progress');
      if (cancelErr) throw cancelErr;

      // Delete any brand_voices row(s) for this project so the landing page
      // shows the empty state (Upload + Start Wizard options)
      const { error: deleteErr } = await supabase
        .from('brand_voices')
        .delete()
        .eq('project_id', currentProject.id);
      if (deleteErr) throw deleteErr;

      // Reset local state
      setMessages([]);
      setDraft({});
      setPrevDraft({});
      setSessionId(null);
      setInput('');

      toast.success('Brand voice reset. Choose how you want to start again.');
      navigate('/project/brand-voice', { replace: true });
    } catch (err: any) {
      toast.error('Failed to reset: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };


  if (!currentProject) {
    navigate('/projects');
    return null;
  }

  const hasAnyData = BRAND_VOICE_SECTIONS.some(s => {
    const section = (draft as any)[s.key];
    if (!section) return false;
    if (Array.isArray(section)) return section.length > 0;
    if (typeof section === 'string') return section.length > 0;
    if (typeof section === 'object') return Object.keys(section).length > 0;
    return false;
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/brand-voice')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'hsl(var(--purple))' }} />
            Brand Voice Wizard
          </h1>
          <p className="text-xs text-muted-foreground">AI-guided brand voice builder</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Start Over
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start brand voice over?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the current brand voice and wizard conversation for this project so you can rebuild from scratch (e.g. after a rebrand). You'll be returned to the start screen where you can upload a new tone-of-voice document or run the wizard again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={startOver}>Yes, start over</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Chat panel - 60% */}
        <div className="w-3/5 flex flex-col border rounded-lg bg-card">
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
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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

        {/* Preview panel - 40% */}
        <div className="w-2/5 flex flex-col border rounded-lg bg-card p-4">
          <BrandVoicePreviewPanel
            draft={draft}
            saving={saving}
            onSave={saveBrandVoice}
            hasAnyData={hasAnyData}
          />
        </div>
      </div>
    </div>
  );
}

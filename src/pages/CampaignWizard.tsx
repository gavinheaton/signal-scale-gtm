import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CampaignPreviewPanel } from '@/components/campaign-wizard/CampaignPreviewPanel';
import { CAMPAIGN_SECTIONS, getCampaignSectionStatus, type CampaignDraft, type ContentCalendarItem } from '@/components/campaign-wizard/types';
import type { AssetType } from '@/types/database';
import { stripDraft } from '@/lib/stripDraft';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const FORMAT_TO_ASSET_TYPE: Record<string, AssetType> = {
  blog: 'blog',
  video: 'video',
  podcast: 'podcast',
  linkedin: 'linkedin_post',
  linkedin_post: 'linkedin_post',
  email: 'email',
  webinar: 'webinar',
  whitepaper: 'whitepaper',
};

export default function CampaignWizard() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>({});
  const [saving, setSaving] = useState(false);
  const [prevDraft, setPrevDraft] = useState<CampaignDraft>({});
  const [notionUrl, setNotionUrl] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Celebrate newly completed sections
  useEffect(() => {
    if (!draft.sections_complete || !prevDraft.sections_complete) return;
    const newlyComplete = draft.sections_complete.filter(
      s => !prevDraft.sections_complete?.includes(s)
    );
    newlyComplete.forEach(key => {
      const section = CAMPAIGN_SECTIONS.find(s => s.key === key);
      if (section) toast.success(`${section.icon} ${section.label} complete!`);
    });
  }, [draft.sections_complete]);

  const currentPhase = CAMPAIGN_SECTIONS.find(s => getCampaignSectionStatus(draft, s.key) !== 'complete');

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
      // Check for existing in-progress campaign session
      const { data: existingSessions } = await supabase
        .from('wizard_sessions')
        .select('*')
        .eq('project_id', currentProject!.id)
        .eq('session_type', 'campaign')
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
            content: m.role === 'assistant' ? stripDraft(m.content) : m.content,
          }))
        );
        if (session.draft_output && Object.keys(session.draft_output as object).length > 0) {
          setDraft(session.draft_output as CampaignDraft);
        }
        if (session.notion_url) setNotionUrl(session.notion_url);
        toast.info('Resumed your previous campaign session');
        return;
      }

      // Fetch ICPs and personas for project context
      const [{ data: icps }, { data: personas }] = await Promise.all([
        supabase.from('icps').select('id, segment_name, matrix_category, fit_score, access_score').eq('project_id', currentProject!.id),
        supabase.from('personas').select('id, persona_name, role_in_buying, icp_id, pain_points, channel_preferences').eq('project_id', currentProject!.id),
      ]);

      const projectContext = {
        icps: icps || [],
        personas: personas || [],
      };

      // Create new session via edge function
      const res = await supabase.functions.invoke('campaign-wizard', {
        body: { project_id: currentProject!.id, project_context: projectContext },
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
      const res = await supabase.functions.invoke('campaign-wizard', {
        body: { message: userMsg, session_id: sessionId, project_id: currentProject!.id },
      });
      if (res.error) throw res.error;
      const data = res.data;
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.updated_draft) {
        setPrevDraft(draft);
        setDraft(data.updated_draft);
      }
      if (data.notion_url) setNotionUrl(data.notion_url);
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

  const handleNameChange = (name: string) => {
    setDraft(prev => ({ ...prev, campaign_name: name }));
  };

  const saveDraft = async () => {
    if (!currentProject || !draft.track) return;
    setSaving(true);
    try {
      const payload = {
        project_id: currentProject.id,
        name: draft.campaign_name || 'Untitled Campaign',
        track: draft.track,
        status: 'brief' as const,
        objective: typeof draft.objective === 'object' ? JSON.stringify(draft.objective) : (draft.objective as any) || null,
        channel_mix: draft.channel_mix || {},
        target_icp_ids: draft.target_audience?.icp_ids || [],
        launch_date: draft.launch_date || null,
        end_date: draft.end_date || null,
      };

      if (campaignId) {
        const { error } = await supabase.from('campaigns').update(payload).eq('id', campaignId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('campaigns').insert(payload).select('id').single();
        if (error) throw error;
        setCampaignId(data.id);
      }
      toast.success('Draft saved!');
    } catch (err: any) {
      toast.error('Failed to save draft: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCampaign = async () => {
    if (!currentProject || !draft.is_complete || !draft.track) return;
    setSaving(true);

    try {
      const targetIcpIds: string[] = draft.target_audience?.icp_ids || [];

      const campaignPayload = {
        project_id: currentProject.id,
        name: draft.campaign_name || 'New Campaign',
        track: draft.track,
        status: 'brief' as const,
        objective: typeof draft.objective === 'object' ? JSON.stringify(draft.objective) : (draft.objective as any) || null,
        channel_mix: draft.channel_mix || {},
        target_icp_ids: targetIcpIds,
        launch_date: draft.launch_date || null,
        end_date: draft.end_date || null,
      };

      let finalCampaignId = campaignId;

      if (campaignId) {
        const { error } = await supabase.from('campaigns').update(campaignPayload).eq('id', campaignId);
        if (error) throw error;
      } else {
        const { data: campaign, error } = await supabase.from('campaigns').insert(campaignPayload).select('id').single();
        if (error) throw error;
        finalCampaignId = campaign.id;
      }

      // Bulk insert campaign assets from content calendar
      if (draft.content_calendar && draft.content_calendar.length > 0 && finalCampaignId) {
        const assets = draft.content_calendar.map((item, idx) => ({
          campaign_id: finalCampaignId!,
          title: item.title,
          asset_type: (FORMAT_TO_ASSET_TYPE[item.format?.toLowerCase()] || 'blog') as AssetType,
          status: 'brief' as const,
          publish_date: item.publish_date || null,
          sequence_order: item.sequence_order ?? idx + 1,
          offset_days: item.offset_days ?? null,
          production_due: item.production_due ?? null,
          rationale: item.rationale ?? null,
        }));

        const { data: insertedAssets, error: assetsError } = await supabase
          .from('campaign_assets')
          .insert(assets)
          .select('id, sequence_order');
        if (assetsError) console.error('Failed to insert some assets:', assetsError.message);

        // Second pass: resolve depends_on references (sequence_order → UUID)
        if (insertedAssets) {
          const seqMap = new Map(insertedAssets.map((a: any) => [a.sequence_order, a.id]));
          const dependencyUpdates = draft.content_calendar
            .filter(item => item.depends_on != null)
            .map(item => {
              const assetId = seqMap.get(item.sequence_order ?? 0);
              const dependsOnId = seqMap.get(item.depends_on!);
              return assetId && dependsOnId ? { id: assetId, depends_on: dependsOnId } : null;
            })
            .filter(Boolean) as { id: string; depends_on: string }[];

          for (const u of dependencyUpdates) {
            await supabase.from('campaign_assets').update({ depends_on: u.depends_on }).eq('id', u.id);
          }
        }
      }

      // Mark session complete
      if (sessionId) {
        await supabase.from('wizard_sessions').update({ status: 'complete' }).eq('id', sessionId);
      }

      // Push to Notion if workspace is set up (fire-and-forget)
      if (currentProject.notion_calendar_db_id && finalCampaignId) {
        supabase.functions.invoke('add-campaign-to-notion', {
          body: { campaign_id: finalCampaignId },
        }).then(({ data, error }) => {
          if (error || data?.error) {
            toast.error('Notion sync failed — you can re-sync from Settings');
          } else {
            toast.success(`${data?.items_pushed || 0} items pushed to Notion calendar`);
          }
        });
      }

      toast.success('Campaign saved!');
      navigate('/project/campaigns');
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
      <div className="flex items-center gap-3 mb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/campaigns')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: 'hsl(var(--orange))' }} />
            Campaign Wizard
          </h1>
          <p className="text-xs text-muted-foreground">AI-guided campaign builder</p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Chat Panel — 60% */}
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

          <div className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your campaign..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={loading}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview Panel — 40% */}
        <div className="w-2/5 flex flex-col border rounded-lg bg-card p-4">
          <CampaignPreviewPanel
            draft={draft}
            saving={saving}
            onSave={saveCampaign}
            onSaveDraft={saveDraft}
            onNameChange={handleNameChange}
            notionUrl={notionUrl}
          />
        </div>
      </div>
    </div>
  );
}

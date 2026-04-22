import { useState, useEffect } from 'react';
import { CampaignAsset, AssetStatus } from '@/types/database';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Sparkles, ExternalLink, RefreshCw, Pencil, Save, X, Check, Mail } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import AssetVisualsPanel from './AssetVisualsPanel';
import AssetSEOPanel from './AssetSEOPanel';
import AssetPublishPanel from './AssetPublishPanel';
import EmailAssetDialog from './EmailAssetDialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const statusColors: Record<AssetStatus, string> = {
  brief: 'bg-muted text-muted-foreground',
  draft: 'bg-blue-100 text-blue-800',
  review: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  published: 'bg-purple-100 text-purple-800',
};

const STATUSES: AssetStatus[] = ['brief', 'draft', 'review', 'approved', 'published'];

interface Props {
  asset: CampaignAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export default function AssetDetailDrawer({ asset, open, onOpenChange, onUpdated }: Props) {
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [promptOverride, setPromptOverride] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setTitleEditing(false);
    }
  }, [open]);

  if (!asset) return null;

  const startEditing = () => {
    setEditContent(asset.content || '');
    setEditTitle(asset.title);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: { content: string; title: string; status?: 'draft' } = {
        content: editContent,
        title: editTitle,
      };
      if (asset.status === 'brief' && editContent.trim()) {
        updates.status = 'draft';
      }
      const { error } = await supabase
        .from('campaign_assets')
        .update(updates)
        .eq('id', asset.id);
      if (error) throw error;
      toast.success('Asset saved');
      setEditing(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTitleSave = async () => {
    const next = titleDraft.trim();
    if (!next || next === asset.title) {
      setTitleEditing(false);
      return;
    }
    setTitleSaving(true);
    try {
      const { error } = await supabase
        .from('campaign_assets')
        .update({ title: next })
        .eq('id', asset.id);
      if (error) throw error;
      toast.success('Title updated');
      setTitleEditing(false);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update title');
    } finally {
      setTitleSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-campaign-content', {
        body: { asset_id: asset.id, campaign_id: asset.campaign_id, prompt_override: promptOverride || undefined },
      });
      if (error) throw error;
      toast.success(`Content generated for "${asset.title}"`);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handlePushToNotion = async () => {
    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-asset-to-notion', {
        body: { asset_id: asset.id },
      });
      if (error) {
        let msg = 'Push failed';
        try {
          const parsed = typeof error === 'object' && error.context ? await error.context.json?.() : null;
          if (parsed?.error) msg = parsed.error;
        } catch {}
        if (data?.error) msg = data.error;
        throw new Error(msg);
      }
      toast.success('Pushed to Notion');
      if (data?.notion_url) {
        window.open(data.notion_url, '_blank');
      }
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const handleStatusChange = async (newStatus: AssetStatus) => {
    const { error } = await supabase
      .from('campaign_assets')
      .update({ status: newStatus })
      .eq('id', asset.id);
    if (error) {
      toast.error('Failed to update status');
    } else {
      toast.success(`Status updated to ${newStatus}`);
      onUpdated();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-lg font-semibold"
            />
          ) : titleEditing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleTitleSave(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setTitleEditing(false); }
                }}
                className="text-lg font-semibold"
              />
              <Button size="icon" variant="ghost" onClick={handleTitleSave} disabled={titleSaving} aria-label="Save title">
                {titleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setTitleEditing(false)} disabled={titleSaving} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SheetTitle className="flex-1 text-left">{asset.title}</SheetTitle>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-60 hover:opacity-100"
                onClick={() => { setTitleDraft(asset.title); setTitleEditing(true); }}
                aria-label="Edit title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{asset.asset_type.replace(/_/g, ' ')}</Badge>
            <Badge className={statusColors[asset.status]}>{asset.status}</Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Status change */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Status</label>
            <Select value={asset.status} onValueChange={(v) => handleStatusChange(v as AssetStatus)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground">Content</label>
              {!editing && (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            {editing ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                  placeholder="Write your content in markdown..."
                />
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEditing}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : asset.content ? (
              <div className="mt-2 prose prose-sm max-w-none bg-muted/50 rounded-md p-4 max-h-96 overflow-y-auto">
                <ReactMarkdown>{asset.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No content generated yet.</p>
            )}
          </div>

          {/* Prompt override */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Custom prompt (optional)</label>
            <Textarea
              className="mt-1"
              placeholder="Override the default generation prompt..."
              value={promptOverride}
              onChange={(e) => setPromptOverride(e.target.value)}
              rows={2}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : asset.content ? <RefreshCw className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {asset.content ? 'Regenerate' : 'Generate Content'}
            </Button>

            {asset.content && (
              <Button variant="outline" onClick={handlePushToNotion} disabled={pushing}>
                {pushing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
                Push to Notion
              </Button>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full">
                    <Button
                      variant="outline"
                      onClick={() => setEmailOpen(true)}
                      disabled={!asset.content}
                      className="w-full"
                    >
                      <Mail className="h-4 w-4 mr-1" /> Email content
                    </Button>
                  </span>
                </TooltipTrigger>
                {!asset.content && (
                  <TooltipContent>Generate content first</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {asset.notion_url && (
              <Button variant="ghost" size="sm" asChild>
                <a href={asset.notion_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> View in Notion
                </a>
              </Button>
            )}
          </div>

          {/* Visuals & Publishing — only meaningful for written content */}
          {['blog', 'linkedin_post', 'email', 'whitepaper', 'press_release'].includes(asset.asset_type) && (
            <>
              <Separator className="my-4" />
              <AssetVisualsPanel asset={asset} onUpdated={onUpdated} />
              <Separator className="my-4" />
              <AssetSEOPanel asset={asset} onUpdated={onUpdated} />
              <Separator className="my-4" />
              <AssetPublishPanel asset={asset} onUpdated={onUpdated} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

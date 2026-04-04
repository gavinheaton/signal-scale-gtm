import { useState } from 'react';
import { CampaignAsset, AssetStatus } from '@/types/database';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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

  if (!asset) return null;

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
      if (error) throw error;
      toast.success('Pushed to Notion');
      if (data?.notion_url) {
        window.open(data.notion_url, '_blank');
      }
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Push failed');
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
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{asset.title}</SheetTitle>
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

          {/* Content preview */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Content</label>
            {asset.content ? (
              <div className="mt-2 prose prose-sm max-w-none bg-muted/50 rounded-md p-4 max-h-80 overflow-y-auto">
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

            {asset.notion_url && (
              <Button variant="ghost" size="sm" asChild>
                <a href={asset.notion_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> View in Notion
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useState, useEffect } from 'react';
import { CampaignAsset } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Send, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  asset: CampaignAsset;
  onUpdated: () => void;
}

export default function AssetPublishPanel({ asset, onUpdated }: Props) {
  const [publishStatus, setPublishStatus] = useState<'draft' | 'publish'>('draft');
  const [publishing, setPublishing] = useState(false);
  const [siteId, setSiteId] = useState<string>('');
  const [defaultSiteId, setDefaultSiteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('project_id')
        .eq('id', asset.campaign_id)
        .single();
      if (!campaign) return;
      const { data: settings } = await supabase
        .from('project_visual_settings')
        .select('wordpress_site_id, wordpress_default_status')
        .eq('project_id', campaign.project_id)
        .maybeSingle();
      if (settings?.wordpress_site_id) {
        setDefaultSiteId(settings.wordpress_site_id);
        setSiteId(settings.wordpress_site_id);
      }
      if (settings?.wordpress_default_status === 'publish') setPublishStatus('publish');
    })();
  }, [asset.campaign_id]);

  const handlePublish = async () => {
    if (!asset.content) {
      toast.error('Asset has no content to publish');
      return;
    }
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
        body: { asset_id: asset.id, status: publishStatus, site_id_override: siteId || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Published as ${publishStatus} on WordPress`);
      if (data?.post_url) window.open(data.post_url, '_blank');
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Send className="h-4 w-4" /> Publish to WordPress
      </h3>

      {!defaultSiteId && (
        <div className="flex gap-2 p-2 bg-muted rounded-md text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>No default WordPress site set. Configure in project Settings → Visuals & Publishing, or override below.</span>
        </div>
      )}

      <div>
        <Label className="text-xs">WordPress site ID or URL</Label>
        <Input
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder="example.wordpress.com"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs">Status</Label>
        <Select value={publishStatus} onValueChange={(v) => setPublishStatus(v as any)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="publish">Publish (live)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handlePublish} disabled={publishing || !siteId} className="w-full">
        {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
        {asset.wordpress_post_url ? 'Re-publish' : 'Publish'}
      </Button>

      {asset.wordpress_post_url && (
        <Button variant="ghost" size="sm" asChild className="w-full">
          <a href={asset.wordpress_post_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" /> View on WordPress
          </a>
        </Button>
      )}
    </div>
  );
}

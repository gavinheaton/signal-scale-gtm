import { useState, useEffect } from 'react';
import { CampaignAsset, WpFlavor } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, ExternalLink, AlertCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface Props {
  asset: CampaignAsset;
  onUpdated: () => void;
}

interface OrgConn {
  flavor: WpFlavor;
  site_url: string;
  default_status: string;
}

export default function AssetPublishPanel({ asset, onUpdated }: Props) {
  const { organisation } = useAuth();
  const [publishStatus, setPublishStatus] = useState<'draft' | 'publish'>('draft');
  const [publishing, setPublishing] = useState(false);
  const [siteOverride, setSiteOverride] = useState<string>('');
  const [orgConn, setOrgConn] = useState<OrgConn | null>(null);
  const [loadingConn, setLoadingConn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingConn(true);
      // Look up the asset's org via campaign → project
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('project_id, projects(org_id)')
        .eq('id', asset.campaign_id)
        .single();
      const orgId = (campaign as any)?.projects?.org_id;

      // Project-level overrides
      if (campaign?.project_id) {
        const { data: settings } = await supabase
          .from('project_visual_settings')
          .select('wordpress_site_id, wordpress_default_status')
          .eq('project_id', campaign.project_id)
          .maybeSingle();
        if (!cancelled && settings?.wordpress_site_id) setSiteOverride(settings.wordpress_site_id);
        if (!cancelled && settings?.wordpress_default_status === 'publish') setPublishStatus('publish');
      }

      // Org connection (safe RPC)
      if (orgId) {
        const { data } = await supabase.rpc('get_my_org_wp_connection', { _org_id: orgId });
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          const row = data[0] as any;
          setOrgConn({ flavor: row.flavor, site_url: row.site_url, default_status: row.default_status });
          if (!cancelled && row.default_status === 'publish' && publishStatus === 'draft') {
            // org default takes effect only if no project override above
          }
        } else if (!cancelled) {
          setOrgConn(null);
        }
      }
      if (!cancelled) setLoadingConn(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.campaign_id]);

  const handlePublish = async () => {
    if (!asset.content) {
      toast.error('Asset has no content to publish');
      return;
    }
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('publish-to-wordpress', {
        body: {
          asset_id: asset.id,
          status: publishStatus,
          site_id_override: orgConn?.flavor === 'wordpress_com' ? (siteOverride || undefined) : undefined,
        },
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

      {loadingConn ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !orgConn ? (
        <div className="flex gap-2 p-3 bg-muted rounded-md text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            This organisation hasn't connected WordPress yet.{' '}
            <Link to="/settings" className="text-primary underline">Connect it in Settings</Link>.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 p-2 rounded-md border bg-card">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-xs text-foreground truncate flex-1">{orgConn.site_url}</span>
            <Badge variant="secondary" className="text-[10px]">
              {orgConn.flavor === 'wordpress_com' ? 'WP.com' : 'Self-hosted'}
            </Badge>
          </div>

          {orgConn.flavor === 'wordpress_com' && (
            <div>
              <Label className="text-xs">Site override (optional)</Label>
              <Input
                value={siteOverride}
                onChange={(e) => setSiteOverride(e.target.value)}
                placeholder={orgConn.site_url}
                className="mt-1"
              />
            </div>
          )}

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

          <Button onClick={handlePublish} disabled={publishing} className="w-full">
            {publishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {asset.wordpress_post_url ? 'Re-publish' : 'Publish'}
          </Button>
        </>
      )}

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

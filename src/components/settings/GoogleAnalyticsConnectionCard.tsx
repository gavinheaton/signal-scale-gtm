import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Link as LinkIcon, BarChart3 } from 'lucide-react';
import PropertyPicker from '@/components/analytics/PropertyPicker';

interface ConnState {
  connected: boolean;
  google_email?: string;
  gsc_site_url?: string | null;
  ga4_property_id?: string | null;
}

export default function GoogleAnalyticsConnectionCard() {
  const { currentProject } = useProject();
  const [data, setData] = useState<ConnState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke('analytics-fetch', {
      body: { project_id: currentProject.id, days: 7 },
    });
    if (error) {
      setData(null);
    } else {
      setData(res as ConnState);
    }
    setLoading(false);
  }, [currentProject]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'google-oauth') {
        if (e.data.success) {
          toast.success('Google connected');
          fetchData();
        } else {
          toast.error('Google connection failed');
        }
        setConnecting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('connected')) {
      if (params.get('connected') === '1') toast.success('Google connected');
      else toast.error('Google connection failed');
      window.history.replaceState({}, '', window.location.pathname);
      fetchData();
    }
  }, [fetchData]);

  const handleConnect = async () => {
    if (!currentProject) return;
    setConnecting(true);
    const { data: res, error } = await supabase.functions.invoke('google-oauth-start', {
      body: { project_id: currentProject.id, return_url: '/project/settings' },
    });
    if (error || !res?.url) {
      toast.error(error?.message || 'Failed to start Google auth');
      setConnecting(false);
      return;
    }
    const popup = window.open(res.url, 'google-oauth', 'width=520,height=720');
    if (!popup) {
      window.location.href = res.url;
    }
  };

  if (!currentProject) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Google Search Console &amp; Analytics 4
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-lg border bg-card">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data?.connected ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Google connected · {data.google_email}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {data.gsc_site_url
                    ? <Badge variant="secondary">GSC: {data.gsc_site_url}</Badge>
                    : <Badge variant="outline" className="text-amber-600 border-amber-300">No Search Console property selected</Badge>}
                  {data.ga4_property_id
                    ? <Badge variant="secondary">GA4: {data.ga4_property_id}</Badge>
                    : <Badge variant="outline" className="text-amber-600 border-amber-300">No GA4 property selected</Badge>}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">No Google account connected</p>
                <p className="text-xs text-muted-foreground">Connect Google to pull Search Console and Analytics 4 data for this project.</p>
              </div>
            </div>
          )}
          <Button onClick={handleConnect} disabled={connecting}>
            <LinkIcon className="h-4 w-4 mr-2" />
            {data?.connected ? 'Reconnect' : 'Connect Google'}
          </Button>
        </div>

        {data?.connected && (
          <PropertyPicker projectId={currentProject.id} onSaved={fetchData} />
        )}
      </CardContent>
    </Card>
  );
}

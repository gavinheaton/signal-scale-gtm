import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface PropsList {
  connected: boolean;
  gscSites: Array<{ siteUrl: string; permissionLevel: string }>;
  ga4Properties: Array<{ propertyId: string; propertyName: string; accountName: string; defaultUri?: string }>;
  current: { gsc_site_url: string | null; ga4_property_id: string | null };
}

const NONE = '__none__';

export default function PropertyPicker({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [list, setList] = useState<PropsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gsc, setGsc] = useState<string>(NONE);
  const [ga4, setGa4] = useState<string>(NONE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('analytics-list-properties', {
        body: { project_id: projectId },
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message || 'Failed to load Google properties');
      } else {
        const d = data as PropsList;
        setList(d);
        setGsc(d.current.gsc_site_url || NONE);
        setGa4(d.current.ga4_property_id || NONE);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.functions.invoke('analytics-save-selection', {
      body: {
        project_id: projectId,
        gsc_site_url: gsc === NONE ? null : gsc,
        ga4_property_id: ga4 === NONE ? null : ga4,
      },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Failed to save');
      return;
    }
    toast.success('Property selection saved');
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Property selection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading available properties…
          </div>
        ) : !list ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Search Console site</label>
                <Select value={gsc} onValueChange={setGsc}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a site" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {list.gscSites.map((s) => (
                      <SelectItem key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {list.gscSites.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">This Google account has no Search Console sites.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">GA4 property</label>
                <Select value={ga4} onValueChange={setGa4}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pick a property" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— None —</SelectItem>
                    {list.ga4Properties.map((p) => (
                      <SelectItem key={p.propertyId} value={p.propertyId}>
                        {p.accountName} · {p.propertyName}{p.defaultUri ? ` (${p.defaultUri})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {list.ga4Properties.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">This Google account has no GA4 properties.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving…' : 'Save & refresh'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

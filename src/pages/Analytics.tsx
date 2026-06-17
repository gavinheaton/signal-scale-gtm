import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Link, Navigate } from 'react-router-dom';
import { Lightbulb, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';


interface GoogleData {
  connected: boolean;
  google_email?: string;
  gsc_site_url?: string | null;
  ga4_property_id?: string | null;
  range?: { startDate: string; endDate: string; days: number };
  gsc?: {
    byDate: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    topQueries: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
    topPages: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  ga4?: {
    report: {
      rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
    } | null;
  };
}

export default function Analytics() {
  const { currentProject } = useProject();
  const [days, setDays] = useState(28);
  const [data, setData] = useState<GoogleData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke('analytics-fetch', {
      body: { project_id: currentProject.id, days },
    });
    if (error) {
      toast.error(error.message || 'Failed to load analytics');
      setData(null);
    } else {
      setData(res as GoogleData);
    }
    setLoading(false);
  }, [currentProject, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!currentProject) return <Navigate to="/projects" replace />;

  const gscByDate = (data?.gsc?.byDate || []).map((r) => ({
    date: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: +(r.ctr * 100).toFixed(2),
    position: +r.position.toFixed(1),
  }));

  // GA4: pivot rows into per-date totals + channel breakdown
  const ga4Rows = data?.ga4?.report?.rows || [];
  const ga4ByDate = new Map<string, { date: string; sessions: number; engaged: number; conversions: number; channels: Record<string, number> }>();
  for (const row of ga4Rows) {
    const date = row.dimensionValues[0]?.value || '';
    const channel = row.dimensionValues[1]?.value || 'Unassigned';
    const sessions = Number(row.metricValues[0]?.value || 0);
    const engaged = Number(row.metricValues[1]?.value || 0);
    const conversions = Number(row.metricValues[2]?.value || 0);
    const formatted = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
    const entry = ga4ByDate.get(formatted) || { date: formatted, sessions: 0, engaged: 0, conversions: 0, channels: {} };
    entry.sessions += sessions;
    entry.engaged += engaged;
    entry.conversions += conversions;
    entry.channels[channel] = (entry.channels[channel] || 0) + sessions;
    ga4ByDate.set(formatted, entry);
  }
  const ga4Series = [...ga4ByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Channel totals for donut
  const channelTotals: Record<string, number> = {};
  for (const e of ga4Series) {
    for (const [ch, v] of Object.entries(e.channels)) {
      channelTotals[ch] = (channelTotals[ch] || 0) + v;
    }
  }
  const channelData = Object.entries(channelTotals).map(([name, value]) => ({ name, value }));
  const CHANNEL_COLORS = ['hsl(263 100% 60%)', 'hsl(8 82% 51%)', 'hsl(217 80% 18%)', 'hsl(174 60% 33%)', 'hsl(40 90% 55%)', 'hsl(0 0% 60%)'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="28">Last 28 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Callout */}
      <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--purple))' }}>
        <CardContent className="pt-6 flex gap-3 items-start">
          <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Measure like a brand, not just a funnel</p>
            <p className="text-xs text-muted-foreground mt-1">These metrics focus on long-term growth signals — search impressions, organic traffic, channel mix and engagement — not just last-click conversions.</p>
          </div>
        </CardContent>
      </Card>

      {!data?.connected ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">No Google account connected for this project yet.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/project/settings">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Connect in Project Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (!data.gsc_site_url && !data.ga4_property_id) ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">Google is connected, but no Search Console or GA4 property is selected yet.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/project/settings">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Pick properties in Project Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {/* GSC Impressions */}
            <Card>
              <CardHeader><CardTitle className="text-base">Search Impressions</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={gscByDate}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="impressions" stroke="hsl(263 100% 60%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* GSC Clicks */}
            <Card>
              <CardHeader><CardTitle className="text-base">Search Clicks</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={gscByDate}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="clicks" fill="hsl(8 82% 51%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* GA4 Sessions */}
            <Card>
              <CardHeader><CardTitle className="text-base">Sessions (GA4)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={ga4Series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="sessions" stroke="hsl(263 100% 60%)" fill="hsl(263 100% 60% / 0.2)" />
                    <Area type="monotone" dataKey="engaged" stroke="hsl(174 60% 33%)" fill="hsl(174 60% 33% / 0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* GA4 Channel Mix */}
            <Card>
              <CardHeader><CardTitle className="text-base">Traffic by Channel</CardTitle></CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={channelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                      {channelData.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top queries + pages */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Top Search Queries</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {(data.gsc?.topQueries || []).map((q, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5">
                      <span className="truncate pr-2">{q.keys[0]}</span>
                      <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{q.clicks} clicks</span>
                        <span>{q.impressions} imp</span>
                        <span>#{q.position.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                  {(data.gsc?.topQueries || []).length === 0 && <p className="text-xs text-muted-foreground">No query data yet.</p>}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top Landing Pages</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-80 overflow-auto">
                  {(data.gsc?.topPages || []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5">
                      <a href={p.keys[0]} target="_blank" rel="noreferrer" className="truncate pr-2 hover:underline">{p.keys[0]}</a>
                      <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{p.clicks} clicks</span>
                        <span>{p.impressions} imp</span>
                      </div>
                    </div>
                  ))}
                  {(data.gsc?.topPages || []).length === 0 && <p className="text-xs text-muted-foreground">No page data yet.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

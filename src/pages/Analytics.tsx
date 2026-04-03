import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Campaign, CampaignMetric } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Navigate } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';

export default function Analytics() {
  const { currentProject } = useProject();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetric[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProject) return;
    supabase.from('campaigns').select('*').eq('project_id', currentProject.id).then(({ data }) => {
      if (data) setCampaigns(data as unknown as Campaign[]);
    });
    supabase.from('campaign_metrics').select('*').then(({ data }) => {
      if (data) setMetrics(data as unknown as CampaignMetric[]);
      setLoading(false);
    });
  }, [currentProject]);

  if (!currentProject) return <Navigate to="/projects" replace />;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const filtered = selectedCampaign === 'all' ? metrics : metrics.filter(m => m.campaign_id === selectedCampaign);
  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));

  const cumulativePipeline = sorted.reduce<{ date: string; value: number }[]>((acc, m) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].value : 0;
    acc.push({ date: m.date, value: prev + m.pipeline_influenced });
    return acc;
  }, []);

  const latestSov = sorted.length > 0 ? sorted[sorted.length - 1].share_of_voice_pct : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Callout */}
      <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--purple))' }}>
        <CardContent className="pt-6 flex gap-3 items-start">
          <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Measure like a brand, not just a funnel</p>
            <p className="text-xs text-muted-foreground mt-1">These metrics focus on long-term growth signals — brand awareness, share of voice, and community engagement — not just last-click conversions.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Brand Search Volume */}
        <Card>
          <CardHeader><CardTitle className="text-base">Brand Search Volume</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={sorted}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="brand_search_volume" stroke="hsl(263 100% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inbound Referrals */}
        <Card>
          <CardHeader><CardTitle className="text-base">Inbound Referrals</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sorted}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="inbound_referrals" fill="hsl(8 82% 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pipeline Influenced */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline Influenced (Cumulative)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cumulativePipeline}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="hsl(263 100% 60%)" fill="hsl(263 100% 60% / 0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Share of Voice */}
        <Card>
          <CardHeader><CardTitle className="text-base">Share of Voice</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[{ value: latestSov }, { value: 100 - latestSov }]}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={80}
                  startAngle={90} endAngle={-270} dataKey="value"
                >
                  <Cell fill="hsl(263 100% 60%)" />
                  <Cell fill="hsl(220 20% 90%)" />
                </Pie>
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold fill-foreground">{latestSov.toFixed(1)}%</text>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Community Engagement */}
      <Card>
        <CardHeader><CardTitle className="text-base">Community Engagement</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sorted}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="community_engagement" fill="hsl(263 100% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

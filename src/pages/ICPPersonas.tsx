import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { ICP, Persona, MatrixCategory, RoleInBuying } from '@/types/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label as RLabel } from 'recharts';
import { Plus, Target, Users, Sparkles } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const matrixColors: Record<MatrixCategory, string> = {
  now_account: 'bg-green-100 text-green-800',
  strategic_nurture: 'bg-blue-100 text-blue-800',
  trap_account: 'bg-amber-100 text-amber-800',
  no_go: 'bg-red-100 text-red-800',
};

const matrixLabels: Record<MatrixCategory, string> = {
  now_account: 'Now Account',
  strategic_nurture: 'Strategic Nurture',
  trap_account: 'Trap Account',
  no_go: 'No-Go',
};

const roleColors: Record<RoleInBuying, string> = {
  champion: 'bg-purple-100 text-purple-800',
  economic_buyer: 'bg-green-100 text-green-800',
  influencer: 'bg-blue-100 text-blue-800',
  end_user: 'bg-amber-100 text-amber-800',
  blocker: 'bg-red-100 text-red-800',
};

const dotColors: Record<MatrixCategory, string> = {
  now_account: '#22c55e',
  strategic_nurture: '#3b82f6',
  trap_account: '#f59e0b',
  no_go: '#ef4444',
};

export default function ICPPersonas() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [icps, setIcps] = useState<ICP[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [expandedIcp, setExpandedIcp] = useState<string | null>(null);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ICP form
  const [icpForm, setIcpForm] = useState({ segment_name: '', fit_score: 5, access_score: 5, matrix_category: 'now_account' as MatrixCategory, firmographics: '', buyer_roles: '' });
  const [icpOpen, setIcpOpen] = useState(false);

  // Persona form
  const [personaForm, setPersonaForm] = useState({ persona_name: '', icp_id: '', role_in_buying: 'champion' as RoleInBuying, pain_points: '', goals: '', how_we_help: '', ai_readiness_score: 3 });
  const [personaOpen, setPersonaOpen] = useState(false);

  const fetchData = async () => {
    if (!currentProject) return;
    const [{ data: icpData }, { data: personaData }] = await Promise.all([
      supabase.from('icps').select('*').eq('project_id', currentProject.id),
      supabase.from('personas').select('*').eq('project_id', currentProject.id),
    ]);
    if (icpData) setIcps(icpData as unknown as ICP[]);
    if (personaData) setPersonas(personaData as unknown as Persona[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentProject]);

  if (!currentProject) return <Navigate to="/projects" replace />;

  const handleAddIcp = async () => {
    const { error } = await supabase.from('icps').insert({
      project_id: currentProject.id,
      segment_name: icpForm.segment_name,
      fit_score: icpForm.fit_score,
      access_score: icpForm.access_score,
      matrix_category: icpForm.matrix_category,
      firmographics: icpForm.firmographics ? JSON.parse(icpForm.firmographics) : {},
      buyer_roles: icpForm.buyer_roles ? JSON.parse(icpForm.buyer_roles) : {},
      psychographics: {},
      anti_icp_signals: {},
    });
    if (error) { toast.error(error.message); return; }
    toast.success('ICP segment added');
    setIcpOpen(false);
    fetchData();
  };

  const handleAddPersona = async () => {
    const { error } = await supabase.from('personas').insert({
      project_id: currentProject.id,
      icp_id: personaForm.icp_id,
      persona_name: personaForm.persona_name,
      role_in_buying: personaForm.role_in_buying,
      pain_points: personaForm.pain_points ? JSON.parse(personaForm.pain_points) : {},
      goals: personaForm.goals ? JSON.parse(personaForm.goals) : {},
      how_we_help: personaForm.how_we_help,
      ai_readiness_score: personaForm.ai_readiness_score,
      channel_preferences: {},
      is_current: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Persona added');
    setPersonaOpen(false);
    fetchData();
  };

  const scatterData = icps.map(icp => ({
    x: icp.access_score,
    y: icp.fit_score,
    name: icp.segment_name,
    category: icp.matrix_category,
    fill: dotColors[icp.matrix_category],
  }));

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill={payload.fill} stroke="white" strokeWidth={2} />
        <text x={cx} y={cy - 14} textAnchor="middle" className="text-[10px] fill-foreground font-medium">{payload.name}</text>
      </g>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // If no ICPs exist, redirect to wizard
  if (!loading && icps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
        <div className="text-center space-y-2">
          <Sparkles className="h-12 w-12 mx-auto" style={{ color: 'hsl(var(--orange))' }} />
          <h1 className="text-2xl font-bold text-foreground">No ICP segments yet</h1>
          <p className="text-muted-foreground max-w-md">Use the AI-powered ICP Wizard to build your first Ideal Customer Profile through a guided conversation.</p>
        </div>
        <Button onClick={() => navigate('/project/icp-wizard')} size="lg">
          <Sparkles className="h-4 w-4 mr-2" /> Start ICP Wizard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">ICP & Personas</h1>
      <Tabs defaultValue="icps">
        <TabsList>
          <TabsTrigger value="icps" className="gap-1"><Target className="h-4 w-4" /> ICPs</TabsTrigger>
          <TabsTrigger value="personas" className="gap-1"><Users className="h-4 w-4" /> Personas</TabsTrigger>
        </TabsList>

        <TabsContent value="icps" className="space-y-6 mt-4">
          {/* Prioritisation Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prioritisation Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" dataKey="x" domain={[0, 10]} name="Access Score">
                      <RLabel value="Access Score →" position="bottom" offset={20} />
                    </XAxis>
                    <YAxis type="number" dataKey="y" domain={[0, 10]} name="Fit Score">
                      <RLabel value="Fit Score →" angle={-90} position="left" offset={20} />
                    </YAxis>
                    <ReferenceLine x={5} stroke="#d1d5db" strokeDasharray="4 4" />
                    <ReferenceLine y={5} stroke="#d1d5db" strokeDasharray="4 4" />
                    <Tooltip content={({ payload }) => {
                      if (!payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border rounded-lg p-2 shadow-lg">
                          <p className="font-semibold text-sm">{d.name}</p>
                          <p className="text-xs text-muted-foreground">Fit: {d.y} | Access: {d.x}</p>
                          <Badge className={`${matrixColors[d.category as MatrixCategory]} text-xs mt-1`}>{matrixLabels[d.category as MatrixCategory]}</Badge>
                        </div>
                      );
                    }} />
                    <Scatter data={scatterData} shape={<CustomDot />} />
                  </ScatterChart>
                </ResponsiveContainer>
                {/* Quadrant labels */}
                <div className="absolute top-6 left-12 text-[10px] text-muted-foreground/50 font-medium">Strategic Nurture</div>
                <div className="absolute top-6 right-8 text-[10px] text-muted-foreground/50 font-medium">Now Accounts</div>
                <div className="absolute bottom-12 left-12 text-[10px] text-muted-foreground/50 font-medium">No-Go Zone</div>
                <div className="absolute bottom-12 right-8 text-[10px] text-muted-foreground/50 font-medium">Trap Accounts</div>
              </div>
            </CardContent>
          </Card>

          {/* ICP Cards */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>ICP Segments</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate('/project/icp-wizard')}>
                <Sparkles className="h-4 w-4 mr-1" /> ICP Wizard
              </Button>
              <Sheet open={icpOpen} onOpenChange={setIcpOpen}>
                <SheetTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add ICP Segment</Button>
                </SheetTrigger>
              <SheetContent>
                <SheetHeader><SheetTitle>Add ICP Segment</SheetTitle></SheetHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Segment Name</Label><Input value={icpForm.segment_name} onChange={e => setIcpForm(f => ({ ...f, segment_name: e.target.value }))} /></div>
                  <div><Label>Fit Score (1-10)</Label><Input type="number" min={1} max={10} value={icpForm.fit_score} onChange={e => setIcpForm(f => ({ ...f, fit_score: +e.target.value }))} /></div>
                  <div><Label>Access Score (1-10)</Label><Input type="number" min={1} max={10} value={icpForm.access_score} onChange={e => setIcpForm(f => ({ ...f, access_score: +e.target.value }))} /></div>
                  <div>
                    <Label>Matrix Category</Label>
                    <Select value={icpForm.matrix_category} onValueChange={v => setIcpForm(f => ({ ...f, matrix_category: v as MatrixCategory }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(matrixLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Firmographics (JSON)</Label><Textarea value={icpForm.firmographics} onChange={e => setIcpForm(f => ({ ...f, firmographics: e.target.value }))} placeholder='{"industry": "Government", "size": "1000+"}' /></div>
                  <div><Label>Buyer Roles (JSON)</Label><Textarea value={icpForm.buyer_roles} onChange={e => setIcpForm(f => ({ ...f, buyer_roles: e.target.value }))} placeholder='["CTO", "Procurement"]' /></div>
                  <Button onClick={handleAddIcp} className="w-full">Save ICP Segment</Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {icps.map(icp => (
              <Card key={icp.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setExpandedIcp(expandedIcp === icp.id ? null : icp.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{icp.segment_name}</CardTitle>
                    <Badge className={matrixColors[icp.matrix_category]}>{matrixLabels[icp.matrix_category]}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Fit: <strong className="text-foreground">{icp.fit_score}</strong>/10</span>
                    <span>Access: <strong className="text-foreground">{icp.access_score}</strong>/10</span>
                  </div>
                  {icp.firmographics && Object.keys(icp.firmographics).length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {Object.entries(icp.firmographics).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="mr-2">{k}: {String(v)}</span>
                      ))}
                    </div>
                  )}
                  {expandedIcp === icp.id && (
                    <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                      {icp.buyer_roles && <div><strong>Buyer Roles:</strong> {JSON.stringify(icp.buyer_roles)}</div>}
                      {icp.psychographics && Object.keys(icp.psychographics).length > 0 && <div><strong>Psychographics:</strong> {JSON.stringify(icp.psychographics)}</div>}
                      {icp.anti_icp_signals && Object.keys(icp.anti_icp_signals).length > 0 && <div><strong>Anti-ICP Signals:</strong> {JSON.stringify(icp.anti_icp_signals)}</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="personas" className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>Persona Gallery</h2>
            <Sheet open={personaOpen} onOpenChange={setPersonaOpen}>
              <SheetTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Persona</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader><SheetTitle>Add Persona</SheetTitle></SheetHeader>
                <div className="space-y-4 mt-4">
                  <div><Label>Persona Name</Label><Input value={personaForm.persona_name} onChange={e => setPersonaForm(f => ({ ...f, persona_name: e.target.value }))} /></div>
                  <div>
                    <Label>ICP Segment</Label>
                    <Select value={personaForm.icp_id} onValueChange={v => setPersonaForm(f => ({ ...f, icp_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select ICP" /></SelectTrigger>
                      <SelectContent>{icps.map(i => <SelectItem key={i.id} value={i.id}>{i.segment_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Role in Buying</Label>
                    <Select value={personaForm.role_in_buying} onValueChange={v => setPersonaForm(f => ({ ...f, role_in_buying: v as RoleInBuying }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['champion', 'economic_buyer', 'influencer', 'end_user', 'blocker'] as const).map(r => <SelectItem key={r} value={r}>{r.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pain Points (JSON)</Label><Textarea value={personaForm.pain_points} onChange={e => setPersonaForm(f => ({ ...f, pain_points: e.target.value }))} placeholder='["Legacy systems", "Budget constraints"]' /></div>
                  <div><Label>Goals (JSON)</Label><Textarea value={personaForm.goals} onChange={e => setPersonaForm(f => ({ ...f, goals: e.target.value }))} placeholder='["Modernise infrastructure"]' /></div>
                  <div><Label>How We Help</Label><Textarea value={personaForm.how_we_help} onChange={e => setPersonaForm(f => ({ ...f, how_we_help: e.target.value }))} /></div>
                  <div><Label>AI Readiness Score (1-5)</Label><Input type="number" min={1} max={5} value={personaForm.ai_readiness_score} onChange={e => setPersonaForm(f => ({ ...f, ai_readiness_score: +e.target.value }))} /></div>
                  <Button onClick={handleAddPersona} className="w-full">Save Persona</Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {personas.map(p => {
              const icp = icps.find(i => i.id === p.icp_id);
              const painPoints = Array.isArray(p.pain_points) ? p.pain_points : Object.values(p.pain_points || {});
              return (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setExpandedPersona(expandedPersona === p.id ? null : p.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.persona_name}</CardTitle>
                      <Badge className={roleColors[p.role_in_buying]}>{p.role_in_buying.replace('_', ' ')}</Badge>
                    </div>
                    {icp && <p className="text-xs text-muted-foreground mt-1">{icp.segment_name}</p>}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs text-muted-foreground mr-1">AI Ready:</span>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} className={`w-2.5 h-2.5 rounded-full ${n <= p.ai_readiness_score ? 'bg-primary' : 'bg-muted'}`} />
                      ))}
                    </div>
                    {painPoints.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {painPoints.slice(0, 2).map((pp: string, i: number) => (
                          <p key={i}>• {pp}</p>
                        ))}
                      </div>
                    )}
                    {expandedPersona === p.id && (
                      <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                        {p.goals && <div><strong>Goals:</strong> {JSON.stringify(p.goals)}</div>}
                        {p.how_we_help && <div><strong>How We Help:</strong> {p.how_we_help}</div>}
                        {p.channel_preferences && Object.keys(p.channel_preferences).length > 0 && <div><strong>Channel Preferences:</strong> {JSON.stringify(p.channel_preferences)}</div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

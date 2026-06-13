import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PersonaSunburst from '@/components/icp-wizard/PersonaSunburst';
import PersonaDetailModal from '@/components/PersonaDetailModal';
import { useProject } from '@/contexts/ProjectContext';
import { ICP, Persona, MatrixCategory, RoleInBuying } from '@/types/database';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label as RLabel } from 'recharts';
import { Target, Users, Sparkles, ChevronDown, Pencil, Trash2, DownloadCloud } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import NotionImportDialog from '@/components/notion/NotionImportDialog';


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
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Persona | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const notionStrategyPageId = (currentProject as any)?.notion_strategy_page_id;


  const fetchData = async () => {
    if (!currentProject) return;
    const [{ data: icpData }, { data: personaData }] = await Promise.all([
      supabase.from('icps').select('*').eq('project_id', currentProject.id),
      supabase.from('personas').select('*').eq('project_id', currentProject.id).eq('is_current', true),
    ]);
    if (icpData) setIcps(icpData as unknown as ICP[]);
    if (personaData) setPersonas(personaData as unknown as Persona[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentProject]);

  const handleDeletePersona = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('personas').update({ is_current: false }).eq('id', deleteTarget.id);
    if (error) {
      toast.error('Failed to delete persona');
    } else {
      setPersonas(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success(`"${deleteTarget.persona_name}" removed`);
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  if (!currentProject) return <Navigate to="/projects" replace />;

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
                <div className="absolute top-6 left-12 text-[10px] text-muted-foreground/50 font-medium">Strategic Nurture</div>
                <div className="absolute top-6 right-8 text-[10px] text-muted-foreground/50 font-medium">Now Accounts</div>
                <div className="absolute bottom-12 left-12 text-[10px] text-muted-foreground/50 font-medium">No-Go Zone</div>
                <div className="absolute bottom-12 right-8 text-[10px] text-muted-foreground/50 font-medium">Trap Accounts</div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>ICP Segments</h2>
            <div className="flex items-center gap-2">
              {notionStrategyPageId && (
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <DownloadCloud className="h-4 w-4 mr-1" /> Import from Notion
                </Button>
              )}
              <Button size="sm" onClick={() => navigate('/project/icp-wizard')}>
                <Sparkles className="h-4 w-4 mr-1" /> Add ICP Segment
              </Button>
            </div>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Buying Influence Map</CardTitle>
            </CardHeader>
            <CardContent>
              <PersonaSunburst icps={icps} personas={personas} />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--orange))' }}>Persona Gallery</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Sparkles className="h-4 w-4 mr-1" /> Add Persona <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {icps.map(icp => (
                  <DropdownMenuItem key={icp.id} onClick={() => navigate(`/project/persona-wizard?icp_id=${icp.id}`)}>
                    <span className="mr-2">{icp.segment_name}</span>
                    <Badge className={`${matrixColors[icp.matrix_category]} text-[9px] ml-auto`}>{matrixLabels[icp.matrix_category]}</Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {personas.map(p => {
              const icp = icps.find(i => i.id === p.icp_id);
              const painPoints = Array.isArray(p.pain_points) ? p.pain_points : Object.values(p.pain_points || {});
              return (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedPersona(p)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.persona_name}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Badge className={roleColors[p.role_in_buying]}>{p.role_in_buying.replace('_', ' ')}</Badge>
                      </div>
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <PersonaDetailModal
        persona={selectedPersona}
        icp={icps.find(i => i.id === selectedPersona?.icp_id)}
        open={!!selectedPersona}
        onOpenChange={(open) => !open && setSelectedPersona(null)}
        onEdit={(p) => navigate(`/project/persona-wizard?icp_id=${p.icp_id}&edit_persona_id=${p.id}`)}
        onDelete={(p) => setDeleteTarget(p)}
        onRefreshed={(updated) => {
          setSelectedPersona(updated);
          setPersonas(prev => prev.map(p => p.id === updated.id ? updated : p));
        }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Persona</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.persona_name}</strong>? This will archive the persona — it won't appear in active views.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeletePersona} disabled={deleting}>
              {deleting ? 'Removing…' : 'Remove Persona'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

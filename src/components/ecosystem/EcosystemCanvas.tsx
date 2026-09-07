import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Node, Edge, NodeProps,
  applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange,
  ConnectionMode, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '@/integrations/supabase/client';
import { NodeDrawer } from './NodeDrawer';

type Kind = 'project'|'segment'|'company'|'role'|'person'|'partner'|'regulator'|'competitor'|'channel'|'influencer'|'community'|'theme'|'insight'|'custom';

interface DbNode {
  id: string; kind: Kind; label: string; subtitle: string | null;
  x: number; y: number; ring: number | null; readiness_score: number | null;
  hidden: boolean; stale: boolean; ref_table: string | null; ref_id: string | null; meta: any;
}
interface DbEdge { id: string; source_node_id: string; target_node_id: string; kind: string; note: string | null; meta: any }

const KIND_STYLES: Record<Kind, { bg: string; border: string; text: string; label: string }> = {
  project:    { bg: 'hsl(263 100% 60%)',       border: 'hsl(263 100% 40%)', text: '#fff',    label: 'You' },
  segment:    { bg: 'hsl(220 60% 20%)',        border: 'hsl(220 60% 30%)',  text: '#fff',    label: 'Segment' },
  company:    { bg: 'hsl(220 15% 96%)',        border: 'hsl(220 15% 70%)',  text: '#111',    label: 'Company' },
  role:       { bg: 'hsl(28 90% 55%)',         border: 'hsl(28 90% 40%)',   text: '#fff',    label: 'Role' },
  person:     { bg: 'hsl(170 55% 45%)',        border: 'hsl(170 55% 30%)',  text: '#fff',    label: 'Person' },
  partner:    { bg: 'hsl(140 45% 45%)',        border: 'hsl(140 45% 30%)',  text: '#fff',    label: 'Partner' },
  regulator:  { bg: 'hsl(0 65% 50%)',          border: 'hsl(0 65% 35%)',    text: '#fff',    label: 'Regulator' },
  competitor: { bg: 'hsl(340 65% 55%)',        border: 'hsl(340 65% 40%)',  text: '#fff',    label: 'Competitor' },
  channel:    { bg: 'hsl(200 55% 55%)',        border: 'hsl(200 55% 40%)',  text: '#fff',    label: 'Channel' },
  influencer: { bg: 'hsl(280 55% 55%)',        border: 'hsl(280 55% 40%)',  text: '#fff',    label: 'Influencer' },
  community:  { bg: 'hsl(50 90% 55%)',         border: 'hsl(50 90% 40%)',   text: '#111',    label: 'Community' },
  theme:      { bg: 'hsl(220 15% 25%)',        border: 'hsl(220 15% 40%)',  text: '#fff',    label: 'Theme' },
  insight:    { bg: 'hsl(190 55% 45%)',        border: 'hsl(190 55% 30%)',  text: '#fff',    label: 'Insight' },
  custom:     { bg: 'hsl(220 15% 90%)',        border: 'hsl(220 15% 60%)',  text: '#111',    label: 'Custom' },
};

function heat(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 70) return '#ef4444';   // hot
  if (score >= 40) return '#f59e0b';   // warm
  return '#94a3b8';                     // cold
}

function EcoNode({ data }: NodeProps<any>) {
  const style = KIND_STYLES[data.kind as Kind] || KIND_STYLES.custom;
  const glow = heat(data.readiness_score);
  return (
    <div
      style={{
        background: style.bg, color: style.text,
        border: `2px solid ${glow || style.border}`,
        boxShadow: glow ? `0 0 0 3px ${glow}22` : undefined,
        opacity: data.stale ? 0.55 : 1,
      }}
      className="rounded-lg px-3 py-2 min-w-[140px] max-w-[220px] text-left"
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="text-[9px] uppercase tracking-wider opacity-70">{style.label}</div>
      <div className="text-sm font-semibold truncate">{data.label}</div>
      {data.subtitle && <div className="text-[11px] opacity-80 truncate">{data.subtitle}</div>}
      {data.readiness_score != null && (
        <div className="text-[10px] mt-1 opacity-80">Readiness {data.readiness_score}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { eco: EcoNode };

interface Props { mapId: string; projectId: string; refreshKey: number }

export function EcosystemCanvas({ mapId, refreshKey }: Props) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<DbNode | null>(null);
  const [dbNodes, setDbNodes] = useState<Record<string, DbNode>>({});
  const [showHidden, setShowHidden] = useState(false);
  const [kindFilter, setKindFilter] = useState<Set<Kind>>(new Set());

  const load = useCallback(async () => {
    const [nRes, eRes] = await Promise.all([
      (supabase as any).from('ecosystem_nodes').select('*').eq('map_id', mapId),
      (supabase as any).from('ecosystem_edges').select('*').eq('map_id', mapId),
    ]);
    const dbN = ((nRes.data || []) as DbNode[]);
    const dbE = ((eRes.data || []) as DbEdge[]);
    const map: Record<string, DbNode> = {};
    for (const n of dbN) map[n.id] = n;
    setDbNodes(map);
    const filtered = dbN.filter((n) => (showHidden || !n.hidden) && (kindFilter.size === 0 || kindFilter.has(n.kind)));
    setNodes(filtered.map<Node>((n) => ({
      id: n.id, type: 'eco', position: { x: n.x, y: n.y },
      data: { label: n.label, subtitle: n.subtitle, kind: n.kind, readiness_score: n.readiness_score, stale: n.stale },
      draggable: true,
    })));
    setEdges(dbE
      .filter((e) => filtered.find((n) => n.id === e.source_node_id) && filtered.find((n) => n.id === e.target_node_id))
      .map<Edge>((e) => ({
        id: e.id, source: e.source_node_id, target: e.target_node_id,
        label: e.kind !== 'custom' ? e.kind.replace('_', ' ') : undefined,
        style: { stroke: 'hsl(220 15% 65%)', strokeWidth: 1 },
        labelStyle: { fontSize: 9, fill: 'hsl(220 15% 40%)' },
      })));
  }, [mapId, showHidden, kindFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const onNodesChange = useCallback(async (changes: NodeChange[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    // Persist positions on drag stop
    for (const c of changes) {
      if (c.type === 'position' && !c.dragging && c.position) {
        await (supabase as any).from('ecosystem_nodes')
          .update({ x: c.position.x, y: c.position.y }).eq('id', c.id);
      }
    }
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  const kinds = useMemo<Kind[]>(() => Array.from(new Set(Object.values(dbNodes).map((n) => n.kind))) as Kind[], [dbNodes]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1 max-w-[60%] bg-background/90 backdrop-blur border rounded-md p-1">
        <button
          onClick={() => setKindFilter(new Set())}
          className={`text-[11px] px-2 py-1 rounded ${kindFilter.size === 0 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >All</button>
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => {
              const next = new Set(kindFilter);
              next.has(k) ? next.delete(k) : next.add(k);
              setKindFilter(next);
            }}
            className={`text-[11px] px-2 py-1 rounded ${kindFilter.has(k) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >{KIND_STYLES[k].label}</button>
        ))}
        <label className="text-[11px] flex items-center gap-1 ml-2 px-1">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          Show hidden/stale
        </label>
      </div>
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, n) => setSelected(dbNodes[n.id] || null)}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="hsl(220 15% 90%)" />
        <MiniMap pannable zoomable className="!bg-background" nodeColor={(n) => KIND_STYLES[(n.data as any).kind as Kind]?.bg || '#ccc'} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <NodeDrawer node={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

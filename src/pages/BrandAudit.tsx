import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Activity, Plus, Loader2, ArrowRight, AlertTriangle, CheckCircle2, Gauge, Trash2, MessageSquareQuote, Target, Users, Sparkles, type LucideIcon } from 'lucide-react';
import { format } from 'date-fns';

const DIMENSIONS: { key: 'voice' | 'icp' | 'persona' | 'clarity'; label: string; weight: string; icon: LucideIcon; color: string }[] = [
  { key: 'voice',   label: 'Voice',   weight: '30%', icon: MessageSquareQuote, color: '#8833ff' },
  { key: 'icp',     label: 'ICP',     weight: '30%', icon: Target,             color: '#0f284c' },
  { key: 'persona', label: 'Persona', weight: '25%', icon: Users,              color: '#e33e23' },
  { key: 'clarity', label: 'Clarity', weight: '15%', icon: Sparkles,           color: '#0ea5a4' },
];

type Scope = 'quick' | 'deep' | 'custom';
interface Run {
  id: string;
  scope: Scope;
  status: string;
  base_url: string;
  pages_total: number;
  pages_scored: number;
  headline_score: number | null;
  voice_score: number | null;
  icp_score: number | null;
  persona_score: number | null;
  clarity_score: number | null;
  created_at: string;
  completed_at: string | null;
}

const scopeLabel: Record<Scope, string> = { quick: 'Quick', deep: 'Deep', custom: 'Custom URLs' };

function scoreColor(s: number | null) {
  if (s == null) return 'text-muted-foreground';
  if (s >= 80) return 'text-green-600';
  if (s >= 60) return 'text-orange-600';
  return 'text-red-600';
}

export default function BrandAudit() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [bvReady, setBvReady] = useState<boolean | null>(null);
  const [defaultWebsite, setDefaultWebsite] = useState('');
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('quick');
  const [baseUrl, setBaseUrl] = useState('');
  const [customUrls, setCustomUrls] = useState('');
  const [pageLimit, setPageLimit] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState(false);
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (!currentProject) return;
    userEditedRef.current = false;
    void load();
  }, [currentProject]);

  async function load() {
    setLoading(true);
    const [{ data: bvComplete }, { data: bvLatest }, { data: rs }] = await Promise.all([
      supabase.from('brand_voices').select('brand_identity').eq('project_id', currentProject!.id).eq('status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('brand_voices').select('status, brand_identity').eq('project_id', currentProject!.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('brand_audit_runs').select('*').eq('project_id', currentProject!.id).order('created_at', { ascending: false }),
    ]);
    setRuns((rs ?? []) as unknown as Run[]);
    setBvReady(bvLatest?.status === 'complete');

    const bvWebsite =
      (bvComplete?.brand_identity as any)?.website_url ??
      (bvLatest?.brand_identity as any)?.website_url ??
      '';
    const lastRunUrl = (rs ?? []).find(r => r.base_url && r.scope !== 'custom')?.base_url ?? '';
    const website = bvWebsite || lastRunUrl || '';
    setDefaultWebsite(website);
    if (!userEditedRef.current) setBaseUrl(website);
    setLoading(false);
  }

  const latest = runs[0];

  function openDialog() {
    if (!userEditedRef.current && defaultWebsite) setBaseUrl(defaultWebsite);
    setOpen(true);
  }

  async function startAudit() {
    if (!currentProject) return;
    if (scope !== 'custom' && !baseUrl) {
      toast.error('Please enter a website URL');
      return;
    }
    if (scope === 'custom' && !customUrls.trim()) {
      toast.error('Please enter at least one URL');
      return;
    }
    setSubmitting(true);
    const t = toast.loading('Running audit — discovering, scraping and scoring pages…');
    try {
      const { data, error } = await supabase.functions.invoke('brand-audit-run', {
        body: {
          project_id: currentProject.id,
          scope,
          base_url: baseUrl || undefined,
          custom_urls: scope === 'custom' ? customUrls.split(/[\n,]/).map(s => s.trim()).filter(Boolean) : undefined,
          page_limit: pageLimit,
        },
      });
      if (error) throw error;
      toast.dismiss(t);
      toast.success(`Audit complete — ${data.pages_scored} pages scored`);
      setOpen(false);
      await load();
      if (data?.run_id) navigate(`/project/brand-audit?run=${data.run_id}`);
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e.message ?? 'Audit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { error: pErr } = await supabase.from('brand_audit_pages').delete().eq('run_id', pendingDelete.id);
      if (pErr) throw pErr;
      const { error: rErr } = await supabase.from('brand_audit_runs').delete().eq('id', pendingDelete.id);
      if (rErr) throw rErr;
      toast.success('Audit deleted');
      setPendingDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete audit');
    } finally {
      setDeleting(false);
    }
  }

  if (!currentProject) {
    return <div className="p-8">Select a project first.</div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0f284c' }}>Brand Audit</h1>
          <p className="text-muted-foreground mt-1">
            Score your website against your Brand Voice, ICPs and Personas.
          </p>
        </div>
        <Button
          onClick={openDialog}
          disabled={!bvReady}
          className="gap-2"
          style={{ backgroundColor: '#8833ff' }}
        >
          <Plus className="h-4 w-4" /> New Audit
        </Button>
      </div>

      {bvReady === false && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <div className="flex-1">
              <p className="text-sm font-medium">Brand Voice not complete</p>
              <p className="text-xs text-muted-foreground">Finish your Brand Voice before running an audit — scoring relies on it.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/project/brand-voice')}>Go to Brand Voice</Button>
          </CardContent>
        </Card>
      )}

      {/* Headline card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" />Brand Health</CardTitle>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-sm text-muted-foreground">No audits yet. Run your first audit to see your Brand Health score.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="md:col-span-1 flex flex-col items-center justify-center border rounded-lg p-6 bg-muted/30">
                <div className={`text-5xl font-bold ${scoreColor(latest.headline_score)}`}>
                  {latest.headline_score ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Headline (latest)</div>
              </div>
              {[
                { label: 'Voice', val: latest.voice_score, w: '30%' },
                { label: 'ICP', val: latest.icp_score, w: '30%' },
                { label: 'Persona', val: latest.persona_score, w: '25%' },
                { label: 'Clarity', val: latest.clarity_score, w: '15%' },
              ].map((s) => (
                <div key={s.label} className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">{s.label} <span className="opacity-60">({s.w})</span></div>
                  <div className={`text-3xl font-semibold mt-2 ${scoreColor(s.val)}`}>{s.val ?? '—'}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runs list */}
      <Card>
        <CardHeader><CardTitle>Audit History</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit runs yet.</p>
          ) : (
            <div className="divide-y">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 hover:bg-muted/40 rounded">
                  <button
                    onClick={() => navigate(`/project/brand-audit?run=${r.id}`)}
                    className="flex-1 py-3 flex items-center gap-4 text-left px-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{scopeLabel[r.scope]}</Badge>
                        <span className="text-sm font-medium truncate">{r.base_url || '(custom URLs)'}</span>
                        {r.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <Badge variant="secondary" className="text-xs">{r.status}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(r.created_at), 'MMM d, yyyy · HH:mm')} · {r.pages_scored}/{r.pages_total} pages
                      </div>
                    </div>
                    <div className={`text-2xl font-bold ${scoreColor(r.headline_score)}`}>{r.headline_score ?? '—'}</div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-red-600 mr-2"
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }}
                    aria-label="Delete audit"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New audit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Brand Audit</DialogTitle>
            <DialogDescription>Choose how much of the site to score.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <RadioGroup value={scope} onValueChange={(v) => { setScope(v as Scope); setPageLimit(v === 'deep' ? 25 : v === 'quick' ? 8 : 10); }}>
              {[
                { v: 'quick', t: 'Quick audit', d: 'Home, About + top key pages (~8 total)' },
                { v: 'deep', t: 'Deep audit', d: 'Full crawl, up to 25 pages' },
                { v: 'custom', t: 'Custom URLs', d: 'Paste the exact URLs you want scored' },
              ].map(o => (
                <label key={o.v} className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-muted/40">
                  <RadioGroupItem value={o.v} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{o.t}</div>
                    <div className="text-xs text-muted-foreground">{o.d}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {scope !== 'custom' && (
              <div>
                <Label className="text-xs">Website URL</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://example.com" />
                {defaultWebsite && baseUrl === defaultWebsite && (
                  <p className="text-[11px] text-muted-foreground mt-1">Prefilled from your Brand Voice.</p>
                )}
              </div>
            )}

            {scope === 'custom' && (
              <div>
                <Label className="text-xs">URLs (one per line, max 50)</Label>
                <Textarea value={customUrls} onChange={(e) => setCustomUrls(e.target.value)} rows={6} placeholder={"https://example.com/about\nhttps://example.com/pricing"} />
              </div>
            )}

            <div>
              <Label className="text-xs">Page limit (1–50)</Label>
              <Input type="number" min={1} max={50} value={pageLimit} onChange={(e) => setPageLimit(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={startAudit} disabled={submitting} style={{ backgroundColor: '#8833ff' }}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</> : <><Activity className="h-4 w-4 mr-2" /> Start audit</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this audit run?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the run and all its scored pages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

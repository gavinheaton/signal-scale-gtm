import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, DownloadCloud } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'icps' | 'brand_voice' | 'all';

interface Extracted {
  icps?: Array<{ name?: string; company_size?: string; industry?: string; pain_points?: string[]; goals?: string[] }>;
  brand_voice?: { tone_description?: string; personality_adjectives?: string[]; banned_phrases?: string[]; writing_principles?: string[] };
  content_pillars?: string[];
}

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: Mode;
  onImported?: () => void;
}

export default function NotionImportDialog({ projectId, open, onOpenChange, mode = 'all', onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<Extracted | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setData(null); setError(null); return; }
    setLoading(true);
    supabase.functions.invoke('import-from-notion', { body: { project_id: projectId } })
      .then(({ data: res, error }) => {
        if (error || (res as any)?.error) setError((res as any)?.error || error?.message || 'Import failed');
        else setData((res as any)?.extracted || null);
      })
      .finally(() => setLoading(false));
  }, [open, projectId]);

  const showIcps = mode !== 'brand_voice';
  const showVoice = mode !== 'icps';

  const handleConfirm = async () => {
    if (!data) return;
    setImporting(true);
    try {
      // ICPs
      if (showIcps && data.icps?.length) {
        const rows = data.icps
          .filter(i => i.name)
          .map(i => ({
            project_id: projectId,
            segment_name: i.name!,
            firmographics: { company_size: i.company_size || '', industry: i.industry || '' },
            psychographics: { pain_points: i.pain_points || [], goals: i.goals || [] },
            buyer_roles: {},
            anti_icp_signals: {},
            fit_score: 5,
            access_score: 5,
            matrix_category: 'strategic_nurture' as const,
          }));
        if (rows.length) {
          const { error } = await supabase.from('icps').insert(rows as any);
          if (error) throw error;
        }
      }

      // Brand voice
      if (showVoice && data.brand_voice && (data.brand_voice.tone_description || data.brand_voice.personality_adjectives?.length)) {
        const bv = data.brand_voice;
        const { error } = await supabase.from('brand_voices').insert({
          project_id: projectId,
          status: 'draft',
          tone_description: bv.tone_description || null,
          personality_adjectives: bv.personality_adjectives || [],
          banned_phrases: bv.banned_phrases || [],
          writing_principles: bv.writing_principles || [],
        } as any);
        if (error) throw error;
      }

      toast.success('Imported from Notion');
      onImported?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Import failed: ' + (e.message || 'Unknown'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DownloadCloud className="h-5 w-5" /> Import from Notion</DialogTitle>
          <DialogDescription>Review the extracted strategy artefacts before importing into Signal+Scale.</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Reading Notion page and extracting…
          </div>
        )}

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {data && !loading && (
          <div className="space-y-5 text-sm">
            {showIcps && (
              <section>
                <h3 className="font-semibold mb-2">ICPs ({data.icps?.length || 0})</h3>
                {!data.icps?.length && <p className="text-muted-foreground text-xs">No ICPs detected.</p>}
                <ul className="space-y-2">
                  {data.icps?.map((icp, i) => (
                    <li key={i} className="rounded border p-2">
                      <div className="font-medium">{icp.name || `ICP ${i + 1}`}</div>
                      <div className="text-xs text-muted-foreground">
                        {[icp.company_size, icp.industry].filter(Boolean).join(' • ')}
                      </div>
                      {icp.pain_points?.length ? <div className="text-xs mt-1">Pain points: {icp.pain_points.join(', ')}</div> : null}
                      {icp.goals?.length ? <div className="text-xs">Goals: {icp.goals.join(', ')}</div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {showVoice && (
              <section>
                <h3 className="font-semibold mb-2">Brand voice</h3>
                {!data.brand_voice ? (
                  <p className="text-muted-foreground text-xs">Not detected.</p>
                ) : (
                  <div className="rounded border p-2 space-y-1 text-xs">
                    {data.brand_voice.tone_description && <p><strong>Tone:</strong> {data.brand_voice.tone_description}</p>}
                    {data.brand_voice.personality_adjectives?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {data.brand_voice.personality_adjectives.map((a, i) => <Badge key={i} variant="outline">{a}</Badge>)}
                      </div>
                    ) : null}
                    {data.brand_voice.banned_phrases?.length ? <p><strong>Banned:</strong> {data.brand_voice.banned_phrases.join(', ')}</p> : null}
                    {data.brand_voice.writing_principles?.length ? <p><strong>Principles:</strong> {data.brand_voice.writing_principles.join(' • ')}</p> : null}
                  </div>
                )}
              </section>
            )}

            {!!data.content_pillars?.length && (
              <section>
                <h3 className="font-semibold mb-2">Content pillars</h3>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {data.content_pillars.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-1">Content pillars are shown for reference — not yet stored as records.</p>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!data || importing || loading}>
            {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing…</> : 'Confirm and import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

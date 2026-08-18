import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type SessionType = 'icp' | 'persona' | 'campaign' | 'brand_voice';

interface DraftSession {
  id: string;
  created_at: string;
  draft_output: Record<string, unknown>;
}

interface UnsavedDraftCardProps {
  projectId: string;
  sessionType: SessionType;
  /** Route the "Resume" button navigates to */
  resumeTo: string;
  /** Human label, e.g. "ICP" */
  label: string;
}

/** Anything beyond internal _meta counts as real draft content */
function hasContent(draft: Record<string, unknown> | null): boolean {
  if (!draft) return false;
  return Object.entries(draft).some(([key, value]) => {
    if (key === '_meta') return false;
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as object).length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });
}

function draftTitle(draft: Record<string, unknown>): string | null {
  const candidates = ['segment_name', 'persona_name', 'name', 'brand_name'];
  for (const key of candidates) {
    const v = draft[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export default function UnsavedDraftCard({ projectId, sessionType, resumeTo, label }: UnsavedDraftCardProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<DraftSession | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wizard_sessions')
        .select('id, created_at, draft_output')
        .eq('project_id', projectId)
        .eq('session_type', sessionType)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1);

      if (cancelled) return;
      const found = data?.[0];
      const draft = (found?.draft_output as Record<string, unknown>) || null;
      if (found && hasContent(draft)) {
        setSession({ id: found.id, created_at: found.created_at, draft_output: draft! });
      } else {
        setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sessionType]);

  const discard = async () => {
    if (!session) return;
    setDiscarding(true);
    const { error } = await supabase
      .from('wizard_sessions')
      .update({ status: 'cancelled' })
      .eq('id', session.id);
    setDiscarding(false);
    setConfirmOpen(false);
    if (error) {
      toast.error('Could not discard draft: ' + error.message);
      return;
    }
    try {
      localStorage.removeItem(`wizard-draft:${session.id}`);
    } catch {}
    setSession(null);
    toast.success('Draft discarded');
  };

  if (!session) return null;

  const title = draftTitle(session.draft_output);
  const started = new Date(session.created_at).toLocaleString();

  return (
    <>
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex items-center gap-3">
        <FileClock className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Unsaved {label} draft{title ? `: ${title}` : ''}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Started {started} — not yet saved to the platform.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmOpen(true)}>
            {discarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Discard'}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => navigate(resumeTo)}>
            Resume
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this {label} draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft conversation and its generated content will be removed. Already-saved records are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

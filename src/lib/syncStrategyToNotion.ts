import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget background sync of the project's strategy artefacts to Notion.
 * Silent on failure — errors only visible in edge function logs.
 */
export function triggerStrategySync(projectId: string | undefined | null, pageId: string | undefined | null) {
  if (!projectId || !pageId) return;
  supabase.functions
    .invoke('sync-strategy-to-notion', { body: { project_id: projectId } })
    .catch(() => { /* silent */ });
}

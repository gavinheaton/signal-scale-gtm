import { supabase } from '@/integrations/supabase/client';
import type { DiscoveryOrgStatus } from '@/types/discovery';

// Non-destructive status nudges. Never move backwards, never overwrite
// a terminal status the user has explicitly set (validated/disqualified).
const ORDER: DiscoveryOrgStatus[] = ['researching', 'targeted', 'in_conversation', 'validated', 'disqualified'];
const TERMINAL: DiscoveryOrgStatus[] = ['validated', 'disqualified'];

export async function maybeAdvanceOrgStatus(
  orgId: string,
  target: 'targeted' | 'in_conversation',
) {
  if (!orgId) return;
  const { data } = await (supabase as any)
    .from('discovery_organizations')
    .select('status')
    .eq('id', orgId)
    .maybeSingle();
  const current = data?.status as DiscoveryOrgStatus | undefined;
  if (!current) return;
  if (TERMINAL.includes(current)) return;
  if (ORDER.indexOf(target) <= ORDER.indexOf(current)) return;
  await (supabase as any)
    .from('discovery_organizations')
    .update({ status: target })
    .eq('id', orgId);
}

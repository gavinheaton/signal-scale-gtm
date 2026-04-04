

# Add Campaign Deletion

## Problem
There is no way to delete a campaign from the UI. The `campaigns` table RLS doesn't even allow DELETE. Campaign assets can be deleted (RLS exists), but campaign metrics cannot.

## Solution

### 1. Database migration — enable campaign deletion
Add RLS DELETE policies for `campaigns` and `campaign_metrics`, scoped to org access. Optionally create a `delete_campaign_cascade` security definer function (like `delete_project_cascade`) that deletes metrics, assets, then the campaign — ensuring clean ordering and admin-level permission checks.

**Migration SQL:**
```sql
-- Delete policy for campaigns (admin/manager+)
CREATE POLICY "Users can delete project campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN org_memberships om ON om.org_id = p.org_id
    WHERE p.id = campaigns.project_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'superadmin', 'manager')
  )
);

-- Delete policy for campaign_metrics
CREATE POLICY "Users can delete campaign metrics"
ON public.campaign_metrics FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    JOIN projects p ON p.id = c.project_id
    WHERE c.id = campaign_metrics.campaign_id
      AND user_has_org_access(auth.uid(), p.org_id)
  )
);
```

### 2. UI — Add delete option to campaign detail and kanban cards

**`src/pages/Campaigns.tsx`:**

- Import `Trash2`, `MoreVertical` from lucide and `AlertDialog` components
- Add state: `deleteTarget`, `deleting`
- Add delete handler: deletes `campaign_metrics`, then `campaign_assets`, then `campaigns` row by id. On success, clear `selectedCampaign` and refresh list.
- **Campaign detail view**: Add a delete button (with destructive styling) in the header area next to the Notion link button
- **Kanban cards**: Add a `DropdownMenu` with a delete option (three-dot menu), similar to the Projects page pattern
- Both trigger an `AlertDialog` confirmation: "Delete [campaign name]? This will permanently delete all assets and metrics."

### Files changed
1. **New migration** — RLS DELETE policies for `campaigns` and `campaign_metrics`
2. **`src/pages/Campaigns.tsx`** — delete confirmation dialog, delete handler, UI triggers in detail header and kanban cards

### Delete handler logic
```typescript
const handleDeleteCampaign = async (campaign: Campaign) => {
  // Delete children first
  await supabase.from('campaign_metrics').delete().eq('campaign_id', campaign.id);
  await supabase.from('campaign_assets').delete().eq('campaign_id', campaign.id);
  const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id);
  if (error) { toast.error(error.message); return; }
  toast.success(`"${campaign.name}" deleted`);
  setSelectedCampaign(null);
  fetchData();
};
```


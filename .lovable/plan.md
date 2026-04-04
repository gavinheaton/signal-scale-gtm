

# Add Press Release Asset Type

## What Changes

1. **Database migration**: Add `'press_release'` to the `asset_type` enum
2. **Update existing record**: Change the "Healthcare AI Press Release" asset from `blog` to `press_release`
3. **TypeScript types**: The `types.ts` file auto-regenerates from Supabase, but we need to update the local `src/types/database.ts` to include `'press_release'` in the `AssetType` union
4. **UI references**: Update any components that render asset type badges/labels to handle the new `press_release` type with appropriate label ("Press Release") and styling

## Files to Change

- **Migration SQL**: `ALTER TYPE asset_type ADD VALUE 'press_release'` + update the existing record
- **`src/types/database.ts`**: Add `'press_release'` to `AssetType`
- **Content Pipeline & Campaign detail components**: Add badge color/label for `press_release` (scan `Campaigns.tsx`, `ContentPipeline.tsx`, and any shared badge helpers)

## Technical Notes

- Postgres `ADD VALUE` to an enum cannot run inside a transaction, so migration must use a single `ALTER TYPE` statement
- The record update (blog → press_release) will be a separate data insert tool call


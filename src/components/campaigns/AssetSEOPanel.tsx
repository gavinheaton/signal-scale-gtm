import { useState, useEffect } from 'react';
import { CampaignAsset, SeoMeta } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  asset: CampaignAsset;
  onUpdated: () => void;
}

export default function AssetSEOPanel({ asset, onUpdated }: Props) {
  const [seo, setSeo] = useState<SeoMeta>(asset.seo_meta || {});
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    setSeo(asset.seo_meta || {});
  }, [asset.id, asset.seo_meta]);

  const handleAutoGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-seo-metadata', {
        body: { asset_id: asset.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSeo(data.seo_meta);
      toast.success('SEO metadata generated');
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('campaign_assets')
        .update({ seo_meta: seo as never })
        .eq('id', asset.id);
      if (error) throw error;
      toast.success('SEO saved');
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    const tags = [...(seo.tags || [])];
    if (!tags.includes(t)) tags.push(t);
    setSeo({ ...seo, tags });
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setSeo({ ...seo, tags: (seo.tags || []).filter(x => x !== t) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Search className="h-4 w-4" /> SEO Metadata
        </h3>
        <Button variant="ghost" size="sm" onClick={handleAutoGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          Auto-generate
        </Button>
      </div>

      <div>
        <Label className="text-xs">Slug</Label>
        <Input
          value={seo.slug || ''}
          onChange={(e) => setSeo({ ...seo, slug: e.target.value })}
          placeholder="my-awesome-post"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs">Meta description</Label>
        <Textarea
          value={seo.meta_description || ''}
          onChange={(e) => setSeo({ ...seo, meta_description: e.target.value })}
          placeholder="150-160 characters that show in search results"
          rows={2}
          className="mt-1"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {(seo.meta_description || '').length}/160
        </p>
      </div>

      <div>
        <Label className="text-xs">Excerpt</Label>
        <Textarea
          value={seo.excerpt || ''}
          onChange={(e) => setSeo({ ...seo, excerpt: e.target.value })}
          rows={2}
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs">Tags</Label>
        <div className="flex gap-1 flex-wrap mt-1 mb-2">
          {(seo.tags || []).map(t => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button onClick={() => removeTag(t)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add tag and press Enter"
            className="text-sm"
          />
          <Button variant="outline" size="sm" onClick={addTag}>Add</Button>
        </div>
      </div>

      <div>
        <Label className="text-xs">Categories (comma-separated)</Label>
        <Input
          value={(seo.categories || []).join(', ')}
          onChange={(e) => setSeo({ ...seo, categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="Marketing, Strategy"
          className="mt-1"
        />
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Save SEO
      </Button>
    </div>
  );
}

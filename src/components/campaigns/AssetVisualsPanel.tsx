import { useState, useEffect } from 'react';
import { CampaignAsset, AssetImage } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, ImageIcon, Wand2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  asset: CampaignAsset;
  onUpdated: () => void;
}

export default function AssetVisualsPanel({ asset, onUpdated }: Props) {
  const [images, setImages] = useState<AssetImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [compositing, setCompositingId] = useState<string | null>(null);
  const [promptOverride, setPromptOverride] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);

  const loadImages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('asset_images')
      .select('*')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false });
    setImages((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadImages(); }, [asset.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-asset-image', {
        body: { asset_id: asset.id, prompt_override: promptOverride || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Generated ${data?.images?.length || 0} variants`);
      await loadImages();
    } catch (err: any) {
      toast.error(err?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleComposite = async (imgId: string) => {
    setCompositingId(imgId);
    try {
      const { data, error } = await supabase.functions.invoke('composite-feature-image', {
        body: { asset_image_id: imgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Title overlay applied');
      await loadImages();
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Composite failed');
    } finally {
      setCompositingId(null);
    }
  };

  const variants = images.filter(i => !i.is_composited);
  const composites = images.filter(i => i.is_composited);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ImageIcon className="h-4 w-4" /> Feature Image
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowPrompt(s => !s)}>
          {showPrompt ? 'Hide prompt' : 'Edit prompt'}
        </Button>
      </div>

      {asset.feature_image_url && (
        <div className="rounded-md overflow-hidden border bg-muted">
          <img src={asset.feature_image_url} alt={asset.feature_image_alt || ''} className="w-full h-auto" />
          <div className="p-2 text-xs text-muted-foreground bg-background border-t">
            Current feature image
          </div>
        </div>
      )}

      {showPrompt && (
        <Textarea
          value={promptOverride}
          onChange={(e) => setPromptOverride(e.target.value)}
          placeholder="Override style prompt (leave blank to use project default)"
          rows={3}
        />
      )}

      <Button onClick={handleGenerate} disabled={generating} className="w-full">
        {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
        {variants.length > 0 ? 'Generate 4 new variants' : 'Generate 4 variants'}
      </Button>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {variants.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Variants — click to apply title overlay</p>
              <div className="grid grid-cols-2 gap-2">
                {variants.map(img => (
                  <button
                    key={img.id}
                    onClick={() => handleComposite(img.id)}
                    disabled={compositing === img.id}
                    className={cn(
                      'relative group rounded-md overflow-hidden border-2 transition-all',
                      img.is_selected ? 'border-primary' : 'border-border hover:border-primary/50',
                      compositing === img.id && 'opacity-60'
                    )}
                  >
                    <img src={img.public_url} alt="" className="w-full h-32 object-cover" />
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      {compositing === img.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <span className="text-xs font-medium flex items-center gap-1">
                          <Wand2 className="h-3 w-3" /> Apply title
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {composites.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Composited versions</p>
              <div className="grid grid-cols-2 gap-2">
                {composites.slice(0, 4).map(img => (
                  <div key={img.id} className="relative rounded-md overflow-hidden border">
                    <img src={img.public_url} alt="" className="w-full h-32 object-cover" />
                    {img.is_selected && (
                      <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectVisualSettings } from '@/types/database';
import { Loader2, Palette, Save } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_SETTINGS: Omit<ProjectVisualSettings, 'id' | 'project_id' | 'created_at' | 'updated_at'> = {
  visual_style_preset: 'editorial photography, technology-themed, human-centered, warm lighting, shallow depth of field, no text, no logos, cinematic',
  overlay_template: {
    font_family: 'Poppins', font_size: 72, font_weight: 700,
    text_color: '#FFFFFF', gradient_opacity: 0.55, gradient_direction: 'bottom',
    padding: 80, max_width_pct: 80, alignment: 'left',
  },
  wordpress_site_id: null,
  wordpress_default_category: null,
  wordpress_default_status: 'draft',
};

export default function VisualStyleSettings() {
  const { currentProject } = useProject();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('project_visual_settings')
        .select('*')
        .eq('project_id', currentProject.id)
        .maybeSingle();
      if (data) {
        setExistingId(data.id);
        setSettings({
          visual_style_preset: data.visual_style_preset || DEFAULT_SETTINGS.visual_style_preset,
          overlay_template: (data.overlay_template as any) || DEFAULT_SETTINGS.overlay_template,
          wordpress_site_id: data.wordpress_site_id,
          wordpress_default_category: data.wordpress_default_category,
          wordpress_default_status: data.wordpress_default_status || 'draft',
        });
      }
      setLoading(false);
    })();
  }, [currentProject?.id]);

  const handleSave = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      const payload: any = {
        project_id: currentProject.id,
        visual_style_preset: settings.visual_style_preset,
        overlay_template: settings.overlay_template,
        wordpress_site_id: settings.wordpress_site_id,
        wordpress_default_category: settings.wordpress_default_category,
        wordpress_default_status: settings.wordpress_default_status,
      };
      const { error } = existingId
        ? await supabase.from('project_visual_settings').update(payload).eq('id', existingId)
        : await supabase.from('project_visual_settings').insert(payload).select().single().then(r => {
            if (r.data) setExistingId(r.data.id);
            return r;
          });
      if (error) throw error;
      toast.success('Visual settings saved');
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) return null;
  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;

  const tmpl = settings.overlay_template;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" /> Visuals & Publishing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Visual style preset</Label>
          <p className="text-xs text-muted-foreground mb-1">Prepended to every AI image generation. Defines your aesthetic fingerprint.</p>
          <Textarea
            value={settings.visual_style_preset}
            onChange={(e) => setSettings({ ...settings, visual_style_preset: e.target.value })}
            rows={3}
          />
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-2">Title overlay template</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Font family</Label>
              <Input value={tmpl.font_family} onChange={(e) => setSettings({ ...settings, overlay_template: { ...tmpl, font_family: e.target.value } })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Text color</Label>
              <Input type="color" value={tmpl.text_color} onChange={(e) => setSettings({ ...settings, overlay_template: { ...tmpl, text_color: e.target.value } })} className="mt-1 h-10" />
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <Select value={tmpl.alignment} onValueChange={(v) => setSettings({ ...settings, overlay_template: { ...tmpl, alignment: v as any } })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Gradient position</Label>
              <Select value={tmpl.gradient_direction} onValueChange={(v) => setSettings({ ...settings, overlay_template: { ...tmpl, gradient_direction: v as any } })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">Bottom</SelectItem>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-2">WordPress defaults</h4>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Default site (e.g. example.wordpress.com)</Label>
              <Input
                value={settings.wordpress_site_id || ''}
                onChange={(e) => setSettings({ ...settings, wordpress_site_id: e.target.value || null })}
                placeholder="yoursite.wordpress.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Default category</Label>
              <Input
                value={settings.wordpress_default_category || ''}
                onChange={(e) => setSettings({ ...settings, wordpress_default_category: e.target.value || null })}
                placeholder="Marketing"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Default publish status</Label>
              <Select value={settings.wordpress_default_status || 'draft'} onValueChange={(v) => setSettings({ ...settings, wordpress_default_status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="publish">Publish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

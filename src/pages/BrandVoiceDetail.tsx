import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Download, Edit, Info, Mic, X } from 'lucide-react';
import { toast } from 'sonner';

export default function BrandVoiceDetail() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [bv, setBv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!currentProject) return;
    supabase
      .from('brand_voices')
      .select('*')
      .eq('project_id', currentProject.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setBv(data[0]);
        setLoading(false);
      });
  }, [currentProject]);

  const exportForCowork = async () => {
    if (!bv || !currentProject) return;
    const { data: project } = await supabase
      .from('projects').select('name, slug').eq('id', currentProject.id).single();
    if (!project) { toast.error('Failed to load project'); return; }

    const slug = (project as any).slug || project.name.toLowerCase().replace(/\s+/g, '-');
    const exportData = {
      schema_version: "1.0",
      project_slug: slug,
      project_name: project.name,
      generated_at: new Date().toISOString(),
      generated_by: "gtm-platform-brand-voice-wizard",
      brand_voice: {
        personality_adjectives: bv.personality_adjectives,
        tone_description: bv.tone_description,
        writing_principles: bv.writing_principles,
        banned_phrases: bv.banned_phrases,
        preferred_vocabulary: bv.preferred_vocabulary,
        formatting_rules: bv.formatting_rules,
        content_type_guidance: bv.content_type_guidance,
        writing_samples: bv.writing_samples,
        target_audiences: bv.target_audiences,
        brand_identity: bv.brand_identity,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowBanner(true);
  };

  if (!currentProject) { navigate('/projects'); return null; }
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!bv) { navigate('/project/brand-voice'); return null; }

  const identity = bv.brand_identity || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/project/brand-voice')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Mic className="h-6 w-6" style={{ color: 'hsl(var(--purple))' }} />
            {identity.brand_name || 'Brand Voice'}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/project/brand-voice-wizard')}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
          {bv.status === 'complete' && (
            <Button variant="outline" onClick={exportForCowork}>
              <Download className="h-4 w-4 mr-2" /> Export for Cowork
            </Button>
          )}
        </div>
      </div>

      {showBanner && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-foreground">File downloaded</p>
            <p className="text-muted-foreground">
              Move this file into your <code className="text-xs bg-muted px-1 py-0.5 rounded">GTM Platform/brand-voices/</code> folder, then open Cowork and say "sync brand voices" to activate this brand voice.
            </p>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Personality */}
        {bv.personality_adjectives?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">✨ Personality</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {bv.personality_adjectives.map((a: string, i: number) => <Badge key={i} variant="secondary">{a}</Badge>)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tone */}
        {bv.tone_description && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">🎵 Tone</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{bv.tone_description}</p></CardContent>
          </Card>
        )}

        {/* Writing Principles */}
        {bv.writing_principles?.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">📝 Writing Principles</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bv.writing_principles.map((p: any, i: number) => (
                  <div key={i} className="border-l-2 border-primary/30 pl-3">
                    <p className="font-medium text-sm text-foreground">{p.principle}</p>
                    <p className="text-xs text-muted-foreground">{p.explanation}</p>
                    {p.bad_example && <p className="text-xs text-destructive mt-1">✗ {p.bad_example}</p>}
                    {p.good_example && <p className="text-xs text-green-600">✓ {p.good_example}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Banned Phrases */}
        {bv.banned_phrases?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">🚫 Banned Phrases</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {bv.banned_phrases.map((p: string, i: number) => <Badge key={i} variant="destructive" className="text-xs">{p}</Badge>)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preferred Vocabulary */}
        {bv.preferred_vocabulary?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">📖 Preferred Vocabulary</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {bv.preferred_vocabulary.map((v: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    Use "<span className="text-foreground font-medium">{v.use}</span>" instead of "<span className="line-through">{v.instead_of}</span>"
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Formatting Rules */}
        {bv.formatting_rules?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">📐 Formatting Rules</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                {bv.formatting_rules.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Content Type Guidance */}
        {bv.content_type_guidance && Object.keys(bv.content_type_guidance).length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">📋 Content Type Guidance</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(bv.content_type_guidance).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-foreground capitalize">{k.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{v as string}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Writing Samples */}
        {bv.writing_samples?.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">✍️ Writing Samples</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bv.writing_samples.map((s: any, i: number) => (
                  <div key={i} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-foreground">{s.type}</p>
                    <p className="text-sm text-muted-foreground mt-1 italic">"{s.sample}"</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Target Audiences */}
        {bv.target_audiences?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">🎯 Target Audiences</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {bv.target_audiences.map((a: any, i: number) => (
                  <div key={i}><span className="text-xs font-medium text-foreground">{a.segment}:</span> <span className="text-xs text-muted-foreground">{a.tone_adjustment}</span></div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Brand Identity */}
        {Object.keys(identity).filter(k => identity[k]).length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">🏷️ Brand Identity</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(identity).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><span className="text-xs font-medium text-foreground capitalize">{k.replace(/_/g, ' ')}:</span> <span className="text-xs text-muted-foreground">{v as string}</span></div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

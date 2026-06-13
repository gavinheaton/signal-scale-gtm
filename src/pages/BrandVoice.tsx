import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Sparkles, Eye, Download, ArrowRight, Info, X, Upload, Loader2, DownloadCloud } from 'lucide-react';
import { toast } from 'sonner';
import NotionImportDialog from '@/components/notion/NotionImportDialog';


interface BrandVoiceRecord {
  id: string;
  status: string;
  personality_adjectives: string[];
  tone_description: string | null;
  brand_identity: any;
  wizard_session_id: string | null;
}

export default function BrandVoice() {
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const [brandVoice, setBrandVoice] = useState<BrandVoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const notionStrategyPageId = (currentProject as any)?.notion_strategy_page_id;


  useEffect(() => {
    if (!currentProject) return;
    fetchBrandVoice();
  }, [currentProject]);

  const fetchBrandVoice = async () => {
    const { data } = await supabase
      .from('brand_voices')
      .select('id, status, personality_adjectives, tone_description, brand_identity, wizard_session_id')
      .eq('project_id', currentProject!.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setBrandVoice(data[0] as unknown as BrandVoiceRecord);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;

    const allowedTypes = ['.pdf', '.docx', '.txt', '.md'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(ext)) {
      toast.error('Please upload a PDF, DOCX, TXT, or MD file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      return;
    }

    setUploading(true);
    try {
      const filePath = `${currentProject.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('brand-voice-uploads')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      toast.success('Document uploaded — starting analysis...');
      navigate('/project/brand-voice-wizard', { state: { fileUrl: filePath } });
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const exportForCowork = async () => {
    if (!brandVoice || !currentProject) return;

    const { data: fullBv } = await supabase
      .from('brand_voices')
      .select('*')
      .eq('id', brandVoice.id)
      .single();

    const { data: project } = await supabase
      .from('projects')
      .select('name, slug')
      .eq('id', currentProject.id)
      .single();

    if (!fullBv || !project) {
      toast.error('Failed to load data for export');
      return;
    }

    const slug = (project as any).slug || project.name.toLowerCase().replace(/\s+/g, '-');

    const exportData = {
      schema_version: "1.0",
      project_slug: slug,
      project_name: project.name,
      generated_at: new Date().toISOString(),
      generated_by: "gtm-platform-brand-voice-wizard",
      brand_voice: {
        personality_adjectives: (fullBv as any).personality_adjectives,
        tone_description: (fullBv as any).tone_description,
        writing_principles: (fullBv as any).writing_principles,
        banned_phrases: (fullBv as any).banned_phrases,
        preferred_vocabulary: (fullBv as any).preferred_vocabulary,
        formatting_rules: (fullBv as any).formatting_rules,
        content_type_guidance: (fullBv as any).content_type_guidance,
        writing_samples: (fullBv as any).writing_samples,
        target_audiences: (fullBv as any).target_audiences,
        brand_identity: (fullBv as any).brand_identity,
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

  if (!currentProject) {
    navigate('/projects');
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    in_progress: 'bg-amber-500/15 text-amber-600',
    complete: 'bg-green-500/15 text-green-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Mic className="h-6 w-6" style={{ color: 'hsl(var(--purple))' }} />
            Brand Voice
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Define how your brand communicates</p>
        </div>
        {notionStrategyPageId && (
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <DownloadCloud className="h-4 w-4 mr-2" /> Import from Notion
          </Button>
        )}
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
          <button onClick={() => setShowBanner(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        onChange={handleFileUpload}
      />

      {!brandVoice ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Define your brand voice</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Our AI wizard will guide you through creating a comprehensive brand voice guide — covering tone, writing principles, vocabulary, and more.
            </p>
            <div className="flex gap-3">
              <Button size="lg" onClick={() => navigate('/project/brand-voice-wizard')}>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Brand Voice Wizard
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {uploading ? 'Uploading...' : 'Upload Existing Document'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Supports PDF, DOCX, TXT, and MD files (max 10MB)
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">
              {(brandVoice.brand_identity as any)?.brand_name || 'Brand Voice'}
            </CardTitle>
            <Badge className={statusColors[brandVoice.status] || ''}>
              {brandVoice.status.replace('_', ' ')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {brandVoice.personality_adjectives?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {brandVoice.personality_adjectives.map((adj, i) => (
                  <Badge key={i} variant="outline">{adj}</Badge>
                ))}
              </div>
            )}
            {brandVoice.tone_description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{brandVoice.tone_description}</p>
            )}
            <div className="flex gap-2 pt-2">
              {brandVoice.status === 'complete' ? (
                <>
                  <Button onClick={() => navigate('/project/brand-voice-detail')}>
                    <Eye className="h-4 w-4 mr-2" /> View
                  </Button>
                  <Button variant="outline" onClick={exportForCowork}>
                    <Download className="h-4 w-4 mr-2" /> Export for Cowork
                  </Button>
                </>
              ) : (
                <Button onClick={() => navigate('/project/brand-voice-wizard')}>
                  <ArrowRight className="h-4 w-4 mr-2" /> Continue
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {currentProject && (
        <NotionImportDialog
          projectId={currentProject.id}
          open={importOpen}
          onOpenChange={setImportOpen}
          mode="brand_voice"
          onImported={fetchBrandVoice}
        />
      )}
    </div>
  );
}


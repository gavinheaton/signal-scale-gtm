import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Sparkles, History, FlaskConical, ChevronDown, Download } from "lucide-react";

const IMPORTABLE_KEYS = new Set([
  "icp_wizard",
  "persona_wizard",
  "brand_voice_wizard",
  "campaign_wizard",
]);

interface Template {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sample_input_json: any;
  current_version_id: string | null;
  updated_at: string;
}

interface Version {
  id: string;
  template_id: string;
  prompt_text: string;
  created_by: string | null;
  created_at: string;
}

export default function AIPromptsAdmin() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<Record<string, string | null>>({});

  // Selected template / editor state
  const [selected, setSelected] = useState<Template | null>(null);
  const [activeVersion, setActiveVersion] = useState<Version | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [promptText, setPromptText] = useState("");
  const [sampleInput, setSampleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { raw_output: string; looks_like_valid_json: boolean } | null
  >(null);

  const [importing, setImporting] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_prompt_templates")
      .select("*")
      .order("label");
    if (error) {
      toast.error("Failed to load prompt templates: " + error.message);
      setLoading(false);
      return;
    }
    setTemplates(data || []);

    // Look up last-updated-by from active versions
    const versionIds = (data || [])
      .map((t) => t.current_version_id)
      .filter(Boolean) as string[];
    if (versionIds.length) {
      const { data: vData } = await supabase
        .from("ai_prompt_template_versions")
        .select("id, template_id, created_by")
        .in("id", versionIds);
      const map: Record<string, string | null> = {};
      for (const v of vData || []) map[v.template_id] = v.created_by;
      setLastUpdatedBy(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openTemplate = async (t: Template) => {
    setSelected(t);
    setPromptText("");
    setActiveVersion(null);
    setTestResult(null);
    setSampleInput(
      t.sample_input_json ? JSON.stringify(t.sample_input_json, null, 2) : "",
    );

    // Active version
    if (t.current_version_id) {
      const { data: v } = await supabase
        .from("ai_prompt_template_versions")
        .select("*")
        .eq("id", t.current_version_id)
        .maybeSingle();
      if (v) {
        setActiveVersion(v);
        setPromptText(v.prompt_text);
      }
    }

    // Version history
    const { data: vList } = await supabase
      .from("ai_prompt_template_versions")
      .select("*")
      .eq("template_id", t.id)
      .order("created_at", { ascending: false });
    setVersions(vList || []);
  };

  const closeSheet = () => {
    setSelected(null);
    setActiveVersion(null);
    setVersions([]);
    setPromptText("");
    setSampleInput("");
    setTestResult(null);
  };

  const persistSampleInput = async (tid: string, parsed: any) => {
    await supabase
      .from("ai_prompt_templates")
      .update({ sample_input_json: parsed })
      .eq("id", tid);
  };

  const handleSaveVersion = async () => {
    if (!selected || !promptText.trim()) {
      toast.error("Prompt text is required");
      return;
    }
    setSaving(true);

    // Optionally persist sample_input changes
    let parsedSample: any = null;
    if (sampleInput.trim()) {
      try {
        parsedSample = JSON.parse(sampleInput);
      } catch {
        toast.error("Sample input JSON is invalid — fix it or clear it before saving");
        setSaving(false);
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: newVersion, error: insErr } = await supabase
      .from("ai_prompt_template_versions")
      .insert({
        template_id: selected.id,
        prompt_text: promptText,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();

    if (insErr || !newVersion) {
      toast.error("Save failed: " + (insErr?.message || "unknown error"));
      setSaving(false);
      return;
    }

    const { error: updErr } = await supabase
      .from("ai_prompt_templates")
      .update({ current_version_id: newVersion.id })
      .eq("id", selected.id);

    if (updErr) {
      toast.error("Couldn't mark new version active: " + updErr.message);
      setSaving(false);
      return;
    }

    if (sampleInput.trim()) await persistSampleInput(selected.id, parsedSample);

    toast.success("New version saved & set active");
    setSaving(false);
    await fetchTemplates();
    await openTemplate({ ...selected, current_version_id: newVersion.id, sample_input_json: parsedSample });
  };

  const handleRestoreVersion = async (v: Version) => {
    if (!selected) return;
    if (!confirm("Create a new active version from this old prompt text?")) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newVersion, error } = await supabase
      .from("ai_prompt_template_versions")
      .insert({
        template_id: selected.id,
        prompt_text: v.prompt_text,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();
    if (error || !newVersion) {
      toast.error("Restore failed: " + (error?.message || "unknown"));
      setSaving(false);
      return;
    }
    await supabase
      .from("ai_prompt_templates")
      .update({ current_version_id: newVersion.id })
      .eq("id", selected.id);
    toast.success("Restored — created new active version");
    setSaving(false);
    await fetchTemplates();
    await openTemplate({ ...selected, current_version_id: newVersion.id });
  };

  const handleTest = async () => {
    if (!selected || !promptText.trim()) {
      toast.error("Add prompt text first");
      return;
    }
    setTesting(true);
    setTestResult(null);

    let sample: any = null;
    if (sampleInput.trim()) {
      try {
        sample = JSON.parse(sampleInput);
      } catch {
        toast.error("Sample input must be valid JSON (or empty)");
        setTesting(false);
        return;
      }
    }

    const { data, error } = await supabase.functions.invoke("test-prompt-template", {
      body: {
        template_key: selected.key,
        prompt_text: promptText,
        sample_input_json: sample,
      },
    });
    setTesting(false);
    if (error) {
      toast.error("Test failed: " + error.message);
      return;
    }
    setTestResult(data as any);
  };

  const handleImportFromSource = async (t: Template) => {
    if (!IMPORTABLE_KEYS.has(t.key)) {
      toast.error("No import source mapped for this template");
      return;
    }
    if (!confirm(`Import the current prompt for "${t.label}" from its secret / built-in default and save it as a new active version?`)) return;
    setImporting(true);
    const { data, error } = await supabase.functions.invoke("import-prompt-from-source", {
      body: { template_key: t.key },
    });
    setImporting(false);
    if (error) {
      toast.error("Import failed: " + error.message);
      return;
    }
    const src = (data as any)?.source;
    toast.success(`Imported from ${src === "secret" ? "secret" : "built-in default"} (${(data as any)?.char_count} chars)`);
    await fetchTemplates();
    if (selected?.id === t.id) {
      // Reload editor with new active version
      await openTemplate(t);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> AI Prompts ({templates.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Versioned system prompts powering every wizard. Edits create a new version; old versions are kept for restore.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Active version</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.label}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.key}</code>
                  </TableCell>
                  <TableCell>
                    {t.current_version_id ? (
                      <Badge variant="outline">Set</Badge>
                    ) : (
                      <Badge variant="destructive">Not configured</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.updated_at).toLocaleDateString()}
                    {lastUpdatedBy[t.id] && (
                      <div className="text-xs">by {lastUpdatedBy[t.id]?.slice(0, 8)}…</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openTemplate(t)}>
                        Edit
                      </Button>
                      {!t.current_version_id && IMPORTABLE_KEYS.has(t.key) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={importing}
                          onClick={() => handleImportFromSource(t)}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Import current
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent className="sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.label}</SheetTitle>
            <p className="text-xs text-muted-foreground">
              Key: <code>{selected?.key}</code>
            </p>
          </SheetHeader>

          {selected && (
            <div className="space-y-5 mt-4">
              <div>
                <Label>Prompt text</Label>
                <Textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="font-mono text-xs min-h-[300px] mt-1"
                  placeholder={
                    activeVersion
                      ? ""
                      : "No active version yet — paste the existing system prompt here and save."
                  }
                />
                {activeVersion && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Active version saved {new Date(activeVersion.created_at).toLocaleString()}
                  </p>
                )}
              </div>

              <div>
                <Label>Sample input JSON (used by Test button only)</Label>
                <Textarea
                  value={sampleInput}
                  onChange={(e) => setSampleInput(e.target.value)}
                  className="font-mono text-xs min-h-[120px] mt-1"
                  placeholder='{"example": "context for a dry-run test"}'
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleTest} disabled={testing} variant="outline">
                  <FlaskConical className="h-4 w-4 mr-1" />
                  {testing ? "Testing…" : "Test"}
                </Button>
                <Button onClick={handleSaveVersion} disabled={saving || !promptText.trim()}>
                  {saving ? "Saving…" : "Save as new version"}
                </Button>
              </div>

              {testResult && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Test result
                      <Badge variant={testResult.looks_like_valid_json ? "default" : "secondary"}>
                        {testResult.looks_like_valid_json ? "Valid JSON detected" : "No JSON detected"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-3 rounded max-h-[300px] overflow-auto whitespace-pre-wrap">
                      {testResult.raw_output}
                    </pre>
                  </CardContent>
                </Card>
              )}

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    <History className="h-4 w-4 mr-1" />
                    Version history ({versions.length})
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  {versions.length === 0 && (
                    <p className="text-sm text-muted-foreground">No versions yet.</p>
                  )}
                  {versions.map((v) => (
                    <Card key={v.id} className={v.id === selected.current_version_id ? "border-primary" : ""}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {new Date(v.created_at).toLocaleString()}
                            {v.created_by && ` · by ${v.created_by.slice(0, 8)}…`}
                          </span>
                          <div className="flex gap-2">
                            {v.id === selected.current_version_id && (
                              <Badge variant="outline">Active</Badge>
                            )}
                            {v.id !== selected.current_version_id && (
                              <Button size="sm" variant="outline" onClick={() => handleRestoreVersion(v)}>
                                Restore
                              </Button>
                            )}
                          </div>
                        </div>
                        <pre className="text-xs bg-muted p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">
                          {v.prompt_text.slice(0, 600)}
                          {v.prompt_text.length > 600 ? "…" : ""}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

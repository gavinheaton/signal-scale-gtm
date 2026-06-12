import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdopted: () => void;
}

interface NotionProp { name: string; type: string }
interface NotionDb { id: string; title: string; properties: NotionProp[] }

const EXPECTED = {
  calendar: {
    label: 'Content Calendar',
    titles: ['content calendar', 'calendar', 'content', 'schedule'],
    fields: [
      { key: 'Title', type: 'title', aliases: ['content', 'name', 'title'] },
      { key: 'Status', type: 'select', aliases: ['status', 'stage'] },
      { key: 'Channel', type: 'select', aliases: ['channel', 'platform'] },
      { key: 'Content Type', type: 'select', aliases: ['content type', 'type', 'format'] },
      { key: 'Demand Type', type: 'select', aliases: ['demand type', 'track'] },
      { key: 'Publish Date', type: 'date', aliases: ['publish date', 'date', 'scheduled'] },
      { key: 'Campaign', type: 'rich_text', aliases: ['campaign'] },
      { key: 'Persona', type: 'rich_text', aliases: ['persona', 'audience'] },
      { key: 'Pillar', type: 'relation', aliases: ['pillar', 'content pillar'] },
    ],
  },
  pillars: {
    label: 'Content Pillars',
    titles: ['content pillars', 'pillars'],
    fields: [
      { key: 'Title', type: 'title', aliases: ['pillar', 'name'] },
      { key: 'Description', type: 'rich_text', aliases: ['description', 'detail'] },
    ],
  },
  foundations: {
    label: 'Strategic Foundations',
    titles: ['strategic foundations', 'foundations'],
    fields: [
      { key: 'Title', type: 'title', aliases: ['foundation', 'name'] },
      { key: 'Type', type: 'select', aliases: ['type', 'category'] },
      { key: 'Detail', type: 'rich_text', aliases: ['detail', 'description'] },
    ],
  },
} as const;

type DbKey = keyof typeof EXPECTED;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function autoMatchDb(dbs: NotionDb[], titles: readonly string[]): string | undefined {
  const targets = titles.map(norm);
  for (const db of dbs) {
    const n = norm(db.title);
    if (targets.some((t) => n.includes(t) || t.includes(n))) return db.id;
  }
  return undefined;
}

function autoMatchProp(props: NotionProp[], type: string, aliases: readonly string[]): string | undefined {
  const candidates = props.filter((p) => p.type === type);
  for (const alias of aliases) {
    const a = norm(alias);
    const m = candidates.find((p) => norm(p.name) === a);
    if (m) return m.name;
  }
  return undefined;
}

export default function NotionAdoptWorkspaceDialog({ projectId, open, onOpenChange, onAdopted }: Props) {
  const [step, setStep] = useState<'url' | 'map'>('url');
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parentPageId, setParentPageId] = useState('');
  const [parentTitle, setParentTitle] = useState('');
  const [databases, setDatabases] = useState<NotionDb[]>([]);
  const [selected, setSelected] = useState<Record<DbKey, string>>({
    calendar: '', pillars: '', foundations: '',
  });
  const [maps, setMaps] = useState<Record<DbKey, Record<string, string>>>({
    calendar: {}, pillars: {}, foundations: {},
  });

  const reset = () => {
    setStep('url'); setUrl(''); setParentPageId(''); setParentTitle('');
    setDatabases([]); setSelected({ calendar: '', pillars: '', foundations: '' });
    setMaps({ calendar: {}, pillars: {}, foundations: {} });
  };

  const handleScan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    const { data, error } = await supabase.functions.invoke('discover-notion-workspace', {
      body: { project_id: projectId, parent_page_url: url.trim() },
    });
    setScanning(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to scan workspace');
      return;
    }
    setParentPageId(data.parent_page_id);
    setParentTitle(data.parent_page_title);
    setDatabases(data.databases || []);

    // auto-match DBs and properties
    const nextSel: Record<DbKey, string> = { calendar: '', pillars: '', foundations: '' };
    const nextMap: Record<DbKey, Record<string, string>> = { calendar: {}, pillars: {}, foundations: {} };
    (Object.keys(EXPECTED) as DbKey[]).forEach((k) => {
      const dbId = autoMatchDb(data.databases || [], EXPECTED[k].titles);
      if (dbId) {
        nextSel[k] = dbId;
        const db = (data.databases as NotionDb[]).find((d) => d.id === dbId);
        if (db) {
          EXPECTED[k].fields.forEach((f) => {
            const m = autoMatchProp(db.properties, f.type, f.aliases);
            if (m) nextMap[k][f.key] = m;
          });
        }
      }
    });
    setSelected(nextSel);
    setMaps(nextMap);
    setStep('map');
  };

  const handleDbChange = (key: DbKey, dbId: string) => {
    setSelected((s) => ({ ...s, [key]: dbId }));
    const db = databases.find((d) => d.id === dbId);
    const nextMap: Record<string, string> = {};
    if (db) {
      EXPECTED[key].fields.forEach((f) => {
        const m = autoMatchProp(db.properties, f.type, f.aliases);
        if (m) nextMap[f.key] = m;
      });
    }
    setMaps((m) => ({ ...m, [key]: nextMap }));
  };

  const handlePropChange = (key: DbKey, field: string, propName: string) => {
    setMaps((m) => ({
      ...m,
      [key]: { ...m[key], [field]: propName === '__none__' ? '' : propName },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const cleanMap = (m: Record<string, string>) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(m)) if (v) out[k] = v;
      return out;
    };
    const { data, error } = await supabase.functions.invoke('adopt-notion-workspace', {
      body: {
        project_id: projectId,
        parent_page_id: parentPageId,
        calendar_db_id: selected.calendar || null,
        pillars_db_id: selected.pillars || null,
        foundations_db_id: selected.foundations || null,
        property_map: {
          calendar: cleanMap(maps.calendar),
          pillars: cleanMap(maps.pillars),
          foundations: cleanMap(maps.foundations),
        },
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to save');
      return;
    }
    toast.success('Notion workspace adopted');
    onAdopted();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adopt existing Notion workspace</DialogTitle>
          <DialogDescription>
            Connect to an existing Notion page (like your ProPresence template) without creating new databases.
            We'll scan its child databases and map them to the app's expected fields.
          </DialogDescription>
        </DialogHeader>

        {step === 'url' ? (
          <div className="space-y-4">
            <div>
              <Label>Parent page URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.notion.so/Your-Workspace-Template-..."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The page that contains your Content Calendar, Pillars, and Foundations databases.
                Make sure this page is shared with your Notion integration.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleScan} disabled={!url.trim() || scanning}>
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Scan workspace
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{parentTitle}</div>
              <div className="text-xs text-muted-foreground">Found {databases.length} database{databases.length !== 1 ? 's' : ''}</div>
            </div>

            {(Object.keys(EXPECTED) as DbKey[]).map((key) => {
              const cfg = EXPECTED[key];
              const dbId = selected[key];
              const db = databases.find((d) => d.id === dbId);
              return (
                <div key={key} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {cfg.label}
                        {db ? (
                          <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Matched
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <AlertCircle className="h-3 w-3 mr-1" /> Not selected
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Select value={dbId || '__none__'} onValueChange={(v) => handleDbChange(key, v === '__none__' ? '' : v)}>
                      <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select database…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Skip this database —</SelectItem>
                        {databases.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {db && (
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-2 text-sm items-center">
                      <div className="font-medium text-xs text-muted-foreground">App field</div>
                      <div />
                      <div className="font-medium text-xs text-muted-foreground">Your Notion property</div>
                      {cfg.fields.map((f) => {
                        const options = db.properties.filter((p) => p.type === f.type);
                        return (
                          <>
                            <div key={`l-${f.key}`}>
                              {f.key} <span className="text-xs text-muted-foreground">({f.type})</span>
                            </div>
                            <div key={`a-${f.key}`} className="text-muted-foreground">→</div>
                            <Select
                              key={`s-${f.key}`}
                              value={maps[key][f.key] || '__none__'}
                              onValueChange={(v) => handlePropChange(key, f.key, v)}
                            >
                              <SelectTrigger><SelectValue placeholder="— Not mapped —" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Not mapped —</SelectItem>
                                {options.map((o) => (
                                  <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('url')}>Back</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save mapping
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

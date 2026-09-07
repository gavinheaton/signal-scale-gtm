import { useCallback, useEffect, useState } from 'react';
import { CanvasEntry, CanvasEntryStatus, STATUS_COLOR } from './types';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Plus, Trash2, Check, Loader2, Link as LinkIcon, Pencil, RefreshCw, CheckCheck, X } from 'lucide-react';
import { toast } from 'sonner';

interface Suggestion { id: string; content: string }

interface Props {
  canvasId: string;
  boxKey: string;
  label: string;
  hint: string;
  entries: CanvasEntry[];
  onChange: () => void;
}

const STATUS_ORDER: CanvasEntryStatus[] = ['assumption', 'hypothesis', 'validated'];

export function CanvasBox({ canvasId, boxKey, label, hint, entries, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addingAll, setAddingAll] = useState(false);
  const [addingSelected, setAddingSelected] = useState(false);

  async function addEntry(content: string, source: 'user' | 'ai_suggestion' = 'user') {
    if (!content.trim()) return;
    const { error } = await (supabase as any).from('canvas_entries').insert({
      canvas_id: canvasId, box: boxKey, content: content.trim(), source, status: 'assumption',
    });
    if (error) return toast.error(error.message);
    setText(''); setAdding(false); onChange();
  }

  async function addManyAiEntries(contents: string[]) {
    const rows = contents
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => ({ canvas_id: canvasId, box: boxKey, content: c, source: 'ai_suggestion', status: 'assumption' }));
    if (!rows.length) return;
    const { error } = await (supabase as any).from('canvas_entries').insert(rows);
    if (error) return toast.error(error.message);
    onChange();
  }

  async function updateStatus(id: string, status: CanvasEntryStatus) {
    await (supabase as any).from('canvas_entries').update({ status }).eq('id', id);
    onChange();
  }

  async function saveEdit(id: string) {
    const v = editText.trim();
    if (!v) return;
    await (supabase as any).from('canvas_entries').update({ content: v }).eq('id', id);
    setEditingId(null); setEditText('');
    onChange();
  }

  async function removeEntry(id: string) {
    await (supabase as any).from('canvas_entries').delete().eq('id', id);
    onChange();
  }

  async function suggest(append = false) {
    setSuggesting(true);
    if (!append) { setSuggestions([]); setSelected(new Set()); }
    try {
      const { data, error } = await supabase.functions.invoke('canvas-suggest', {
        body: { canvas_id: canvasId, box: boxKey, count: 5 },
      });
      if (error) throw error;
      const next = (data as any)?.suggestions || [];
      setSuggestions((prev) => (append ? [...prev, ...next] : next));
    } catch (e: any) {
      toast.error(`Suggest failed: ${e.message || e}`);
    } finally {
      setSuggesting(false);
    }
  }

  async function addAllSuggestions() {
    setAddingAll(true);
    try {
      await addManyAiEntries(suggestions);
      setSuggestions([]);
      setSelected(new Set());
    } finally {
      setAddingAll(false);
    }
  }

  function toggleSelected(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  async function addSelectedSuggestions() {
    if (!selected.size) return;
    setAddingSelected(true);
    try {
      const picked = suggestions.filter((_, i) => selected.has(i));
      await addManyAiEntries(picked);
      setSuggestions((prev) => prev.filter((_, i) => !selected.has(i)));
      setSelected(new Set());
    } finally {
      setAddingSelected(false);
    }
  }

  return (
    <div className="border rounded-md bg-card p-3 flex flex-col min-h-[220px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => suggest(false)} disabled={suggesting} title="Suggest with AI">
          {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-auto">
        {entries.map((e) => (
          <div key={e.id} className={`group text-xs p-1.5 rounded border ${e.is_stale ? 'opacity-50' : ''}`}>
            {editingId === e.id ? (
              <div className="space-y-1">
                <Textarea
                  value={editText}
                  onChange={(ev) => setEditText(ev.target.value)}
                  rows={3}
                  className="text-xs"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs flex-1" onClick={() => saveEdit(e.id)}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditingId(null); setEditText(''); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-1">
                <button
                  onClick={() => {
                    const idx = STATUS_ORDER.indexOf(e.status);
                    updateStatus(e.id, STATUS_ORDER[(idx + 1) % 3]);
                  }}
                  className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${STATUS_COLOR[e.status]}`}
                  title="Click to cycle status"
                >
                  {e.status[0]}
                </button>
                <p className="flex-1 leading-snug break-words">{e.content}</p>
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { setEditingId(e.id); setEditText(e.content); }} title="Edit">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeEntry(e.id)} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            {editingId !== e.id && e.source !== 'user' && (
              <div className="flex items-center gap-1 mt-0.5 ml-6">
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">
                  {e.source === 'auto' ? <><LinkIcon className="h-2 w-2 mr-0.5" />{e.source_ref?.table || 'auto'}</> : 'AI'}
                </Badge>
              </div>
            )}
          </div>
        ))}

        {suggestions.length > 0 && (
          <div className="border-t pt-1.5 mt-1.5 space-y-1">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <div className="flex items-center gap-1">
                <p className="text-[9px] uppercase text-muted-foreground">AI suggestions ({suggestions.length})</p>
                <button
                  className="text-[9px] uppercase text-muted-foreground underline hover:text-foreground"
                  onClick={() =>
                    setSelected(selected.size === suggestions.length ? new Set() : new Set(suggestions.map((_, i) => i)))
                  }
                >
                  {selected.size === suggestions.length ? 'clear' : 'all'}
                </button>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={addSelectedSuggestions} disabled={addingSelected || selected.size === 0} title="Add selected">
                  {addingSelected ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-0.5" />Add selected ({selected.size})</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={addAllSuggestions} disabled={addingAll} title="Add all">
                  {addingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCheck className="h-3 w-3 mr-0.5" />Add all</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={() => suggest(true)} disabled={suggesting} title="More suggestions">
                  {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-0.5" />More</>}
                </Button>
              </div>
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="text-xs flex items-start gap-1 bg-purple-50 p-1.5 rounded">
                <Checkbox
                  checked={selected.has(i)}
                  onCheckedChange={() => toggleSelected(i)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span className="flex-1 cursor-pointer" onClick={() => toggleSelected(i)}>{s}</span>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { addEntry(s, 'ai_suggestion'); setSuggestions(suggestions.filter((_, j) => j !== i)); setSelected((prev) => { const n = new Set<number>(); prev.forEach((x) => { if (x < i) n.add(x); else if (x > i) n.add(x - 1); }); return n; }); }} title="Add just this">
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding ? (
        <div className="mt-2 space-y-1">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-xs" placeholder="Add entry…" autoFocus />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={() => addEntry(text)}>Add</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setAdding(false); setText(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-6 mt-2 text-xs justify-start" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}

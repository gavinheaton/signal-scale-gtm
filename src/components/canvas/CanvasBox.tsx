import { useState } from 'react';
import { CanvasEntry, CanvasEntryStatus, STATUS_COLOR } from './types';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Trash2, Check, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

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
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  async function addEntry(content: string, source: 'user' | 'ai_suggestion' = 'user') {
    if (!content.trim()) return;
    const { error } = await (supabase as any).from('canvas_entries').insert({
      canvas_id: canvasId, box: boxKey, content: content.trim(), source, status: 'assumption',
    });
    if (error) return toast.error(error.message);
    setText(''); setAdding(false); onChange();
  }

  async function updateStatus(id: string, status: CanvasEntryStatus) {
    await (supabase as any).from('canvas_entries').update({ status }).eq('id', id);
    onChange();
  }

  async function updateContent(id: string, content: string) {
    await (supabase as any).from('canvas_entries').update({ content }).eq('id', id);
    onChange();
  }

  async function removeEntry(id: string) {
    await (supabase as any).from('canvas_entries').delete().eq('id', id);
    onChange();
  }

  async function suggest() {
    setSuggesting(true); setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke('canvas-suggest', { body: { canvas_id: canvasId, box: boxKey } });
      if (error) throw error;
      setSuggestions((data as any)?.suggestions || []);
    } catch (e: any) {
      toast.error(`Suggest failed: ${e.message || e}`);
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="border rounded-md bg-card p-3 flex flex-col min-h-[220px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={suggest} disabled={suggesting} title="Suggest with AI">
          {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-auto">
        {entries.map((e) => (
          <div key={e.id} className={`group text-xs p-1.5 rounded border ${e.is_stale ? 'opacity-50' : ''}`}>
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
              <p
                className="flex-1 leading-snug outline-none"
                contentEditable
                suppressContentEditableWarning
                onBlur={(ev) => {
                  const v = ev.currentTarget.textContent || '';
                  if (v !== e.content) updateContent(e.id, v);
                }}
              >
                {e.content}
              </p>
              <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => removeEntry(e.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {e.source !== 'user' && (
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
            <p className="text-[9px] uppercase text-muted-foreground">AI suggestions</p>
            {suggestions.map((s, i) => (
              <div key={i} className="text-xs flex items-start gap-1 bg-purple-50 p-1.5 rounded">
                <span className="flex-1">{s}</span>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { addEntry(s, 'ai_suggestion'); setSuggestions(suggestions.filter((_, j) => j !== i)); }}>
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

import PptxGenJS from 'pptxgenjs';
import type { Persona, ICP } from '@/types/database';

const NAVY = '0F284C';
const NAVY_DEEP = '0A1F3C';
const ORANGE = 'E33E23';
const PURPLE = '8833FF';
const MUTED = '64748B';
const WHITE = 'FFFFFF';
const CARD = 'FFFFFF';

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.42;
const GAP = 0.24;
const COL_W = (SLIDE_W - MARGIN * 2 - GAP * 2) / 3;
const COLS = [MARGIN, MARGIN + COL_W + GAP, MARGIN + (COL_W + GAP) * 2];
const BODY_TOP = 1.68;
const BODY_BOTTOM = SLIDE_H - 0.5;

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Flatten any jsonb value into short display lines. */
function flatten(data: any, prefix = ''): string[] {
  if (data === null || data === undefined) return [];
  if (typeof data === 'string') {
    const t = data.trim();
    return t ? [prefix ? `${prefix}: ${t}` : t] : [];
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return [prefix ? `${prefix}: ${data}` : String(data)];
  }
  if (Array.isArray(data)) return data.flatMap(v => flatten(v, prefix));
  if (typeof data === 'object') {
    return Object.entries(data).flatMap(([k, v]) => flatten(v, titleCase(k)));
  }
  return [];
}

interface CardDef {
  title: string;
  lines: string[];
  accent?: string;
  noBullet?: boolean;
}

function personaCards(persona: Persona): CardDef[] {
  const prefs = (persona.channel_preferences || {}) as Record<string, any>;
  const { preferred_evidence, ...channels } = prefs;

  const defs: CardDef[] = [
    { title: 'Goals & Objectives', lines: flatten(persona.goals) },
    { title: 'Biggest Challenges', lines: flatten(persona.pain_points) },
    { title: 'Organisational Context', lines: flatten((persona as any).organisational_context) },
    { title: 'Buying Behaviour', lines: flatten((persona as any).buying_behaviour) },
    { title: 'Where They Get Information', lines: flatten(channels) },
    { title: 'Evidence That Convinces Them', lines: flatten(preferred_evidence) },
    { title: 'How We Help', lines: flatten(persona.how_we_help), noBullet: true },
  ];
  return defs.filter(d => d.lines.length > 0);
}

const LINE_H = 0.20;
const CARD_PAD_TOP = 0.62;
const CARD_PAD_BOTTOM = 0.22;
const CHARS_PER_LINE = Math.floor((COL_W - 0.45) * 14.5);

function wrappedCount(line: string) {
  return Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
}

function cardHeight(card: CardDef) {
  const rows = card.lines.reduce((a, l) => a + wrappedCount(l), 0);
  return CARD_PAD_TOP + rows * LINE_H + CARD_PAD_BOTTOM;
}

function splitCard(card: CardDef, maxHeight: number): [CardDef, CardDef | null] {
  const avail = maxHeight - CARD_PAD_TOP - CARD_PAD_BOTTOM;
  const maxRows = Math.max(1, Math.floor(avail / LINE_H));
  let rows = 0;
  const head: string[] = [];
  const tail: string[] = [];
  for (const line of card.lines) {
    const n = wrappedCount(line);
    if (rows + n <= maxRows || head.length === 0) {
      head.push(line);
      rows += n;
    } else {
      tail.push(line);
    }
  }
  return [
    { ...card, lines: head },
    tail.length ? { ...card, title: `${card.title} (cont.)`, lines: tail } : null,
  ];
}

function addCard(slide: PptxGenJS.Slide, card: CardDef, x: number, y: number, h: number) {
  slide.addShape('roundRect', {
    x,
    y,
    w: COL_W,
    h,
    fill: { color: CARD },
    line: { color: 'E6EBF2', width: 0.5 },
    rectRadius: 0.08,
    shadow: { type: 'outer', color: '000000', opacity: 0.12, blur: 8, offset: 2, angle: 90 },
  });
  slide.addText(card.title.toUpperCase(), {
    x: x + 0.18,
    y: y + 0.13,
    w: COL_W - 0.36,
    h: 0.34,
    fontFace: 'Poppins',
    fontSize: 11,
    bold: true,
    color: card.accent || ORANGE,
    charSpacing: 0.6,
    valign: 'middle',
    margin: 0,
  });
  slide.addText(
    card.lines.map(l => ({
      text: l,
      options: card.noBullet
        ? { breakLine: true }
        : { bullet: { characterCode: '2022', indent: 12 }, breakLine: true },
    })),
    {
      x: x + 0.18,
      y: y + CARD_PAD_TOP - 0.12,
      w: COL_W - 0.36,
      h: h - CARD_PAD_TOP - CARD_PAD_BOTTOM + 0.12,
      fontFace: 'Poppins',
      fontSize: 10.5,
      color: '1A2438',
      lineSpacingMultiple: 1.05,
      valign: 'top',
      margin: 0,
    },
  );
}

function addHeader(slide: PptxGenJS.Slide, persona: Persona, icp?: ICP, contPage?: number) {
  slide.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 1.34, fill: { color: NAVY } });
  slide.addShape('rect', { x: 0, y: 1.34, w: SLIDE_W, h: 0.06, fill: { color: ORANGE } });

  const nameText = persona.persona_name + (contPage ? ` (${contPage})` : '');
  const titleSize = nameText.length > 62 ? 18 : nameText.length > 44 ? 21 : 26;
  slide.addText(nameText, {
    x: MARGIN,
    y: 0.16,
    w: SLIDE_W - MARGIN * 2 - 3.2,
    h: 0.66,
    fontFace: 'Poppins',
    fontSize: titleSize,
    valign: 'middle',
    bold: true,
    color: WHITE,
    margin: 0,
  });

  const meta = [titleCase(persona.role_in_buying), icp?.segment_name].filter(Boolean).join('   •   ');
  slide.addText(meta, {
    x: MARGIN,
    y: 0.88,
    w: SLIDE_W - MARGIN * 2 - 3.2,
    h: 0.3,
    fontFace: 'Poppins',
    fontSize: 12,
    color: 'C9D6E8',
    margin: 0,
  });

  const score = persona.ai_readiness_score || 0;
  slide.addText(
    [
      { text: 'AI READINESS  ', options: { color: 'C9D6E8', fontSize: 10, bold: true, charSpacing: 0.8 } },
      { text: `${score}/5  `, options: { color: WHITE, fontSize: 12, bold: true } },
      { text: '●'.repeat(score) + '○'.repeat(Math.max(0, 5 - score)), options: { color: PURPLE, fontSize: 12 } },
    ],
    {
      x: SLIDE_W - MARGIN - 3.2,
      y: 0.52,
      w: 3.2,
      h: 0.36,
      fontFace: 'Poppins',
      align: 'right',
      valign: 'middle',
      margin: 0,
    },
  );
}

function addFooter(slide: PptxGenJS.Slide, projectName?: string) {
  slide.addText(['Signal + Scale', projectName].filter(Boolean).join('   •   '), {
    x: MARGIN,
    y: SLIDE_H - 0.42,
    w: SLIDE_W - MARGIN * 2,
    h: 0.28,
    fontFace: 'Poppins',
    fontSize: 9,
    color: MUTED,
    margin: 0,
  });
}

/** Lay a persona out over one or more slides using a 3-column packing algorithm. */
function addPersonaSlides(pptx: PptxGenJS, persona: Persona, icp?: ICP, projectName?: string) {
  const queue = personaCards(persona);
  if (queue.length === 0) queue.push({ title: 'Persona', lines: ['No detail captured yet.'] });

  let page = 0;
  const maxCardH = BODY_BOTTOM - BODY_TOP;

  while (queue.length) {
    page += 1;
    const slide = pptx.addSlide();
    slide.background = { color: 'F4F6FA' };
    addHeader(slide, persona, icp, page > 1 ? page : undefined);
    addFooter(slide, projectName);

    const heights = [BODY_TOP, BODY_TOP, BODY_TOP];
    let placedAny = false;

    while (queue.length) {
      const colIdx = heights.indexOf(Math.min(...heights));
      const room = BODY_BOTTOM - heights[colIdx];
      let card = queue[0];
      let h = cardHeight(card);

      if (h > room) {
        if (room < 1.1) break; // column set is full → next slide
        const [head, tail] = splitCard(card, room);
        card = head;
        h = cardHeight(card);
        if (tail) queue[0] = tail;
        else queue.shift();
      } else {
        queue.shift();
      }

      const drawH = Math.min(h, maxCardH, BODY_BOTTOM - heights[colIdx]);
      addCard(slide, card, COLS[colIdx], heights[colIdx], drawH);
      heights[colIdx] += drawH + GAP;
      placedAny = true;
    }

    if (!placedAny) break; // safety valve
  }
}

function slugify(s: string) {
  return s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ');
}

function newDeck() {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Signal + Scale';
  pptx.company = 'Signal + Scale';
  return pptx;
}

export async function downloadPersonaPptx(persona: Persona, icp?: ICP, projectName?: string) {
  const pptx = newDeck();
  pptx.title = `${persona.persona_name} — Persona`;
  addPersonaSlides(pptx, persona, icp, projectName);
  await pptx.writeFile({ fileName: `${slugify(persona.persona_name)} - Persona.pptx` });
}

export async function downloadAllPersonasPptx(personas: Persona[], icps: ICP[], projectName?: string) {
  const pptx = newDeck();
  pptx.title = `${projectName ? projectName + ' — ' : ''}Buyer Personas`;

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: NAVY_DEEP };
  cover.addShape('rect', { x: 0, y: 3.28, w: 2.6, h: 0.09, fill: { color: ORANGE } });
  cover.addText('Buyer Personas', {
    x: MARGIN + 0.3,
    y: 2.3,
    w: SLIDE_W - 2,
    h: 0.9,
    fontFace: 'Poppins',
    fontSize: 40,
    bold: true,
    color: WHITE,
    margin: 0,
  });
  cover.addText(
    [projectName, `${personas.length} persona${personas.length === 1 ? '' : 's'}`].filter(Boolean).join('   •   '),
    {
      x: MARGIN + 0.3,
      y: 3.55,
      w: SLIDE_W - 2,
      h: 0.4,
      fontFace: 'Poppins',
      fontSize: 15,
      color: 'C9D6E8',
      margin: 0,
    },
  );

  const groups = icps
    .map(icp => ({ icp, items: personas.filter(p => p.icp_id === icp.id) }))
    .filter(g => g.items.length > 0);
  const orphans = personas.filter(p => !icps.some(i => i.id === p.icp_id));
  if (orphans.length) groups.push({ icp: undefined as unknown as ICP, items: orphans });

  for (const group of groups) {
    for (const p of group.items) {
      addPersonaSlides(pptx, p, group.icp, projectName);
    }
  }

  await pptx.writeFile({ fileName: `${projectName ? slugify(projectName) + ' - ' : ''}Buyer Personas.pptx` });
}

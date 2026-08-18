import PptxGenJS from 'pptxgenjs';
import type { Persona, ICP, RoleInBuying } from '@/types/database';

/* ---------- palette (mirrors the Buying Influence Map) ---------- */

const NAVY = '0F284C';
const NAVY_DEEP = '081831';
const INK = '15203A';
const MUTED = '6B7A93';
const HAIR = 'DFE5EE';
const CANVAS = 'FBFCFE';
const WHITE = 'FFFFFF';

const ROLE_ACCENTS: Record<RoleInBuying, string> = {
  champion: '8B44E0',
  economic_buyer: '2E9E63',
  influencer: '3B7FD4',
  end_user: 'E0A22B',
  blocker: 'DC4B33',
};

const ROLE_TINTS: Record<RoleInBuying, string> = {
  champion: 'F6F1FE',
  economic_buyer: 'F0F8F4',
  influencer: 'F1F5FC',
  end_user: 'FDF7EC',
  blocker: 'FDF2F0',
};

const ROLE_LABELS: Record<RoleInBuying, string> = {
  champion: 'Champion',
  economic_buyer: 'Economic Buyer',
  influencer: 'Influencer',
  end_user: 'End User',
  blocker: 'Blocker',
};

const accentFor = (p: Persona) => ROLE_ACCENTS[p.role_in_buying] || ROLE_ACCENTS.influencer;
const tintFor = (p: Persona) => ROLE_TINTS[p.role_in_buying] || ROLE_TINTS.influencer;

/* ---------- geometry ---------- */

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.72;
const GAP = 0.28;
const COL_W = (SLIDE_W - MARGIN * 2 - GAP * 2) / 3;
const COLS = [MARGIN, MARGIN + COL_W + GAP, MARGIN + (COL_W + GAP) * 2];
const BODY_TOP = 1.9;
const BODY_BOTTOM = SLIDE_H - 0.72;

const SANS = 'Poppins';

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const pad2 = (n: number) => String(n).padStart(2, '0');

/* ---------- data flattening ---------- */

function flatten(data: unknown, prefix = ''): string[] {
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
    return Object.entries(data as Record<string, unknown>).flatMap(([k, v]) => flatten(v, titleCase(k)));
  }
  return [];
}

interface CardDef {
  title: string;
  lines: string[];
  index: number;
  noBullet?: boolean;
}

function personaCards(persona: Persona): CardDef[] {
  const prefs = (persona.channel_preferences || {}) as Record<string, unknown>;
  const { preferred_evidence, ...channels } = prefs;

  const defs: Omit<CardDef, 'index'>[] = [
    { title: 'Goals & Objectives', lines: flatten(persona.goals) },
    { title: 'Biggest Challenges', lines: flatten(persona.pain_points) },
    { title: 'Organisational Context', lines: flatten((persona as unknown as Record<string, unknown>).organisational_context) },
    { title: 'Buying Behaviour', lines: flatten((persona as unknown as Record<string, unknown>).buying_behaviour) },
    { title: 'Where They Get Information', lines: flatten(channels) },
    { title: 'Evidence That Convinces Them', lines: flatten(preferred_evidence) },
    { title: 'How We Help', lines: flatten(persona.how_we_help), noBullet: true },
  ];

  return defs.filter(d => d.lines.length > 0).map((d, i) => ({ ...d, index: i + 1 }));
}

/* ---------- height estimation ---------- */

const LINE_H = 0.2;
const CARD_PAD_TOP = 0.66;
const CARD_PAD_BOTTOM = 0.24;
const CHARS_PER_LINE = Math.floor((COL_W - 0.5) * 14.5);

const wrappedCount = (line: string) => Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));

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

/* ---------- primitives ---------- */

function roleChip(slide: PptxGenJS.Slide, persona: Persona, x: number, y: number) {
  const accent = accentFor(persona);
  const label = ROLE_LABELS[persona.role_in_buying] || titleCase(persona.role_in_buying);
  const w = 0.28 + label.length * 0.088;
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h: 0.32,
    fill: { color: accent },
    line: { color: accent, width: 0 },
    rectRadius: 0.16,
  });
  slide.addText(label.toUpperCase(), {
    x,
    y,
    w,
    h: 0.32,
    fontFace: SANS,
    fontSize: 9,
    bold: true,
    color: WHITE,
    charSpacing: 1.1,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  return w;
}

/** Thin ring gauge echoing the influence map sunburst. */
function readinessDial(slide: PptxGenJS.Slide, persona: Persona, cx: number, cy: number) {
  const score = Math.max(0, Math.min(5, persona.ai_readiness_score || 0));
  const accent = accentFor(persona);
  const d = 0.86;

  slide.addShape('pie', {
    x: cx - d / 2,
    y: cy - d / 2,
    w: d,
    h: d,
    fill: { color: HAIR },
    line: { color: HAIR, width: 0 },
    angleRange: [0, 359.9],
  });
  if (score > 0) {
    slide.addShape('pie', {
      x: cx - d / 2,
      y: cy - d / 2,
      w: d,
      h: d,
      fill: { color: accent },
      line: { color: accent, width: 0 },
      angleRange: [0, (score / 5) * 359.9],
    });
  }
  slide.addShape('ellipse', {
    x: cx - d / 2 + 0.11,
    y: cy - d / 2 + 0.11,
    w: d - 0.22,
    h: d - 0.22,
    fill: { color: CANVAS },
    line: { color: CANVAS, width: 0 },
  });
  slide.addText(`${score}`, {
    x: cx - d / 2,
    y: cy - 0.17,
    w: d,
    h: 0.34,
    fontFace: SANS,
    fontSize: 15,
    bold: true,
    color: INK,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  slide.addText('AI READINESS  ·  OF 5', {
    x: cx - 1.9,
    y: cy - 0.14,
    w: 1.55,
    h: 0.28,
    fontFace: SANS,
    fontSize: 8,
    bold: true,
    color: MUTED,
    charSpacing: 1.2,
    align: 'right',
    valign: 'middle',
    margin: 0,
  });
}

function addFooter(slide: PptxGenJS.Slide, persona: Persona, projectName?: string, page?: string) {
  slide.addShape('rect', {
    x: MARGIN,
    y: SLIDE_H - 0.62,
    w: SLIDE_W - MARGIN * 2,
    h: 0.008,
    fill: { color: HAIR },
    line: { color: HAIR, width: 0 },
  });
  slide.addText(['Signal + Scale', projectName, 'Buyer Persona'].filter(Boolean).join('   ·   ').toUpperCase(), {
    x: MARGIN,
    y: SLIDE_H - 0.52,
    w: SLIDE_W - MARGIN * 2 - 1.4,
    h: 0.28,
    fontFace: SANS,
    fontSize: 8,
    color: MUTED,
    charSpacing: 1.1,
    margin: 0,
  });
  if (page) {
    slide.addText(page, {
      x: SLIDE_W - MARGIN - 1.4,
      y: SLIDE_H - 0.52,
      w: 1.4,
      h: 0.28,
      fontFace: SANS,
      fontSize: 8,
      bold: true,
      color: accentFor(persona),
      charSpacing: 1.1,
      align: 'right',
      margin: 0,
    });
  }
}

/* ---------- detail card ---------- */

function addCard(slide: PptxGenJS.Slide, persona: Persona, card: CardDef, x: number, y: number, h: number) {
  const accent = accentFor(persona);

  slide.addShape('rect', {
    x,
    y,
    w: COL_W,
    h,
    fill: { color: tintFor(persona) },
    line: { color: HAIR, width: 0.5 },
  });
  slide.addShape('rect', {
    x,
    y,
    w: 0.035,
    h,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });

  slide.addText(pad2(card.index), {
    x: x + 0.22,
    y: y + 0.16,
    w: 0.4,
    h: 0.26,
    fontFace: SANS,
    fontSize: 9,
    bold: true,
    color: accent,
    charSpacing: 0.6,
    valign: 'middle',
    margin: 0,
  });
  slide.addText(card.title.toUpperCase(), {
    x: x + 0.62,
    y: y + 0.16,
    w: COL_W - 0.84,
    h: 0.26,
    fontFace: SANS,
    fontSize: 9.5,
    bold: true,
    color: INK,
    charSpacing: 1.1,
    valign: 'middle',
    margin: 0,
  });

  slide.addText(
    card.lines.map(l => ({
      text: l,
      options: card.noBullet
        ? { breakLine: true }
        : { bullet: { characterCode: '2013', indent: 12 }, breakLine: true },
    })),
    {
      x: x + 0.24,
      y: y + CARD_PAD_TOP - 0.14,
      w: COL_W - 0.46,
      h: h - CARD_PAD_TOP - CARD_PAD_BOTTOM + 0.14,
      fontFace: SANS,
      fontSize: 10,
      color: '2B3752',
      lineSpacingMultiple: 1.12,
      valign: 'top',
      margin: 0,
    },
  );
}

/* ---------- headers ---------- */

function addDetailHeader(slide: PptxGenJS.Slide, persona: Persona, icp?: ICP) {
  const accent = accentFor(persona);
  slide.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.075, fill: { color: accent }, line: { color: accent, width: 0 } });

  slide.addText(persona.persona_name, {
    x: MARGIN,
    y: 0.62,
    w: SLIDE_W - MARGIN * 2 - 3.0,
    h: 0.5,
    fontFace: SANS,
    fontSize: 22,
    bold: true,
    color: INK,
    valign: 'middle',
    margin: 0,
  });

  const meta = [ROLE_LABELS[persona.role_in_buying] || titleCase(persona.role_in_buying), icp?.segment_name]
    .filter(Boolean)
    .join('   ·   ');
  slide.addText(meta.toUpperCase(), {
    x: MARGIN,
    y: 1.13,
    w: SLIDE_W - MARGIN * 2 - 3.0,
    h: 0.28,
    fontFace: SANS,
    fontSize: 9,
    bold: true,
    color: accent,
    charSpacing: 1.4,
    margin: 0,
  });

  slide.addShape('rect', {
    x: MARGIN,
    y: 1.6,
    w: SLIDE_W - MARGIN * 2,
    h: 0.008,
    fill: { color: HAIR },
    line: { color: HAIR, width: 0 },
  });
}

/* ---------- summary slide ---------- */

function addSummarySlide(pptx: PptxGenJS, persona: Persona, icp?: ICP, projectName?: string) {
  const accent = accentFor(persona);
  const slide = pptx.addSlide();
  slide.background = { color: CANVAS };

  slide.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.075, fill: { color: accent }, line: { color: accent, width: 0 } });

  slide.addText('BUYER PERSONA', {
    x: MARGIN,
    y: 0.9,
    w: 5,
    h: 0.26,
    fontFace: SANS,
    fontSize: 9,
    bold: true,
    color: MUTED,
    charSpacing: 2,
    margin: 0,
  });

  const name = persona.persona_name;
  slide.addText(name, {
    x: MARGIN,
    y: 1.24,
    w: SLIDE_W - MARGIN * 2 - 2.4,
    h: 1.5,
    fontFace: SANS,
    fontSize: name.length > 58 ? 30 : name.length > 40 ? 36 : 42,
    bold: true,
    color: INK,
    lineSpacingMultiple: 0.95,
    valign: 'top',
    margin: 0,
  });

  const chipW = roleChip(slide, persona, MARGIN, 2.92);
  if (icp?.segment_name) {
    slide.addText(icp.segment_name.toUpperCase(), {
      x: MARGIN + chipW + 0.22,
      y: 2.92,
      w: SLIDE_W - MARGIN * 2 - chipW - 2.6,
      h: 0.32,
      fontFace: SANS,
      fontSize: 9,
      bold: true,
      color: MUTED,
      charSpacing: 1.4,
      valign: 'middle',
      margin: 0,
    });
  }

  readinessDial(slide, persona, SLIDE_W - MARGIN - 0.43, 1.62);

  // Two headline panels: top goal, top challenge
  const goals = flatten(persona.goals);
  const pains = flatten(persona.pain_points);
  const panelW = (SLIDE_W - MARGIN * 2 - GAP) / 2;
  const panelY = 3.66;
  const panelH = 1.72;

  const panels: { label: string; text: string }[] = [
    { label: 'Primary Goal', text: goals[0] || 'Not captured yet' },
    { label: 'Primary Challenge', text: pains[0] || 'Not captured yet' },
  ];

  panels.forEach((panel, i) => {
    const x = MARGIN + i * (panelW + GAP);
    slide.addShape('rect', {
      x,
      y: panelY,
      w: panelW,
      h: panelH,
      fill: { color: WHITE },
      line: { color: HAIR, width: 0.5 },
    });
    slide.addShape('rect', {
      x,
      y: panelY,
      w: panelW,
      h: 0.035,
      fill: { color: accent },
      line: { color: accent, width: 0 },
    });
    slide.addText(panel.label.toUpperCase(), {
      x: x + 0.3,
      y: panelY + 0.24,
      w: panelW - 0.6,
      h: 0.26,
      fontFace: SANS,
      fontSize: 9,
      bold: true,
      color: accent,
      charSpacing: 1.4,
      valign: 'middle',
      margin: 0,
    });
    slide.addText(panel.text, {
      x: x + 0.3,
      y: panelY + 0.6,
      w: panelW - 0.6,
      h: panelH - 0.86,
      fontFace: SANS,
      fontSize: 13,
      color: INK,
      lineSpacingMultiple: 1.14,
      valign: 'top',
      margin: 0,
    });
  });

  const help = flatten(persona.how_we_help)[0];
  if (help) {
    slide.addText('HOW WE HELP', {
      x: MARGIN,
      y: panelY + panelH + 0.3,
      w: 2,
      h: 0.24,
      fontFace: SANS,
      fontSize: 8,
      bold: true,
      color: MUTED,
      charSpacing: 1.4,
      margin: 0,
    });
    slide.addText(help, {
      x: MARGIN + 1.7,
      y: panelY + panelH + 0.24,
      w: SLIDE_W - MARGIN * 2 - 1.7,
      h: 0.52,
      fontFace: SANS,
      fontSize: 11,
      italic: true,
      color: '3A4762',
      lineSpacingMultiple: 1.1,
      valign: 'top',
      margin: 0,
    });
  }

  addFooter(slide, persona, projectName, 'OVERVIEW');
}

/* ---------- layout engine ---------- */

function addPersonaSlides(pptx: PptxGenJS, persona: Persona, icp?: ICP, projectName?: string) {
  addSummarySlide(pptx, persona, icp, projectName);

  const queue = personaCards(persona);
  if (queue.length === 0) return;

  let page = 0;
  const maxCardH = BODY_BOTTOM - BODY_TOP;

  while (queue.length) {
    page += 1;
    const slide = pptx.addSlide();
    slide.background = { color: CANVAS };
    addDetailHeader(slide, persona, icp);

    const heights = [BODY_TOP, BODY_TOP, BODY_TOP];
    let placedAny = false;

    while (queue.length) {
      const colIdx = heights.indexOf(Math.min(...heights));
      const room = BODY_BOTTOM - heights[colIdx];
      let card = queue[0];
      let h = cardHeight(card);

      if (h > room) {
        if (room < 1.1) break;
        const [head, tail] = splitCard(card, room);
        card = head;
        h = cardHeight(card);
        if (tail) queue[0] = tail;
        else queue.shift();
      } else {
        queue.shift();
      }

      const drawH = Math.min(h, maxCardH, BODY_BOTTOM - heights[colIdx]);
      addCard(slide, persona, card, COLS[colIdx], heights[colIdx], drawH);
      heights[colIdx] += drawH + GAP;
      placedAny = true;
    }

    addFooter(slide, persona, projectName, `DETAIL ${pad2(page)}`);
    if (!placedAny) break;
  }
}

/* ---------- deck plumbing ---------- */

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

  /* Cover: dark navy, thin type, role legend */
  const cover = pptx.addSlide();
  cover.background = { color: NAVY_DEEP };

  cover.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.075, fill: { color: '8B44E0' }, line: { color: '8B44E0', width: 0 } });

  cover.addText('SIGNAL + SCALE', {
    x: MARGIN,
    y: 0.95,
    w: 5,
    h: 0.26,
    fontFace: SANS,
    fontSize: 9,
    bold: true,
    color: '8DA2C0',
    charSpacing: 2.4,
    margin: 0,
  });

  cover.addText('Buyer Personas', {
    x: MARGIN,
    y: 2.5,
    w: SLIDE_W - MARGIN * 2 - 1,
    h: 1.0,
    fontFace: SANS,
    fontSize: 46,
    bold: true,
    color: WHITE,
    valign: 'middle',
    margin: 0,
  });

  cover.addText([projectName, `${personas.length} persona${personas.length === 1 ? '' : 's'}`].filter(Boolean).join('   ·   ').toUpperCase(), {
    x: MARGIN,
    y: 3.56,
    w: SLIDE_W - MARGIN * 2 - 1,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    bold: true,
    color: 'A9BCD6',
    charSpacing: 1.6,
    margin: 0,
  });

  cover.addShape('rect', {
    x: MARGIN,
    y: 4.36,
    w: 2.2,
    h: 0.035,
    fill: { color: 'E33E23' },
    line: { color: 'E33E23', width: 0 },
  });

  // Legend of the roles actually present
  const rolesPresent = (Object.keys(ROLE_ACCENTS) as RoleInBuying[]).filter(r =>
    personas.some(p => p.role_in_buying === r),
  );
  rolesPresent.forEach((role, i) => {
    const x = MARGIN + i * 2.2;
    cover.addShape('ellipse', {
      x,
      y: 5.28,
      w: 0.15,
      h: 0.15,
      fill: { color: ROLE_ACCENTS[role] },
      line: { color: ROLE_ACCENTS[role], width: 0 },
    });
    cover.addText(ROLE_LABELS[role].toUpperCase(), {
      x: x + 0.26,
      y: 5.19,
      w: 1.85,
      h: 0.32,
      fontFace: SANS,
      fontSize: 8.5,
      bold: true,
      color: 'C3D2E6',
      charSpacing: 1.2,
      valign: 'middle',
      margin: 0,
    });
  });

  cover.addText('BUYING INFLUENCE', {
    x: MARGIN,
    y: 6.5,
    w: 4,
    h: 0.26,
    fontFace: SANS,
    fontSize: 8,
    bold: true,
    color: '5C7597',
    charSpacing: 1.8,
    margin: 0,
  });

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

export { NAVY };

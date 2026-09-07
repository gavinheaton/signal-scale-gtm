import PptxGenJS from 'pptxgenjs';

/* ------------------------------------------------------------------ *
 * Brand Guide deck — shares the visual language of personaPptx.ts:
 * light canvas, thin large headings, small uppercase tracked labels,
 * numbered markers, quiet tinted panels with a single hairline accent.
 * ------------------------------------------------------------------ */

const NAVY_DEEP = '081831';
const INK = '15203A';
const BODY = '2B3752';
const MUTED = '6B7A93';
const HAIR = 'DFE5EE';
const CANVAS = 'FBFCFE';
const WHITE = 'FFFFFF';
const PURPLE = '8833FF';
const ORANGE = 'E33E23';
const GOOD = '2E9E63';
const BAD = 'DC4B33';

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.72;
const GAP = 0.28;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const COL_W = (CONTENT_W - GAP * 2) / 3;
const COLS = [MARGIN, MARGIN + COL_W + GAP, MARGIN + (COL_W + GAP) * 2];
const BODY_TOP = 1.98;
const BODY_BOTTOM = SLIDE_H - 0.78;

const SANS = 'Poppins';

/* ---------- helpers ---------- */

const titleCase = (s: string) =>
  s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const pad2 = (n: number) => String(n).padStart(2, '0');

function hex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return v.split('').map(c => c + c).join('').toUpperCase();
  }
  return fallback;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Rough wrapped-line count for a given box width / font size. */
const charsPerLine = (w: number, fontSize: number) =>
  Math.max(8, Math.floor((w - 0.1) * 152 / fontSize));
const rowsFor = (text: string, w: number, fontSize: number) =>
  Math.max(1, Math.ceil(text.length / charsPerLine(w, fontSize)));

export interface BrandVoiceLike {
  personality_adjectives?: unknown;
  tone_description?: unknown;
  writing_principles?: unknown;
  banned_phrases?: unknown;
  preferred_vocabulary?: unknown;
  formatting_rules?: unknown;
  content_type_guidance?: unknown;
  writing_samples?: unknown;
  target_audiences?: unknown;
  brand_identity?: unknown;
}

interface Theme {
  accent: string;
  primary: string;
  brandName: string;
  projectName?: string;
}

/* ---------- chrome ---------- */

function newSlide(pptx: PptxGenJS, theme: Theme) {
  const slide = pptx.addSlide();
  slide.background = { color: CANVAS };
  slide.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.075,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
  });
  return slide;
}

function addHeader(
  slide: PptxGenJS.Slide,
  theme: Theme,
  kicker: string,
  title: string,
  standfirst?: string,
) {
  slide.addText(kicker.toUpperCase(), {
    x: MARGIN, y: 0.58, w: CONTENT_W, h: 0.24,
    fontFace: SANS, fontSize: 8.5, bold: true, color: MUTED, charSpacing: 2, margin: 0,
  });
  slide.addText(title, {
    x: MARGIN, y: 0.86, w: CONTENT_W - 0.4, h: 0.56,
    fontFace: SANS, fontSize: title.length > 52 ? 22 : 26, bold: true,
    color: INK, valign: 'middle', margin: 0,
  });
  if (standfirst) {
    slide.addText(standfirst, {
      x: MARGIN, y: 1.44, w: Math.min(CONTENT_W, 9.2), h: 0.3,
      fontFace: SANS, fontSize: 10.5, color: MUTED, valign: 'middle', margin: 0,
    });
  }
  slide.addShape('rect', {
    x: MARGIN, y: 1.78, w: CONTENT_W, h: 0.008,
    fill: { color: HAIR }, line: { color: HAIR, width: 0 },
  });
}

function addFooter(slide: PptxGenJS.Slide, theme: Theme, page: string) {
  slide.addShape('rect', {
    x: MARGIN, y: SLIDE_H - 0.62, w: CONTENT_W, h: 0.008,
    fill: { color: HAIR }, line: { color: HAIR, width: 0 },
  });
  slide.addText(
    [theme.brandName, theme.projectName, 'Brand Voice Guide']
      .filter(Boolean).join('   ·   ').toUpperCase(),
    {
      x: MARGIN, y: SLIDE_H - 0.52, w: CONTENT_W - 2.0, h: 0.28,
      fontFace: SANS, fontSize: 8, color: MUTED, charSpacing: 1.1, margin: 0,
    },
  );
  slide.addText(page.toUpperCase(), {
    x: SLIDE_W - MARGIN - 2.0, y: SLIDE_H - 0.52, w: 2.0, h: 0.28,
    fontFace: SANS, fontSize: 8, bold: true, color: theme.accent,
    charSpacing: 1.1, align: 'right', margin: 0,
  });
}

/* ---------- generic card packing (3 columns) ---------- */

interface CardDef {
  title: string;
  lines: string[];
  index: number;
  noBullet?: boolean;
}

const LINE_H = 0.205;
const CARD_PAD_TOP = 0.68;
const CARD_PAD_BOTTOM = 0.26;

function cardHeight(card: CardDef) {
  const rows = card.lines.reduce((a, l) => a + rowsFor(l, COL_W - 0.5, 10), 0);
  return CARD_PAD_TOP + rows * LINE_H + CARD_PAD_BOTTOM;
}

function splitCard(card: CardDef, maxHeight: number): [CardDef, CardDef | null] {
  const maxRows = Math.max(1, Math.floor((maxHeight - CARD_PAD_TOP - CARD_PAD_BOTTOM) / LINE_H));
  let rows = 0;
  const head: string[] = [];
  const tail: string[] = [];
  for (const line of card.lines) {
    const n = rowsFor(line, COL_W - 0.5, 10);
    if (rows + n <= maxRows || head.length === 0) {
      head.push(line);
      rows += n;
    } else tail.push(line);
  }
  return [
    { ...card, lines: head },
    tail.length ? { ...card, title: `${card.title} (cont.)`, lines: tail } : null,
  ];
}

function addCard(
  slide: PptxGenJS.Slide, theme: Theme, card: CardDef,
  x: number, y: number, h: number,
) {
  slide.addShape('rect', {
    x, y, w: COL_W, h,
    fill: { color: WHITE }, line: { color: HAIR, width: 0.5 },
  });
  slide.addShape('rect', {
    x, y, w: 0.035, h,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
  });
  slide.addText(pad2(card.index), {
    x: x + 0.22, y: y + 0.18, w: 0.4, h: 0.26,
    fontFace: SANS, fontSize: 9, bold: true, color: theme.accent,
    charSpacing: 0.6, valign: 'middle', margin: 0,
  });
  slide.addText(card.title.toUpperCase(), {
    x: x + 0.64, y: y + 0.18, w: COL_W - 0.86, h: 0.26,
    fontFace: SANS, fontSize: 9.5, bold: true, color: INK,
    charSpacing: 1.1, valign: 'middle', margin: 0,
  });
  slide.addText(
    card.lines.map(l => ({
      text: l,
      options: card.noBullet
        ? { breakLine: true }
        : { bullet: { characterCode: '2013', indent: 12 }, breakLine: true },
    })),
    {
      x: x + 0.24, y: y + CARD_PAD_TOP - 0.14, w: COL_W - 0.46,
      h: h - CARD_PAD_TOP - CARD_PAD_BOTTOM + 0.14,
      fontFace: SANS, fontSize: 10, color: BODY,
      lineSpacingMultiple: 1.12, valign: 'top', margin: 0,
    },
  );
}

function addCardSection(
  pptx: PptxGenJS, theme: Theme, cards: CardDef[],
  kicker: string, title: string, standfirst: string | undefined, pageLabel: string,
) {
  const queue = [...cards];
  if (!queue.length) return;
  let page = 0;
  const maxCardH = BODY_BOTTOM - BODY_TOP;

  while (queue.length) {
    page += 1;
    const slide = newSlide(pptx, theme);
    addHeader(slide, theme, kicker, title, standfirst);
    const heights = [BODY_TOP, BODY_TOP, BODY_TOP];
    let placedAny = false;

    while (queue.length) {
      const colIdx = heights.indexOf(Math.min(...heights));
      const room = BODY_BOTTOM - heights[colIdx];
      let card = queue[0];
      let h = cardHeight(card);

      if (h > room) {
        if (room < 1.2) break;
        const [head, tail] = splitCard(card, room);
        card = head;
        h = cardHeight(card);
        if (tail) queue[0] = tail;
        else queue.shift();
      } else queue.shift();

      const drawH = Math.min(h, maxCardH, BODY_BOTTOM - heights[colIdx]);
      addCard(slide, theme, card, COLS[colIdx], heights[colIdx], drawH);
      heights[colIdx] += drawH + GAP;
      placedAny = true;
    }

    addFooter(slide, theme, page > 1 ? `${pageLabel} ${pad2(page)}` : pageLabel);
    if (!placedAny) break;
  }
}

/* ---------- cover ---------- */

function addCover(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const cover = pptx.addSlide();
  cover.background = { color: NAVY_DEEP };
  cover.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.075,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
  });

  cover.addText('SIGNAL + SCALE', {
    x: MARGIN, y: 0.95, w: 6, h: 0.26,
    fontFace: SANS, fontSize: 9, bold: true, color: '8DA2C0', charSpacing: 2.4, margin: 0,
  });

  const name = theme.brandName;
  cover.addText(name, {
    x: MARGIN, y: 2.3, w: CONTENT_W - 1, h: 1.1,
    fontFace: SANS, fontSize: name.length > 34 ? 34 : name.length > 22 ? 42 : 48,
    bold: true, color: WHITE, valign: 'middle', margin: 0,
  });

  cover.addText('Brand Voice & Messaging Guide', {
    x: MARGIN, y: 3.44, w: CONTENT_W - 1, h: 0.44,
    fontFace: SANS, fontSize: 19, color: 'C3D2E6', valign: 'middle', margin: 0,
  });

  cover.addShape('rect', {
    x: MARGIN, y: 4.22, w: 2.2, h: 0.035,
    fill: { color: ORANGE }, line: { color: ORANGE, width: 0 },
  });

  const adjectives = arr<string>(bv.personality_adjectives).map(str).filter(Boolean);
  if (adjectives.length) {
    cover.addText(adjectives.slice(0, 6).join('   ·   ').toUpperCase(), {
      x: MARGIN, y: 4.62, w: CONTENT_W - 1, h: 0.34,
      fontFace: SANS, fontSize: 10, bold: true, color: 'A9BCD6',
      charSpacing: 1.6, valign: 'middle', margin: 0,
    });
  }

  const swatches = [
    { label: 'Primary', color: theme.primary },
    { label: 'Accent', color: theme.accent },
  ];
  swatches.forEach((s, i) => {
    const x = MARGIN + i * 2.1;
    cover.addShape('rect', {
      x, y: 5.5, w: 0.34, h: 0.34,
      fill: { color: s.color }, line: { color: '2A3A55', width: 0.75 },
    });
    cover.addText(`${s.label.toUpperCase()}  #${s.color}`, {
      x: x + 0.46, y: 5.5, w: 1.6, h: 0.34,
      fontFace: SANS, fontSize: 8, bold: true, color: 'C3D2E6',
      charSpacing: 1, valign: 'middle', margin: 0,
    });
  });

  const meta = [theme.projectName, new Date().toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })].filter(Boolean).join('   ·   ');
  cover.addText(meta.toUpperCase(), {
    x: MARGIN, y: 6.5, w: CONTENT_W, h: 0.26,
    fontFace: SANS, fontSize: 8, bold: true, color: '5C7597', charSpacing: 1.8, margin: 0,
  });
}

/* ---------- personality & tone ---------- */

function addPersonalitySlide(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const adjectives = arr<string>(bv.personality_adjectives).map(str).filter(Boolean);
  const tone = str(bv.tone_description);
  if (!adjectives.length && !tone) return;

  const slide = newSlide(pptx, theme);
  addHeader(slide, theme, 'Section 01', 'Personality', 'The traits every piece of communication should carry.');

  // Chip rows
  let x = MARGIN;
  let y = BODY_TOP + 0.1;
  const chipH = 0.56;
  adjectives.forEach(adj => {
    const label = adj.toUpperCase();
    const w = 0.56 + label.length * 0.115;
    if (x + w > MARGIN + CONTENT_W) {
      x = MARGIN;
      y += chipH + 0.2;
    }
    slide.addShape('roundRect', {
      x, y, w, h: chipH,
      fill: { color: WHITE }, line: { color: theme.accent, width: 1 }, rectRadius: 0.28,
    });
    slide.addText(label, {
      x, y, w, h: chipH,
      fontFace: SANS, fontSize: 12, bold: true, color: theme.accent,
      charSpacing: 1.2, align: 'center', valign: 'middle', margin: 0,
    });
    x += w + 0.2;
  });

  if (tone) {
    const panelY = Math.min(y + chipH + 0.5, 4.5);
    const panelH = Math.min(
      BODY_BOTTOM - panelY,
      0.9 + rowsFor(tone, CONTENT_W - 0.8, 13) * 0.28,
    );
    slide.addShape('rect', {
      x: MARGIN, y: panelY, w: CONTENT_W, h: panelH,
      fill: { color: WHITE }, line: { color: HAIR, width: 0.5 },
    });
    slide.addShape('rect', {
      x: MARGIN, y: panelY, w: 0.035, h: panelH,
      fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
    });
    slide.addText('HOW WE SOUND', {
      x: MARGIN + 0.34, y: panelY + 0.22, w: 4, h: 0.26,
      fontFace: SANS, fontSize: 9, bold: true, color: theme.accent, charSpacing: 1.4, margin: 0,
    });
    slide.addText(tone, {
      x: MARGIN + 0.34, y: panelY + 0.6, w: CONTENT_W - 0.7, h: panelH - 0.84,
      fontFace: SANS, fontSize: 13, color: INK, lineSpacingMultiple: 1.16,
      valign: 'top', margin: 0,
    });
  }

  addFooter(slide, theme, 'Personality');
}

/* ---------- writing principles ---------- */

interface Principle {
  principle: string;
  explanation: string;
  bad_example: string;
  good_example: string;
}

/** Different wizard vintages use different key names — accept them all. */
function normalisePrinciples(raw: unknown): Principle[] {
  return arr<Record<string, unknown>>(raw)
    .map(p => ({
      principle: str(p?.principle) || str(p?.name) || str(p?.title),
      explanation: str(p?.explanation) || str(p?.description) || str(p?.detail),
      bad_example: str(p?.bad_example) || str(p?.before) || str(p?.avoid_example),
      good_example: str(p?.good_example) || str(p?.after) || str(p?.example),
    }))
    .filter(p => p.principle || p.explanation);
}

function addPrincipleSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const principles = normalisePrinciples(bv.writing_principles);
  if (!principles.length) return;

  principles.forEach((p, i) => {
    const slide = newSlide(pptx, theme);
    const heading = str(p.principle) || `Principle ${i + 1}`;
    addHeader(
      slide, theme,
      `Writing Principle ${pad2(i + 1)} of ${pad2(principles.length)}`,
      heading,
    );

    let y = BODY_TOP + 0.06;
    const explanation = str(p.explanation);
    if (explanation) {
      const h = Math.min(1.7, 0.1 + rowsFor(explanation, CONTENT_W - 0.2, 14) * 0.3);
      slide.addText(explanation, {
        x: MARGIN, y, w: Math.min(CONTENT_W, 10.6), h,
        fontFace: SANS, fontSize: 14, color: BODY, lineSpacingMultiple: 1.2,
        valign: 'top', margin: 0,
      });
      y += h + 0.34;
    }

    const bad = str(p.bad_example);
    const good = str(p.good_example);
    if (bad || good) {
      const panelW = (CONTENT_W - GAP) / 2;
      const panels = [
        { label: 'Instead of this', text: bad, color: BAD, tint: 'FDF2F0' },
        { label: 'Write this', text: good, color: GOOD, tint: 'F0F8F4' },
      ].filter(p2 => p2.text);
      const w = panels.length === 1 ? CONTENT_W : panelW;
      const rows = Math.max(...panels.map(p2 => rowsFor(p2.text, w - 0.7, 13)));
      const panelH = Math.min(BODY_BOTTOM - y, 1.0 + rows * 0.28);

      panels.forEach((p2, j) => {
        const x = MARGIN + j * (w + GAP);
        slide.addShape('rect', {
          x, y, w, h: panelH,
          fill: { color: p2.tint }, line: { color: HAIR, width: 0.5 },
        });
        slide.addShape('rect', {
          x, y, w, h: 0.035,
          fill: { color: p2.color }, line: { color: p2.color, width: 0 },
        });
        slide.addText(p2.label.toUpperCase(), {
          x: x + 0.3, y: y + 0.24, w: w - 0.6, h: 0.26,
          fontFace: SANS, fontSize: 9, bold: true, color: p2.color,
          charSpacing: 1.4, valign: 'middle', margin: 0,
        });
        slide.addText(p2.text, {
          x: x + 0.3, y: y + 0.64, w: w - 0.6, h: panelH - 0.9,
          fontFace: SANS, fontSize: 13, italic: true, color: INK,
          lineSpacingMultiple: 1.16, valign: 'top', margin: 0,
        });
      });
    }

    addFooter(slide, theme, `Principle ${pad2(i + 1)}`);
  });
}

/* ---------- vocabulary ---------- */

function normaliseVocab(raw: unknown) {
  return arr<Record<string, unknown>>(raw)
    .map(p => ({
      use: str(p?.use) || str(p?.prefer) || str(p?.preferred),
      instead: str(p?.instead_of) || str(p?.avoid) || str(p?.instead),
    }))
    .filter(p => p.use || p.instead);
}

function addVocabularySlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const pairs = normaliseVocab(bv.preferred_vocabulary);
  if (!pairs.length) return;

  const PER_PAGE = 8;
  const pages = Math.ceil(pairs.length / PER_PAGE);

  for (let page = 0; page < pages; page++) {
    const slice = pairs.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const slide = newSlide(pptx, theme);
    addHeader(slide, theme, 'Section 03', 'Words we use', 'Swap the phrase on the right for the one on the left.');

    const colW = (CONTENT_W - GAP) / 2;
    const headY = BODY_TOP + 0.06;
    slide.addText('USE', {
      x: MARGIN + 0.1, y: headY, w: colW, h: 0.28,
      fontFace: SANS, fontSize: 9, bold: true, color: GOOD, charSpacing: 1.6, margin: 0,
    });
    slide.addText('INSTEAD OF', {
      x: MARGIN + colW + GAP + 0.1, y: headY, w: colW, h: 0.28,
      fontFace: SANS, fontSize: 9, bold: true, color: MUTED, charSpacing: 1.6, margin: 0,
    });

    const rowH = Math.min(0.56, (BODY_BOTTOM - headY - 0.44) / slice.length);
    slice.forEach((p, i) => {
      const y = headY + 0.42 + i * (rowH + 0.06);
      slide.addShape('rect', {
        x: MARGIN, y, w: colW, h: rowH,
        fill: { color: WHITE }, line: { color: HAIR, width: 0.5 },
      });
      slide.addShape('rect', {
        x: MARGIN, y, w: 0.03, h: rowH,
        fill: { color: GOOD }, line: { color: GOOD, width: 0 },
      });
      slide.addText(p.use || '—', {
        x: MARGIN + 0.24, y, w: colW - 0.44, h: rowH,
        fontFace: SANS, fontSize: 11.5, bold: true, color: INK, valign: 'middle', margin: 0,
      });
      slide.addText(p.instead || '—', {
        x: MARGIN + colW + GAP + 0.1, y, w: colW - 0.2, h: rowH,
        fontFace: SANS, fontSize: 11.5, color: MUTED, strike: true, valign: 'middle', margin: 0,
      });
    });

    addFooter(slide, theme, pages > 1 ? `Vocabulary ${pad2(page + 1)}` : 'Vocabulary');
  }
}

/* ---------- banned phrases ---------- */

interface Banned { phrase: string; reason: string; alternative: string }

/** Entries arrive as plain strings, JSON-encoded strings, or objects. */
function normaliseBanned(raw: unknown): Banned[] {
  return arr<unknown>(raw)
    .map(entry => {
      let value: unknown = entry;
      if (typeof value === 'string') {
        const t = value.trim();
        if (t.startsWith('{')) {
          try { value = JSON.parse(t); } catch { /* keep the raw string */ }
        }
      }
      if (typeof value === 'string') {
        return { phrase: value.trim(), reason: '', alternative: '' };
      }
      const o = (value || {}) as Record<string, unknown>;
      return {
        phrase: str(o.phrase) || str(o.term) || str(o.text),
        reason: str(o.reason) || str(o.why),
        alternative: str(o.alternative) || str(o.instead) || str(o.replacement),
      };
    })
    .filter(b => b.phrase);
}

function addBannedSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const items = normaliseBanned(bv.banned_phrases);
  if (!items.length) return;

  const detailed = items.some(i => i.alternative || i.reason);
  const kicker = 'Section 04';
  const title = 'Words we avoid';
  const standfirst = detailed
    ? 'Cut the phrase on the left; use the replacement on the right.'
    : 'These phrases dilute the voice — cut or rewrite them.';

  if (!detailed) {
    const queue = items.map(i => i.phrase);
    let page = 0;
    while (queue.length) {
      page += 1;
      const slide = newSlide(pptx, theme);
      addHeader(slide, theme, kicker, title, standfirst);

      let x = MARGIN;
      let y = BODY_TOP + 0.12;
      const chipH = 0.5;

      while (queue.length) {
        const phrase = queue[0];
        const w = Math.min(CONTENT_W, 0.5 + phrase.length * 0.098);
        if (x + w > MARGIN + CONTENT_W) {
          x = MARGIN;
          y += chipH + 0.18;
        }
        if (y + chipH > BODY_BOTTOM) break;
        queue.shift();
        slide.addShape('roundRect', {
          x, y, w, h: chipH,
          fill: { color: 'FDF2F0' }, line: { color: 'F2CDC6', width: 0.75 }, rectRadius: 0.25,
        });
        slide.addText(phrase, {
          x: x + 0.12, y, w: w - 0.24, h: chipH,
          fontFace: SANS, fontSize: 11, color: BAD, strike: true,
          align: 'center', valign: 'middle', margin: 0,
        });
        x += w + 0.18;
      }

      addFooter(slide, theme, page > 1 ? `Avoid ${pad2(page)}` : 'Avoid');
    }
    return;
  }

  const leftW = CONTENT_W * 0.38;
  const rightW = CONTENT_W - leftW - GAP;
  const queue = [...items];
  let page = 0;

  while (queue.length) {
    page += 1;
    const slide = newSlide(pptx, theme);
    addHeader(slide, theme, kicker, title, standfirst);

    const headY = BODY_TOP + 0.06;
    slide.addText('AVOID', {
      x: MARGIN + 0.24, y: headY, w: leftW, h: 0.28,
      fontFace: SANS, fontSize: 9, bold: true, color: BAD, charSpacing: 1.6, margin: 0,
    });
    slide.addText('WRITE THIS INSTEAD', {
      x: MARGIN + leftW + GAP, y: headY, w: rightW, h: 0.28,
      fontFace: SANS, fontSize: 9, bold: true, color: GOOD, charSpacing: 1.6, margin: 0,
    });

    let y = headY + 0.42;
    let placed = 0;
    while (queue.length) {
      const item = queue[0];
      const right = [item.alternative, item.reason].filter(Boolean).join('  —  ');
      const rows = Math.max(
        rowsFor(item.phrase, leftW - 0.5, 11.5),
        rowsFor(right || '—', rightW - 0.3, 11),
      );
      const h = Math.max(0.5, rows * 0.24 + 0.26);
      if (placed > 0 && y + h > BODY_BOTTOM) break;
      queue.shift();
      placed += 1;

      slide.addShape('rect', {
        x: MARGIN, y, w: leftW, h,
        fill: { color: 'FDF2F0' }, line: { color: 'F2CDC6', width: 0.5 },
      });
      slide.addShape('rect', {
        x: MARGIN, y, w: 0.03, h,
        fill: { color: BAD }, line: { color: BAD, width: 0 },
      });
      slide.addText(item.phrase, {
        x: MARGIN + 0.24, y, w: leftW - 0.42, h,
        fontFace: SANS, fontSize: 11.5, color: BAD, strike: true,
        lineSpacingMultiple: 1.1, valign: 'middle', margin: 0,
      });

      if (item.alternative) {
        slide.addText(item.alternative, {
          x: MARGIN + leftW + GAP, y, w: rightW, h: item.reason ? h * 0.56 : h,
          fontFace: SANS, fontSize: 11.5, bold: true, color: INK,
          lineSpacingMultiple: 1.1, valign: item.reason ? 'bottom' : 'middle', margin: 0,
        });
      }
      if (item.reason) {
        slide.addText(item.reason, {
          x: MARGIN + leftW + GAP, y: item.alternative ? y + h * 0.54 : y,
          w: rightW, h: item.alternative ? h * 0.46 : h,
          fontFace: SANS, fontSize: 9.5, italic: true, color: MUTED,
          lineSpacingMultiple: 1.1, valign: item.alternative ? 'top' : 'middle', margin: 0,
        });
      }

      y += h + 0.12;
    }

    addFooter(slide, theme, page > 1 ? `Avoid ${pad2(page)}` : 'Avoid');
  }
}

/* ---------- formatting rules ---------- */

function addFormattingSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const rules = arr<string>(bv.formatting_rules).map(str).filter(Boolean);
  if (!rules.length) return;

  const colW = (CONTENT_W - GAP * 1.5) / 2;
  const queue = rules.map((text, i) => ({ text, n: i + 1 }));
  let page = 0;

  while (queue.length) {
    page += 1;
    const slide = newSlide(pptx, theme);
    addHeader(slide, theme, 'Section 05', 'Formatting & style', 'Mechanics that keep everything consistent.');

    const heights = [BODY_TOP + 0.06, BODY_TOP + 0.06];
    let placedAny = false;

    while (queue.length) {
      const col = heights[0] <= heights[1] ? 0 : 1;
      const rule = queue[0];
      const h = Math.max(0.46, rowsFor(rule.text, colW - 0.66, 11.5) * 0.26 + 0.28);
      if (heights[col] + h > BODY_BOTTOM) {
        if (heights[1 - col] + h > BODY_BOTTOM) break;
        continue;
      }
      queue.shift();
      const x = MARGIN + col * (colW + GAP * 1.5);
      const y = heights[col];
      slide.addText(pad2(rule.n), {
        x, y: y + 0.02, w: 0.44, h: 0.3,
        fontFace: SANS, fontSize: 10, bold: true, color: theme.accent,
        charSpacing: 0.6, valign: 'middle', margin: 0,
      });
      slide.addText(rule.text, {
        x: x + 0.5, y, w: colW - 0.56, h,
        fontFace: SANS, fontSize: 11.5, color: BODY,
        lineSpacingMultiple: 1.14, valign: 'top', margin: 0,
      });
      heights[col] = y + h + 0.16;
      placedAny = true;
    }

    addFooter(slide, theme, page > 1 ? `Formatting ${pad2(page)}` : 'Formatting');
    if (!placedAny) break;
  }
}

/* ---------- channel guidance ---------- */

function addChannelSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const guidance = (bv.content_type_guidance && typeof bv.content_type_guidance === 'object' && !Array.isArray(bv.content_type_guidance))
    ? (bv.content_type_guidance as Record<string, unknown>)
    : {};
  const cards: CardDef[] = Object.entries(guidance)
    .map(([k, v]) => ({ title: titleCase(k), text: str(v) }))
    .filter(c => c.text)
    .map((c, i) => ({ title: c.title, lines: [c.text], index: i + 1, noBullet: true }));

  addCardSection(
    pptx, theme, cards, 'Section 06', 'Guidance by channel',
    'How the voice flexes across formats.', 'Channels',
  );
}

/* ---------- audiences ---------- */

function addAudienceSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const cards: CardDef[] = arr<Record<string, unknown>>(bv.target_audiences)
    .map(a => ({
      segment: str(a?.segment) || str(a?.persona) || str(a?.name),
      tone: str(a?.tone_adjustment) || str(a?.tone_emphasis) || str(a?.tone),
      focus: str(a?.content_focus) || str(a?.focus),
      who: str(a?.description) || str(a?.who),
    }))
    .filter(a => a.segment || a.tone || a.focus)
    .map((a, i) => ({
      title: a.segment || `Audience ${i + 1}`,
      lines: [a.who, a.tone, a.focus].filter(Boolean).length
        ? [a.who, a.tone, a.focus].filter(Boolean)
        : ['—'],
      index: i + 1,
      noBullet: true,
    }));

  addCardSection(
    pptx, theme, cards, 'Section 07', 'Speaking to each audience',
    'Same voice, tuned for who is listening.', 'Audiences',
  );
}

/* ---------- writing samples ---------- */

interface Sample { type?: string; sample?: string }

function addSampleSlides(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const samples = arr<Sample>(bv.writing_samples)
    .map(s => ({ type: str(s?.type), text: str(s?.sample) }))
    .filter(s => s.text);
  if (!samples.length) return;

  const avail = BODY_BOTTOM - BODY_TOP - 0.1;

  const measure = (s: { type: string; text: string }) =>
    Math.min(avail, 1.1 + rowsFor(s.text, CONTENT_W - 1.1, 12.5) * 0.26);

  const queue = [...samples];
  let page = 0;
  while (queue.length) {
    page += 1;
    const slide = newSlide(pptx, theme);
    addHeader(slide, theme, 'Section 08', 'Writing in practice', 'Reference samples that show the voice working.');

    let y = BODY_TOP + 0.1;
    let placed = 0;
    while (queue.length) {
      const s = queue[0];
      const h = measure(s);
      if (placed > 0 && y + h > BODY_BOTTOM) break;
      queue.shift();
      placed += 1;
      const drawH = Math.min(h, BODY_BOTTOM - y);

      slide.addShape('rect', {
        x: MARGIN, y, w: CONTENT_W, h: drawH,
        fill: { color: WHITE }, line: { color: HAIR, width: 0.5 },
      });
      slide.addShape('rect', {
        x: MARGIN, y, w: 0.035, h: drawH,
        fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
      });
      slide.addText((s.type ? titleCase(s.type) : 'Sample').toUpperCase(), {
        x: MARGIN + 0.36, y: y + 0.2, w: CONTENT_W - 0.7, h: 0.26,
        fontFace: SANS, fontSize: 9, bold: true, color: theme.accent,
        charSpacing: 1.4, valign: 'middle', margin: 0,
      });
      slide.addText(s.text, {
        x: MARGIN + 0.36, y: y + 0.58, w: CONTENT_W - 0.74, h: drawH - 0.8,
        fontFace: SANS, fontSize: 12.5, color: INK, lineSpacingMultiple: 1.18,
        valign: 'top', margin: 0,
      });
      y += drawH + GAP;
      if (y > BODY_BOTTOM - 0.9) break;
    }

    addFooter(slide, theme, page > 1 ? `Samples ${pad2(page)}` : 'Samples');
  }
}

/* ---------- brand identity ---------- */

function addIdentitySlide(pptx: PptxGenJS, theme: Theme, bv: BrandVoiceLike) {
  const identity = (bv.brand_identity && typeof bv.brand_identity === 'object')
    ? (bv.brand_identity as Record<string, unknown>)
    : {};
  const nameRules = str(identity.brand_name_rules);
  const font = str(identity.font);
  const locale = str(identity.locale);
  const hasSwatch = str(identity.primary_colour) || str(identity.accent_colour);
  if (!nameRules && !font && !locale && !hasSwatch) return;

  const slide = newSlide(pptx, theme);
  addHeader(slide, theme, 'Section 09', 'Identity essentials', 'Naming, colour and type at a glance.');

  let y = BODY_TOP + 0.1;

  if (hasSwatch) {
    const items = [
      { label: 'Primary', color: theme.primary },
      { label: 'Accent', color: theme.accent },
    ];
    items.forEach((s, i) => {
      const x = MARGIN + i * 3.1;
      slide.addShape('rect', {
        x, y, w: 2.7, h: 1.1,
        fill: { color: s.color }, line: { color: HAIR, width: 0.5 },
      });
      slide.addText(`${s.label.toUpperCase()}   #${s.color}`, {
        x, y: y + 1.18, w: 2.7, h: 0.28,
        fontFace: SANS, fontSize: 9, bold: true, color: MUTED, charSpacing: 1.2, margin: 0,
      });
    });
    y += 1.72;
  }

  const facts = [
    font ? { label: 'Typeface', text: font } : null,
    locale ? { label: 'Language & locale', text: locale } : null,
    nameRules ? { label: 'Using the brand name', text: nameRules } : null,
  ].filter(Boolean) as { label: string; text: string }[];

  facts.forEach(f => {
    if (y > BODY_BOTTOM - 0.5) return;
    const h = Math.min(BODY_BOTTOM - y, Math.max(0.5, rowsFor(f.text, CONTENT_W - 2.6, 12) * 0.28 + 0.2));
    slide.addText(f.label.toUpperCase(), {
      x: MARGIN, y, w: 2.3, h: 0.3,
      fontFace: SANS, fontSize: 9, bold: true, color: theme.accent,
      charSpacing: 1.3, valign: 'top', margin: 0,
    });
    slide.addText(f.text, {
      x: MARGIN + 2.4, y: y - 0.03, w: CONTENT_W - 2.4, h,
      fontFace: SANS, fontSize: 12, color: INK, lineSpacingMultiple: 1.16,
      valign: 'top', margin: 0,
    });
    y += h + 0.28;
  });

  addFooter(slide, theme, 'Identity');
}

/* ---------- closing ---------- */

function addClosingSlide(pptx: PptxGenJS, theme: Theme, counts: Record<string, number>) {
  const slide = pptx.addSlide();
  slide.background = { color: NAVY_DEEP };
  slide.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.075,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 },
  });

  slide.addText('USING THIS GUIDE', {
    x: MARGIN, y: 0.95, w: 6, h: 0.26,
    fontFace: SANS, fontSize: 9, bold: true, color: '8DA2C0', charSpacing: 2.4, margin: 0,
  });

  slide.addText('Write it, then check it against this.', {
    x: MARGIN, y: 1.9, w: CONTENT_W - 1, h: 1.0,
    fontFace: SANS, fontSize: 34, bold: true, color: WHITE, valign: 'middle', margin: 0,
  });

  const steps = [
    'Draft first — get the substance right before polishing the voice.',
    'Read the draft against the writing principles, one at a time.',
    'Swap in the preferred vocabulary and cut anything on the avoid list.',
    'Adjust tone for the audience and channel, not the message itself.',
  ];
  steps.forEach((s, i) => {
    const y = 3.2 + i * 0.62;
    slide.addText(pad2(i + 1), {
      x: MARGIN, y, w: 0.5, h: 0.34,
      fontFace: SANS, fontSize: 11, bold: true, color: theme.accent,
      charSpacing: 0.6, valign: 'middle', margin: 0,
    });
    slide.addText(s, {
      x: MARGIN + 0.56, y, w: CONTENT_W - 1.2, h: 0.34,
      fontFace: SANS, fontSize: 13, color: 'D6E1F0', valign: 'middle', margin: 0,
    });
  });

  const tally = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join('   ·   ');
  if (tally) {
    slide.addText(tally.toUpperCase(), {
      x: MARGIN, y: 6.4, w: CONTENT_W, h: 0.3,
      fontFace: SANS, fontSize: 8.5, bold: true, color: '5C7597', charSpacing: 1.6, margin: 0,
    });
  }
}

/* ---------- deck plumbing ---------- */

export function buildBrandGuideDeck(
  bv: BrandVoiceLike,
  projectName?: string,
): PptxGenJS {
  const identity = (bv.brand_identity && typeof bv.brand_identity === 'object')
    ? (bv.brand_identity as Record<string, unknown>)
    : {};

  const theme: Theme = {
    accent: hex(identity.accent_colour, hex(identity.primary_colour, PURPLE)),
    primary: hex(identity.primary_colour, hex(identity.accent_colour, '0F284C')),
    brandName: str(identity.brand_name) || projectName || 'Brand Voice',
    projectName,
  };

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Signal + Scale';
  pptx.company = 'Signal + Scale';
  pptx.title = `${theme.brandName} — Brand Voice Guide`;

  addCover(pptx, theme, bv);
  addPersonalitySlide(pptx, theme, bv);
  addPrincipleSlides(pptx, theme, bv);
  addVocabularySlides(pptx, theme, bv);
  addBannedSlides(pptx, theme, bv);
  addFormattingSlides(pptx, theme, bv);
  addChannelSlides(pptx, theme, bv);
  addAudienceSlides(pptx, theme, bv);
  addSampleSlides(pptx, theme, bv);
  addIdentitySlide(pptx, theme, bv);
  addClosingSlide(pptx, theme, {
    'writing principles': normalisePrinciples(bv.writing_principles).length,
    'vocabulary swaps': normaliseVocab(bv.preferred_vocabulary).length,
    'phrases to avoid': normaliseBanned(bv.banned_phrases).length,
    'writing samples': arr(bv.writing_samples).length,
  });

  return pptx;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'brand';
}

export async function downloadBrandGuidePptx(
  bv: BrandVoiceLike,
  projectName?: string,
  slug?: string,
) {
  const pptx = buildBrandGuideDeck(bv, projectName);
  const base = slug || slugify(projectName || 'brand');
  await pptx.writeFile({ fileName: `${base}-brand-guide.pptx` });
}

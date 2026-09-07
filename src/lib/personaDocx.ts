import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  Footer,
  PageBreak,
  BorderStyle,
  TableOfContents,
} from 'docx';
import type { Persona, ICP } from '@/types/database';

const NAVY = '0F284C';
const ORANGE = 'E33E23';
const PURPLE = '8833FF';
const MUTED = '64748B';

const FONT = 'Poppins';

const SECTION_ORDER: { key: string; label: string; subtitle: string }[] = [
  { key: 'goals', label: 'Goals', subtitle: 'What they are trying to achieve' },
  { key: 'pain_points', label: 'Pain Points', subtitle: 'Frustrations and blockers' },
  { key: 'organisational_context', label: 'Organisational Context', subtitle: 'Structure, culture and decision-making' },
  { key: 'buying_behaviour', label: 'Buying Behaviour', subtitle: 'How they evaluate and purchase' },
  { key: 'channel_preferences', label: 'Channel Preferences', subtitle: 'Where they consume content' },
  { key: 'preferred_evidence', label: 'Preferred Evidence', subtitle: 'What convinces them to act' },
  { key: 'how_we_help', label: 'How We Help', subtitle: 'Our value to this persona' },
];

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const emptyPara = () =>
  new Paragraph({
    children: [new TextRun({ text: 'Not captured yet', italics: true, color: MUTED, size: 20 })],
    spacing: { after: 120 },
  });

function isEmpty(data: any): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data === 'string') return data.trim().length === 0;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') return Object.keys(data).length === 0;
  return false;
}

/** Convert an arbitrary jsonb value into docx paragraphs. Mirrors renderContent() in PersonaDetailModal. */
function renderValue(data: any, depth = 0): Paragraph[] {
  if (isEmpty(data)) return [emptyPara()];

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return [
      new Paragraph({
        children: [new TextRun({ text: String(data), size: 22 })],
        spacing: { after: 100 },
        indent: depth > 0 ? { left: 360 * depth } : undefined,
      }),
    ];
  }

  if (Array.isArray(data)) {
    return data.flatMap(item => {
      if (item && typeof item === 'object') return renderValue(item, depth + 1);
      return [
        new Paragraph({
          numbering: { reference: 'persona-bullets', level: Math.min(depth, 2) },
          children: [new TextRun({ text: String(item), size: 22 })],
          spacing: { after: 60 },
        }),
      ];
    });
  }

  // plain object
  return Object.entries(data).flatMap(([key, value]) => [
    new Paragraph({
      children: [new TextRun({ text: titleCase(key), bold: true, size: 21, color: NAVY })],
      spacing: { before: 100, after: 40 },
      indent: depth > 0 ? { left: 360 * depth } : undefined,
    }),
    ...renderValue(value, depth + 1),
  ]);
}

function sectionData(persona: Persona, key: string): any {
  const channelPrefs = (persona.channel_preferences || {}) as Record<string, any>;
  if (key === 'channel_preferences') {
    const { preferred_evidence, ...channels } = channelPrefs;
    return channels;
  }
  if (key === 'preferred_evidence') return channelPrefs.preferred_evidence;
  return (persona as any)[key];
}

function readinessLine(persona: Persona): Paragraph {
  const score = persona.ai_readiness_score || 0;
  return new Paragraph({
    children: [
      new TextRun({ text: 'AI Readiness  ', bold: true, size: 21, color: MUTED }),
      new TextRun({ text: `${score} / 5`, bold: true, size: 22, color: PURPLE }),
      new TextRun({ text: `   ${'●'.repeat(score)}${'○'.repeat(Math.max(0, 5 - score))}`, size: 22, color: PURPLE }),
    ],
    spacing: { after: 200 },
  });
}

/** Paragraphs for a single persona (without page break). */
function personaBlocks(persona: Persona, icp?: ICP): Paragraph[] {
  const meta: string[] = [titleCase(persona.role_in_buying)];
  if (icp) meta.push(icp.segment_name);

  const blocks: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: persona.persona_name, bold: true })],
    }),
    new Paragraph({
      children: [new TextRun({ text: meta.join('  ·  '), size: 22, color: PURPLE, bold: true })],
      spacing: { after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 6 },
      },
    }),
    readinessLine(persona),
  ];

  for (const section of SECTION_ORDER) {
    blocks.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.label, bold: true })],
      }),
      new Paragraph({
        children: [new TextRun({ text: section.subtitle, italics: true, size: 19, color: MUTED })],
        spacing: { after: 100 },
      }),
      ...renderValue(sectionData(persona, section.key)),
    );
  }

  return blocks;
}

const baseDocOptions = {
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: '1A1A2E' } } },
    paragraphStyles: [
      {
        id: 'Title',
        name: 'Title',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 48, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { after: 200 } },
      },
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 34, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: ORANGE },
        paragraph: { spacing: { before: 240, after: 40 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'persona-bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480, hanging: 260 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: '–',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 260 } } },
          },
          {
            level: 2,
            format: LevelFormat.BULLET,
            text: '·',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1320, hanging: 260 } } },
          },
        ],
      },
    ],
  },
};

const pageProps = {
  page: {
    size: { width: 12240, height: 15840 },
    margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
  },
};

const footer = () =>
  new Footer({
    children: [
      new Paragraph({
        children: [new TextRun({ text: 'Signal + Scale', size: 18, color: MUTED, bold: true })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

function slugify(s: string) {
  return s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ');
}

async function downloadDoc(doc: Document, filename: string) {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPersonaDocx(persona: Persona, icp?: ICP) {
  const doc = new Document({
    ...baseDocOptions,
    sections: [
      {
        properties: pageProps,
        footers: { default: footer() },
        children: personaBlocks(persona, icp),
      },
    ],
  });
  await downloadDoc(doc, `${slugify(persona.persona_name)} - Persona.docx`);
}

export async function downloadAllPersonasDocx(personas: Persona[], icps: ICP[], projectName?: string) {
  const grouped = icps
    .map(icp => ({ icp, items: personas.filter(p => p.icp_id === icp.id) }))
    .filter(g => g.items.length > 0);
  const orphans = personas.filter(p => !icps.some(i => i.id === p.icp_id));
  if (orphans.length) grouped.push({ icp: undefined as any, items: orphans });

  const children: Paragraph[] = [
    new Paragraph({
      style: 'Title',
      children: [new TextRun({ text: 'Buyer Personas', bold: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${projectName ? projectName + '  ·  ' : ''}${personas.length} persona${personas.length === 1 ? '' : 's'}`,
          size: 22,
          color: PURPLE,
          bold: true,
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  children.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }) as unknown as Paragraph);
  children.push(new Paragraph({ children: [new PageBreak()] }));

  grouped.forEach((group, gi) => {
    if (gi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: group.icp ? group.icp.segment_name.toUpperCase() : 'UNASSIGNED',
            bold: true,
            size: 20,
            color: MUTED,
          }),
        ],
        spacing: { after: 80 },
      }),
    );
    group.items.forEach((p, pi) => {
      if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...personaBlocks(p, group.icp));
    });
  });

  const doc = new Document({
    ...baseDocOptions,
    features: { updateFields: true },
    sections: [
      {
        properties: pageProps,
        footers: { default: footer() },
        children,
      },
    ],
  });

  await downloadDoc(doc, `${projectName ? slugify(projectName) + ' - ' : ''}Buyer Personas.docx`);
}

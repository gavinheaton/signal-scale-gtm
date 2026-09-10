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
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  TableOfContents,
} from 'docx';
import type { Competitor, NarrativeSection } from '@/types/competitors';
import { ARCHETYPE_LABELS, TYPE_LABELS } from '@/types/competitors';

const NAVY = '0F284C';
const ORANGE = 'E33E23';
const MUTED = '64748B';
const FONT = 'Poppins';

const CONTENT_WIDTH = 9360;
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const cellBorders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function headerCell(text: string, width: number) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: { fill: 'EEF2F7', type: ShadingType.CLEAR },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: NAVY, font: FONT })] })],
  });
}

function bodyCell(text: string, width: number) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text: text || '—', size: 18, font: FONT })] })],
  });
}

function competitorTable(competitors: Competitor[]) {
  const widths = [2600, 2000, 4760];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: [headerCell('Organisation', widths[0]), headerCell('Group', widths[1]), headerCell('Position', widths[2])],
      }),
      ...competitors.map((c) =>
        new TableRow({
          children: [
            bodyCell(c.name, widths[0]),
            bodyCell(
              [c.archetype ? ARCHETYPE_LABELS[c.archetype] : '', c.type ? TYPE_LABELS[c.type] : '']
                .filter(Boolean)
                .join(' · '),
              widths[1],
            ),
            bodyCell((c.positioning || c.why_suggested || '').slice(0, 400), widths[2]),
          ],
        }),
      ),
    ],
  });
}

export async function downloadCompetitiveNarrativeDocx(opts: {
  projectName: string;
  sections: NarrativeSection[];
  competitors: Competitor[];
  personaName?: string | null;
  generatedAt?: string | null;
}) {
  const { projectName, sections, competitors, personaName, generatedAt } = opts;
  const dated = generatedAt ? new Date(generatedAt) : new Date();

  const body: Paragraph[] = [];

  // Title page
  body.push(
    new Paragraph({ spacing: { before: 2400, after: 0 }, children: [
      new TextRun({ text: 'Competitive Landscape', bold: true, size: 56, color: NAVY, font: FONT }),
    ] }),
    new Paragraph({ spacing: { after: 200 }, children: [
      new TextRun({ text: projectName, bold: true, size: 32, color: ORANGE, font: FONT }),
    ] }),
    new Paragraph({ spacing: { after: 80 }, children: [
      new TextRun({
        text: personaName ? `Seen through ${personaName}` : 'Across all personas',
        size: 22, color: MUTED, font: FONT,
      }),
    ] }),
    new Paragraph({ children: [
      new TextRun({
        text: dated.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
        size: 20, color: MUTED, font: FONT,
      }),
    ] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Contents' })] }),
  );

  const toc = new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' });

  const afterToc: Paragraph[] = [new Paragraph({ children: [new PageBreak()] })];

  sections.forEach((s, i) => {
    afterToc.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: i > 0,
        children: [new TextRun({ text: s.heading })],
      }),
    );
    s.paragraphs.forEach((p) =>
      afterToc.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [new TextRun({ text: p, size: 22, font: FONT })],
        }),
      ),
    );
    s.bullets.forEach((b) =>
      afterToc.push(
        new Paragraph({
          numbering: { reference: 'narrative-bullets', level: 0 },
          spacing: { after: 100 },
          children: [new TextRun({ text: b, size: 22, font: FONT })],
        }),
      ),
    );
  });

  const appendix: (Paragraph | Table)[] = [];
  if (competitors.length > 0) {
    appendix.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'The organisations in view' })] }),
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: 'Every confirmed organisation behind this narrative.', size: 20, color: MUTED, font: FONT }),
      ] }),
      competitorTable(competitors),
    );
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: FONT, color: NAVY },
          paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: FONT, color: ORANGE },
          paragraph: { spacing: { before: 200, after: 140 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'narrative-bullets',
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `${projectName} · Competitive Landscape`, size: 16, color: MUTED, font: FONT })],
            })],
          }),
        },
        children: [...body, toc, ...afterToc, ...appendix],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  a.href = url;
  a.download = `${slug}-competitive-landscape.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

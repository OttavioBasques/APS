// Gera o documento da APS em Word a partir de conteudo.js.
// Uso: node gerar.js [arquivo-saida.docx] [paginas.json]
// paginas.json (opcional) traz o número de página de cada título para o índice.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType,
  WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak, Header, LevelFormat, PageNumber,
  PageOrientation, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
  TableLayoutType, VerticalAlign,
} = require('docx');
const { capa, secoes } = require('./conteudo.js');

const OUT = process.argv[2] || 'APS_Respira_Urbana.docx';
const PAGES = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3])) : {};

const FONT = 'Arial';
const MONO = 'Courier New';
const CM = 567;               // 1 cm em DXA
const TEXT_W = 11906 - 2 * Math.round(2.5 * CM); // largura útil A4 com margens de 2,5 cm
const LINE15 = 360;           // espaçamento 1,5

// ---------- texto com **negrito**, *itálico* e `código` ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, ...base, size: (base.size || 24) - 2 }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const body = (text) => new Paragraph({
  children: runs(text), alignment: AlignmentType.JUSTIFIED,
  indent: { firstLine: Math.round(1.25 * CM) }, spacing: { line: LINE15, after: 120 },
});

const caption = (text) => new Paragraph({
  children: [new TextRun({ text, size: 20, bold: true })], alignment: AlignmentType.CENTER,
  spacing: { before: 200, after: 80, line: 240 }, keepNext: true,
});
const source = (text = 'Fonte: elaborado pelos autores.') => new Paragraph({
  children: [new TextRun({ text, size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: 240 },
});

const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: border, bottom: border, left: border, right: border };

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (text, head, w, isLast, keep) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: 'D9E2EC', color: 'auto' } : (isLast ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined),
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ keepNext: !!keep, children: runs(text, { size: 20, bold: head || undefined }), spacing: { line: 240 } })],
  });
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, true, widths[i], false, true)) }),
      ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, false, widths[i], r[0] === 'Total', k === rows.length - 1)) })),
    ],
  });
}

function codeBlock(code) {
  const lines = code.split('\n');
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [new TableCell({
      width: { size: TEXT_W, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill: 'F5F5F5', color: 'auto' },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      children: lines.map((l) => new Paragraph({ children: [new TextRun({ text: l === '' ? ' ' : l, font: MONO, size: 16 })], spacing: { line: 240 } })),
    })] })],
  });
}

function figure(file, cap, widthCm) {
  const buf = fs.readFileSync(path.join(__dirname, file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // PNG
  const pxW = Math.round(widthCm / 2.54 * 96);
  return [
    caption(cap),
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true,
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: pxW, height: Math.round(pxW * h / w) } })] }),
    source(),
  ];
}

function printBox(cap) {
  return [
    caption(cap),
    new Table({
      width: { size: 5200, type: WidthType.DXA }, columnWidths: [5200], alignment: AlignmentType.CENTER, layout: TableLayoutType.FIXED,
      rows: [new TableRow({ height: { value: 2400, rule: 'atLeast' }, children: [new TableCell({
        width: { size: 5200, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
        borders: { top: { style: BorderStyle.DASHED, size: 6, color: 'A0A0A0' }, bottom: { style: BorderStyle.DASHED, size: 6, color: 'A0A0A0' }, left: { style: BorderStyle.DASHED, size: 6, color: 'A0A0A0' }, right: { style: BorderStyle.DASHED, size: 6, color: 'A0A0A0' } },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '[INSERIR PRINT DA TELA]', color: '808080', size: 20 })] })],
      })] })],
    }),
    source('Fonte: elaborado pelos autores (captura de tela do aplicativo).'),
  ];
}

// ---------- capa ----------
const center = (text, opts = {}, spacing = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE15, ...spacing }, children: [new TextRun({ text, ...opts })] });
const capaParas = [
  center(capa.instituicao, { bold: true }),
  center(capa.curso, { bold: true }),
  center(capa.disciplina, {}, { after: 1200 }),
  ...capa.alunos.map(([n, ra]) => center(`${n} – RA: ${ra}`)),
  center('', {}, { after: 1400 }),
  center(capa.titulo, { bold: true, size: 32 }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE15, after: 2800 }, children: [new TextRun({ text: capa.subtitulo })] }),
  center(capa.local),
  center(capa.ano),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- índice ----------
const headingsFor = secoes.filter(([t]) => t === 'h1' || t === 'h2').map(([t, s]) => [t, s]);
headingsFor.push(['h1', 'FICHA DE ATIVIDADES PRÁTICAS SUPERVISIONADAS']);
const tocParas = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE15, after: 240 }, children: [new TextRun({ text: 'ÍNDICE', bold: true })] }),
  ...headingsFor.map(([t, s]) => new Paragraph({
    spacing: { line: t === 'h1' ? 300 : 260, before: t === 'h1' ? 80 : 0 },
    indent: { left: t === 'h2' ? Math.round(0.6 * CM) : 0, right: 500 },
    tabStops: [{ type: 'right', position: TEXT_W, leader: 'dot' }],
    children: [
      new TextRun({ text: s, bold: t === 'h1', size: t === 'h1' ? 22 : 20 }),
      new TextRun({ text: '\t' + String(PAGES[s] ?? '00'), bold: t === 'h1', size: t === 'h1' ? 22 : 20 }),
    ],
  })),
];

// ---------- corpo ----------
const children = [...capaParas, ...tocParas];
let firstH1 = true;
for (const blk of secoes) {
  const [type, a, b, c, d] = blk;
  switch (type) {
    case 'h1':
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(a)] }));
      firstH1 = false; break;
    case 'h2': children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(a)] })); break;
    case 'p': children.push(body(a)); break;
    case 'ul': case 'ol':
      for (const it of a) children.push(new Paragraph({ children: runs(it), alignment: AlignmentType.JUSTIFIED,
        numbering: { reference: type === 'ul' ? 'bullets' : 'numbers', level: 0 }, spacing: { line: LINE15, after: 60 } }));
      break;
    case 'code':
      if (b) children.push(caption(b));
      children.push(codeBlock(a));
      children.push(source(b ? 'Fonte: código-fonte do projeto Respira Urbana.' : ' '));
      break;
    case 'table':
      children.push(caption(d)); children.push(table(a, b, c)); children.push(source()); break;
    case 'fig': children.push(...figure(a, b, c)); break;
    case 'print': children.push(...printBox(a)); break;
    case 'ref': children.push(new Paragraph({ children: runs(a), alignment: AlignmentType.LEFT, spacing: { line: 240, after: 240 } })); break;
    case 'pb': children.push(new Paragraph({ children: [new PageBreak()] })); break;
  }
}

// ---------- ficha APS (paisagem, uma por aluno) ----------
const LAND_W = 16838 - 2 * Math.round(2 * CM);
function ficha([nome, ra], idx) {
  const line = (label, value) => new TextRun({ text: `${label}: `, bold: true, size: 18 });
  const f = (pairs) => new Paragraph({ spacing: { line: 300, after: 60 }, children: pairs.flatMap(([l, v]) => [
    new TextRun({ text: `${l}: `, bold: true, size: 18 }), new TextRun({ text: `${v}     `, size: 18 })]) });
  const cols = [1500, 5800, 1300, 2600, 1300, LAND_W - 1500 - 5800 - 1300 - 2600 - 1300];
  const heads = ['DATA DA ATIVIDADE', 'DESCRIÇÃO DA ATIVIDADE', 'TOTAL DE HORAS', 'ASSINATURA DO ALUNO', 'HORAS ATRIBUÍDAS (1)', 'ASSINATURA DO PROFESSOR'];
  const c = (t, w, head) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: head ? { type: ShadingType.CLEAR, fill: 'D9E2EC', color: 'auto' } : undefined, margins: { left: 60, right: 60 },
    children: [new Paragraph({ alignment: head ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: t, size: 16, bold: head || undefined })] })] });
  const rows = [new TableRow({ tableHeader: true, children: heads.map((h, i) => c(h, cols[i], true)) })];
  for (let i = 0; i < 12; i++) rows.push(new TableRow({ height: { value: 400, rule: 'atLeast' }, children: cols.map((w) => c('', w)) }));
  return [
    new Paragraph({ heading: idx === 0 ? HeadingLevel.HEADING_1 : undefined, pageBreakBefore: idx > 0, alignment: AlignmentType.CENTER, spacing: { after: 160 },
      children: [new TextRun({ text: 'FICHA DAS ATIVIDADES PRÁTICAS SUPERVISIONADAS – APS', bold: true, size: 22 })] }),
    f([['NOME', nome], ['TURMA', '__________'], ['RA', ra]]),
    f([['CURSO', 'Ciência da Computação'], ['CAMPUS', '__________________'], ['SEMESTRE', '_____'], ['TURNO', '__________']]),
    f([['CÓDIGO DA ATIVIDADE', '__________'], ['SEMESTRE', '_____'], ['ANO GRADE', '_____']]),
    new Table({ width: { size: LAND_W, type: WidthType.DXA }, columnWidths: cols, layout: TableLayoutType.FIXED, rows }),
    new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: '(1) Horas atribuídas de acordo com o regulamento das Atividades Práticas Supervisionadas do curso.', size: 16 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120, line: 300 }, children: [new TextRun({ text: 'TOTAL DE HORAS ATRIBUÍDAS: ________   AVALIAÇÃO: ______________ (Aprovado ou Reprovado)   NOTA: ______   DATA: ____/____/______', size: 16 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [new TextRun({ text: '______________________________________________________', size: 16 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'CARIMBO E ASSINATURA DO COORDENADOR DO CURSO', size: 16 })] }),
  ];
}

const pageHeader = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })] });
const emptyHeader = new Header({ children: [new Paragraph({ children: [] })] });

const doc = new Document({
  creator: 'Grupo APS – Respira Urbana',
  title: 'Respira Urbana – APS Desenvolvimento de Sistemas Distribuídos',
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 0, after: 360, line: LINE15 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 360, after: 120, line: LINE15 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  sections: [
    { properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: Math.round(2.5 * CM), bottom: Math.round(2.5 * CM), left: Math.round(2.5 * CM), right: Math.round(2.5 * CM) } } },
      headers: { default: pageHeader, first: emptyHeader }, children },
    { properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: Math.round(2 * CM), bottom: Math.round(2 * CM), left: Math.round(2 * CM), right: Math.round(2 * CM) } } },
      headers: { default: emptyHeader }, children: capa.alunos.flatMap(ficha) },
  ],
});

Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log('gerado:', OUT); });

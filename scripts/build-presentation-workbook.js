#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const DEFAULT_INPUT = "outputs/3289-trades-presentation/trades.presentation-source-20260429-065448.csv";
const DEFAULT_OUTPUT = "outputs/3289-trades-presentation/trades.presentation-20260429-065448.xlsx";

const LEGACY_HEADERS = [
  "Date",
  "Time (UTC)",
  "Exchange",
  "Symbol",
  "Side",
  "Quantity",
  "Price",
  "Total USD",
  "Fee (est.)",
  "Net Amount",
  "Order ID",
  "Mode",
  "Notes",
];

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") options.input = argv[++i];
    else if (arg === "--output") options.output = argv[++i];
    else if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) throw new Error("CSV is empty");
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCsvLine(line));
  return { headers, rows };
}

function cellValue(headers, row, name) {
  const index = headers.indexOf(name);
  return index === -1 ? "" : String(row[index] ?? "");
}

function titleCase(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
}

function lastNonEmpty(row) {
  for (let i = row.length - 1; i >= 0; i--) {
    const value = String(row[i] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function numberValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function normalizeRows(headers, rawRows) {
  return rawRows.map((row, index) => {
    const mode = cellValue(headers, row, "Mode").trim().toUpperCase();
    const netAmount = cellValue(headers, row, "Net Amount").trim().toUpperCase();
    const orderId = cellValue(headers, row, "Order ID");
    const sourceRow = index + 2;

    if (mode === "NOTE") {
      return {
        rowType: "Source note",
        sourceRow,
        date: "",
        time: "",
        venue: "",
        instrument: "",
        direction: "",
        quantity: "",
        entryPrice: "",
        grossUsd: "",
        feeUsd: "",
        decisionStatus: "Note",
        orderId: "",
        notes: cellValue(headers, row, "Notes") || lastNonEmpty(row),
      };
    }

    const blocked = netAmount === "BLOCKED";
    return {
      rowType: "Trade decision",
      sourceRow,
      date: cellValue(headers, row, "Date"),
      time: cellValue(headers, row, "Time (UTC)"),
      venue: cellValue(headers, row, "Exchange"),
      instrument: cellValue(headers, row, "Symbol"),
      direction: titleCase(cellValue(headers, row, "Side")),
      quantity: cellValue(headers, row, "Quantity"),
      entryPrice: cellValue(headers, row, "Price"),
      grossUsd: cellValue(headers, row, "Total USD"),
      feeUsd: cellValue(headers, row, "Fee (est.)"),
      decisionStatus: blocked ? "Blocked" : titleCase(cellValue(headers, row, "Mode")),
      orderId: blocked ? "" : orderId,
      notes: blocked ? orderId : cellValue(headers, row, "Notes"),
    };
  });
}

function buildSummaryRows(cleanedRows, sourceLabel) {
  const sourceRows = cleanedRows.length;
  const tradeRows = cleanedRows.filter(row => row.rowType === "Trade decision");
  const sourceNotes = cleanedRows.filter(row => row.rowType === "Source note").length;
  const blocked = tradeRows.filter(row => row.decisionStatus === "Blocked").length;
  const rawTotalUsd = tradeRows.reduce((sum, row) => sum + numberValue(row.grossUsd), 0);

  return [
    ["Legacy Trade Log Presentation Copy"],
    [`Source: ${sourceLabel} | Raw data preserved in the Raw Data sheet`],
    ["Source rows", "", "Trade decisions", "", "Blocked", "", "Raw Total USD", ""],
    [sourceRows, "", tradeRows.length, "", blocked, "", formatNumber(rawTotalUsd), ""],
    ["Rows after the CSV header", "", "Cleaned trade rows", "", "Rows marked as blocked", "", "Source Total USD field", ""],
    ["Summary Metrics", "", "", "", "Assumption Snapshot"],
    ["Metric", "Value", "", "", "Original CSV was not edited."],
    ["Source data rows", sourceRows, "", "", "CSV tabs are impossible, so this copy is an .xlsx workbook."],
    ["Trade decision rows", tradeRows.length, "", "", "The NOTE row is retained in raw data and classified as Source note."],
    ["Non-trade source note rows", sourceNotes, "", "", "The BLOCKED value in the legacy Net Amount column is treated as the decision status on the clean sheet."],
    ["Blocked decisions", blocked, "", "", "Blank fee, net, and order fields were left blank; no financial values were invented."],
    ["Executed or settled rows", tradeRows.length - blocked, "", "", "CRASH_500 appears only because it is in the source row; this workbook does not change execution scope."],
    ["Raw Total USD in trade rows", formatNumber(rawTotalUsd)],
    ["Chart Category", "Rows"],
    ["Trade decisions", tradeRows.length],
    ["Source notes", sourceNotes],
    ["Blocked decisions", blocked],
  ];
}

function buildCleanedRows(cleanedRows) {
  return [
    ["Cleaned Trade View"],
    ["Labels normalized for presentation. Source row references map back to Raw Data."],
    [
      "Row Type",
      "Source Row",
      "Trade Date",
      "Time (UTC)",
      "Venue",
      "Instrument",
      "Direction",
      "Quantity",
      "Entry Price",
      "Gross Amount (USD)",
      "Estimated Fee (USD)",
      "Decision Status",
      "Order / Contract ID",
      "Decision Notes",
    ],
    ...cleanedRows.map(row => [
      row.rowType,
      row.sourceRow,
      row.date,
      row.time,
      row.venue,
      row.instrument,
      row.direction,
      row.quantity,
      row.entryPrice,
      row.grossUsd,
      row.feeUsd,
      row.decisionStatus,
      row.orderId,
      row.notes,
    ]),
  ];
}

function buildRawRows(headers, rawRows) {
  return [
    ["Raw Data"],
    ["Imported from the source CSV without removing rows or changing original labels."],
    headers,
    ...rawRows.map(row => headers.map((_, index) => row[index] ?? "")),
  ];
}

function buildAssumptionRows(sourceLabel) {
  return [
    ["Assumptions and Change Log"],
    ["Audit notes for how the presentation copy is generated."],
    ["Area", "What changed", "Why", "Evidence / assumption"],
    ["File format", "Generated an .xlsx workbook copy.", "CSV files cannot contain worksheet tabs.", `Source CSV: ${sourceLabel}.`],
    ["Raw data", "Adds a Raw Data tab with the original CSV headers and rows.", "Preserve source values for auditability.", "No raw rows are deleted; blank source cells remain blank."],
    ["Labels", "Adds a Cleaned tab with presentation labels such as Venue, Instrument, Direction, Gross Amount (USD), Decision Status, and Decision Notes.", "Make the legacy operational fields easier to read.", "Source Row maps each cleaned row back to Raw Data."],
    ["Malformed note row", "Classifies the NOTE row as Source note.", "The row does not contain trade fields.", "The original text remains visible in Raw Data and Cleaned."],
    ["Legacy blocked row", "Interprets BLOCKED as Decision Status and the following text as Decision Notes.", "The row has fewer populated fields than the 13-column legacy header.", "The raw row is unchanged in Raw Data."],
    ["Summary", "Adds summary metrics and a row-classification table.", "Make the copy presentation-ready.", "Summary metrics are derived from cleaned-row counts."],
    ["Financial fields", "Leaves blank fee, net amount, and order ID values blank.", "The source did not provide numeric values for those cells.", "No estimated values are added."],
    ["Execution scope", "Does not run live/demo execution or change symbol eligibility.", "Request is presentation formatting only.", "CRASH_500 appears only because it exists in the source CSV."],
    ["Validation", "Checks that the generated workbook has Summary, Cleaned, Raw Data, and Assumptions sheets.", "Keep the workbook reproducible from CSV input.", "Run npm run presentation:workbook -- --check."],
  ];
}

function buildWorkbookSheets({ inputPath, headers, rows }) {
  const cleanedRows = normalizeRows(headers, rows);
  const sourceLabel = inputPath.replace(/\\/g, "/");
  return [
    {
      name: "Summary",
      rows: buildSummaryRows(cleanedRows, sourceLabel),
      merges: ["A1:H1", "A2:H2", "A6:D6", "E6:H6"],
      widths: [26, 14, 20, 8, 22, 8, 20, 10],
      freezeRow: 6,
    },
    {
      name: "Cleaned",
      rows: buildCleanedRows(cleanedRows),
      merges: ["A1:N1", "A2:N2"],
      widths: [18, 12, 14, 12, 14, 18, 14, 12, 14, 18, 18, 18, 22, 60],
      freezeRow: 3,
      autoFilter: "A3:N3",
    },
    {
      name: "Raw Data",
      rows: buildRawRows(headers, rows),
      merges: ["A1:M1", "A2:M2"],
      widths: [14, 14, 14, 18, 12, 12, 12, 12, 12, 14, 42, 12, 70],
      freezeRow: 3,
      autoFilter: "A3:M3",
    },
    {
      name: "Assumptions",
      rows: buildAssumptionRows(sourceLabel),
      merges: ["A1:D1", "A2:D2"],
      widths: [22, 46, 42, 58],
      freezeRow: 3,
      autoFilter: "A3:D3",
    },
  ];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function styleForCell(rowIndex, sheetName) {
  if (rowIndex === 1) return 1;
  if (rowIndex === 2) return 2;
  if (rowIndex === 3) return 3;
  if (sheetName === "Summary" && rowIndex === 6) return 4;
  return 0;
}

function sheetXml(sheet) {
  const maxColumns = Math.max(...sheet.rows.map(row => row.length), 1);
  const dimension = `A1:${columnName(maxColumns)}${sheet.rows.length}`;
  const cols = (sheet.widths || []).map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  ).join("");
  const pane = sheet.freezeRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const rows = sheet.rows.map((row, rowIndex) => {
    const r = rowIndex + 1;
    const cells = row.map((value, cellIndex) => {
      if (value == null || value === "") return "";
      const ref = `${columnName(cellIndex + 1)}${r}`;
      const style = styleForCell(r, sheet.name);
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    const height = r === 1 ? ` ht="24" customHeight="1"` : "";
    return `<row r="${r}"${height}>${cells}</row>`;
  }).join("");
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<dimension ref="${dimension}"/>`,
    pane,
    `<sheetFormatPr defaultRowHeight="18"/>`,
    cols ? `<cols>${cols}</cols>` : "",
    `<sheetData>${rows}</sheetData>`,
    merges,
    autoFilter,
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`,
    `</worksheet>`,
  ].join("");
}

function workbookXml(sheets) {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<sheets>`,
    sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join(""),
    `</sheets>`,
    `</workbook>`,
  ].join("");
}

function workbookRelsXml(sheets) {
  const sheetRels = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  const styleId = sheets.length + 1;
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    sheetRels,
    `<Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `</Relationships>`,
  ].join("");
}

function contentTypesXml(sheets) {
  const sheetOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    sheetOverrides,
    `</Types>`,
  ].join("");
}

function rootRelsXml() {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`,
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`,
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>`,
    `</Relationships>`,
  ].join("");
}

function stylesXml() {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`,
    `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF44546A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>`,
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>`,
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders>`,
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`,
    `<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs>`,
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`,
    `</styleSheet>`,
  ].join("");
}

function coreXml() {
  const timestamp = "2026-04-29T06:54:48Z";
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `<dc:creator>Codex presentation generator</dc:creator>`,
    `<cp:lastModifiedBy>Codex presentation generator</cp:lastModifiedBy>`,
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>`,
    `</cp:coreProperties>`,
  ].join("");
}

function appXml(sheets) {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`,
    `<Application>Codex</Application>`,
    `<DocSecurity>0</DocSecurity>`,
    `<ScaleCrop>false</ScaleCrop>`,
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`,
    `<TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(sheet => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>`,
    `</Properties>`,
  ].join("");
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosTimestamp() {
  const date = new Date("2026-04-29T06:54:48Z");
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

function localFileHeader(name, data, crc, mod) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(mod.time, 10);
  header.writeUInt16LE(mod.day, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer]);
}

function centralDirectoryHeader(name, data, crc, offset, mod) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(mod.time, 12);
  header.writeUInt16LE(mod.day, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  const mod = dosTimestamp();
  let offset = 0;

  for (const [name, text] of entries) {
    const data = Buffer.from(text, "utf8");
    const crc = crc32(data);
    const localHeader = localFileHeader(name, data, crc, mod);
    localParts.push(localHeader, data);
    centralParts.push(centralDirectoryHeader(name, data, crc, offset, mod));
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endOfCentralDirectory(entries.length, central.length, centralOffset),
  ]);
}

function xlsxEntries(sheets) {
  return [
    ["[Content_Types].xml", contentTypesXml(sheets)],
    ["_rels/.rels", rootRelsXml()],
    ["docProps/core.xml", coreXml()],
    ["docProps/app.xml", appXml(sheets)],
    ["xl/workbook.xml", workbookXml(sheets)],
    ["xl/_rels/workbook.xml.rels", workbookRelsXml(sheets)],
    ["xl/styles.xml", stylesXml()],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]),
  ];
}

function verifyWorkbook(filePath) {
  const buffer = readFileSync(filePath);
  const text = buffer.toString("utf8");
  for (const sheetName of ["Summary", "Cleaned", "Raw Data", "Assumptions"]) {
    if (!text.includes(`name="${sheetName}"`)) throw new Error(`Generated workbook is missing ${sheetName} sheet`);
  }
}

export function buildPresentationWorkbook({ input = DEFAULT_INPUT, output = DEFAULT_OUTPUT, check = false } = {}) {
  if (!existsSync(input)) throw new Error(`Input CSV not found: ${input}`);
  const parsed = parseCsv(readFileSync(input, "utf8"));
  const headers = parsed.headers.length ? parsed.headers : LEGACY_HEADERS;
  const sheets = buildWorkbookSheets({ inputPath: input, headers, rows: parsed.rows });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, buildZip(xlsxEntries(sheets)));
  if (check) verifyWorkbook(output);
  return { input, output, sheets: sheets.map(sheet => sheet.name), sourceRows: parsed.rows.length };
}

function printHelp() {
  console.log([
    "Usage: node scripts/build-presentation-workbook.js [--input <csv>] [--output <xlsx>] [--check]",
    "",
    `Default input:  ${DEFAULT_INPUT}`,
    `Default output: ${DEFAULT_OUTPUT}`,
  ].join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  const result = buildPresentationWorkbook(options);
  console.log(`Built ${result.output} from ${result.input} (${result.sourceRows} source rows; sheets: ${result.sheets.join(", ")})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

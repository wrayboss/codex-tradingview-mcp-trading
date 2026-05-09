import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

function readStoredZipEntries(filePath) {
  const buffer = readFileSync(filePath);
  const entries = new Map();
  let offset = 0;

  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (compression !== 0) throw new Error(`Unsupported zip compression for ${name}`);
    entries.set(name, buffer.subarray(dataStart, dataStart + compressedSize).toString("utf8"));
    offset = dataStart + compressedSize;
  }

  return entries;
}

function workbookSheetNames(entries) {
  const workbook = entries.get("xl/workbook.xml") || "";
  return [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map(match => match[1]);
}

export const presentationWorkbookTests = [
  {
    name: "builds workbook from legacy trade CSV",
    run(eq, truthy) {
      const dir = "state-test-presentation-workbook";
      const input = path.join(dir, "legacy-trades.csv");
      const output = path.join(dir, "trades.presentation.xlsx");

      try {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        writeFileSync(input, [
          "Date,Time (UTC),Exchange,Symbol,Side,Quantity,Price,Total USD,Fee (est.),Net Amount,Order ID,Mode,Notes",
          ",,,,,,,,,,,NOTE,Presentation note",
          "2026-04-27,04:19:48,Deriv,CRASH_500,SELL,10,10,5,,BLOCKED,Failed: RSI(3) above 70 (reversal in downtrend),,"
        ].join("\n") + "\n");

        const result = spawnSync(process.execPath, [
          "scripts/build-presentation-workbook.js",
          "--input", input,
          "--output", output,
          "--check",
        ], { encoding: "utf8" });

        eq("generator exits cleanly", result.status, 0);
        if (result.status !== 0) return;

        truthy("workbook file exists", existsSync(output));
        const entries = readStoredZipEntries(output);
        eq("sheet names", workbookSheetNames(entries).join("|"), "Summary|Cleaned|Raw Data|Assumptions");
        truthy("summary includes trade count label", entries.get("xl/worksheets/sheet1.xml").includes("Trade decisions"));
        truthy("cleaned sheet includes blocked decision", entries.get("xl/worksheets/sheet2.xml").includes("Blocked"));
        truthy("raw sheet preserves source symbol", entries.get("xl/worksheets/sheet3.xml").includes("CRASH_500"));
        truthy("assumptions sheet keeps execution boundary", entries.get("xl/worksheets/sheet4.xml").includes("presentation formatting only"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];

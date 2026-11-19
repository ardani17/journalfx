import { posix } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { fromBufferPromise, type Entry } from "yauzl";

const MAX_XML_BYTES = 32 * 1024 * 1024;
const REPEATED_TAGS = new Set(["sheet", "Relationship", "si", "r", "row", "c"]);

type TextNode = string | { "#text"?: string };

interface XmlText {
  t?: TextNode;
  r?: { t?: TextNode }[];
}

interface XmlWorksheet {
  worksheet?: {
    sheetData?: {
      row?: {
        "@_r": string;
        c?: { "@_r": string; "@_t"?: string; v?: string; is?: XmlText; f?: unknown }[];
      }[];
    };
  };
}

export interface WorkbookRow {
  number: number;
  cells: Map<string, string>;
}

function cellText(value: XmlText | undefined) {
  const text = (node?: TextNode) => typeof node === "string" ? node : node?.["#text"] ?? "";
  return value?.t !== undefined ? text(value.t) : value?.r?.map((run) => text(run.t)).join("") ?? "";
}

function decodeXml(bytes: Buffer) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  const xml = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error("Invalid workbook XML");
  return xml;
}

export async function* readWorkbookSheets(bytes: Buffer) {
  const zip = await fromBufferPromise(bytes, { validateEntrySizes: true });
  try {
    const entries = new Map<string, Entry>();
    for await (const entry of zip.eachEntry()) {
      if (entries.has(entry.fileName)) throw new Error("Duplicate workbook entry");
      entries.set(entry.fileName, entry);
    }

    let remaining = MAX_XML_BYTES;
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      isArray: (name) => REPEATED_TAGS.has(name),
    });

    async function readXml<T>(name: string): Promise<T> {
      const entry = entries.get(name);
      if (!entry || entry.uncompressedSize > remaining) throw new Error("Invalid workbook entry size");
      remaining -= entry.uncompressedSize;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      return parser.parse(decodeXml(Buffer.concat(chunks))) as T;
    }

    const { workbook } = await readXml<{
      workbook?: { workbookPr?: { "@_date1904"?: string }; sheets?: { sheet?: { "@_r:id": string }[] } };
    }>("xl/workbook.xml");
    const { Relationships } = await readXml<{
      Relationships?: { Relationship?: { "@_Id": string; "@_Type": string; "@_Target": string; "@_TargetMode"?: string }[] };
    }>("xl/_rels/workbook.xml.rels");
    if (!workbook?.sheets?.sheet?.length || !Relationships?.Relationship?.length) throw new Error("Missing workbook sheets");

    const relationships = Relationships.Relationship.filter((rel) => rel["@_TargetMode"] !== "External");
    const shared = relationships.find((rel) => rel["@_Type"].endsWith("/sharedStrings"));
    const targetPath = (target: string) => posix.resolve("/xl", target).slice(1);
    const strings = shared
      ? (await readXml<{ sst?: { si?: XmlText[] } }>(targetPath(shared["@_Target"]))).sst?.si?.map(cellText) ?? []
      : [];
    const date1904 = ["1", "true"].includes(workbook.workbookPr?.["@_date1904"] ?? "");

    for (const sheet of workbook.sheets.sheet) {
      const rel = relationships.find((item) => item["@_Id"] === sheet["@_r:id"] && item["@_Type"].endsWith("/worksheet"));
      if (!rel) continue;
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- Stream one sheet at a time under the shared XML budget.
      const { worksheet } = await readXml<XmlWorksheet>(targetPath(rel["@_Target"]));
      const rows = (worksheet?.sheetData?.row ?? []).map((row, index): WorkbookRow => {
        const cells = new Map<string, string>();
        for (const cell of row.c ?? []) {
          if (cell.f !== undefined || cell["@_t"] === "e") continue;
          const column = cell["@_r"]?.match(/^[A-Z]+/)?.[0];
          if (!column) continue;
          const value = cell["@_t"] === "s" && cell.v !== undefined ? strings[Number(cell.v)]
            : cell["@_t"] === "inlineStr" ? cellText(cell.is) : cell.v;
          if (value?.trim()) cells.set(column, value.trim());
        }
        return { number: Number(row["@_r"]) || index + 1, cells };
      });
      yield { rows, date1904 };
    }
  } finally {
    zip.close();
  }
}

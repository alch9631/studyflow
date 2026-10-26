import { classifyTextSource } from "./fileText";
import { textStudySections, type StudySection } from "./studyDraft";

type Material = { filename: string; mimeType: string | null; content: Uint8Array };
export async function materialStudySections(file: Material): Promise<StudySection[]> {
  return (await materialStudyBatch(file)).sections;
}

export async function materialStudyBatch(file: Material, cursor = 1): Promise<{ sections: StudySection[]; nextCursor: number | null }> {
  if (classifyTextSource(file.filename, file.mimeType) === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(file.content) });
    try {
      const result = await parser.getText({ first: cursor, last: cursor + 5 });
      const sections = result.pages.filter((page) => page.text.trim()).map((page) => ({ id: `p${page.num}`, reference: `PDF p. ${page.num}`, text: page.text.trim().slice(0, 5000) }));
      return { sections, nextCursor: cursor + 6 <= result.total ? cursor + 6 : null };
    } finally { await parser.destroy(); }
  }
  const type = classifyTextSource(file.filename, file.mimeType);
  const text = type === "docx" ? (await (await import("mammoth")).extractRawText({ buffer: Buffer.from(file.content) })).value
    : Buffer.from(file.content).toString("utf8");
  const sections = textStudySections(text, undefined, cursor);
  const nextLine = sections.at(-1)?.nextLine;
  if (type === "docx") sections.forEach((section) => { section.reference = `Text excerpt · ${section.id}`; });
  return { sections, nextCursor: nextLine && text.split(/\r?\n/).slice(nextLine - 1).some((line) => line.trim()) ? nextLine : null };
}

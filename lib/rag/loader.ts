import path from "node:path";

const TEXT_EXT = new Set([
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".text",
  ".csv",
  ".tsv",
  ".json",
  ".log",
  ".yml",
  ".yaml",
  ".html",
  ".htm",
  ".xml",
  ".ini",
  ".conf",
]);

export const SUPPORTED_EXT = [".pdf", ".docx", ".md", ".txt", ".csv", ".json", ".html"];

export function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export function isSupported(filename: string): boolean {
  const ext = getExtension(filename);
  return ext === ".pdf" || ext === ".docx" || TEXT_EXT.has(ext);
}

/**
 * 把二进制文件解析成纯文本。
 * 每个格式单独一个分支，新增格式（pptx / xlsx / epub）在这里扩展即可。
 */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = getExtension(filename);

  if (ext === ".pdf") {
    const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractPdfText(pdf, { mergePages: true });
    const raw = result.text as string | string[];
    return Array.isArray(raw) ? raw.join("\n\n") : raw;
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (ext === ".html" || ext === ".htm") {
    return stripHtml(buffer.toString("utf8"));
  }

  if (TEXT_EXT.has(ext) || ext === "") {
    return stripBom(buffer.toString("utf8"));
  }

  throw new Error(`暂不支持的文件类型：${ext || "未知"}。支持：${SUPPORTED_EXT.join("、")}`);
}

/** 清洗：去掉 PDF 解析常见的水印噪音、统一换行、压缩连续空行 */
export function cleanText(text: string): string {
  return stripBom(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]{2,}/g, " ");
}

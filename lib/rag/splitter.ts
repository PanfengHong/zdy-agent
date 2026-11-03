import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getRagConfig } from "../config";

/**
 * 中文友好的递归切分：优先按段落切，其次按句子标点切，最后才硬切字符。
 * 相比默认（只认 \n 和空格），中文长段落不会被切碎。
 */
const SEPARATORS = [
  "\n\n",
  "\n",
  "。",
  "！",
  "？",
  "；",
  "……",
  ".",
  "!",
  "?",
  ";",
  "，",
  ",",
  " ",
  "",
];

export function createSplitter() {
  const { chunkSize, chunkOverlap } = getRagConfig();
  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: SEPARATORS,
    keepSeparator: true,
  });
}

export interface SplitOptions {
  source: string;
  docId: string;
  title?: string;
}

export async function splitIntoChunks(text: string, opts: SplitOptions): Promise<Document[]> {
  const splitter = createSplitter();
  const raw = await splitter.createDocuments([text]);

  return raw
    .map((doc) => doc.pageContent.trim())
    .filter((content) => content.length > 10)
    .map(
      (content, index) =>
        new Document({
          pageContent: content,
          metadata: {
            id: `${opts.docId}#${index}`,
            docId: opts.docId,
            source: opts.source,
            title: opts.title ?? opts.source,
            chunk: index,
          },
        })
    );
}

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Settings } from './config.js';
import { Store, type Chunk } from './store.js';
import { embed } from './ai.js';
import type { Source, DocumentInfo } from '../shared/types.js';

export interface Page { text: string; location: string }
export function chunkPages(pages: Page[], documentId: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const page of pages) {
    const text = page.text.replace(/\r/g, '').trim();
    // 1,800 characters keeps Russian chunks well inside embedding token limits.
    for (let start = 0; start < text.length; start += 1560) {
      const part = text.slice(start, start + 1800).trim();
      if (part) chunks.push({ id: randomUUID(), documentId, text: part, location: page.location, vector: null, embeddingModel: null });
      if (start + 1800 >= text.length) break;
    }
  }
  return chunks;
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
async function extract(buffer: Buffer, extension: string): Promise<Page[]> {
  if (extension !== '.pdf') {
    const text = buffer.toString('utf8');
    if (text.includes('\0') || text.includes('\uFFFD')) throw new Error('Файл должен быть текстом в UTF-8.');
    if (extension !== '.md') return [{ text, location: 'Текст' }];
    let heading = 'Текст', body: string[] = []; const pages: Page[] = [];
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s/.test(line)) { if (body.length) pages.push({ text: body.join('\n'), location: heading }); heading = line.replace(/^#+\s*/, ''); body = [line]; }
      else body.push(line);
    }
    if (body.length) pages.push({ text: body.join('\n'), location: heading });
    return pages;
  }
  // PDF parsing runs away from the realtime audio/event loop, also under tsx dev.
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(workerData), useSystemFonts: true, isEvalSupported: false }).promise;
      if (pdf.numPages > 500) throw new Error('PDF превышает 500 страниц. Разделите его на части.');
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        pages.push({ text: content.items.map(x => x.str || '').join(' '), location: 'Страница ' + n });
      }
      await pdf.destroy(); parentPort.postMessage(pages);
    })().catch(() => { parentPort.postMessage({ error: true }); });
  `, { eval: true, workerData: buffer });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('PDF не удалось прочитать за 30 секунд. Разделите файл на части.')); }, 30000);
    worker.once('message', (data: Page[] | { error: true }) => { clearTimeout(timeout); void worker.terminate(); if ('error' in data) reject(new Error('PDF повреждён, защищён паролем или не поддерживается.')); else resolve(data); });
    worker.once('error', () => { clearTimeout(timeout); reject(new Error('PDF не удалось прочитать.')); });
  });
}
export class Documents {
  private queryCache = new Map<string, number[]>();
  constructor(private store: Store, private settings: Settings) {
    for (const d of store.documents()) if (d.status === 'indexing') store.document({ ...d, status: 'error', error: 'Индексирование прервалось. Удалите файл и загрузите снова.' });
  }
  async ingest(name: string, bytes: Buffer): Promise<DocumentInfo> {
    const extension = extname(name).toLowerCase();
    if (!['.pdf', '.txt', '.md'].includes(extension)) throw new Error('Файл должен быть PDF, TXT или Markdown.');
    const doc: DocumentInfo = { id: randomUUID(), name: name.slice(0, 200), createdAt: Date.now(), status: 'indexing', chunks: 0, semantic: false };
    this.store.document(doc);
    try {
      const pages = await extract(bytes, extension);
      const chunks = chunkPages(pages, doc.id);
      if (!chunks.length || pages.every(p => p.text.trim().length < 10)) throw new Error(extension === '.pdf' ? 'PDF не содержит текстового слоя. Сначала выполните OCR.' : 'Документ не содержит текста.');
      if (chunks.length > 5000) throw new Error('Документ слишком большой. Разделите его на несколько файлов.');
      const config = { ...this.settings.value.embedding };
      let embeddingError = false;
      if (config.apiKey) {
        try {
          for (let i = 0; i < chunks.length; i += 32) {
            const batch = chunks.slice(i, i + 32); const vectors = await embed(batch.map(c => c.text), config);
            if (vectors.length !== batch.length) throw new Error('embedding count');
            batch.forEach((c, index) => { c.vector = vectors[index]; c.embeddingModel = `${config.baseURL}|${config.model}`; });
          }
        } catch { embeddingError = true; }
      }
      // A document deleted during ingestion cannot reappear or leave orphan FTS rows.
      if (!this.store.getDocument(doc.id)) return { ...doc, status: 'error', error: 'Документ удалён.' };
      this.store.addChunks(chunks);
      const result: DocumentInfo = { ...doc, status: 'ready', chunks: chunks.length, semantic: chunks.every(c => !!c.vector), ...(embeddingError ? { error: 'Семантический индекс недоступен; работает поиск по словам. Для переиндексации загрузите файл снова.' } : {}) };
      this.store.document(result); return result;
    } catch (error) {
      const result: DocumentInfo = { ...doc, status: 'error', error: (error as Error).message.startsWith('PDF') || (error as Error).message.startsWith('Документ') || (error as Error).message.startsWith('Файл') ? (error as Error).message : 'Не удалось индексировать документ.' };
      if (this.store.getDocument(doc.id)) this.store.document(result); return result;
    }
  }
  async search(query: string, ids: string[], signal: AbortSignal): Promise<Source[]> {
    if (!query || !ids.length) return [];
    const chunks = this.store.chunks(ids); const lexical = this.store.lexical(query, ids); const config = this.settings.value.embedding;
    const identity = `${config.baseURL}|${config.model}`;
    let vector: number[] | undefined;
    if (config.apiKey && chunks.some(c => c.embeddingModel === identity)) {
      try {
        const key = `${identity}|${query}`;
        vector = this.queryCache.get(key);
        if (!vector) { vector = (await embed([query], config, AbortSignal.any([signal, AbortSignal.timeout(1800)])))[0]; this.queryCache.set(key, vector); }
        if (this.queryCache.size > 100) this.queryCache.delete(this.queryCache.keys().next().value!);
      } catch { if (signal.aborted) return []; }
    }
    const semantic = vector ? chunks.filter(c => c.vector && c.embeddingModel === identity).map(c => ({ id: c.id, score: cosine(vector!, c.vector!) })).filter(c => c.score > 0.2).sort((a, b) => b.score - a.score).slice(0, 20).map(c => c.id) : [];
    const scores = new Map<string, number>();
    for (const list of [lexical, semantic]) list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index)));
    return [...scores].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => {
      const c = chunks.find(c => c.id === id)!;
      return { id: c.id, kind: 'document', title: this.store.getDocument(c.documentId)?.name ?? 'Документ', location: c.location, excerpt: c.text, documentId: c.documentId };
    });
  }
}
export async function webSearch(query: string, key: string, signal: AbortSignal): Promise<Source[]> {
  if (!query || !key) return [];
  const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false }), signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]) });
  if (!response.ok) throw new Error('search unavailable');
  const data = await response.json() as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).filter(r => { try { return ['https:', 'http:'].includes(new URL(r.url).protocol); } catch { return false; } }).map(r => ({ id: randomUUID(), kind: 'web', title: r.title, location: new URL(r.url).hostname, url: r.url, excerpt: r.content.slice(0, 2000) }));
}

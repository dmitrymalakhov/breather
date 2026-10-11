import Database from 'better-sqlite3';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Meeting, Utterance, Speaker, Hint, DocumentInfo, Metrics, UsageRecord, UsageTotals } from '../shared/types.js';
export interface Chunk { id: string; documentId: string; text: string; location: string; vector: number[] | null; embeddingModel: string | null }
export class Store {
  db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_meeting ON usage_records(meeting_id);
      CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS utterances (id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE, start REAL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS speakers (id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hints (id TEXT PRIMARY KEY, meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE, created INTEGER, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE, text TEXT NOT NULL, location TEXT, vector TEXT, embedding_model TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, chunk_id UNINDEXED, document_id UNINDEXED, tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS timings (meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE, ms REAL NOT NULL);
      CREATE INDEX IF NOT EXISTS utterance_meeting ON utterances(meeting_id, start);
      CREATE INDEX IF NOT EXISTS hint_meeting ON hints(meeting_id, created);
    `);
    if (!(this.db.pragma('table_info(timings)') as { name: string }[]).some(column => column.name === 'kind')) this.db.exec("ALTER TABLE timings ADD COLUMN kind TEXT NOT NULL DEFAULT 'hint'");
    // A crashed app cannot still be recording when the user opens it again.
    for (const meeting of this.meetings()) if (meeting.status !== 'ended') this.meeting({ ...meeting, status: 'ended', endedAt: Date.now() });
  }
  private all<T>(sql: string, ...args: unknown[]): T[] { return (this.db.prepare(sql).all(...args) as { data: string }[]).map(row => JSON.parse(row.data) as T); }
  meeting(m: Meeting) { this.db.prepare('INSERT INTO meetings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(m.id, JSON.stringify(m)); }
  getMeeting(id: string) { return this.all<Meeting>('SELECT data FROM meetings WHERE id=?', id)[0]; }
  meetings() { return this.all<Meeting>('SELECT data FROM meetings ORDER BY rowid DESC'); }
  utterance(u: Utterance) { this.db.prepare('INSERT OR REPLACE INTO utterances VALUES (?,?,?,?)').run(u.id, u.meetingId, u.start, JSON.stringify(u)); }
  utterances(id: string) { return this.all<Utterance>('SELECT data FROM utterances WHERE meeting_id=? ORDER BY start', id); }
  speaker(s: Speaker) { this.db.prepare('INSERT OR REPLACE INTO speakers VALUES (?,?,?)').run(s.id, s.meetingId, JSON.stringify(s)); }
  speakers(id: string) { return this.all<Speaker>('SELECT data FROM speakers WHERE meeting_id=? ORDER BY rowid', id); }
  hint(h: Hint) { this.db.prepare('INSERT OR REPLACE INTO hints VALUES (?,?,?,?)').run(h.id, h.meetingId, h.createdAt, JSON.stringify(h)); }
  hints(id: string) { return this.all<Hint>('SELECT data FROM hints WHERE meeting_id=? ORDER BY created', id); }
  deleteMeeting(id: string) { this.db.prepare('DELETE FROM meetings WHERE id=?').run(id); }
  document(d: DocumentInfo) { this.db.prepare('INSERT INTO documents VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(d.id, JSON.stringify(d)); }
  documents() { return this.all<DocumentInfo>('SELECT data FROM documents ORDER BY rowid DESC'); }
  getDocument(id: string) { return this.all<DocumentInfo>('SELECT data FROM documents WHERE id=?', id)[0]; }
  addChunks(chunks: Chunk[]) {
    this.db.transaction(() => { for (const c of chunks) {
      this.db.prepare('INSERT INTO chunks VALUES (?,?,?,?,?,?)').run(c.id, c.documentId, c.text, c.location, c.vector ? JSON.stringify(c.vector) : null, c.embeddingModel);
      this.db.prepare('INSERT INTO chunks_fts VALUES (?,?,?)').run(c.text, c.id, c.documentId);
    } })();
  }
  chunks(ids: string[]): Chunk[] {
    if (!ids.length) return [];
    return (this.db.prepare(`SELECT * FROM chunks WHERE document_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Record<string, string>[]).map(row => ({ id: row.id, documentId: row.document_id, text: row.text, location: row.location, vector: row.vector ? JSON.parse(row.vector) : null, embeddingModel: row.embedding_model }));
  }
  lexical(query: string, ids: string[]): string[] {
    const terms = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 12) ?? [];
    if (!terms.length || !ids.length) return [];
    const match = terms.map(t => `"${t}"*`).join(' OR ');
    return (this.db.prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND document_id IN (${ids.map(() => '?').join(',')}) ORDER BY bm25(chunks_fts) LIMIT 20`).all(match, ...ids) as { chunk_id: string }[]).map(r => r.chunk_id);
  }
  deleteDocument(id: string) { this.db.transaction(() => { this.db.prepare('DELETE FROM chunks_fts WHERE document_id=?').run(id); this.db.prepare('DELETE FROM documents WHERE id=?').run(id); })(); }
  timing(id: string, ms: number, kind: 'hint' | 'model' | 'question' = 'hint') { this.db.prepare('INSERT INTO timings (meeting_id,ms,kind) VALUES (?,?,?)').run(id, Math.max(0, ms), kind); }
  timings(id: string, kind: 'hint' | 'model' | 'question' = 'hint') { return (this.db.prepare('SELECT ms FROM timings WHERE meeting_id=? AND kind=? ORDER BY ms').all(id, kind) as { ms: number }[]).map(r => r.ms); }
  metrics(id: string, sttLastMs: number | null = null): Metrics {
    const values = this.timings(id), model = this.timings(id, 'model'), question = this.timings(id, 'question');
    const percentile = (list: number[], p: number) => list.length ? Math.round(list[p === .5 ? Math.floor((list.length - 1) * p) : Math.ceil((list.length - 1) * p)]) : null;
    return { hintP50: percentile(values, .5), hintP95: percentile(values, .95), modelP50: percentile(model, .5), modelP95: percentile(model, .95), questionP50: percentile(question, .5), questionP95: percentile(question, .95), samples: values.length, sttLastMs };
  }
  usage(record: UsageRecord) { this.db.prepare('INSERT INTO usage_records VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id, record.meetingId, JSON.stringify(record)); }
  usageRecords(id?: string): UsageRecord[] { return id ? this.all('SELECT data FROM usage_records WHERE meeting_id=?', id) : this.all('SELECT data FROM usage_records'); }
  usageTotals(id?: string): UsageTotals {
    const records = this.usageRecords(id);
    const sum = (field: 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'audioSeconds' | 'costUsd') => records.reduce((n,r) => n + (r[field] ?? 0), 0);
    return { requests: records.length, modelRequests: records.filter(r=>r.area==='model').length, speechConnections: records.filter(r=>r.area==='speech').length, failed: records.filter(r=>r.status==='failed').length, cancelled: records.filter(r=>r.status==='cancelled').length, pending: records.filter(r=>r.status==='pending').length, unknownTokens: records.filter(r=>r.area==='model' && (r.inputTokens===null || r.outputTokens===null)).length, inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cachedTokens: sum('cachedTokens'), audioSeconds: sum('audioSeconds'), estimatedCostUsd: sum('costUsd'), unpriced: records.filter(r=>r.costUsd===null).length };
  }
  close() { this.db.close(); }
}

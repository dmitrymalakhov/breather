import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store';
import { Settings } from '../server/config';
import { Documents, chunkPages, cosine, webSearch } from '../server/documents';
import { Session } from '../server/session';
import { normalizeDeepgram, type SpeechProvider } from '../server/speech';
import { parseDecision, partialField, friendlyError, type Generator } from '../server/ai';
import type { Meeting, Utterance, ServerEvent } from '../shared/types';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const roots: string[] = []; const stores: Store[] = []; const sessions: Session[] = [];
function fixture(demo = false) {
  const root = mkdtempSync(join(tmpdir(), 'sufler-test-')); roots.push(root);
  const store = new Store(join(root, 'data/test.sqlite')); stores.push(store);
  const settings = new Settings(root, { generation: { provider: 'openai', model: 'gpt-6-luna', baseURL: 'https://api.openai.com/v1', apiKey: '' }, embedding: { baseURL: 'https://api.openai.com/v1', model: 'text-embedding-3-small', apiKey: '' }, deepgramKey: '' });
  const documents = new Documents(store, settings);
  const meeting: Meeting = { id: randomUUID(), brief: { title: 'Тест', goal: 'Обсудить', role: 'Разработчик', preparation: 'Эксперт', documents: [] }, demo, status: 'paused', createdAt: Date.now(), summary: '' };
  store.meeting(meeting); return { root, store, settings, documents, meeting };
}
const utterance = (meetingId: string, id = 'packet:0', text = 'Как работает диаризация?'): Utterance => ({ id, meetingId, speakerId: `${meetingId}:epoch1:speaker:0`, text, start: 0, end: 2, final: true, receivedAt: Date.now() });
afterEach(async () => { for (const s of sessions.splice(0)) await s.end(); for (const s of stores.splice(0)) s.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('persistent transcript and documents', () => {
  it('keeps child records when updating a meeting and document', async () => {
    const { store, documents, meeting } = fixture(); store.utterance(utterance(meeting.id));
    store.meeting({ ...meeting, summary: 'Обновление', status: 'ended' });
    expect(store.utterances(meeting.id)).toHaveLength(1);
    const doc = await documents.ingest('заметки.md', Buffer.from('# Диаризация\nРазделение реплик по говорящим в потоке.'));
    expect(doc.status).toBe('ready'); expect(store.chunks([doc.id])).toHaveLength(1);
    expect(await documents.search('диаризация', [doc.id], new AbortController().signal)).toMatchObject([{ title: 'заметки.md', location: 'Диаризация', excerpt: expect.stringContaining('говорящим') }]);
    store.deleteDocument(doc.id); expect(store.lexical('диаризация', [doc.id])).toEqual([]);
    store.deleteMeeting(meeting.id); expect(store.utterances(meeting.id)).toEqual([]);
  });
  it('preserves source locations and ranks only selected documents', async () => {
    const { documents, store } = fixture();
    const one = await documents.ingest('one.txt', Buffer.from('Реактор и мощность обсуждаются отдельно.'));
    const two = await documents.ingest('two.txt', Buffer.from('Реактор в другом документе.'));
    const sources = await documents.search('реактор', [one.id], new AbortController().signal);
    expect(sources.every(s => s.documentId === one.id)).toBe(true); expect(sources.some(s => s.documentId === two.id)).toBe(false);
    const chunks = chunkPages([{ text: 'а'.repeat(4200), location: 'Страница 5' }], one.id);
    expect(chunks).toHaveLength(3); expect(chunks.every(c => c.location === 'Страница 5')).toBe(true);
    expect(cosine([1, 0], [1, 0])).toBe(1); expect(cosine([1], [1, 2])).toBe(0);
    expect(store.getDocument(one.id)?.semantic).toBe(false);
  });
  it('writes secret configuration with 0600 and hides all key values', () => {
    const { settings, root } = fixture(); settings.save({ ...settings.value, deepgramKey: 'test-only-secret', generation: { ...settings.value.generation, apiKey: 'test-model-secret' } });
    expect(statSync(join(root, '.env.local')).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(settings.public())).not.toContain('secret');
    expect(() => settings.candidate({ generation: { ...settings.value.generation, baseURL: 'https://other.example/v1', apiKey: '' } })).toThrow('Старый ключ');
  });
  it('indexes text PDF pages and explains when OCR is required', async () => {
    const { documents } = fixture();
    const pdf = (text: boolean) => {
      const stream = text ? 'BT /F1 12 Tf 40 700 Td (Streaming speech and diarization) Tj ET' : '';
      const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
      let source = '%PDF-1.4\n'; const offsets = [0];
      objects.forEach((object, index) => { offsets.push(source.length); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
      const xref = source.length; source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => n.toString().padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
      return Buffer.from(source);
    };
    const ready = await documents.ingest('text.pdf', pdf(true)); expect(ready.status).toBe('ready');
    const sources = await documents.search('diarization', [ready.id], new AbortController().signal);
    expect(sources[0]).toMatchObject({ location: 'Страница 1', excerpt: expect.stringContaining('diarization') });
    const blank = await documents.ingest('scan.pdf', pdf(false)); expect(blank.status).toBe('error'); expect(blank.error).toContain('OCR');
  }, 10000);
});

describe('speaker normalization and stream safety', () => {
  it.each([44100, 48000])('resamples %i Hz to bounded 100ms PCM packets without audible output', rate => {
    let Processor: any; const packets: { audio: ArrayBuffer; level: number }[] = [];
    vm.runInNewContext(readFileSync(new URL('../public/audio-worklet.js', import.meta.url), 'utf8'), {
      sampleRate: rate, AudioWorkletProcessor: class { port = { postMessage: (data: { audio: ArrayBuffer; level: number }) => packets.push(data) }; },
      registerProcessor: (_name: string, constructor: any) => { Processor = constructor; }, Int16Array, Float32Array, Date, Math, Array,
    });
    const processor = new Processor();
    for (let i = 0; i < rate + 256; i += 128) processor.process([[new Float32Array(128).fill(.5), new Float32Array(128).fill(.25)]]);
    expect(packets).toHaveLength(10); expect(packets.every(p => p.audio.byteLength === 4800)).toBe(true);
    expect(new Int16Array(packets[0].audio)[10]).toBeCloseTo(12288, 0);
    expect(processor.carry.length).toBeLessThanOrEqual(3);
  });
  it('splits speaker turns and updates the same IDs for interim and final results', () => {
    const packet = { type: 'Results', start: 0, duration: 2, is_final: false, channel: { alternatives: [{ transcript: 'Привет. Добрый день.', words: [{ word: 'Привет', punctuated_word: 'Привет.', start: 0, end: .5, speaker: 0 }, { word: 'Добрый', start: .7, end: 1, speaker: 1 }, { word: 'день', punctuated_word: 'день.', start: 1, end: 2, speaker: 1 }] }] } };
    const interim = normalizeDeepgram(packet, 'm', 'epoch1', 10)!;
    const final = normalizeDeepgram({ ...packet, is_final: true }, 'm', 'epoch1', 10)!;
    expect(interim.utterances).toHaveLength(2); expect(interim.utterances[1].text).toBe('Добрый день.');
    expect(interim.utterances.map(u => u.id)).toEqual(final.utterances.map(u => u.id));
    expect(final.utterances[0].start).toBe(10); expect(final.utterances.every(u => u.final)).toBe(true);
    const reconnect = normalizeDeepgram(packet, 'm', 'epoch2', 12)!;
    expect(reconnect.utterances[0].speakerId).not.toBe(interim.utterances[0].speakerId);
  });
  it('does not duplicate packets, regress finalized text, or accumulate stale interim groups', async () => {
    const f = fixture(); const session = new Session(f.meeting, f.store, f.settings, f.documents); sessions.push(session);
    const u = utterance(f.meeting.id); session.ingest('packet', [{ ...u, final: false }, { ...u, id: 'packet:1', final: false }]);
    session.ingest('packet', [u]); session.ingest('packet', [u]); session.ingest('packet', [{ ...u, text: 'Старый текст', final: false }]);
    expect(session.snapshot().utterances).toHaveLength(1); expect(session.snapshot().utterances[0].text).toBe(u.text);
    const second = { ...u, id: 'other:0', speakerId: `${f.meeting.id}:epoch2:speaker:0` }; session.ingest('other', [second]);
    session.renameSpeaker(u.speakerId, 'Анна', true); session.renameSpeaker(second.speakerId, 'Борис', true);
    expect(session.snapshot().speakers.filter(s => s.isSelf).map(s => s.name)).toEqual(['Борис']);
  });
  it('keeps audio flowing independently of a pending model and stores no audio in a simulated hour', async () => {
    const f = fixture(); let sent = 0; let stop = 0;
    const speech: SpeechProvider = { supportsSpeakers: true, start() {}, send() { sent++; }, async stop() { stop++; } };
    const generator: Generator = { async *stream(_m, signal) { while (!signal.aborted) await new Promise(r => setTimeout(r, 10)); } };
    const session = new Session(f.meeting, f.store, f.settings, f.documents, { speech: () => speech, generator: () => generator }); sessions.push(session); session.start();
    const frame = Buffer.alloc(4808); frame.writeDoubleLE(Date.now());
    for (let i = 0; i < 36000; i++) { session.audio(frame); if (i % 30 === 0) session.ingest(`p${i}`, [{ ...utterance(f.meeting.id, `p${i}:0`), start: i / 10, end: i / 10 + 2, speakerId: `${f.meeting.id}:epoch:speaker:${i % 4}` }]); }
    await new Promise(r => setTimeout(r, 20)); expect(sent).toBe(36000); expect(f.store.utterances(f.meeting.id)).toHaveLength(1200);
    await session.end(); expect(stop).toBe(1); expect(f.store.getMeeting(f.meeting.id)?.status).toBe('ended');
    expect(readdirSync(join(f.root, 'data')).every(file => file.startsWith('test.sqlite'))).toBe(true);
  }, 15000);
});

describe('generation cancellation and parsing', () => {
  it('separates speech, model and question-to-hint timings', async () => {
    const f = fixture();
    const generator: Generator = { async *stream() { yield JSON.stringify({ kind: 'answer', title: 'Ответ', body: 'Короткий законченный ответ на вопрос участника.', documentQuery: '' }); } };
    const session = new Session(f.meeting, f.store, f.settings, f.documents, { generator: () => generator, speech: () => ({ supportsSpeakers: true, start() {}, send() {}, async stop() {} }) }); sessions.push(session); session.start();
    session.ingest('packet', [{ ...utterance(f.meeting.id), sttLatencyMs: 300 }]);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(session.metrics()).toMatchObject({ samples: 1, sttLastMs: 300, modelP50: expect.any(Number), questionP50: expect.any(Number) });
    expect(session.metrics().questionP50!).toBeGreaterThanOrEqual(300); expect(f.store.timings(f.meeting.id)).toHaveLength(1);
  });
  it('streams JSON string prefixes without exposing incomplete escapes', () => {
    expect(partialField('{"body":"Привет\\nмир', 'body')).toBe('Привет\nмир');
    expect(partialField('{"body":"текст\\', 'body')).toBe('текст');
    expect(parseDecision('{"kind":"none","title":"","body":""}').kind).toBe('none');
    expect(() => parseDecision('{"kind":"made-up"}')).toThrow();
    expect(friendlyError({ status: 401, message: 'secret-token' })).not.toContain('secret');
  });
  it('invalidates an in-flight answer when the model is changed', async () => {
    const f = fixture(); let release: (() => void) | undefined; let calls = 0;
    const generator: Generator = { async *stream(_messages, signal) { calls++; if (calls === 1) await new Promise<void>(r => { release = r; }); if (!signal.aborted) yield JSON.stringify({ kind: 'answer', title: 'Новая модель', body: 'Короткий ответ новой модели.', documentQuery: '', needsWeb: false, publicWebQuery: '' }); } };
    const session = new Session(f.meeting, f.store, f.settings, f.documents, { generator: () => generator, speech: () => ({ supportsSpeakers: true, start() {}, send() {}, async stop() {} }) }); sessions.push(session);
    session.start(); session.ingest('packet', [utterance(f.meeting.id)]);
    await new Promise(r => setTimeout(r, 25)); session.modelChanged(); release?.();
    await new Promise(r => setTimeout(r, 1550));
    expect(session.snapshot().hints).toHaveLength(1); expect(session.snapshot().hints[0].title).toBe('Новая модель'); expect(calls).toBe(2);
  });
  it('sends a public search query without document content', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: [{ title: 'API', url: 'https://example.org/docs', content: 'Публичный источник' }] }), { status: 200 }));
    const result = await webSearch('streaming speech API', 'test-key', new AbortController().signal);
    expect(JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)).toMatchObject({ query: 'streaming speech API', include_answer: false });
    expect(result[0].url).toBe('https://example.org/docs');
  });
});

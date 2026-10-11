import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { observeModel } from './usage.js';
import { Settings, settingsSchema, speechKey } from './config.js';
import { Store } from './store.js';
import { Documents } from './documents.js';
import { ApiGenerator, collect, friendlyError } from './ai.js';
import { Session, type SessionDependencies } from './session.js';
import type { Meeting, Snapshot, Config } from '../shared/types.js';

export const briefSchema = z.object({ language: z.enum(['en', 'ru']).optional(), title: z.string().trim().max(120).default('Новая встреча'), goal: z.string().max(3000).default(''), role: z.string().max(1000).default(''), preparation: z.string().max(1000).default(''), documents: z.array(z.string().uuid()).max(30).default([]) });
export interface AppOptions { root: string; database?: string; config?: Partial<Config>; dependencies?: SessionDependencies; serveStatic?: boolean }
export async function createApp(options: AppOptions) {
  const settings = new Settings(options.root, options.config);
  const store = new Store(options.database ?? resolve(options.root, 'data/sufler.sqlite'));
  const documents = new Documents(store, settings);
  const sessions = new Map<string, Session>();
  let uploading = false;
  let changingSettings = false;
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  const origin = `http://127.0.0.1:${settings.value.port}`;
  // Loopback binding alone doesn't protect localhost from requests by unrelated websites.
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    if (host !== `127.0.0.1:${settings.value.port}` && host !== `localhost:${settings.value.port}`) return reply.code(403).send({ message: 'Недопустимый адрес приложения.' });
    const accepted = [origin, `http://localhost:${settings.value.port}`];
    const suppliedOrigin = request.headers.origin;
    if (suppliedOrigin && !accepted.includes(suppliedOrigin)) return reply.code(403).send({ message: 'Запросы разрешены только из приложения.' });
    if ((request.method !== 'GET' && request.method !== 'HEAD') || request.headers.upgrade === 'websocket') {
      if (!suppliedOrigin || !accepted.includes(suppliedOrigin)) return reply.code(403).send({ message: 'Откройте приложение и повторите действие.' });
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({ message: 'Запросы разрешены только из приложения.' });
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    reply.header('Permissions-Policy', 'microphone=(self), camera=()');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ message: 'Проверьте поля формы: ' + error.issues.map(i => i.path.join('.')).slice(0, 3).join(', ') });
    const code = (error as { statusCode?: number }).statusCode;
    return reply.code(code && code >= 400 && code < 500 ? code : 400).send({ message: friendlyError(error) });
  });
  await app.register(websocket, { options: { maxPayload: 65536 } });
  await app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024 } });
  const getSession = (id: string) => { const s = sessions.get(id); if (!s) throw new Error('Выберите активную встречу.'); return s; };
  const historySnapshot = (id: string): Snapshot | undefined => {
    const meeting = store.getMeeting(id); if (!meeting) return;
    const utterances = store.utterances(id);
    return { usage: store.usageTotals(id), meeting, utterances, speakers: store.speakers(id), hints: store.hints(id), metrics: store.metrics(id, utterances.at(-1)?.sttLatencyMs ?? null) };
  };
  app.get('/api/usage', async () => store.usageTotals());
  app.get('/api/config', async () => settings.public());
  app.put('/api/config', async request => {
    if (changingSettings) throw new Error('Выберите настройки после завершения текущей проверки.');
    changingSettings = true;
    try {
      const next = settings.candidate(settingsSchema.parse(request.body));
      if ((JSON.stringify(next.speechOptions) !== JSON.stringify(settings.value.speechOptions) || next.speechProvider !== settings.value.speechProvider || speechKey(next) !== speechKey(settings.value)) && [...sessions.values()].some(session => !session.meeting.demo && session.meeting.status === 'active')) throw new Error('Приостановите встречу перед сменой сервиса речи или его ключа.');
      if (next.generation.apiKey) {
        const result = await collect(new ApiGenerator(next.generation, observeModel(store, next.generation, next.billing, null)), [{ role: 'user', content: 'Reply with OK only.' }], AbortSignal.timeout(12000), 'test');
        if (!result.trim()) throw new Error('Модель не вернула ответ при проверке подключения.');
      }
      settings.save(next);
      for (const session of sessions.values()) if (!session.meeting.demo) session.modelChanged();
      return settings.public();
    } finally { changingSettings = false; }
  });
  app.get('/api/meetings', async () => store.meetings());
  app.post('/api/meetings', async request => {
    const body = z.object({ brief: briefSchema, demo: z.boolean().default(false) }).parse(request.body);
    for (const session of sessions.values()) if (session.meeting.status !== 'ended') throw new Error('Выберите завершение текущей встречи перед началом новой.');
    if (!body.demo && !speechKey(settings.value)) throw new Error('Добавьте API-ключ выбранного сервиса речи в настройках.');
    const validDocuments = body.brief.documents.every(id => store.getDocument(id)?.status === 'ready');
    if (!validDocuments) throw new Error('Документ ещё индексируется или недоступен.');
    const meeting: Meeting = { id: randomUUID(), brief: body.brief, demo: body.demo, status: 'paused', createdAt: Date.now(), summary: '' };
    store.meeting(meeting); const session = new Session(meeting, store, settings, documents, options.dependencies); sessions.set(meeting.id, session); return session.snapshot();
  });
  app.get<{ Params: { id: string } }>('/api/meetings/:id', async (request, reply) => {
    const snapshot = sessions.get(request.params.id)?.snapshot() ?? historySnapshot(request.params.id); return snapshot ?? reply.code(404).send({ message: 'Встреча не найдена.' });
  });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/memory', async request => { const session = getSession(request.params.id); await session.refreshMemory(true); return session.snapshot(); });
  app.put<{ Params: { id: string; item: string } }>('/api/meetings/:id/memory/:item', async (request, reply) => { const body = z.object({ resolved: z.boolean() }).parse(request.body); return getSession(request.params.id).resolveMemory(request.params.item, body.resolved) ? { ok: true } : reply.code(404).send({ message: 'Запись не найдена.' }); });
  app.put<{ Params: { id: string } }>('/api/meetings/:id/brief', async request => { const brief = briefSchema.parse(request.body); getSession(request.params.id).updateBrief(brief); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/start', async request => { getSession(request.params.id).start(); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/pause', async request => { await getSession(request.params.id).pause(); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/end', async request => { await getSession(request.params.id).end(); return { ok: true }; });
  app.delete<{ Params: { id: string } }>('/api/meetings/:id', async request => { await sessions.get(request.params.id)?.end(); sessions.delete(request.params.id); store.deleteMeeting(request.params.id); return { ok: true }; });
  app.put<{ Params: { id: string; speaker: string } }>('/api/meetings/:id/speakers/:speaker', async (request, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(80), isSelf: z.boolean() }).parse(request.body);
    return getSession(request.params.id).renameSpeaker(request.params.speaker, body.name, body.isSelf) ? { ok: true } : reply.code(404).send({ message: 'Участник не найден.' });
  });
  app.put<{ Params: { id: string; hint: string } }>('/api/meetings/:id/hints/:hint', async (request, reply) => {
    const { pinned } = z.object({ pinned: z.boolean() }).parse(request.body);
    return getSession(request.params.id).pin(request.params.hint, pinned) ? { ok: true } : reply.code(404).send({ message: 'Подсказка не найдена.' });
  });
  app.get('/api/documents', async () => store.documents());
  app.post('/api/documents', async request => {
    if (uploading) throw new Error('Документ уже индексируется. Дождитесь завершения.');
    const file = await request.file(); if (!file) throw new Error('Файл не выбран.');
    uploading = true;
    try { const buffer = await file.toBuffer(); return await documents.ingest(file.filename, buffer); } finally { uploading = false; }
  });
  app.get<{ Params: { id: string } }>('/api/documents/:id', async (request, reply) => {
    const doc = store.getDocument(request.params.id); if (!doc) return reply.code(404).send({ message: 'Документ удалён.' });
    return { document: doc, chunks: store.chunks([doc.id]).map(({ id, text, location }) => ({ id, text, location })) };
  });
  app.delete<{ Params: { id: string } }>('/api/documents/:id', async request => { for (const s of sessions.values()) s.removeDocument(request.params.id); store.deleteDocument(request.params.id); return { ok: true }; });
  app.get<{ Params: { id: string } }>('/api/meetings/:id/stream', { websocket: true }, (socket, request) => {
    const session = sessions.get(request.params.id);
    if (!session) { socket.close(1008, 'Meeting unavailable'); return; }
    // One capture owner per meeting. Secondary tabs could duplicate audio or stop another mic.
    if (session.hasSubscribers()) { socket.close(1008, 'Meeting already open'); return; }
    const unsubscribe = session.subscribe(event => { if (socket.readyState === 1) socket.send(JSON.stringify(event)); });
    socket.on('message', (buffer, binary) => { if (binary) session.audio(Buffer.from(buffer as Buffer)); });
    socket.on('close', () => { unsubscribe(); session.detach(); });
    socket.on('error', () => { unsubscribe(); session.detach(); });
  });
  if (options.serveStatic !== false && existsSync(resolve(options.root, 'dist'))) await app.register(staticPlugin, { root: resolve(options.root, 'dist'), prefix: '/' });
  app.addHook('onClose', async () => { for (const s of sessions.values()) await s.end(); store.close(); });
  return { app, settings, store, sessions, documents };
}

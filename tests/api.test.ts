import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';

describe('local API boundary and lifecycle', () => {
  it('rejects foreign origins, missing mutation origins, and DNS-rebinding hosts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sufler-api-'));
    const { app } = await createApp({ root, database: ':memory:', serveStatic: false, config: { port: 4317 } });
    try {
      const host = '127.0.0.1:4317'; const origin = 'http://' + host;
      expect((await app.inject({ url: '/api/config', headers: { host, origin: 'https://unrelated.example' } })).statusCode).toBe(403);
      expect((await app.inject({ url: '/api/config', headers: { host: 'attacker.example:4317' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/meetings', headers: { host }, payload: { brief: {}, demo: true } })).statusCode).toBe(403);
      const response = await app.inject({ method: 'POST', url: '/api/meetings', headers: { host, origin }, payload: { brief: { title: 'Демо' }, demo: true } });
      expect(response.statusCode).toBe(200); const id = response.json().meeting.id;
      const again = await app.inject({ method: 'POST', url: '/api/meetings', headers: { host, origin }, payload: { brief: {}, demo: true } });
      expect(again.statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: `/api/meetings/${id}/end`, headers: { host, origin } })).statusCode).toBe(200);
      expect((await app.inject({ url: `/api/meetings/${id}`, headers: { host } })).json().meeting.status).toBe('ended');
      expect((await app.inject({ method: 'DELETE', url: `/api/meetings/${id}`, headers: { host, origin } })).statusCode).toBe(200);
      expect((await app.inject({ url: `/api/meetings/${id}`, headers: { host } })).statusCode).toBe(404);
    } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
  });
});

it('requires the selected speech key and applies speech changes only while paused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sufler-speech-api-'));
  const { app, settings } = await createApp({ root, database: ':memory:', serveStatic: false, config: { port: 4317, speechProvider: 'elevenlabs', elevenlabsKey: '', deepgramKey: 'deep-only', generation: { provider: 'openai', baseURL: 'https://api.openai.com/v1', model: 'test', apiKey: '' } }, dependencies: { speech: () => ({ supportsSpeakers: false, start() {}, send() {}, async stop() {} }) } });
  const headers = { host: '127.0.0.1:4317', origin: 'http://127.0.0.1:4317' };
  try {
    expect((await app.inject({ method: 'POST', url: '/api/meetings', headers, payload: { brief: { title: 'Eleven' } } })).statusCode).toBe(400);
    const payload = { generation: settings.value.generation, speechProvider: 'elevenlabs', elevenlabsKey: 'eleven-secret' };
    expect((await app.inject({ method: 'PUT', url: '/api/config', headers, payload })).statusCode).toBe(200);
    const created = await app.inject({ method: 'POST', url: '/api/meetings', headers, payload: { brief: { title: 'Eleven' } } }); expect(created.statusCode).toBe(200);
    const id = created.json().meeting.id;
    await app.inject({ method: 'POST', url: `/api/meetings/${id}/start`, headers });
    const switchPayload = { generation: settings.value.generation, speechProvider: 'deepgram' };
    const rejected = await app.inject({ method: 'PUT', url: '/api/config', headers, payload: switchPayload }); expect(rejected.statusCode).toBe(400); expect(settings.value.speechProvider).toBe('elevenlabs');
    await app.inject({ method: 'POST', url: `/api/meetings/${id}/pause`, headers });
    expect((await app.inject({ method: 'PUT', url: '/api/config', headers, payload: switchPayload })).statusCode).toBe(200); expect(settings.value.speechProvider).toBe('deepgram');
  } finally { await app.close(); rmSync(root, { recursive: true, force: true }); }
});

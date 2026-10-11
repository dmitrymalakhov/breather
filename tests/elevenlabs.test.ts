import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { once } from 'node:events';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ElevenLabsSpeech, type SpeechCallbacks } from '../server/speech';
import { Settings, settingsSchema, speechKey } from '../server/config';

const servers: WebSocketServer[] = [];
const providers: ElevenLabsSpeech[] = [];
afterEach(async () => {
  await Promise.all(providers.splice(0).map(p => p.stop()));
  for (const server of servers.splice(0)) { for (const client of server.clients) client.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
async function fixture() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); servers.push(server); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const callbacks: SpeechCallbacks = { packet: vi.fn(), state: vi.fn(), gap: vi.fn(), error: vi.fn() };
  const requests: { url: string; options: WebSocket.ClientOptions }[] = [];
  const provider = new ElevenLabsSpeech('private-test-key', 'meeting', 10, callbacks, (url, options) => { requests.push({ url, options }); return new WebSocket(`ws://127.0.0.1:${port}`, options); }); providers.push(provider);
  const connected = once(server, 'connection'); provider.start(); const [socket] = await connected as [WebSocket];
  return { server, socket, provider, callbacks, requests };
}
function message(socket: WebSocket, message_type: string, text = '') { socket.send(JSON.stringify({ message_type, text })); }

describe('ElevenLabs Realtime adapter', () => {
  it('authenticates server-side, sends PCM, replaces partials, and commits the last segment on stop', async () => {
    const f = await fixture();
    const url = new URL(f.requests[0].url);
    expect(url.searchParams.get('audio_format')).toBe('pcm_24000'); expect(url.searchParams.get('commit_strategy')).toBe('vad'); expect(url.toString()).not.toContain('private-test-key');
    expect(f.requests[0].options.headers).toEqual({ 'xi-api-key': 'private-test-key' }); expect(f.provider.supportsSpeakers).toBe(false);
    f.provider.send(Buffer.alloc(4800)); // Not ready: audio must be dropped.
    message(f.socket, 'session_started'); await vi.waitFor(() => expect(f.callbacks.state).toHaveBeenCalledWith('listening'));
    const audioReceived = once(f.socket, 'message'); const audio = Buffer.alloc(4800, 7); f.provider.send(audio);
    const [raw] = await audioReceived; const chunk = JSON.parse(raw.toString()); expect(chunk.sample_rate).toBe(24000); expect(Buffer.from(chunk.audio_base_64, 'base64')).toEqual(audio);
    message(f.socket, 'partial_transcript', 'При'); message(f.socket, 'partial_transcript', 'Привет'); message(f.socket, 'committed_transcript', 'Привет.');
    await vi.waitFor(() => expect(f.callbacks.packet).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(f.callbacks.packet).mock.calls;
    expect(new Set(calls.map(c => c[0])).size).toBe(1); expect(calls[2][1][0]).toMatchObject({ start: 10, end: 10.1, final: true, speakerId: 'meeting:elevenlabs:unknown' });
    message(f.socket, 'partial_transcript', 'Пока'); await vi.waitFor(() => expect(f.callbacks.packet).toHaveBeenCalledTimes(4));
    f.socket.once('message', raw => { expect(JSON.parse(raw.toString())).toMatchObject({ commit: true, audio_base_64: '' }); message(f.socket, 'committed_transcript', 'Пока.'); });
    await f.provider.stop(); expect(f.callbacks.packet).toHaveBeenCalledTimes(5); expect(vi.mocked(f.callbacks.packet).mock.calls[4][0]).not.toBe(calls[0][0]);
    expect(f.callbacks.gap).not.toHaveBeenCalled();
  });
  it('reconnects with fresh segment IDs and carries forward audio time', async () => {
    const f = await fixture(); message(f.socket, 'session_started'); await vi.waitFor(() => expect(f.callbacks.state).toHaveBeenCalledWith('listening'));
    f.provider.send(Buffer.alloc(4800)); message(f.socket, 'partial_transcript', 'До обрыва'); await vi.waitFor(() => expect(f.callbacks.packet).toHaveBeenCalledTimes(1));
    const connected = once(f.server, 'connection'); f.socket.close(); const [next] = await connected as [WebSocket];
    expect(f.callbacks.gap).toHaveBeenCalledTimes(1); message(next, 'session_started'); message(next, 'committed_transcript', 'После обрыва');
    await vi.waitFor(() => expect(f.callbacks.packet).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(f.callbacks.packet).mock.calls; expect(calls[1][0]).not.toBe(calls[0][0]); expect(calls[1][1][0].start).toBe(10.1);
    next.once('message', () => next.close());
  });
  it('stops retrying rejected credentials and never exposes the provider error payload', async () => {
    const f = await fixture(); f.socket.send(JSON.stringify({ message_type: 'auth_error', error: 'private-test-key' }));
    await vi.waitFor(() => expect(f.callbacks.state).toHaveBeenCalledWith('failed'));
    expect(f.callbacks.error).toHaveBeenCalledWith(expect.stringContaining('ключ')); expect(JSON.stringify(vi.mocked(f.callbacks.error).mock.calls)).not.toContain('private-test-key');
    expect(f.requests).toHaveLength(1);
  });
});

it('persists both speech keys independently, defaults old settings to Deepgram, and hides secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'sufler-eleven-'));
  try {
    const settings = new Settings(root); expect(settings.value.speechProvider).toBe('deepgram');
    const next = settings.candidate(settingsSchema.parse({ generation: settings.value.generation, speechProvider: 'elevenlabs', elevenlabsKey: 'eleven-secret', deepgramKey: 'deep-secret' }));
    settings.save(next); const loaded = new Settings(root);
    expect(speechKey(loaded.value)).toBe('eleven-secret'); expect(loaded.public()).toMatchObject({ speechProvider: 'elevenlabs', hasElevenlabsKey: true, hasDeepgramKey: true }); expect(JSON.stringify(loaded.public())).not.toContain('secret'); expect(statSync(join(root, '.env.local')).mode & 0o777).toBe(0o600);
    const switched = loaded.candidate({ generation: loaded.value.generation, speechProvider: 'deepgram' }); expect(speechKey(switched)).toBe('deep-secret'); expect(switched.elevenlabsKey).toBe('eleven-secret');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

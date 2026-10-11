// An isolated test server. This file is never part of the production build.
import { resolve } from 'node:path';
import { createApp } from '../../server/app';
import type { SpeechCallbacks } from '../../server/speech';
import type { Generator } from '../../server/ai';
let frames = 0, bytes = 0, stopped = 0, models = 0;
const generator: Generator = { async *stream(_messages, signal, purpose) {
  models++;
  const text = purpose === 'decision' ? JSON.stringify({ kind: 'answer', title: 'Контрольная подсказка', body: 'Поток аудио продолжается во время генерации. Это проверка реального AudioWorklet с тестовым микрофоном Chrome.', documentQuery: '', needsWeb: false, publicWebQuery: '' }) : 'Краткое содержание';
  for (let i = 0; i < text.length; i += 12) { await new Promise(r => setTimeout(r, 50)); if (signal.aborted) return; yield text.slice(i, i + 12); }
} };
const { app } = await createApp({ root: resolve(process.cwd()), database: ':memory:', config: { speechProvider: 'deepgram', elevenlabsKey: '', port: 4318, deepgramKey: 'test-only-key', generation: { provider: 'compatible', baseURL: 'http://127.0.0.1:4318', model: 'fixture', apiKey: 'test-only-key' }, embedding: { baseURL: 'http://127.0.0.1:4318', model: 'fixture', apiKey: '' } }, dependencies: {
  generator: () => generator,
  speech: (meeting, callbacks: SpeechCallbacks) => ({ supportsSpeakers: true, start() { callbacks.state('listening'); }, send(audio) {
    frames++; bytes += audio.length;
    if (frames === 4) callbacks.packet('fake:0', [{ id: 'fake:0:0', meetingId: meeting.id, speakerId: 'fake-speaker', text: 'Это контрольная реплика из потока микрофона.', start: 0, end: .4, final: true, receivedAt: Date.now(), sttLatencyMs: 100 }]);
  }, async stop() { stopped++; } }),
} });
app.get('/test/stats', async () => ({ frames, bytes, stopped, models }));
await app.listen({ host: '127.0.0.1', port: 4318 });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));

import { resolve } from 'node:path';
import { createApp } from '../../server/app';
const { app } = await createApp({ root: resolve(process.cwd()), database: ':memory:', config: { speechProvider: 'deepgram', elevenlabsKey: '', port: 4319, deepgramKey: '', tavilyKey: '', generation: { provider: 'openai', model: 'gpt-6-luna', baseURL: 'https://api.openai.com/v1', apiKey: '' }, embedding: { model: 'text-embedding-3-small', baseURL: 'https://api.openai.com/v1', apiKey: '' } } });
await app.listen({ host: '127.0.0.1', port: 4319 });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void app.close().then(() => process.exit(0)));

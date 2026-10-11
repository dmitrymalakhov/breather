import { resolve } from 'node:path';
import { createApp } from './app.js';
const { app, settings } = await createApp({ root: resolve(process.cwd()) });
try { await app.listen({ host: '127.0.0.1', port: settings.value.port }); console.log(`Суфлёр: http://127.0.0.1:${settings.value.port}`); }
catch { console.error('Не удалось запустить сервер. Проверьте, свободен ли порт ' + settings.value.port + '.'); process.exit(1); }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });

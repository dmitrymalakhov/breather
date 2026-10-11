import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Config, PublicConfig } from '../shared/types.js';

const endpoint = z.string().url().refine(value => {
  const u = new URL(value);
  return !u.username && !u.password && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)));
}, 'Используйте HTTPS или локальный HTTP-адрес.');
const price = z.number().finite().min(0).max(100000);
const billingSchema = z.object({ deepgramHour: price, elevenlabsHour: price, inputMillion: price.nullable(), outputMillion: price.nullable(), cachedMillion: price.nullable() });
const speechOptionsSchema = z.object({ language: z.enum(['auto', 'ru']), silenceMs: z.number().int().min(300).max(1500) });
export const defaultBilling = { deepgramHour: 0.468, elevenlabsHour: 0.39, inputMillion: null, outputMillion: null, cachedMillion: null };
export const defaultSpeechOptions = { language: 'auto' as const, silenceMs: 500 };
export const settingsSchema = z.object({
  billing: billingSchema.optional(), speechOptions: speechOptionsSchema.optional(),
  generation: z.object({ provider: z.enum(['openai', 'compatible']), baseURL: endpoint, model: z.string().trim().min(1).max(200), apiKey: z.string().max(4096).optional() }),
  speechProvider: z.enum(['deepgram', 'elevenlabs']).optional(), elevenlabsKey: z.string().max(4096).optional(),
  deepgramKey: z.string().max(4096).optional(), tavilyKey: z.string().max(4096).optional(),
  embedding: z.object({ baseURL: endpoint, model: z.string().trim().min(1).max(200), apiKey: z.string().max(4096).optional() }).optional(),
});
export class Settings {
  value: Config;
  private path: string;
  constructor(root: string, overrides: Partial<Config> = {}) {
    this.path = resolve(root, '.env.local');
    const values: Record<string, string> = {};
    if (existsSync(this.path)) {
      chmodSync(this.path, 0o600);
      for (const line of readFileSync(this.path, 'utf8').split('\n')) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) { try { values[match[1]] = JSON.parse(match[2]); } catch { values[match[1]] = match[2].trim(); } }
      }
    }
    const v = (key: string, fallback = '') => process.env[key] ?? values[key] ?? fallback;
    const parse = <T>(key: string, schema: z.ZodType<T>, fallback: T): T => { try { return schema.parse(JSON.parse(v(key))); } catch { return fallback; } };
    this.value = {
      billing: parse('BILLING_RATES', billingSchema, defaultBilling), speechOptions: parse('SPEECH_OPTIONS', speechOptionsSchema, defaultSpeechOptions),
      generation: { provider: v('GENERATION_PROVIDER', 'openai') === 'compatible' ? 'compatible' : 'openai', baseURL: v('GENERATION_BASE_URL', 'https://api.openai.com/v1'), model: v('GENERATION_MODEL', 'gpt-6-luna'), apiKey: v('GENERATION_API_KEY', v('OPENAI_API_KEY')) },
      speechProvider: v('SPEECH_PROVIDER', 'deepgram') === 'elevenlabs' ? 'elevenlabs' : 'deepgram', elevenlabsKey: v('ELEVENLABS_API_KEY'),
      deepgramKey: v('DEEPGRAM_API_KEY'), tavilyKey: v('TAVILY_API_KEY'),
      embedding: { baseURL: v('EMBEDDING_BASE_URL', 'https://api.openai.com/v1'), model: v('EMBEDDING_MODEL', 'text-embedding-3-small'), apiKey: v('EMBEDDING_API_KEY', v('OPENAI_API_KEY', v('GENERATION_PROVIDER', 'openai') === 'openai' ? v('GENERATION_API_KEY') : '')) },
      port: Number(v('PORT', '4317')), ...overrides,
    };
  }
  candidate(input: z.infer<typeof settingsSchema>): Config {
    const old = this.value;
    const changedHost = new URL(input.generation.baseURL).origin !== new URL(old.generation.baseURL).origin;
    if (changedHost && !input.generation.apiKey?.trim()) throw new Error('Для нового адреса введите его API-ключ. Старый ключ не будет отправлен другому серверу.');
    const embedding = input.embedding ?? old.embedding;
    if (input.embedding && new URL(embedding.baseURL).origin !== new URL(old.embedding.baseURL).origin && !input.embedding.apiKey?.trim()) throw new Error('Для нового адреса embeddings введите отдельный ключ.');
    const modelChanged = changedHost || input.generation.model !== old.generation.model || input.generation.provider !== old.generation.provider;
    return { ...old,
      speechOptions: input.speechOptions ?? old.speechOptions,
      billing: input.billing ?? (modelChanged ? { ...old.billing, inputMillion: null, outputMillion: null, cachedMillion: null } : old.billing),
      generation: { ...input.generation, baseURL: input.generation.baseURL.replace(/\/$/, ''), apiKey: input.generation.apiKey?.trim() || old.generation.apiKey },
      speechProvider: input.speechProvider ?? old.speechProvider, elevenlabsKey: input.elevenlabsKey?.trim() || old.elevenlabsKey,
      deepgramKey: input.deepgramKey?.trim() || old.deepgramKey, tavilyKey: input.tavilyKey?.trim() || old.tavilyKey,
      embedding: { ...embedding, apiKey: embedding.apiKey?.trim() || old.embedding.apiKey || (input.generation.provider === 'openai' ? input.generation.apiKey?.trim() || old.generation.apiKey : '') },
    };
  }
  save(next: Config) {
    const values = { BILLING_RATES: JSON.stringify(next.billing), SPEECH_OPTIONS: JSON.stringify(next.speechOptions), SPEECH_PROVIDER: next.speechProvider, ELEVENLABS_API_KEY: next.elevenlabsKey, DEEPGRAM_API_KEY: next.deepgramKey, TAVILY_API_KEY: next.tavilyKey, GENERATION_PROVIDER: next.generation.provider, GENERATION_BASE_URL: next.generation.baseURL, GENERATION_MODEL: next.generation.model, GENERATION_API_KEY: next.generation.apiKey, EMBEDDING_BASE_URL: next.embedding.baseURL, EMBEDDING_MODEL: next.embedding.model, EMBEDDING_API_KEY: next.embedding.apiKey, PORT: String(next.port) };
    writeFileSync(this.path, Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 });
    chmodSync(this.path, 0o600); this.value = next;
  }
  public(): PublicConfig {
    const c = this.value;
    return { billing: c.billing, speechOptions: c.speechOptions, speechProvider: c.speechProvider, hasElevenlabsKey: !!c.elevenlabsKey, generation: { provider: c.generation.provider, baseURL: c.generation.baseURL, model: c.generation.model }, hasGenerationKey: !!c.generation.apiKey, hasDeepgramKey: !!c.deepgramKey, hasTavilyKey: !!c.tavilyKey, embedding: { baseURL: c.embedding.baseURL, model: c.embedding.model, hasKey: !!c.embedding.apiKey } };
  }
}

export function speechKey(config: Config): string { return config.speechProvider === 'elevenlabs' ? config.elevenlabsKey : config.deepgramKey; }

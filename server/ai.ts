import { randomUUID } from 'node:crypto';
import type { TokenUsage, UsageEvent } from './usage.js';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ModelConfig, Decision, Config } from '../shared/types.js';
export interface Message { role: 'system' | 'user'; content: string }
export interface Generator { stream(messages: Message[], signal: AbortSignal, purpose: 'decision' | 'refine' | 'summary' | 'test'): AsyncIterable<string> }
export class ApiGenerator implements Generator {
  constructor(private config: ModelConfig, private observe?: (event: UsageEvent) => void) {}
  async *stream(messages: Message[], signal: AbortSignal, purpose: 'decision' | 'refine' | 'summary' | 'test') {
    if (!this.config.apiKey) throw new Error('Добавьте API-ключ модели в настройках.');
    signal.throwIfAborted();
    const id = randomUUID(), createdAt = Date.now(); let tokens: TokenUsage | undefined; let status: UsageEvent['status'] = 'completed';
    this.observe?.({ id, purpose, createdAt, status: 'pending' });
    try {
    const client = new OpenAI({ apiKey: this.config.apiKey, baseURL: this.config.baseURL, maxRetries: 0, timeout: 15000 });
    // A connection probe still needs room for reasoning tokens on other models.
    const max = purpose === 'decision' ? 600 : purpose === 'test' ? 1024 : purpose === 'summary' ? 2400 : 700;
    if (this.config.provider === 'openai') {
      const stream = await client.responses.create({
        model: this.config.model, input: messages, stream: true, store: false, max_output_tokens: max,
        ...(/^gpt-(5|6)/.test(this.config.model) ? { reasoning: { effort: this.config.model === 'gpt-6-luna' ? 'none' as const : 'low' as const } } : {}),
        ...(purpose === 'decision' ? { text: { format: { type: 'json_object' as const } } } : {}),
      }, { signal });
      for await (const event of stream) {
        if ('response' in event && event.response?.usage) { const u = event.response.usage; tokens = { input: u.input_tokens, output: u.output_tokens, cached: u.input_tokens_details?.cached_tokens ?? 0 }; }
        if (event.type === 'response.output_text.delta') yield event.delta;
        if (event.type === 'response.failed' || event.type === 'error') throw new Error('Модель не завершила ответ. Повторите запрос или смените модель.');
        if (event.type === 'response.incomplete') throw new Error('Ответ модели прерван лимитом. Выберите более быструю модель.');
      }
    } else {
      // Do not assume support for vendor-specific reasoning or JSON-mode fields.
      const stream = await client.chat.completions.create({ model: this.config.model, messages, stream: true, stream_options: { include_usage: true }, max_tokens: max }, { signal });
      for await (const event of stream) { if (event.usage) tokens = { input: event.usage.prompt_tokens, output: event.usage.completion_tokens, cached: event.usage.prompt_tokens_details?.cached_tokens ?? 0 }; const delta = event.choices[0]?.delta.content; if (delta) yield delta; }
    }
    } catch (error) { status = signal.aborted ? 'cancelled' : 'failed'; throw error; }
    finally { this.observe?.({ id, purpose, createdAt, status: signal.aborted ? 'cancelled' : status, tokens }); }
  }
}
export async function collect(generator: Generator, messages: Message[], signal: AbortSignal, purpose: 'summary' | 'test') {
  let text = ''; for await (const delta of generator.stream(messages, signal, purpose)) text += delta; return text;
}
export const decisionSchema = z.object({ kind: z.enum(['answer', 'term', 'prediction', 'goal', 'none']), title: z.string().max(160), body: z.string().max(2400), documentQuery: z.string().max(400).default(''), needsWeb: z.boolean().default(false), publicWebQuery: z.string().max(200).default('') });
export function parseDecision(text: string): Decision {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return decisionSchema.parse(JSON.parse(stripped));
}
// Decode only a complete JSON-string prefix. A partial escape waits for the next delta.
export function partialField(text: string, field: string): string | undefined {
  const start = text.indexOf(`"${field}"`); if (start < 0) return;
  const after = text.slice(start + field.length + 2); const match = after.match(/^\s*:\s*"/); if (!match) return;
  const value = after.slice(match[0].length); let raw = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i]; if (char === '"') break;
    if (char === '\\') {
      if (i + 1 >= value.length) break;
      if (value[i + 1] === 'u' && i + 5 >= value.length) break;
      const count = value[i + 1] === 'u' ? 6 : 2; raw += value.slice(i, i + count); i += count - 1;
    } else raw += char;
  }
  try { return JSON.parse(`"${raw}"`); } catch { return; }
}
export function friendlyError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return 'API отклонил ключ или доступ к модели. Проверьте настройки.';
  if (status === 429) return 'Достигнут лимит API. Лента продолжает работать; попробуйте позже.';
  if (status === 404) return 'Модель или API-адрес не найдены. Проверьте model ID и baseURL.';
  if ((error as Error)?.name === 'AbortError' || (error as Error)?.name === 'TimeoutError') return 'API не ответил вовремя. Попробуйте ещё раз.';
  if (error instanceof z.ZodError || error instanceof SyntaxError) return 'Модель вернула неожиданный формат подсказки. Попробуйте другую модель.';
  const message = (error as Error)?.message;
  // Never forward raw SDK/network errors, which can include request bodies or URLs.
  if (message && /^(Добавьте|Для нового|Используйте|Модель не|Ответ модели|PDF|Документ|Файл|Сервис речи|Выберите)/.test(message)) return message;
  return 'Не удалось связаться с API. Проверьте соединение и настройки.';
}
export async function embed(texts: string[], config: Config['embedding'], signal?: AbortSignal): Promise<number[][]> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 0, timeout: 8000 });
  const result = await client.embeddings.create({ model: config.model, input: texts }, { signal });
  return result.data.sort((a, b) => a.index - b.index).map(r => r.embedding);
}
export class DemoGenerator implements Generator {
  async *stream(messages: Message[], signal: AbortSignal, purpose: string) {
    const context = messages.at(-1)?.content ?? '';
    let result: string;
    if (purpose === 'decision') {
      const turn = context.split('Последние реплики:')[1] ?? context;
      const streamQuestion = /задержк|быстро|поток/i.test(turn.slice(-600));
      result = JSON.stringify({ kind: streamQuestion ? 'answer' : 'term', title: streamQuestion ? 'Как сократить задержку?' : 'Что такое диаризация?', body: streamQuestion ? 'Передавать звук непрерывно и показывать короткий предварительный ответ. Поиск источников выполнять параллельно, чтобы он не останавливал ленту.' : 'Диаризация разделяет речь по говорящим. Она присваивает голосам метки, а имена участников можно указать вручную.', documentQuery: 'потоковое распознавание диаризация задержка', needsWeb: false, publicWebQuery: '' });
    } else if (purpose === 'summary') { let data: any = {}; try { data = JSON.parse(context); } catch {} const utterances = data.utterances ?? []; result = JSON.stringify({ summary: 'Участники обсуждают потоковую обработку речи, разделение говорящих и задержку подсказок.', items: utterances.slice(0, 3).map((u: any, i: number) => ({ kind: i === 1 ? 'question' : 'focus', text: i === 1 ? 'Как отличать говорящих?' : i === 0 ? 'Потоковая расшифровка встречи' : 'Метки участников', utteranceIds: [u.id], resolved: false })) }); }
    else result = 'Короткая подсказка уже доступна. Проверяйте сведения по приведённым источникам и уточняйте детали выбранного решения.';
    for (let i = 0; i < result.length; i += 12) { if (signal.aborted) return; await new Promise(resolve => setTimeout(resolve, 12)); yield result.slice(i, i + 12); }
  }
}

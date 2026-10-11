import { afterEach, expect, it, vi } from 'vitest';
import { ApiGenerator, collect } from '../server/ai';

afterEach(() => vi.restoreAllMocks());
it.each(['openai', 'compatible'] as const)('streams the %s wire protocol with provider-specific parameters', async provider => {
  const events = provider === 'openai'
    ? 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Проверено"}\n\nevent: response.completed\ndata: {"type":"response.completed"}\n\n'
    : 'data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Проверено"},"finish_reason":null}]}\n\ndata: [DONE]\n\n';
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(events, { headers: { 'content-type': 'text/event-stream' } }));
  const generator = new ApiGenerator({ provider, baseURL: 'https://mock.example/v1', model: 'gpt-6-luna', apiKey: 'synthetic-test-key' });
  expect(await collect(generator, [{ role: 'user', content: 'Тест' }], new AbortController().signal, 'test')).toBe('Проверено');
  const [input, init] = fetchSpy.mock.calls[0];
  const url = input instanceof Request ? input.url : String(input);
  const body = JSON.parse(String(init?.body));
  expect(url).toContain(provider === 'openai' ? '/responses' : '/chat/completions');
  if (provider === 'openai') { expect(body.reasoning).toEqual({ effort: 'none' }); expect(body.store).toBe(false); expect(body.max_output_tokens).toBeGreaterThanOrEqual(512); }
  else { expect(body.reasoning).toBeUndefined(); expect(body.response_format).toBeUndefined(); expect(body.messages[0].content).toBe('Тест'); }
});

it('aborts generation before a network request and never exposes keys through an error', async () => {
  const controller = new AbortController(); controller.abort();
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await expect(collect(new ApiGenerator({ provider: 'openai', baseURL: 'https://mock.example/v1', model: 'gpt-6-luna', apiKey: 'synthetic-test-key' }), [{ role: 'user', content: 'Тест' }], controller.signal, 'test')).rejects.toThrow();
  expect(fetchSpy).not.toHaveBeenCalled();
});

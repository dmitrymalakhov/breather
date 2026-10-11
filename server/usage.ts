import { randomUUID } from 'node:crypto';
import type { BillingRates, ModelConfig, UsageRecord } from '../shared/types.js';
import type { Store } from './store.js';
export interface TokenUsage { input: number; output: number; cached: number }
export interface UsageEvent { id: string; purpose: string; createdAt: number; status: UsageRecord['status']; tokens?: TokenUsage }
export function tokenCost(tokens: TokenUsage | undefined, rates: BillingRates): number | null {
  if (!tokens || rates.inputMillion === null || rates.outputMillion === null || (tokens.cached > 0 && rates.cachedMillion === null)) return null;
  return ((tokens.input - tokens.cached) * rates.inputMillion + tokens.cached * (rates.cachedMillion ?? 0) + tokens.output * rates.outputMillion) / 1e6;
}
export function observeModel(store: Store, config: ModelConfig, rates: BillingRates, meetingId: string | null, changed = () => {}) {
  return (event: UsageEvent) => {
    store.usage({ id: event.id, meetingId, area: 'model', purpose: event.purpose, provider: config.provider, model: config.model, status: event.status, inputTokens: event.tokens?.input ?? null, outputTokens: event.tokens?.output ?? null, cachedTokens: event.tokens?.cached ?? 0, audioSeconds: 0, costUsd: tokenCost(event.tokens, rates), createdAt: event.createdAt }); changed();
  };
}
export function speechRecord(meetingId: string, provider: string): UsageRecord {
  return { id: randomUUID(), meetingId, area: 'speech', purpose: 'recognition', provider, model: provider === 'elevenlabs' ? 'scribe_v2_realtime' : 'nova-3', status: 'pending', inputTokens: 0, outputTokens: 0, cachedTokens: 0, audioSeconds: 0, costUsd: 0, createdAt: Date.now() };
}

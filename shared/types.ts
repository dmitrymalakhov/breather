export type SpeechService = 'deepgram' | 'elevenlabs';
export type Provider = 'openai' | 'compatible';
export interface ModelConfig { provider: Provider; baseURL: string; model: string; apiKey: string }
export interface BillingRates { deepgramHour: number; elevenlabsHour: number; inputMillion: number | null; outputMillion: number | null; cachedMillion: number | null }
export interface SpeechOptions { language: 'auto' | 'ru'; silenceMs: number }
export interface Config { billing: BillingRates; speechOptions: SpeechOptions; generation: ModelConfig; speechProvider: SpeechService; elevenlabsKey: string; deepgramKey: string; tavilyKey: string; embedding: { baseURL: string; model: string; apiKey: string }; port: number }
export interface PublicConfig { billing: BillingRates; speechOptions: SpeechOptions; speechProvider: SpeechService; hasElevenlabsKey: boolean; generation: Omit<ModelConfig, 'apiKey'>; hasGenerationKey: boolean; hasDeepgramKey: boolean; hasTavilyKey: boolean; embedding: { baseURL: string; model: string; hasKey: boolean } }
export interface Brief { title: string; goal: string; role: string; preparation: string; documents: string[] }
export type MeetingStatus = 'active' | 'paused' | 'ended';
export interface Meeting { id: string; brief: Brief; demo: boolean; status: MeetingStatus; createdAt: number; endedAt?: number; summary: string; memory?: MeetingMemory; memoryThrough?: string }
export interface Utterance { id: string; meetingId: string; speakerId: string; text: string; start: number; end: number; final: boolean; receivedAt: number; gap?: boolean; sttLatencyMs?: number }
export interface Speaker { id: string; meetingId: string; name: string; isSelf: boolean }
export interface Source { id: string; kind: 'document' | 'web'; title: string; location: string; excerpt: string; url?: string; documentId?: string }
export type HintKind = 'answer' | 'term' | 'prediction' | 'goal';
export interface Hint { id: string; meetingId: string; contextVersion: number; kind: HintKind; title: string; body: string; stage: 'preliminary' | 'grounded'; sources: Source[]; createdAt: number; pinned: boolean; complete: boolean; stale: boolean }
export interface DocumentInfo { id: string; name: string; createdAt: number; status: 'indexing' | 'ready' | 'error'; error?: string; chunks: number; semantic: boolean }
export interface Metrics { hintP50: number | null; hintP95: number | null; modelP50: number | null; modelP95: number | null; questionP50: number | null; questionP95: number | null; samples: number; sttLastMs: number | null }
export interface MemoryItem { id: string; kind: 'focus' | 'question' | 'decision'; text: string; utteranceIds: string[]; resolved: boolean; manual?: boolean }
export interface MeetingMemory { items: MemoryItem[]; updatedAt: number; error?: string }
export interface UsageRecord { id: string; meetingId: string | null; area: 'model' | 'speech'; purpose: string; provider: string; model: string; status: 'pending' | 'completed' | 'failed' | 'cancelled'; inputTokens: number | null; outputTokens: number | null; cachedTokens: number; audioSeconds: number; costUsd: number | null; createdAt: number }
export interface UsageTotals { requests: number; modelRequests: number; speechConnections: number; failed: number; cancelled: number; pending: number; unknownTokens: number; inputTokens: number; outputTokens: number; cachedTokens: number; audioSeconds: number; estimatedCostUsd: number; unpriced: number }
export interface Snapshot { usage?: UsageTotals; meeting: Meeting; utterances: Utterance[]; speakers: Speaker[]; hints: Hint[]; metrics: Metrics }
export type ServerEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'utterance'; data: Utterance }
  | { type: 'speaker'; data: Speaker }
  | { type: 'hint'; data: Hint }
  | { type: 'state'; data: { status: MeetingStatus; speech: string } }
  | { type: 'error'; data: { area: string; message: string } }
  | { type: 'metrics'; data: Metrics }
  | { type: 'usage'; data: UsageTotals }
  | { type: 'memory'; data: { memory: MeetingMemory; summary: string } };
export interface Decision { kind: HintKind | 'none'; title: string; body: string; documentQuery: string; needsWeb: boolean; publicWebQuery: string }

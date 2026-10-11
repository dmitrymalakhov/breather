import WebSocket from 'ws';
import type { Utterance, SpeechOptions } from '../shared/types.js';
export interface SpeechCallbacks { usage?: (event: { connection?: boolean; audioSeconds?: number; status?: 'completed' | 'failed' }) => void; packet: (key: string, utterances: Utterance[]) => void; state: (state: string) => void; gap: () => void; error: (message: string) => void }
export interface SpeechProvider { readonly supportsSpeakers: boolean; start(): void; send(audio: Buffer, capturedAt?: number): void; stop(): Promise<void> }
export function normalizeDeepgram(message: any, meetingId: string, epoch: string, offset: number, now = Date.now()): { key: string; utterances: Utterance[] } | null {
  const alternative = message.channel?.alternatives?.[0];
  if (message.type !== 'Results' || !alternative?.transcript?.trim()) return null;
  const key = `${meetingId}:${epoch}:${Math.round((message.start ?? 0) * 1000)}`;
  const words = alternative.words ?? [];
  const groups: { speaker: string; text: string[]; start: number; end: number }[] = [];
  for (const word of words) {
    const speaker = word.speaker === undefined ? 'unknown' : String(word.speaker);
    let group = groups.at(-1);
    if (!group || group.speaker !== speaker) { group = { speaker, text: [], start: word.start, end: word.end }; groups.push(group); }
    group.text.push(word.punctuated_word ?? word.word); group.end = word.end;
  }
  if (!groups.length) groups.push({ speaker: 'unknown', text: [alternative.transcript], start: message.start ?? 0, end: (message.start ?? 0) + (message.duration ?? 0) });
  return { key, utterances: groups.map((group, index) => ({ id: `${key}:${index}`, meetingId, speakerId: `${meetingId}:${epoch}:speaker:${group.speaker}`, text: group.text.join(' '), start: offset + group.start, end: offset + group.end, final: !!message.is_final, receivedAt: now })) };
}
export class DeepgramSpeech implements SpeechProvider {
  readonly supportsSpeakers = true;
  private socket?: WebSocket;
  private stopped = false;
  private epoch = 0;
  private audioSeconds = 0;
  private epochOffset = 0;
  private retries = 0;
  private clock: { end: number; capturedAt: number }[] = [];
  private epochSeconds = 0;
  private keepalive?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  constructor(private key: string, private meetingId: string, private offset: number, private callbacks: SpeechCallbacks, private options: SpeechOptions = { language: 'auto', silenceMs: 500 }) {}
  start() { this.connect(); }
  private connect() {
    if (this.stopped) return;
    this.callbacks.usage?.({ connection: true });
    this.epoch++; this.epochOffset = this.offset + this.audioSeconds;
    this.epochSeconds = 0; this.clock = [];
    const epoch = String(this.epoch) + '-' + Date.now();
    this.callbacks.state('connecting');
    const params = new URLSearchParams({ model: 'nova-3', language: this.options.language === 'ru' ? 'ru' : 'multi', encoding: 'linear16', sample_rate: '24000', channels: '1', interim_results: 'true', diarize_model: 'v1', endpointing: String(this.options.silenceMs), punctuate: 'true', smart_format: 'true' });
    const socket = this.socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, { headers: { Authorization: `Token ${this.key}` }, handshakeTimeout: 10000 });
    socket.on('open', () => {
      if (this.stopped) { socket.close(); return; }
      this.retries = 0; this.callbacks.state('listening');
      this.keepalive = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'KeepAlive' })); }, 4000);
    });
    socket.on('message', buffer => {
      try {
        const message = JSON.parse(buffer.toString()); const packet = normalizeDeepgram(message, this.meetingId, epoch, this.epochOffset);
        if (packet) {
          for (const utterance of packet.utterances) {
            const end = utterance.end - this.epochOffset;
            const clock = this.clock.find(c => c.end >= end);
            if (clock) utterance.sttLatencyMs = Math.max(0, Date.now() - clock.capturedAt + (clock.end - end) * 1000);
          }
          this.callbacks.packet(packet.key, packet.utterances);
        }
      }
      catch { this.callbacks.error('Сервис речи вернул неожиданный ответ.'); }
    });
    let denied = false;
    socket.on('unexpected-response', (_request, response) => { denied = response.statusCode === 401 || response.statusCode === 403; response.resume(); this.callbacks.error(denied ? 'Сервис речи отклонил ключ. Проверьте Deepgram API-ключ.' : 'Сервис речи недоступен. Проверьте соединение.'); socket.terminate(); });
    socket.on('error', () => { if (!this.stopped && !denied) this.callbacks.error('Сервис речи недоступен. Восстанавливаю соединение.'); });
    socket.on('close', code => {
      clearInterval(this.keepalive); this.callbacks.usage?.({ status: denied || (!this.stopped && code !== 1000) ? 'failed' : 'completed' });
      if (this.stopped) return;
      this.callbacks.gap();
      if (denied || this.retries >= 5) { this.callbacks.state('failed'); return; }
      this.callbacks.state('reconnecting');
      this.retryTimer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retries++));
    });
  }
  send(audio: Buffer, capturedAt?: number) {
    // Drop unavailable/backpressured audio; never queue an old meeting behind live speech.
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 96000) {
      const seconds = audio.length / 48000; this.audioSeconds += seconds; this.epochSeconds += seconds;
      if (capturedAt) { this.clock.push({ end: this.epochSeconds, capturedAt }); if (this.clock.length > 300) this.clock.shift(); }
      this.socket.send(audio); this.callbacks.usage?.({ audioSeconds: seconds });
    }
  }
  async stop() {
    this.stopped = true; clearInterval(this.keepalive); clearTimeout(this.retryTimer);
    const socket = this.socket; if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { socket.terminate(); resolve(); }, 1500);
      socket.once('close', () => { clearTimeout(timeout); resolve(); });
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CloseStream' })); else socket.terminate();
    });
  }
}
// Realtime Scribe has no speaker IDs. Each segment keeps one ID from partial to commit.
export class ElevenLabsSpeech implements SpeechProvider {
  readonly supportsSpeakers = false;
  private socket?: WebSocket;
  private stopped = false;
  private ready = false;
  private audioSeconds = 0;
  private segmentStart = 0;
  private segment = 0;
  private retries = 0;
  private epoch = 0;
  private retryTimer?: NodeJS.Timeout;
  private readyTimer?: NodeJS.Timeout;
  constructor(private key: string, private meetingId: string, private offset: number, private callbacks: SpeechCallbacks,
    private createSocket = (url: string, options: WebSocket.ClientOptions) => new WebSocket(url, options), private options: SpeechOptions = { language: 'auto', silenceMs: 500 }) {}
  start() { this.connect(); }
  private connect() {
    if (this.stopped) return;
    this.callbacks.usage?.({ connection: true });
    this.ready = false; this.segment = 0; this.segmentStart = this.offset + this.audioSeconds;
    const epoch = ++this.epoch;
    this.callbacks.state('connecting');
    const params = new URLSearchParams({ model_id: 'scribe_v2_realtime', audio_format: 'pcm_24000', commit_strategy: 'vad', vad_silence_threshold_secs: String(this.options.silenceMs / 1000) });
    if (this.options.language !== 'auto') params.set('language_code', this.options.language);
    const socket = this.socket = this.createSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`, { headers: { 'xi-api-key': this.key }, handshakeTimeout: 10000 });
    let terminal = false;
    this.readyTimer = setTimeout(() => { if (!this.ready && !this.stopped) socket.terminate(); }, 12000);
    socket.on('message', buffer => {
      try {
        const message = JSON.parse(buffer.toString());
        if (message.message_type === 'session_started') {
          clearTimeout(this.readyTimer);
          if (this.stopped) { socket.close(); return; }
          this.ready = true; this.retries = 0; this.callbacks.state('listening'); return;
        }
        if (message.message_type === 'partial_transcript' || message.message_type === 'committed_transcript') {
          if (typeof message.text !== 'string') return;
          const final = message.message_type === 'committed_transcript';
          const key = `${this.meetingId}:elevenlabs:${epoch}:${this.segment}`;
          const end = this.offset + this.audioSeconds;
          const text = message.text.trim();
          this.callbacks.packet(key, text ? [{ id: `${key}:0`, meetingId: this.meetingId, speakerId: `${this.meetingId}:elevenlabs:unknown`, text, start: this.segmentStart, end, final, receivedAt: Date.now() }] : []);
          if (final) { this.segment++; this.segmentStart = end; if (this.stopped) socket.close(); }
          return;
        }
        // Never echo provider error payloads, which may contain account details.
        if (typeof message.error === 'string') {
          const type = message.message_type;
          terminal = ['auth_error', 'quota_exceeded', 'input_error', 'invalid_request', 'invalid_request_error', 'chunk_size_exceeded'].includes(type);
          this.callbacks.error(type === 'auth_error' ? 'ElevenLabs отклонил ключ. Проверьте ключ и доступ к Speech to Text.' : type === 'quota_exceeded' ? 'Исчерпан лимит ElevenLabs. Проверьте баланс аккаунта.' : type === 'rate_limited' ? 'Достигнут лимит запросов ElevenLabs. Повторю подключение.' : 'Ошибка распознавания ElevenLabs. Проверьте подключение и настройки аккаунта.');
          socket.close();
        }
      } catch { this.callbacks.error('ElevenLabs вернул неожиданный ответ.'); }
    });
    socket.on('unexpected-response', (_request, response) => {
      terminal = [400, 401, 402, 403, 422].includes(response.statusCode ?? 0); response.resume();
      this.callbacks.error(terminal ? 'ElevenLabs отклонил подключение. Проверьте ключ, доступ к Speech to Text и баланс.' : 'ElevenLabs недоступен. Восстанавливаю соединение.'); socket.terminate();
    });
    socket.on('error', () => { if (!this.stopped && !terminal) this.callbacks.error('ElevenLabs недоступен. Восстанавливаю соединение.'); });
    socket.on('close', code => {
      clearTimeout(this.readyTimer); this.ready = false; this.callbacks.usage?.({ status: terminal || (!this.stopped && code !== 1000) ? 'failed' : 'completed' });
      if (this.stopped) return;
      this.callbacks.gap();
      if (terminal || this.retries >= 5) { this.callbacks.state('failed'); return; }
      this.callbacks.state('reconnecting');
      this.retryTimer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retries++));
    });
  }
  send(audio: Buffer, _capturedAt?: number) {
    if (!this.stopped && this.ready && this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 96000) {
      this.audioSeconds += audio.length / 48000;
      this.socket.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: audio.toString('base64'), sample_rate: 24000 })); this.callbacks.usage?.({ audioSeconds: audio.length / 48000 });
    }
  }
  async stop() {
    this.stopped = true; clearTimeout(this.retryTimer); clearTimeout(this.readyTimer);
    const socket = this.socket; if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { socket.terminate(); resolve(); }, 1500);
      socket.once('close', () => { clearTimeout(timeout); resolve(); });
      if (this.ready && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', sample_rate: 24000, commit: true }));
      else socket.terminate();
    });
  }
}

export const demoLines = [
  { speaker: 0, text: 'Давайте обсудим помощника для встречи. Он должен слушать разговор и показывать текст сразу.' },
  { speaker: 1, text: 'А как мы будем отличать говорящих? Что такое диаризация?' },
  { speaker: 0, text: 'Каждому голосу дадим метку. Имена участников можно будет указать вручную.' },
  { speaker: 1, text: 'Мне важно, чтобы ответы появлялись быстро. Как сократить задержку в потоке?' },
  { speaker: 0, text: 'Сначала короткая подсказка, затем уточнение по документам. Поиск не должен останавливать речь.' },
];
export class DemoSpeech implements SpeechProvider {
  readonly supportsSpeakers = true;
  private timers: NodeJS.Timeout[] = [];
  constructor(private meetingId: string, private callbacks: SpeechCallbacks, private offset = 0, private nextLine = 0) {}
  start() {
    this.callbacks.state('demo');
    demoLines.slice(this.nextLine).forEach((line, relativeIndex) => {
      const index = this.nextLine + relativeIndex; const key = `${this.meetingId}:demo:${index}`;
      for (const final of [false, true]) this.timers.push(setTimeout(() => this.callbacks.packet(key, [{ id: `${key}:0`, meetingId: this.meetingId, speakerId: `${this.meetingId}:demo:speaker:${line.speaker}`, text: final ? line.text : line.text.slice(0, Math.round(line.text.length * 0.6)), start: index * 5, end: index * 5 + 4, final, receivedAt: Date.now() }]), relativeIndex * 5000 + (final ? 1600 : 700)));
    });
  }
  send(_audio: Buffer) {}
  async stop() { this.timers.forEach(clearTimeout); this.timers = []; }
}

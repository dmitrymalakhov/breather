import { t } from './i18n';
export class Microphone {
  private stream?: MediaStream; private context?: AudioContext; private node?: AudioWorkletNode; private stopped = false;
  async start(deviceId: string, send: (audio: ArrayBuffer, capturedAt: number) => void, level: (value: number) => void, lost: () => void) {
    this.stopped = false;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Для микрофона откройте приложение в Chrome по локальному адресу."));
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    try {
      this.context = new AudioContext(); await this.context.audioWorklet.addModule('/audio-worklet.js');
      if (this.stopped) { await this.stop(); return; }
      this.node = new AudioWorkletNode(this.context, 'sufler-capture');
      this.node.port.onmessage = event => { if (!this.stopped) { send(event.data.audio, event.data.capturedAt); level(event.data.level); } };
      this.context.createMediaStreamSource(stream).connect(this.node); this.node.connect(this.context.destination); await this.context.resume();
      for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => { if (!this.stopped) lost(); });
      this.context.onstatechange = () => { if (!this.stopped && this.context?.state === 'suspended') lost(); };
    } catch (error) { await this.stop(); throw error; }
  }
  async stop() { this.stopped = true; this.node?.disconnect(); if (this.node) this.node.port.onmessage = null; this.stream?.getTracks().forEach(track => track.stop()); if (this.context && this.context.state !== 'closed') await this.context.close(); this.node = undefined; this.context = undefined; this.stream = undefined; }
}

// Stateful linear resampling: preserve phase between render quanta at 44.1/48 kHz.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 24000; this.phase = 0; this.carry = []; this.packet = new Int16Array(2400); this.index = 0; this.energy = 0; }
  process(inputs) {
    const channels = inputs[0]; if (!channels || !channels.length) return true;
    const input = channels[0];
    const mono = new Float32Array(input.length);
    for (const channel of channels) for (let i = 0; i < input.length; i++) mono[i] += channel[i] / channels.length;
    const samples = this.carry.concat(Array.from(mono));
    while (this.phase + 1 < samples.length) {
      const position = Math.floor(this.phase); const fraction = this.phase - position;
      const value = samples[position] * (1 - fraction) + samples[position + 1] * fraction;
      this.packet[this.index++] = Math.round(Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767)); this.energy += value * value;
      this.phase += this.ratio;
      if (this.index === 2400) {
        const audio = this.packet.buffer; this.port.postMessage({ audio, level: Math.min(1, Math.sqrt(this.energy / 2400) * 4), capturedAt: Date.now() }, [audio]);
        this.packet = new Int16Array(2400); this.index = 0; this.energy = 0;
      }
    }
    const consumed = Math.floor(this.phase); this.carry = samples.slice(consumed); this.phase -= consumed;
    // Outputs intentionally remain silent; there is no microphone playback.
    return true;
  }
}
registerProcessor('sufler-capture', CaptureProcessor);

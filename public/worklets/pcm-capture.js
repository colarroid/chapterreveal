// Runs on the audio thread. Downsamples the input to 16 kHz mono, converts
// to 16-bit PCM, and posts 40 ms chunks with the chunk's level so the
// dashboard can draw the meter from the same stream it transcribes.

const TARGET_RATE = 16000;
// 40 ms: small enough that the transcriber hears each word almost as it is
// said, large enough to keep per-message overhead low.
const CHUNK = TARGET_RATE / 25;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0; // fractional read position into the incoming stream
    this.acc = 0; // running sum for the current output sample
    this.accN = 0;
    this.out = new Int16Array(CHUNK);
    this.outN = 0;
    this.sumSq = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    const ch1 = input[1];

    for (let i = 0; i < ch0.length; i++) {
      // Mix stereo desk feeds down to mono.
      const s = ch1 ? (ch0[i] + ch1[i]) / 2 : ch0[i];
      const a = Math.abs(s);
      if (a > this.peak) this.peak = a;
      this.sumSq += s * s;

      // Box-filter downsample: average every `ratio` input samples.
      this.acc += s;
      this.accN += 1;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.accN));
        this.out[this.outN++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.acc = 0;
        this.accN = 0;
        if (this.outN === CHUNK) this.flush();
      }
    }
    return true;
  }

  flush() {
    const pcm = this.out.slice(0, this.outN);
    const rms = Math.sqrt(this.sumSq / (this.outN * this.ratio));
    this.port.postMessage({ pcm: pcm.buffer, rms, peak: this.peak }, [pcm.buffer]);
    this.outN = 0;
    this.sumSq = 0;
    this.peak = 0;
  }
}

registerProcessor("pcm-capture", PcmCapture);

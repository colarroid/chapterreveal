"use client";

export interface AudioInput {
  deviceId: string;
  label: string;
}

/** Input devices. Labels are blank until the page has mic permission once. */
export async function listInputs(): Promise<AudioInput[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));
}

/** Asks for mic permission so device names show up in the picker. */
export async function unlockInputLabels(): Promise<void> {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
}

export interface Capture {
  stop(): void;
}

export interface CaptureHandlers {
  onChunk(pcm: ArrayBuffer): void;
  onLevel(rms: number, peak: number): void;
}

/**
 * Opens an input and streams 16 kHz PCM chunks. Browser voice processing is
 * switched off: a desk feed is already clean, and echo cancellation or
 * noise suppression would only mangle the preacher's voice.
 */
export async function startCapture(deviceId: string | undefined, h: CaptureHandlers): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
  });
  // Run the audio graph at the desk feed's own rate. Firefox refuses to
  // connect an input whose rate differs from the AudioContext's (a 44.1 kHz
  // interface on a 48 kHz system, say); Chrome would resample silently. The
  // worklet downsamples to 16 kHz from whatever rate it gets.
  const inputRate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext(inputRate ? { latencyHint: "interactive", sampleRate: inputRate } : { latencyHint: "interactive" });
  } catch {
    ctx = new AudioContext({ latencyHint: "interactive" });
  }
  await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number; peak: number }>) => {
    h.onLevel(e.data.rms, e.data.peak);
    h.onChunk(e.data.pcm);
  };
  source.connect(node);
  // Capture only starts from the Start service click, so resume() succeeds.
  // Still, never let a pending resume() hang Start.
  if (ctx.state === "suspended") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 300))]);

  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

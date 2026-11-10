// Stronger noise suppression for the mic: RNNoise (a small neural network,
// compiled to wasm) running in an AudioWorklet. It removes steady background
// noise like fans, hiss and hum better than the browser's built-in filter,
// which stays on underneath it. Setting stored per-browser.
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

const STORAGE_KEY = 'knappchat.noiseSuppression';
// RNNoise is trained on 48 kHz audio
export const NOISE_SAMPLE_RATE = 48000;

export function loadNoiseSuppression(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

const listeners = new Set<(enabled: boolean) => void>();

export function saveNoiseSuppression(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // storage unavailable (private mode etc.) - setting lasts for this tab only
  }
  listeners.forEach((listener) => listener(enabled));
}

export function onNoiseSuppressionChange(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

let wasmBinary: Promise<ArrayBuffer> | null = null;
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

async function prepare(ctx: AudioContext): Promise<ArrayBuffer> {
  wasmBinary ??= loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath });
  if (!workletLoaded.has(ctx)) workletLoaded.set(ctx, ctx.audioWorklet.addModule(rnnoiseWorkletPath));
  const [binary] = await Promise.all([wasmBinary, workletLoaded.get(ctx)]);
  return binary;
}

// LiveKit calls init() with the raw mic track and sends processedTrack instead
export class RnnoiseProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = 'rnnoise';
  processedTrack?: MediaStreamTrack;
  private source?: MediaStreamAudioSourceNode;
  private node?: RnnoiseWorkletNode;

  async init({ track, audioContext }: AudioProcessorOptions) {
    const binary = await prepare(audioContext);
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.node = new RnnoiseWorkletNode(audioContext, { wasmBinary: binary, maxChannels: 1 });
    const destination = audioContext.createMediaStreamDestination();
    this.source.connect(this.node).connect(destination);
    this.processedTrack = destination.stream.getAudioTracks()[0];
  }

  // the mic device changed
  async restart(opts: AudioProcessorOptions) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.node?.destroy();
    this.processedTrack?.stop();
    this.source = this.node = this.processedTrack = undefined;
  }
}

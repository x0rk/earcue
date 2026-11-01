// Small bridge so UI code can turn stored samples into AudioBuffers without importing the engine directly.
import { sampleToBuffer } from './engine.js';

export { PREVIEW_SR, samples } from './samples.js';

export const sampleToBufferSafe = (ctx, sample) => sampleToBuffer(ctx, sample, false);

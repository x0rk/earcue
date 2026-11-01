import { vi } from 'vitest';
import { mulberry32 } from '../src/engine/engine.js';

// Ids, noise seeds and reverb seeds all come from Math.random. A fixed sequence makes every render,
// and so every measurement, the same from run to run.
export function seedRandom(seed = 1) {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
}

// Imports generated module source as an ES module, the way an app imports an exported file.
export const importSource = (src) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

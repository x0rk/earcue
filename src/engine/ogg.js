// Ogg Vorbis encoding, using libvorbis compiled to WebAssembly. This module is loaded the first time
// someone exports an OGG, so the encoder's 450 KB binary never slows down opening the editor.
import { createEncoder } from 'wasm-media-encoders/esnext';
import oggWasmUrl from 'wasm-media-encoders/wasm/ogg?url';

// Vorbis quality runs from -1 to 10. Pure tones come through clean from 8 up, and since most of a
// short OGG is the codec's header, 8 costs a few hundred bytes more than the usual 6.
const VORBIS_QUALITY = 8;

let encoder = null;

export async function encodeOgg(channels, sampleRate) {
  encoder ||= createEncoder('audio/ogg', oggWasmUrl).catch((e) => {
    encoder = null;
    throw e;
  });
  const enc = await encoder;
  enc.configure({ channels: channels.length, sampleRate, vbrQuality: VORBIS_QUALITY });
  // Both calls return views into the encoder's memory, which the next call reuses, so each is copied.
  const body = enc.encode(channels).slice();
  const tail = enc.finalize().slice();
  const out = new Uint8Array(body.length + tail.length);
  out.set(body);
  out.set(tail, body.length);
  return out;
}

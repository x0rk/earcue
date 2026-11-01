import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../src/engine/engine.js';
import { makeZip, patchJson, slug } from '../src/engine/export.js';
import { starterSounds } from '../src/engine/model.js';

// io.js imports the store, which reads the page URL as it loads, so a stub window stands in. This file
// runs in Node rather than jsdom because readZip inflates through Blob.stream(), which jsdom's Blob lacks.
vi.stubGlobal('window', { location: { search: '' } });
const { readZip } = await import('../src/io.js');

const enc = new TextEncoder();
const text = (bytes) => new TextDecoder().decode(bytes);
const contents = (files) => files.map((f) => [f.name, text(f.data)]);
const projects = () => [
  ...starterSounds()
    .slice(0, 2)
    .map((p) => ({ name: `projects/${slug(p.name)}.json`, data: enc.encode(patchJson(p)) })),
  { name: 'projects/über.json', data: enc.encode(patchJson({ ...starterSounds()[3], name: 'Über' })) },
];

async function deflateRaw(data) {
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

// The kind of zip system tools make: makeZip's layout, with each entry deflated and its headers saying
// so, with method 8 and the CRC and size of the uncompressed data.
async function deflatedZip(files) {
  const packed = await Promise.all(files.map(async (f) => ({ ...f, deflated: await deflateRaw(f.data) })));
  const zip = new Uint8Array(await makeZip(packed.map((f) => ({ name: f.name, data: f.deflated }))).arrayBuffer());
  const v = new DataView(zip.buffer);
  let local = 0;
  let central = v.getUint32(zip.length - 6, true);
  for (const f of packed) {
    const nameLength = enc.encode(f.name).length;
    for (const [at, method, crc, size] of [
      [local, 8, 14, 22],
      [central, 10, 16, 24],
    ]) {
      v.setUint16(at + method, 8, true);
      v.setUint32(at + crc, crc32(f.data), true);
      v.setUint32(at + size, f.data.length, true);
    }
    local += 30 + nameLength + f.deflated.length;
    central += 46 + nameLength;
  }
  return zip;
}

describe('readZip', () => {
  it('reads the stored zips the app writes', async () => {
    const files = projects();
    const zip = new Uint8Array(await makeZip(files).arrayBuffer());
    expect(contents(await readZip(zip))).toEqual(contents(files));
  });

  it('inflates deflated entries, as system zip tools write them', async () => {
    const files = projects();
    const zip = await deflatedZip(files);
    expect(zip.length).toBeLessThan(files.reduce((n, f) => n + f.data.length, 0));
    expect(contents(await readZip(zip))).toEqual(contents(files));
  });

  it('throws on bytes that are not a zip', async () => {
    const next = mulberry32(7);
    await expect(readZip(Uint8Array.from({ length: 4096 }, () => Math.floor(next() * 256)))).rejects.toThrow();
    await expect(readZip(new Uint8Array(0))).rejects.toThrow();
  });
});

// Web Audio graph builders. This file is also embedded verbatim (minus `export`) in the
// JavaScript module users export, so it must only reference its own declarations and Math.

export const MATERIALS = {
  bar: [1, 2.756, 5.404, 8.933, 13.344],
  glass: [1, 2.32, 4.25, 6.63, 9.38],
  wood: [1, 1.58, 3.56, 4.4, 6.9],
  membrane: [1, 1.593, 2.136, 2.296, 2.653],
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export function t60ToTau(ms) {
  return Math.max(0.0001, ms / 1000 / 6.91);
}

export function clampHz(ctx, f) {
  return Math.min(Math.max(f, 10), ctx.sampleRate * 0.45);
}

export function applyEnvelope(param, t, attackMs, peak, holdMs, decayMs) {
  const a = Math.max(0.0001, attackMs / 1000);
  const h = Math.max(0, holdMs / 1000);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (h > 0) param.setValueAtTime(peak, t + a + h);
  param.setTargetAtTime(0, t + a + h, t60ToTau(decayMs));
  return t + a + h + decayMs / 1000;
}

export function makeNoiseBuffer(ctx, seconds, color, seed) {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    if (color === 'pink') {
      // Paul Kellet's refined pink noise filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

export function driveCurve(amount) {
  const k = 1 + amount * 14;
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

// Each reverb type shapes the same filtered noise: a room fades evenly, a hall darkens as it fades, a
// plate stays bright and dense, and a spring repeats a short flutter like its coil. Reverse plays the
// tail backwards, so the reverb swells up.
export const REVERB_FADE = { room: 2.5, hall: 1.6, plate: 3.2, spring: 2.2 };
const SPRING_ECHO_S = 0.031;
const SPRING_ECHO_GAIN = 0.45;

export function makeImpulse(ctx, seconds, damping, seed, type, reverse) {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const coef = 1 - Math.min(0.97, damping * 0.95);
  const fade = REVERB_FADE[type] || REVERB_FADE.room;
  const echo = Math.round(SPRING_ECHO_S * ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = mulberry32((seed + ch * 7919) >>> 0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const c = type === 'hall' ? coef * (1 - 0.8 * p) + 0.01 : type === 'plate' ? Math.min(1, coef * 1.6) : coef;
      lp += c * (rnd() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - p, fade);
      if (type === 'spring' && i >= echo) d[i] += d[i - echo] * SPRING_ECHO_GAIN;
    }
    if (reverse) d.reverse();
  }
  return buf;
}

// ---------- effects ----------
// Built only from the browser's own nodes, so exported code plays them with no libraries. Dynamics
// use a level detector driving a gain instead of DynamicsCompressorNode, whose 6 ms lookahead would
// make a UI sound land late.
const FX_TAIL_S = 0.5;
const curveSize = 2048;

function rectifierCurve() {
  const c = new Float32Array(curveSize);
  for (let i = 0; i < curveSize; i++) c[i] = Math.abs((i / (curveSize - 1)) * 2 - 1);
  return c;
}

function gainCurve(thresholdDb, ratio) {
  const c = new Float32Array(curveSize);
  const thr = dbToGain(thresholdDb);
  for (let i = 0; i < curveSize; i++) {
    const level = Math.abs((i / (curveSize - 1)) * 2 - 1);
    c[i] = level > thr ? Math.pow(thr / level, 1 - 1 / ratio) : 1;
  }
  return c;
}

export function buildDynamics(ctx, input, thresholdDb, ratio, smoothMs) {
  const rect = ctx.createWaveShaper();
  rect.curve = rectifierCurve();
  const env = ctx.createBiquadFilter();
  env.type = 'lowpass';
  env.frequency.value = clampHz(ctx, 1000 / (2 * Math.PI * Math.max(0.1, smoothMs)));
  env.Q.value = 0.5;
  const computer = ctx.createWaveShaper();
  computer.curve = gainCurve(thresholdDb, ratio);
  const vca = ctx.createGain();
  vca.gain.value = 0;
  input.connect(vca);
  input.connect(rect);
  rect.connect(env);
  env.connect(computer);
  computer.connect(vca.gain);
  return vca;
}

function lfoGain(ctx, rate, amount, t, stop) {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = amount;
  o.connect(g);
  o.start(t);
  o.stop(stop);
  return g;
}

function blend(ctx, input, wet, mix, out) {
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix / 2;
  input.connect(dry);
  dry.connect(out);
  const w = ctx.createGain();
  w.gain.value = mix;
  wet.connect(w);
  w.connect(out);
  return out;
}

function crushCurve(bits) {
  const steps = Math.pow(2, bits) / 2;
  const c = new Float32Array(curveSize * 4);
  for (let i = 0; i < c.length; i++) c[i] = Math.round(((i / (c.length - 1)) * 2 - 1) * steps) / steps;
  return c;
}

export function buildEffect(ctx, input, fx, t, stop) {
  const out = ctx.createGain();
  if (fx.type === 'eq') {
    let node = input;
    for (const [type, freq, gain] of [
      ['lowshelf', 200, fx.low],
      ['peaking', fx.midFreq, fx.mid],
      ['highshelf', 6000, fx.high],
    ]) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = clampHz(ctx, freq);
      f.Q.value = 1;
      f.gain.value = gain;
      node.connect(f);
      node = f;
    }
    node.connect(out);
    return out;
  }
  if (fx.type === 'comp') {
    const makeup = ctx.createGain();
    makeup.gain.value = dbToGain(fx.makeup);
    buildDynamics(ctx, input, fx.threshold, fx.ratio, fx.speed).connect(makeup);
    return makeup;
  }
  if (fx.type === 'chorus') {
    const wet = ctx.createGain();
    for (const spread of [1, 1.17]) {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = 0.012 * spread;
      lfoGain(ctx, fx.rate * spread, fx.depth * 0.004, t, stop).connect(d.delayTime);
      input.connect(d);
      d.connect(wet);
    }
    const half = ctx.createGain();
    half.gain.value = 0.5;
    wet.connect(half);
    return blend(ctx, input, half, fx.mix, out);
  }
  if (fx.type === 'flanger') {
    const d = ctx.createDelay(0.02);
    d.delayTime.value = 0.002 + fx.depth * 0.003;
    lfoGain(ctx, fx.rate, fx.depth * 0.0018, t, stop).connect(d.delayTime);
    const fb = ctx.createGain();
    fb.gain.value = fx.feedback * 0.9;
    input.connect(d);
    d.connect(fb);
    fb.connect(d);
    return blend(ctx, input, d, fx.mix, out);
  }
  if (fx.type === 'phaser') {
    const sum = ctx.createGain();
    input.connect(sum);
    let node = sum;
    for (let k = 0; k < 4; k++) {
      const ap = ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 900;
      ap.Q.value = 0.6;
      lfoGain(ctx, fx.rate, fx.depth * 800, t, stop).connect(ap.frequency);
      node.connect(ap);
      node = ap;
    }
    // A loop in a Web Audio graph needs a delay in it, even a zero one.
    const loop = ctx.createDelay(0.01);
    loop.delayTime.value = 0;
    const fb = ctx.createGain();
    fb.gain.value = fx.feedback * 0.7;
    node.connect(loop);
    loop.connect(fb);
    fb.connect(sum);
    return blend(ctx, input, node, fx.mix, out);
  }
  if (fx.type === 'crush') {
    const ws = ctx.createWaveShaper();
    ws.curve = crushCurve(fx.bits);
    input.connect(ws);
    return blend(ctx, input, ws, fx.mix, out);
  }
  input.connect(out);
  return out;
}

export function buildEffects(ctx, input, effects, t, end) {
  let node = input;
  for (const fx of effects) if (fx.on) node = buildEffect(ctx, node, fx, t, end + FX_TAIL_S);
  return node;
}

export function sampleToBuffer(ctx, sample, reverse) {
  const len = sample.channels[0].length;
  const buf = ctx.createBuffer(sample.channels.length, len, sample.sampleRate);
  for (let c = 0; c < sample.channels.length; c++) {
    const src = sample.channels[c];
    const dst = buf.getChannelData(c);
    if (reverse) {
      for (let i = 0; i < len; i++) dst[i] = src[len - 1 - i];
    } else {
      dst.set(src);
    }
  }
  return buf;
}

export function buildSourceTone(ctx, out, L, t) {
  const nodes = [];
  const pitchParams = [];
  const voices = Math.max(1, Math.round(L.voices));
  const glideEnd = t + L.glide / 1000;
  let fmOut = null;
  if (L.fmIndex > 0) {
    const fm = ctx.createOscillator();
    fm.type = 'sine';
    fm.frequency.setValueAtTime(L.pitchStart * L.fmRatio, t);
    if (L.glide > 0) fm.frequency.exponentialRampToValueAtTime(Math.max(1, L.pitchEnd * L.fmRatio), glideEnd);
    fmOut = ctx.createGain();
    fmOut.gain.setValueAtTime(L.fmIndex * L.pitchStart * L.fmRatio, t);
    fmOut.gain.setTargetAtTime(0, t, t60ToTau(L.fmDecay));
    fm.connect(fmOut);
    nodes.push(fm);
    pitchParams.push(fm.detune);
  }
  for (let v = 0; v < voices; v++) {
    const o = ctx.createOscillator();
    o.type = L.wave;
    o.frequency.setValueAtTime(L.pitchStart, t);
    if (L.glide > 0) o.frequency.exponentialRampToValueAtTime(Math.max(1, L.pitchEnd), glideEnd);
    o.detune.setValueAtTime(voices > 1 ? (v / (voices - 1) - 0.5) * 2 * L.detune : 0, t);
    if (fmOut) fmOut.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = 1 / Math.sqrt(voices);
    o.connect(g);
    g.connect(out);
    nodes.push(o);
    pitchParams.push(o.detune);
  }
  nodes.forEach((n) => n.start(t));
  return { pitchParams, stop: (at) => nodes.forEach((n) => n.stop(at)) };
}

export function buildSourceNoise(ctx, out, L, t) {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, (L.attack + L.hold + L.decay) / 1000 + 0.05, L.color, L.seed);
  src.connect(out);
  src.start(t);
  return { pitchParams: [], stop: (at) => src.stop(at) };
}

export function buildSourceModal(ctx, out, L, t) {
  const ratios = MATERIALS[L.material] || MATERIALS.bar;
  const nodes = [];
  const pitchParams = [];
  const count = Math.min(Math.round(L.partials), ratios.length);
  for (let k = 0; k < count; k++) {
    const f = L.freq * ratios[k];
    if (f > ctx.sampleRate * 0.45) break;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0;
    applyEnvelope(g.gain, t, 0.3, k === 0 ? 1 : Math.pow(L.brightness, k), 0, L.decay / (1 + L.damping * k * 1.5));
    o.connect(g);
    g.connect(out);
    o.start(t);
    nodes.push(o);
    pitchParams.push(o.detune);
  }
  if (L.strike > -60) {
    const s = ctx.createBufferSource();
    s.buffer = makeNoiseBuffer(ctx, 0.04, 'white', L.seed);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clampHz(ctx, L.freq * 3);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    applyEnvelope(g.gain, t, 0.2, dbToGain(L.strike), 0, 15);
    s.connect(bp);
    bp.connect(g);
    g.connect(out);
    s.start(t);
    nodes.push(s);
  }
  return { pitchParams, stop: (at) => nodes.forEach((n) => n.stop(at)) };
}

// How many seconds len seconds of audio take to play when the speed slides exponentially from r0 to
// r1 over g seconds and then holds at r1.
export function slideDuration(len, r0, r1, g) {
  if (!(g > 0) || r0 === r1) return len / r0;
  const k = Math.log(r1 / r0);
  const during = (g * (r1 - r0)) / k;
  if (len <= during) return (g / k) * Math.log(1 + (len * k) / (r0 * g));
  return g + (len - during) / r1;
}

export function sampleRates(L) {
  const r0 = Math.pow(2, L.pitch / 12);
  const slides = L.glide > 0 && L.slideTo !== L.pitch;
  return { r0, r1: slides ? Math.pow(2, L.slideTo / 12) : r0, g: slides ? L.glide / 1000 : 0 };
}

export function buildSourceSample(ctx, amp, L, t, env) {
  const sample = env && env.samples ? env.samples.get(L.sampleId) : null;
  if (!sample) return { end: t, pitchParams: [] };
  const buf = sampleToBuffer(ctx, sample, L.reverse);
  const offset = Math.min(buf.duration, Math.max(0, L.trimStart / 1000));
  const playLen = Math.max(0.001, buf.duration - offset - Math.max(0, L.trimEnd / 1000));
  const { r0, r1, g } = sampleRates(L);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(r0, t);
  if (g > 0) src.playbackRate.exponentialRampToValueAtTime(r1, t + g);
  src.connect(amp);
  const dur = slideDuration(playLen, r0, r1, g);
  const end = t + dur;
  // Fade in like a synth layer's attack, then fade out over the end of the clip, reaching -60 dB as it stops.
  const fi = Math.min(dur, L.fadeIn / 1000);
  const fo = Math.min(dur - fi, L.fadeOut / 1000);
  amp.gain.setValueAtTime(fi > 0 ? 0 : 1, t);
  if (fi > 0) amp.gain.linearRampToValueAtTime(1, t + fi);
  if (fo > 0) {
    amp.gain.setValueAtTime(1, end - fo);
    amp.gain.setTargetAtTime(0, end - fo, t60ToTau(fo * 1000));
  }
  amp.gain.setValueAtTime(0, end);
  src.start(t, offset, playLen);
  return { end, pitchParams: [src.detune] };
}

export function buildLayer(ctx, bus, L, t, env) {
  const amp = ctx.createGain();
  amp.gain.value = 0;
  let end;
  let pitchParams;
  if (L.type === 'sample') {
    const r = buildSourceSample(ctx, amp, L, t, env);
    end = r.end;
    pitchParams = r.pitchParams;
  } else {
    const r =
      L.type === 'tone'
        ? buildSourceTone(ctx, amp, L, t)
        : L.type === 'noise'
          ? buildSourceNoise(ctx, amp, L, t)
          : buildSourceModal(ctx, amp, L, t);
    pitchParams = r.pitchParams;
    if (L.type === 'modal') {
      // Partials carry their own decays; the layer envelope only shapes the attack.
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(1, t + Math.max(0.0001, L.attack / 1000));
      end = t + (L.attack + L.decay) / 1000;
    } else {
      end = applyEnvelope(amp.gain, t, L.attack, 1, L.hold, L.decay);
    }
    r.stop(end + 0.02);
  }
  let node = amp;
  let filter = null;
  if (L.filter.type !== 'none') {
    filter = ctx.createBiquadFilter();
    filter.type = L.filter.type;
    filter.Q.value = L.filter.q;
    const base = clampHz(ctx, L.filter.freq);
    if (L.filter.envAmt !== 0 && L.filter.envTime > 0) {
      filter.frequency.setValueAtTime(clampHz(ctx, base * Math.pow(2, L.filter.envAmt)), t);
      filter.frequency.exponentialRampToValueAtTime(base, t + L.filter.envTime / 1000);
    } else {
      filter.frequency.setValueAtTime(base, t);
    }
    node.connect(filter);
    node = filter;
  }
  if (L.drive > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(L.drive);
    // Oversampling delays the output by 2.7 to 4 ms, which makes a tap feel late; the curve is gentle enough without it.
    ws.oversample = 'none';
    node.connect(ws);
    node = ws;
  }
  if (L.fx && L.fx.length) node = buildEffects(ctx, node, L.fx, t, end);
  let trem = null;
  if (L.lfo.target === 'amp' && L.lfo.depth > 0) {
    trem = ctx.createGain();
    trem.gain.value = 1 - L.lfo.depth / 2;
    node.connect(trem);
    node = trem;
  }
  const level = ctx.createGain();
  level.gain.value = dbToGain(L.level);
  node.connect(level);
  const pan = ctx.createStereoPanner();
  pan.pan.value = L.pan;
  level.connect(pan);
  pan.connect(bus.input);
  if (bus.reverb && L.reverbSend > 0) {
    const s = ctx.createGain();
    s.gain.value = L.reverbSend;
    pan.connect(s);
    s.connect(bus.reverb);
  }
  if (bus.delay && L.delaySend > 0) {
    const s = ctx.createGain();
    s.gain.value = L.delaySend;
    pan.connect(s);
    s.connect(bus.delay);
  }
  if (L.lfo.target !== 'off' && L.lfo.depth > 0) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = L.lfo.rate;
    const depth = ctx.createGain();
    lfo.connect(depth);
    if (L.lfo.target === 'pitch') {
      depth.gain.value = L.lfo.depth * 100;
      pitchParams.forEach((p) => depth.connect(p));
    } else if (L.lfo.target === 'filter' && filter) {
      depth.gain.value = L.lfo.depth * 2400;
      depth.connect(filter.detune);
    } else if (L.lfo.target === 'amp' && trem) {
      depth.gain.value = L.lfo.depth / 2;
      depth.connect(trem.gain);
    }
    lfo.start(t);
    lfo.stop(end + 0.02);
  }
  return end;
}

// The limiter rounds off what rises above the threshold the moment it happens. A limiter that reacts
// to the level would let a UI sound's first, loudest peak through, and lookahead would make it late.
function limitCurve(limitDb) {
  const t = dbToGain(-limitDb);
  const c = new Float32Array(curveSize * 4);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= t ? a : t + (1 - t) * Math.tanh((a - t) / (1 - t)));
  }
  return c;
}

export function buildMaster(ctx, M, seed) {
  const input = ctx.createGain();
  let node = input;
  const chain = (n) => {
    node.connect(n);
    node = n;
  };
  const biquad = (type, freq, q, gain) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = clampHz(ctx, freq);
    f.Q.value = q;
    f.gain.value = gain;
    return f;
  };
  chain(biquad('highpass', M.hpf, 0.707, 0));
  chain(biquad('lowpass', M.lpf, 0.707, 0));
  if (M.low !== 0) chain(biquad('lowshelf', 250, 0.707, M.low));
  if (M.presence !== 0) chain(biquad('peaking', M.presenceFreq, 1, M.presence));
  if (M.air !== 0) chain(biquad('highshelf', 8000, 0.707, M.air));
  if (M.compOn) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = M.compThreshold;
    c.ratio.value = M.compRatio;
    c.attack.value = M.compAttack / 1000;
    c.release.value = M.compRelease / 1000;
    c.knee.value = 6;
    chain(c);
    const makeup = ctx.createGain();
    makeup.gain.value = dbToGain(M.compMakeup);
    chain(makeup);
  }
  if (M.drive > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(M.drive);
    ws.oversample = 'none';
    chain(ws);
  }
  if (M.limit > 0) {
    // limitRef is the sound's own peak without the limiter, so the threshold sits below that peak
    // however loud the layers are before the final level is set.
    const pre = ctx.createGain();
    pre.gain.value = 1 / Math.max(1e-6, M.limitRef || 1);
    chain(pre);
    const ws = ctx.createWaveShaper();
    ws.curve = limitCurve(M.limit);
    ws.oversample = 'none';
    chain(ws);
  }
  const output = ctx.createGain();
  node.connect(output);
  let reverb = null;
  let delay = null;
  if (M.reverbMix > 0) {
    reverb = ctx.createGain();
    const pre = ctx.createDelay(1);
    pre.delayTime.value = M.reverbPredelay / 1000;
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = makeImpulse(ctx, M.reverbSize, M.reverbDamping, seed, M.reverbType, M.reverbReverse);
    const ret = ctx.createGain();
    ret.gain.value = M.reverbMix;
    reverb.connect(pre);
    pre.connect(conv);
    conv.connect(ret);
    ret.connect(input);
  }
  if (M.delayMix > 0) {
    delay = ctx.createGain();
    const d = ctx.createDelay(2);
    d.delayTime.value = M.delayTime / 1000;
    const fb = ctx.createGain();
    fb.gain.value = M.delayFeedback;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = clampHz(ctx, M.delayTone);
    const ret = ctx.createGain();
    ret.gain.value = M.delayMix;
    delay.connect(d);
    d.connect(tone);
    tone.connect(fb);
    fb.connect(d);
    tone.connect(ret);
    ret.connect(input);
  }
  return { input, output, reverb, delay };
}

export function scheduleSound(ctx, patch, when, destination, env) {
  const bus = buildMaster(ctx, patch.master, patch.seed >>> 0);
  bus.output.connect(destination);
  const anySolo = patch.layers.some((l) => l.on && l.solo);
  let end = when;
  for (const L of patch.layers) {
    if (!L.on || (anySolo && !L.solo)) continue;
    end = Math.max(end, buildLayer(ctx, bus, L, when + L.start / 1000, env));
  }
  return end;
}

export function varyPatch(patch, cents) {
  if (!cents) return patch;
  const r = Math.pow(2, cents / 1200);
  return Object.assign({}, patch, {
    layers: patch.layers.map((L) => {
      if (L.type === 'tone') return Object.assign({}, L, { pitchStart: L.pitchStart * r, pitchEnd: L.pitchEnd * r });
      if (L.type === 'modal') return Object.assign({}, L, { freq: L.freq * r });
      if (L.type === 'sample') return Object.assign({}, L, { pitch: L.pitch + cents / 100, slideTo: L.slideTo + cents / 100 });
      return L;
    }),
  });
}

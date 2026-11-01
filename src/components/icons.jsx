import { AudioWaveform, FileAudio, Hammer, Wind } from 'lucide-react';

const LAYER_ICONS = { tone: AudioWaveform, noise: Wind, modal: Hammer, sample: FileAudio };

export function LayerIcon({ type, className }) {
  const Icon = LAYER_ICONS[type] || AudioWaveform;
  return <Icon className={className} aria-hidden="true" />;
}

const WAVE_PATHS = {
  sine: 'M1 7C3 1 5 1 7 7S11 13 13 7',
  triangle: 'M1 7 4 2 10 12 13 7',
  square: 'M1 10V4h6v6h6V4',
  sawtooth: 'M1 11 7 3v8l6-8',
};

export function WaveIcon({ wave }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0">
      <path d={WAVE_PATHS[wave]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoMark({ className }) {
  // The mark is a sound envelope: an instant rise and a long fade, like the handles in the timeline.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M7.4 23 11 8.6C12.3 17.2 16.2 22.1 24.8 23Z" fill="var(--panel)" stroke="var(--panel)" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

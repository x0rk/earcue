# Earcue

Design the sounds your interface makes.

Earcue is a free, open-source editor for UI sounds: taps, toggles, message sends, successes and errors. Build a sound from layers, shape it on a timeline, compare it with another sound, and export a WAV file or a few lines of JavaScript that play it with no audio file at all.

It is made for designers and engineers who have never used audio software. Every control says what it does in plain words, and pointing at one explains it.

**Use it at [earcue.vercel.app](https://earcue.vercel.app).** Everything runs in your browser.

## What you can do

- **Start from a template** (Thock, Pop, Toggle, Success, Error, Keycap and more) or from a blank sound.
- **Stack layers:** a tone you can slide and shape, noise for clicks and air, a struck object made of metal, glass, wood or drum skin, and your own audio files or microphone recordings.
- **Shape each layer on the timeline.** Drag its block to move it. Drag its dots to set how fast it starts, how loud it is and how long it lasts.
- **Refine it** with filters and sweeps, wobble (vibrato and tremolo), grit, room and echo, tone shaping and a loudness target.
- **Compare** with another sound or any audio file. The waveforms and frequency charts overlay, and the measurements sit side by side: length, start delay, peak, average loudness, brightness and bass.
- **Keep a sound set** for your product, and export the whole set in one go.

## Export

| Format | What you get |
|---|---|
| Audio file | A WAV: mono or stereo, 44.1 or 48 kHz, 16 or 24-bit, normalized to your loudness target. |
| Code | A JavaScript module that plays the sound with the Web Audio API. No audio file needed. |
| Everything | A zip with the WAV, the code, the editable project and a README. |
| Project | A `.json` file you can open in Earcue again or share with someone. |
| Whole set | A zip with a WAV per sound and one `sounds.js` that plays any sound by name. |

Playing an exported sound:

```js
import { playSound } from './thock-light.js';

const audio = new AudioContext();
button.addEventListener('click', () => playSound(audio));
```

Playing a sound from an exported set:

```js
import { playSound, soundNames } from './sounds.js';

playSound('success', audio);
```

## Your data

Sounds are saved in your browser. Recordings and audio files are kept in your browser's storage too. Nothing is uploaded anywhere. To move work to another browser or person, export a project file.

## Run it locally

```bash
npm install
npm run dev
```

Recording from the microphone needs `localhost` or HTTPS.

## Contributing

Issues and pull requests are welcome. [CLAUDE.md](CLAUDE.md) explains how the code is organized, the UI copy rules, and the git workflow (branches, commit format and PR checks).

## License

[MIT](LICENSE)

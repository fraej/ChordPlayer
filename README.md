# 🎹 Chord Player

An interactive web app for exploring chord structures, voicings, and inversions — played on a sampled grand piano right in your browser.

![Screenshot](screenshot.png)

## Features

- **Root selection** via a compact piano keyboard with visual key highlighting.
- **Dynamic chord generation** — all chord types from Tonal.js, organised by category (triads → sevenths → extensions → altered).
- **Voicings & inversions** — close and open position voicings grouped by inversion, each playable with a click.
- **Smart pitch clamping** — higher inversions are automatically shifted down to stay in a comfortable, musical range (ceiling at C7).
- **88-key SVG keyboard** fixed at the bottom with real-time note highlighting, enharmonic resolution, and smooth scrolling to the active region.
- **Responsive layout** — the header row puts the title, root/octave controls, and note selector side-by-side; the bottom keyboard fully re-renders on window resize.
- **Status messaging** with loading progress for the piano samples.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | Vanilla CSS (Google Fonts — Pacifico) |
| Logic | Vanilla JavaScript (no build step) |
| Audio | [Tone.js](https://tonejs.github.io/) — Sampler with Salamander Grand Piano samples |
| Music Theory | [Tonal](https://github.com/tonaljs/tonal) — note, chord, and interval utilities |
| Keyboard | Custom SVG renderers (mini selector + full 88-key) |

## Getting Started

### Prerequisites

Just a modern browser. Audio samples stream from the Tone.js-hosted Salamander set — no local files needed.

### Run Locally

Clone or download the repository and serve over any static HTTP server:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080/` in your browser.

> [!TIP]
> You can also open `index.html` directly, but some browsers may block audio without an HTTP origin.

### Usage

1. Wait for the "Piano loaded" status message.
2. Select a root note on the mini keyboard (highlighted in red).
3. Click a chord button to hear it played immediately.
4. Open the floating voicing popup to explore inversions and open voicings.
5. Adjust the octave selector to shift the register.

## Project Structure

```
index.html      Main page
styles.css      Styling & layout
script.js       Application logic (chords, voicings, audio, 88-key keyboard)
keyboard.js     Reusable mini SVG keyboard class
LICENSE         GPLv3
```

## Keyboard Components

- **Mini Keyboard** — single-octave layout (7 white + 5 black keys) used for root note selection. Scales via CSS.
- **88-Key Keyboard** — dynamically sized SVG spanning the full viewport width; highlights sounding notes with enharmonic resolution (C♯ ↔ D♭). Fully re-renders on resize to maintain correct key proportions.

## Audio

Uses `Tone.Sampler` with a sparse sample map (A, C, D♯, F♯ across octaves) that Tone.js internally pitch-shifts. Release is set to 1 second. Playback only triggers after the audio context is resumed (satisfying browser autoplay policies).

## Development Notes

- **No build step** — edit files, refresh, done.
- Console logs are intentionally verbose during init & note mapping; safe to trim for production.
- Voicing generation uses a MIDI-ceiling approach (`MIDI 96 = C7`) to prevent inversions of extended chords from sounding too shrill.

## Potential Improvements

- Sustain pedal / envelope controls.
- MIDI input support (Web MIDI API).
- Export voicings as MusicXML or MIDI.
- Dark mode toggle.
- Touch-optimised multi-note input on the mini keyboard.
- Chord progression sequencer.

## License

Distributed under the **GNU General Public License v3.0**. See [`LICENSE`](LICENSE) for full terms.

## Attribution

- Piano samples: [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander/) (via Tone.js CDN)
- Libraries: [Tone.js](https://tonejs.github.io/), [Tonal](https://github.com/tonaljs/tonal)

## Contributing

Pull requests are welcome. For larger changes (architecture or feature additions), open an issue first to discuss scope & approach.

---

Enjoy exploring chords and voicings! 🎹

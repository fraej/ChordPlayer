# Chord Player

An interactive web app for exploring chord structures, voicings, and hearing them played on a sampled piano. It provides:

- A small selectable root keyboard (mini piano) to pick the chord root.
- A full 88‑key scrollable piano at the bottom that visually highlights currently sounding notes.
- Automatic chord list generation for a selected root.
- Voicing / inversion display and playback.
- Tone.js based sampler using the Salamander Grand Piano set.

## Features

- Root selection via compact piano UI with visual key highlighting.
- Dynamic chord button generation (extensions & quality labels).
- Multiple voicings / inversions grouped and playable.
- 88‑key SVG keyboard with real‑time highlighting of active notes (supports enharmonic fallback logic).
- Smooth scrolling to active pitch region.
- Status messaging for sample loading.

## Tech Stack

- **HTML/CSS/Vanilla JS** (no build step required)
- **Tone.js** for audio scheduling & sampler playback
- **Tonal** for music theory utilities (note / chord / interval logic)
- Custom **SVG keyboard** renderers (mini & fixed 88‑key) – no external canvas dependencies

## Getting Started

### Prerequisites
Just a modern browser. The audio samples stream from the Tone.js hosted Salamander set.

### Run Locally
Clone or download the repository and open `index.html` directly in a browser. For best results (and to avoid some browsers blocking audio), serve over a local HTTP server (any simple static server works) – e.g. with Python:

```bash
python -m http.server 8080
```
Then browse to `http://localhost:8080/` and open `index.html`.

### Usage
1. Wait for the "Piano loaded" message (or watch the console).
2. Select a root using the mini keyboard (red highlight).
3. Choose a chord quality from the generated chord buttons.
4. Explore available voicings; click to play & highlight notes on the lower 88‑key piano.
5. Adjust octave selection to regenerate voicings in a different register.

## Project Structure
```
index.html      # Main page
styles.css      # Styling
script.js       # Application logic (chords, voicings, audio, full keyboard)
keyboard.js     # Reusable mini SVG keyboard class
```

## Keyboard Components
- **Mini Keyboard**: Fixed 7 white + 5 black key layout (one diatonic span) used purely for root selection.
- **Fixed 88‑Key Keyboard**: Dynamically sized SVG spanning the full width; highlights currently sounding notes. Includes enharmonic resolution logic so Db vs C# still lights the correct key.

## Audio
Uses `Tone.Sampler` with a sparse set of mapped samples (A, C, D#, F# across octaves) that Tone.js internally pitches. Release is customizable (currently set to 1 second). All playback is triggered in response to user gestures (or after context resume) to satisfy browser autoplay policies.

## Development Notes
- No build step; edit files and refresh.
- Console logs are intentionally verbose for initialization & note mapping; safe to trim for production.
- Responsive considerations: bottom keyboard recalculates widths on resize; mini keyboard currently uses a fixed internal coordinate system scaled by CSS.

## Potential Improvements
- Add sustain pedal / envelope controls.
- MIDI input support (Web MIDI API) to capture played chords.
- Export selected voicings as MusicXML / MIDI.
- Dark mode toggle.
- Touch interaction optimization (multi-touch chord input on mini keyboard).

## License
Distributed under the **GNU General Public License v3.0**. See [`LICENSE`](LICENSE) for full terms.

## Attribution
- Piano samples: Salamander Grand Piano (via Tone.js CDN)
- Libraries: [Tone.js](https://tonejs.github.io/), [Tonal](https://github.com/tonaljs/tonal)

## Contributing
Pull requests are welcome. For larger changes (architecture or feature additions), open an issue first to discuss scope & approach.

---
Enjoy exploring chords and voicings! 🎹

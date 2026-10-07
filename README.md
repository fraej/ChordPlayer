# 🎹 Chord Player

An interactive web app for exploring chord structures, voicings, and inversions — played on a sampled grand piano right in your browser.

![Screenshot](Screenshot.png)

## Features

- **Root selection** via a compact piano keyboard (click it, or Tab to it and use the arrow keys).
- **Sharps or flats** — a ♯/♭ toggle respells black-key roots, so you get B♭ D F instead of A♯ C♯♯ E♯.
- **Every chord type from Tonal.js** (107 of them), grouped under headings: triads → sevenths → sixths & added tones → extended → altered dominants → everything else.
- **Chord filter** — type `m7`, `sus`, `♭9` (or `b9`), `minor`… to narrow the list.
- **Voicings & inversions** — close and open position voicings grouped by inversion in a popup next to the chord; click any of them to hear it.
- **Correct spelling everywhere** — notes are shown as they're spelled in the chord (C7 shows B♭, not A♯), with ♯/♭ symbols and scale degrees.
- **Now-playing bar** — the chord's name, the voicing, and each note with its degree (1 3 5 ♭7), plus a replay button.
- **Block or arpeggio** playback.
- **Playable 88-key keyboard** fixed at the bottom: highlights the sounding notes (root in red), labels them, scrolls to them, and plays notes when you click, drag across or tap the keys.
- **Smart pitch clamping** — voicings are moved down whole octaves until they sit at or below C7, so high inversions of extended chords don't get shrill.
- **Remembers your settings** (root, ♯/♭, octave, play style) between visits.
- **Dark mode** that follows your system setting, and a layout that works down to phone size.
- **Loading progress** for the piano samples, with a clear message if they can't be loaded.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | Vanilla CSS with custom properties (Google Fonts — Pacifico) |
| Logic | Vanilla JavaScript (no build step) |
| Audio | [Tone.js](https://tonejs.github.io/) 14.8 — Sampler with Salamander Grand Piano samples |
| Music Theory | [Tonal](https://github.com/tonaljs/tonal) 6.5 — note, chord, and interval utilities |
| Keyboards | Custom SVG components (root picker + 88-key piano) |

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

1. Wait for the "Piano ready" message (chords can be browsed while it loads).
2. Pick a root note on the small keyboard (highlighted in red). Use ♯/♭ to choose how black-key roots are spelled.
3. Click a chord to hear it. Its voicings open in a popup next to it; click one to hear that voicing.
4. Close the popup with ✕, <kbd>Esc</kbd>, or by clicking elsewhere. Clicking another chord switches straight to it.
5. Use the octave selector to shift the register, and **Block / Arpeggio** in the bottom bar to change how chords are played.
6. Play single notes on the big keyboard at the bottom; on a phone, swipe it sideways to scroll.

## Project Structure

```
index.html      Main page
styles.css      Styling, layout, dark mode
theory.js       Music theory: chord catalogue, spelling, voicing generation (no DOM)
keyboard.js     SVG keyboard components: RootKeyboard and PianoKeyboard
script.js       App logic: UI wiring, voicing popup, audio, settings
LICENSE         GPLv3
```

## Keyboard Components

- **RootKeyboard** — one-octave layout (7 white + 5 black keys) used for root selection. Works as an accessible radio group (Tab, arrow keys, Home/End) and relabels its black keys for sharps or flats. Scales via CSS.
- **PianoKeyboard** — 88 keys (A0–C8) that fill the width of the window. Keys never get narrower than 18px; on smaller screens the keyboard scrolls instead and brings the sounding notes into view. Redraws itself when its width changes.

## Audio

Uses `Tone.Sampler` with a sparse sample map (A, C, D♯, F♯ across octaves) that Tone.js pitch-shifts in between. The samples are loaded one by one so the app can show progress, as Ogg (or MP3 where Ogg isn't supported, e.g. Safari). Release is set to 1 second. Browsers only allow audio to start after a user gesture, so the audio context is resumed on the first click, tap or key press.

## Development Notes

- **No build step** — edit files, refresh, done.
- `theory.js` has no DOM access and also exports itself via `module.exports`, so voicing logic can be tested in Node (load Tonal's browser build into `globalThis.Tonal` first).
- Chords are looked up with `Tonal.Chord.getChord(type, tonic)` rather than by joining strings, which Tonal can misread (for example "C" + "b9sus" parses as a C♭ chord).
- Voicing generation uses a MIDI-ceiling approach (`MIDI 96 = C7`) to keep inversions of extended chords in a comfortable range.

## Potential Improvements

- Sustain pedal / envelope controls.
- MIDI input support (Web MIDI API).
- Export voicings as MusicXML or MIDI.
- Manual light/dark toggle (dark mode currently follows the system setting).
- Multi-note input on the keyboards, with chord detection.
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

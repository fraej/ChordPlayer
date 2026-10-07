/**
 * Chord Player - app logic
 *
 * Wires the root picker, chord grid, voicing popup and 88-key piano together
 * and plays everything on a sampled grand piano (Tone.js).
 * Music theory lives in theory.js and the keyboards in keyboard.js.
 */
(function () {
    'use strict';

    // Salamander Grand Piano samples hosted by Tone.js. The set is sparse
    // (a sample every minor third); the sampler pitch-shifts the notes in between.
    const SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';
    const SAMPLE_NOTES = [
        'A0', 'C1', 'D#1', 'F#1', 'A1', 'C2', 'D#2', 'F#2', 'A2', 'C3',
        'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5',
        'A5', 'C6', 'D#6', 'F#6', 'A6', 'C7', 'D#7', 'F#7', 'A7', 'C8'
    ];
    const ARPEGGIO_STEP_MS = 140;
    const SETTINGS_KEY = 'chordPlayer.settings';

    const state = {
        rootPc: 0,              // selected root as a pitch class (0 = C)
        accidentals: 'sharp',   // how black-key roots are spelled: 'sharp' | 'flat'
        octave: 4,
        playStyle: 'block',     // 'block' | 'arpeggio'
        lastPlayed: null        // { chord, notes, detail }, for the replay button
    };

    const audio = {
        sampler: null,
        loadedSamples: 0,
        ready: false,
        failed: false,
        arpeggioTimers: []
    };

    let ui;
    let catalogue;              // chord types grouped for display (see theory.js)
    let chordsById;
    let rootKeyboard;
    let piano;
    let popup = null;           // the open voicing popup: { button, chord, voicings }
    let statusTimer;

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    function init() {
        cacheElements();
        watchDockHeight();

        if (!window.Tonal || !window.ChordTheory) {
            showStatus('Couldn’t load the music theory library. Check your connection and reload the page.', 'error');
            return;
        }

        loadSettings();
        catalogue = ChordTheory.buildCatalogue();
        chordsById = new Map(catalogue.flatMap(group => group.chords).map(entry => [entry.id, entry]));

        rootKeyboard = new RootKeyboard(ui.rootKeyboard, {
            names: noteNames(),
            selected: state.rootPc,
            onSelect: setRoot
        });
        piano = new PianoKeyboard(ui.piano, { onNoteOn: startNote, onNoteOff: stopNote });
        // On narrow screens the piano scrolls: start in the middle of the selected octave
        piano.centerOn(12 * (state.octave + 1) + 6);

        bindEvents();
        syncControls();
        renderChords();

        if (window.Tone) {
            loadPiano();
        } else {
            audio.failed = true;
            showStatus('Couldn’t load the audio library, so the piano is silent. Check your connection and reload the page.', 'error');
        }
    }

    function cacheElements() {
        const byId = id => document.getElementById(id);
        const popupElement = byId('voicingPopup');
        ui = {
            rootName: byId('rootName'),
            rootKeyboard: byId('rootKeyboard'),
            octave: byId('octave'),
            accidentalButtons: [...document.querySelectorAll('[data-accidentals]')],
            playStyleButtons: [...document.querySelectorAll('[data-play-style]')],
            filter: byId('chordFilter'),
            chordGroups: byId('chordGroups'),
            noMatches: byId('noMatches'),
            popup: popupElement,
            popupTitle: byId('voicingTitle'),
            popupBody: popupElement.querySelector('.voicing-popup-body'),
            popupClose: popupElement.querySelector('.voicing-popup-close'),
            status: byId('status'),
            dock: byId('dock'),
            replay: byId('replayButton'),
            nowChord: byId('nowChord'),
            nowDetail: byId('nowDetail'),
            nowNotes: byId('nowNotes'),
            piano: byId('piano')
        };
    }

    function bindEvents() {
        ui.octave.addEventListener('change', () => {
            state.octave = Number(ui.octave.value);
            closePopup();
            saveSettings();
        });
        ui.accidentalButtons.forEach(button => {
            button.addEventListener('click', () => setAccidentals(button.dataset.accidentals));
        });
        ui.playStyleButtons.forEach(button => {
            button.addEventListener('click', () => setPlayStyle(button.dataset.playStyle));
        });
        ui.filter.addEventListener('input', () => {
            closePopup();
            applyFilter();
        });
        ui.chordGroups.addEventListener('click', handleChordClick);
        ui.popupBody.addEventListener('click', handleVoicingClick);
        ui.popupClose.addEventListener('click', () => closePopup({ restoreFocus: true }));
        ui.replay.addEventListener('click', replay);

        // Close the popup with Escape or a click elsewhere. Clicks on other chords
        // switch the popup instead, and clicks on the piano dock leave it open.
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && popup) {
                closePopup({ restoreFocus: true });
            }
        });
        document.addEventListener('pointerdown', event => {
            const target = event.target;
            if (!popup || !(target instanceof Element)) return;
            if (ui.popup.contains(target) || ui.dock.contains(target) || target.closest('.chord-button')) return;
            closePopup();
        });
        window.addEventListener('resize', () => {
            if (popup) positionPopup(popup.button);
        });

        // Audio may only start during a user gesture, and a touch only counts once the
        // finger lifts (piano keys sound on touch-down), so retry on every gesture
        document.addEventListener('pointerup', resumeAudio, true);
        document.addEventListener('keydown', resumeAudio, true);
    }

    // Keep the page padded so the fixed piano dock never covers the last chords
    function watchDockHeight() {
        const update = () => {
            document.documentElement.style.setProperty('--dock-height', `${ui.dock.offsetHeight}px`);
        };
        new ResizeObserver(update).observe(ui.dock);
        update();
    }

    // ---------------------------------------------------------------------
    // Settings & controls
    // ---------------------------------------------------------------------

    const noteNames = () => (state.accidentals === 'flat' ? ChordTheory.FLAT_NAMES : ChordTheory.SHARP_NAMES);
    const rootName = () => ChordTheory.pitchClassName(state.rootPc, state.accidentals);
    const chordSymbol = (tonic, entry) => ChordTheory.formatNote(tonic) + ChordTheory.formatSuffix(entry.suffix);

    function setRoot(pc) {
        state.rootPc = pc;
        closePopup();
        syncControls();
        renderChords();
        saveSettings();
    }

    function setAccidentals(accidentals) {
        if (accidentals === state.accidentals) return;
        state.accidentals = accidentals;
        closePopup();
        rootKeyboard.setNames(noteNames());
        syncControls();
        renderChords();
        saveSettings();
    }

    function setPlayStyle(playStyle) {
        state.playStyle = playStyle;
        syncControls();
        saveSettings();
    }

    function syncControls() {
        ui.rootName.textContent = ChordTheory.formatNote(rootName());
        ui.octave.value = String(state.octave);
        ui.accidentalButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.accidentals === state.accidentals));
        });
        ui.playStyleButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.playStyle === state.playStyle));
        });
    }

    function loadSettings() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch (error) {
            return; // storage blocked or corrupt: keep the defaults
        }
        if (Number.isInteger(saved.rootPc) && saved.rootPc >= 0 && saved.rootPc < 12) {
            state.rootPc = saved.rootPc;
        }
        if (saved.accidentals === 'sharp' || saved.accidentals === 'flat') {
            state.accidentals = saved.accidentals;
        }
        if ([...ui.octave.options].some(option => Number(option.value) === saved.octave)) {
            state.octave = saved.octave;
        }
        if (saved.playStyle === 'block' || saved.playStyle === 'arpeggio') {
            state.playStyle = saved.playStyle;
        }
    }

    function saveSettings() {
        const { rootPc, accidentals, octave, playStyle } = state;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rootPc, accidentals, octave, playStyle }));
        } catch (error) {
            // Storage unavailable (e.g. private browsing): settings just won't persist
        }
    }

    // ---------------------------------------------------------------------
    // Chord grid
    // ---------------------------------------------------------------------

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function renderChords() {
        const tonic = rootName();
        const sections = catalogue.map(group => {
            const section = createElement('section', 'chord-group');
            const grid = createElement('div', 'chord-grid');
            group.chords.forEach(entry => grid.appendChild(createChordButton(entry, tonic)));
            section.append(createElement('h3', 'chord-group-title', group.title), grid);
            return section;
        });
        ui.chordGroups.replaceChildren(...sections);
        applyFilter();
    }

    function createChordButton(entry, tonic) {
        const symbol = chordSymbol(tonic, entry);
        const notes = ChordTheory.chordNotes(entry.id, tonic).map(ChordTheory.formatNote);

        const button = createElement('button', 'chord-button');
        button.type = 'button';
        button.dataset.id = entry.id;
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.title = `${symbol}${entry.name ? ` (${entry.name})` : ''}: ${notes.join(' ')} · ${entry.degrees.join(' ')}`;

        const info = createElement('span', 'chord-info');
        info.append(
            createElement('span', 'chord-symbol', symbol),
            // Many chord types have no name in Tonal; show their formula instead
            createElement('span', 'chord-name', entry.name || entry.degrees.join(' '))
        );
        const count = createElement('span', 'note-count', String(entry.size));
        count.setAttribute('aria-hidden', 'true');
        button.append(info, count);
        return button;
    }

    function applyFilter() {
        const query = ui.filter.value;
        let total = 0;
        ui.chordGroups.querySelectorAll('.chord-group').forEach(section => {
            let shown = 0;
            section.querySelectorAll('.chord-button').forEach(button => {
                const visible = ChordTheory.entryMatches(chordsById.get(button.dataset.id), query);
                button.hidden = !visible;
                if (visible) shown++;
            });
            section.hidden = shown === 0;
            total += shown;
        });
        ui.noMatches.hidden = total > 0;
        ui.noMatches.textContent = total > 0 ? '' : `No chords match “${query.trim()}”.`;
    }

    function handleChordClick(event) {
        const button = event.target.closest('.chord-button');
        if (!button) return;

        const entry = chordsById.get(button.dataset.id);
        const tonic = rootName();
        const pitchClasses = ChordTheory.chordNotes(entry.id, tonic);
        if (pitchClasses.length === 0) return;
        const chord = { entry, tonic, pitchClasses };

        play(chord, ChordTheory.closeVoicing(pitchClasses, 0, state.octave), describeVoicing('close', 0));

        if (popup && popup.button === button) {
            closePopup(); // a second click on the same chord hides its voicings
        } else {
            // Keyboard activation (detail 0) moves focus into the popup
            openPopup(button, chord, { focus: event.detail === 0 });
        }
    }

    // ---------------------------------------------------------------------
    // Voicing popup
    // ---------------------------------------------------------------------

    function describeVoicing(type, inversion) {
        return `${type === 'close' ? 'Close' : 'Open'} · ${ChordTheory.inversionName(inversion)}`;
    }

    function openPopup(button, chord, { focus = false } = {}) {
        closePopup();

        const voicings = [];
        const sections = ChordTheory.voicingGroups(chord.pitchClasses, state.octave).map(group => {
            const detail = describeVoicing(group.type, group.inversion);
            const section = createElement('div', 'inversion-group');
            const grid = createElement('div', 'voicing-grid');
            group.voicings.forEach(voicing => {
                const index = voicings.push({ notes: voicing.notes, detail }) - 1;
                grid.appendChild(createVoicingButton(voicing, index));
            });
            section.append(createElement('div', 'inversion-title', detail), grid);
            return section;
        });
        if (sections.length === 0) {
            sections.push(createElement('p', 'voicing-empty', 'No voicings available'));
        }
        ui.popupTitle.textContent = `${chordSymbol(chord.tonic, chord.entry)} voicings`;
        ui.popupBody.replaceChildren(...sections);

        // The chord has just been played in close root position: the first voicing
        const first = ui.popupBody.querySelector('.voicing-button');
        if (first) first.classList.add('active-voicing');

        popup = { button, chord, voicings };
        button.classList.add('chord-active');
        button.setAttribute('aria-expanded', 'true');
        ui.popup.hidden = false;
        ui.popupBody.scrollTop = 0;
        positionPopup(button);
        if (focus && first) first.focus();
    }

    function createVoicingButton(voicing, index) {
        const button = createElement('button', 'voicing-button');
        button.type = 'button';
        button.dataset.index = String(index);
        voicing.notes.forEach((note, i) => {
            const { name, octave } = ChordTheory.noteParts(note);
            if (i > 0) button.append('–');
            button.append(name, createElement('sub', null, String(octave)));
        });
        button.append(' ', createElement('span', 'voicing-span', `${voicing.span}st`));
        button.title = `Spans ${voicing.span} semitones`;
        button.setAttribute('aria-label',
            `${voicing.notes.map(ChordTheory.formatNote).join(' ')}, spans ${voicing.span} semitones`);
        return button;
    }

    function handleVoicingClick(event) {
        const button = event.target.closest('.voicing-button');
        if (!button || !popup) return;
        ui.popupBody.querySelectorAll('.active-voicing').forEach(active => active.classList.remove('active-voicing'));
        button.classList.add('active-voicing');
        const voicing = popup.voicings[Number(button.dataset.index)];
        play(popup.chord, voicing.notes, voicing.detail);
    }

    function closePopup({ restoreFocus = false } = {}) {
        if (!popup) return;
        const { button } = popup;
        popup = null;
        ui.popup.hidden = true;
        ui.popupBody.replaceChildren();
        button.classList.remove('chord-active');
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus && button.isConnected) button.focus();
    }

    // Place the popup below its chord button, or above it when there's more room
    // there, keeping it clear of the piano dock and inside the page.
    function positionPopup(button) {
        const element = ui.popup;
        const host = element.offsetParent; // the positioned .container
        if (!host) return;
        const hostRect = host.getBoundingClientRect();
        const anchor = button.getBoundingClientRect();
        const gap = 8;
        const margin = 8;

        element.style.maxHeight = '';
        const visibleBottom = Math.min(window.innerHeight, ui.dock.getBoundingClientRect().top);
        const spaceBelow = visibleBottom - anchor.bottom - gap - margin;
        const spaceAbove = anchor.top - gap - margin;
        const naturalHeight = element.offsetHeight;
        const above = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
        const room = Math.max(140, above ? spaceAbove : spaceBelow);
        if (naturalHeight > room) element.style.maxHeight = `${room}px`;

        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const left = Math.max(margin, Math.min(anchor.left - hostRect.left, hostRect.width - width - margin));
        const top = above
            ? anchor.top - hostRect.top - height - gap
            : anchor.bottom - hostRect.top + gap;

        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.classList.toggle('popup-above', above);

        // Point the caret at the chord button even when the popup had to shift sideways
        const caret = anchor.left + Math.min(24, anchor.width / 2) - 6 - (hostRect.left + left);
        element.style.setProperty('--caret-left', `${Math.max(10, Math.min(caret, width - 22))}px`);
    }

    // ---------------------------------------------------------------------
    // Playback
    // ---------------------------------------------------------------------

    /** Sound a voicing, light it up on the piano and describe it in the dock. */
    function play(chord, notes, detail) {
        state.lastPlayed = { chord, notes, detail };
        showNowPlaying(chord, notes, detail);
        piano.highlight(notes.map(note => ({
            midi: ChordTheory.midi(note),
            label: ChordTheory.noteParts(note).name,
            root: ChordTheory.pitchClass(note) === chord.tonic
        })));
        piano.revealHighlight();
        sound(notes);
    }

    function replay() {
        if (!state.lastPlayed) return;
        const { chord, notes, detail } = state.lastPlayed;
        play(chord, notes, detail);
    }

    function sound(notes) {
        audio.arpeggioTimers.forEach(clearTimeout);
        audio.arpeggioTimers = [];
        if (!prepareAudio()) return;

        // The sampler gets sharp-spelled names; it doesn't need the chord spelling
        const names = notes.map(note => ChordTheory.midiToNoteName(ChordTheory.midi(note)));
        const now = Tone.immediate();
        audio.sampler.releaseAll(now);

        if (state.playStyle === 'arpeggio') {
            audio.sampler.triggerAttack(names[0], now);
            names.slice(1).forEach((name, i) => {
                audio.arpeggioTimers.push(setTimeout(() => {
                    audio.sampler.triggerAttack(name, Tone.immediate());
                }, (i + 1) * ARPEGGIO_STEP_MS));
            });
        } else {
            audio.sampler.triggerAttack(names, now);
        }
    }

    // Notes played on the 88-key piano
    function startNote(midi) {
        if (prepareAudio()) {
            audio.sampler.triggerAttack(ChordTheory.midiToNoteName(midi), Tone.immediate());
        }
    }

    function stopNote(midi) {
        if (audio.ready) {
            audio.sampler.triggerRelease(ChordTheory.midiToNoteName(midi), Tone.immediate());
        }
    }

    /** Report whether the piano can play yet, resuming audio if needed. */
    function prepareAudio() {
        if (!audio.ready) {
            if (audio.failed) {
                showStatus('The piano sounds couldn’t be loaded. Reload the page to try again.', 'error');
            } else {
                showLoadingStatus();
            }
            return false;
        }
        resumeAudio();
        return true;
    }

    // Browsers keep audio suspended until a user gesture resumes it
    function resumeAudio() {
        if (window.Tone && Tone.getContext().state !== 'running') {
            Tone.start().catch(error => console.warn('Audio not started yet:', error));
        }
    }

    async function loadPiano() {
        showLoadingStatus();
        try {
            const buffers = await Promise.all(SAMPLE_NOTES.map(async note => {
                // Ogg where the browser supports it, MP3 otherwise (Safari)
                const file = `${note.replace('#', 's')}.[ogg|mp3]`;
                const buffer = await Tone.ToneAudioBuffer.fromUrl(SAMPLE_BASE_URL + file);
                audio.loadedSamples++;
                if (!audio.failed) showLoadingStatus();
                return [note, buffer];
            }));
            audio.sampler = new Tone.Sampler({ urls: Object.fromEntries(buffers), release: 1 }).toDestination();
            audio.ready = true;
            showStatus('Piano ready', 'success', 2000);
        } catch (error) {
            audio.failed = true;
            console.error('Could not load the piano samples:', error);
            showStatus('Couldn’t load the piano sounds. Check your connection and reload the page.', 'error');
        }
    }

    function showLoadingStatus() {
        // Whole tens, so screen readers aren't flooded with updates
        const percent = Math.floor((audio.loadedSamples / SAMPLE_NOTES.length) * 10) * 10;
        showStatus(`Loading piano sounds… ${percent}%`, 'loading');
    }

    function showStatus(message, type, hideAfterMs = 0) {
        clearTimeout(statusTimer);
        if (ui.status.textContent !== message) ui.status.textContent = message;
        ui.status.className = `status ${type}`;
        ui.status.hidden = false;
        if (hideAfterMs > 0) {
            statusTimer = setTimeout(() => { ui.status.hidden = true; }, hideAfterMs);
        }
    }

    function showNowPlaying(chord, notes, detail) {
        const degrees = ChordTheory.noteDegrees(notes, chord.pitchClasses, chord.entry.degrees);
        ui.nowChord.textContent = chordSymbol(chord.tonic, chord.entry);
        ui.nowDetail.textContent = [chord.entry.name, detail].filter(Boolean).join(' · ');
        ui.nowNotes.replaceChildren(...notes.map((note, i) => {
            const { name, octave } = ChordTheory.noteParts(note);
            const chip = createElement('span', 'note-chip');
            chip.classList.toggle('root', ChordTheory.pitchClass(note) === chord.tonic);
            const label = createElement('span', 'note-chip-name', name);
            label.appendChild(createElement('sub', null, String(octave)));
            chip.append(label, createElement('span', 'note-chip-degree', degrees[i]));
            return chip;
        }));
        ui.replay.disabled = false;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

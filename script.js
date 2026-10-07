/**
 * Chord Player - app logic
 *
 * Wires the root picker, chord grid, voicing popup, chord info panel and 88-key
 * piano together and plays everything on a sampled grand piano (Tone.js).
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
        showInfo: true,         // chord info sheet open on narrow screens
        lastPlayed: null        // { chord, voicing }, for replay and the info panel
    };

    const audio = {
        sampler: null,
        loadedSamples: 0,
        ready: false,
        failed: false,
        arpeggioTimers: []
    };

    // Below this width the info panel is a sheet above the piano instead of a sidebar
    const narrowScreen = window.matchMedia('(max-width: 999px)');

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
        watchBottomSpace();

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
        renderChordInfo();

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
        const infoElement = byId('chordInfo');
        ui = {
            rootName: byId('rootName'),
            rootKeyboard: byId('rootKeyboard'),
            octave: byId('octave'),
            accidentalButtons: [...document.querySelectorAll('[data-accidentals]')],
            playStyleButtons: [...document.querySelectorAll('[data-play-style]')],
            filter: byId('chordFilter'),
            chordSection: byId('chordSection'),
            chordGroups: byId('chordGroups'),
            noMatches: byId('noMatches'),
            popup: popupElement,
            popupTitle: byId('voicingTitle'),
            popupBody: popupElement.querySelector('.voicing-popup-body'),
            popupClose: popupElement.querySelector('.voicing-popup-close'),
            info: infoElement,
            infoBody: infoElement.querySelector('.info-panel-body'),
            infoClose: infoElement.querySelector('.info-panel-close'),
            infoToggle: byId('infoToggle'),
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
        ui.infoToggle.addEventListener('click', () => setInfoOpen(!isInfoSheetOpen()));
        ui.infoClose.addEventListener('click', () => {
            setInfoOpen(false);
            ui.infoToggle.focus();
        });

        // Escape closes the popup first, then the info sheet. Clicks elsewhere close
        // the popup, except on other chords (they switch it), the dock and the info panel.
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (popup) {
                closePopup({ restoreFocus: true });
            } else if (isInfoSheetOpen()) {
                setInfoOpen(false);
            }
        });
        document.addEventListener('pointerdown', event => {
            const target = event.target;
            if (!popup || !(target instanceof Element)) return;
            if ([ui.popup, ui.dock, ui.info].some(area => area.contains(target)) || target.closest('.chord-button')) return;
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

    // Keep the page padded so the fixed piano dock (and the info sheet on narrow
    // screens) never covers the last chords
    function watchBottomSpace() {
        const observer = new ResizeObserver(updateBottomSpace);
        observer.observe(ui.dock);
        observer.observe(ui.info);
        narrowScreen.addEventListener('change', updateBottomSpace);
        updateBottomSpace();
    }

    function updateBottomSpace() {
        const style = document.documentElement.style;
        style.setProperty('--dock-height', `${ui.dock.offsetHeight}px`);
        style.setProperty('--sheet-height', `${isInfoSheetOpen() ? ui.info.offsetHeight : 0}px`);
    }

    // ---------------------------------------------------------------------
    // Settings & controls
    // ---------------------------------------------------------------------

    const noteNames = () => (state.accidentals === 'flat' ? ChordTheory.FLAT_NAMES : ChordTheory.SHARP_NAMES);
    const rootName = () => ChordTheory.pitchClassName(state.rootPc, state.accidentals);

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
        renderChordInfo(); // key names like F♯/G♭ follow the preference
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
        if (typeof saved.showInfo === 'boolean') {
            state.showInfo = saved.showInfo;
        }
    }

    function saveSettings() {
        const { rootPc, accidentals, octave, playStyle, showInfo } = state;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rootPc, accidentals, octave, playStyle, showInfo }));
        } catch (error) {
            // Storage unavailable (e.g. private browsing): settings just won't persist
        }
    }

    // ---------------------------------------------------------------------
    // Chord grid
    // ---------------------------------------------------------------------

    /** Create an element with a class and children (strings, nodes or arrays of them). */
    function el(tag, className, ...children) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
        return element;
    }

    function renderChords() {
        const tonic = rootName();
        const sections = catalogue.map(group => el('section', 'chord-group',
            el('h3', 'chord-group-title', group.title),
            el('div', 'chord-grid', group.chords.map(entry => createChordButton(entry, tonic)))
        ));
        ui.chordGroups.replaceChildren(...sections);
        applyFilter();
    }

    function createChordButton(entry, tonic) {
        const symbol = ChordTheory.chordSymbol(tonic, entry);
        const notes = ChordTheory.chordNotes(entry.id, tonic).map(ChordTheory.formatNote);
        const count = el('span', 'note-count', String(entry.size));
        count.setAttribute('aria-hidden', 'true');

        const button = el('button', 'chord-button',
            el('span', 'chord-info',
                el('span', 'chord-symbol', symbol),
                // Many chord types have no name in Tonal; show their formula instead
                el('span', 'chord-name', entry.name || entry.degrees.join(' '))),
            count);
        button.type = 'button';
        button.dataset.id = entry.id;
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.title = `${symbol}${entry.name ? ` (${entry.name})` : ''}: ${notes.join(' ')} · ${entry.degrees.join(' ')}`;
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

        play(chord, { notes: ChordTheory.closeVoicing(pitchClasses, 0, state.octave), type: 'close', inversion: 0 });
        keepAboveInfoSheet(button);

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

    // "Close · Root position", "Open · 2nd inversion"
    function voicingLabel({ type, inversion }) {
        return `${type === 'close' ? 'Close' : 'Open'} · ${ChordTheory.inversionName(inversion)}`;
    }

    function openPopup(button, chord, { focus = false } = {}) {
        closePopup();

        const voicings = [];
        const sections = ChordTheory.voicingGroups(chord.pitchClasses, state.octave).map(group => el('div', 'inversion-group',
            el('div', 'inversion-title', voicingLabel(group)),
            el('div', 'voicing-grid', group.voicings.map(voicing => {
                const index = voicings.push({ notes: voicing.notes, type: group.type, inversion: group.inversion }) - 1;
                return createVoicingButton(voicing, index);
            }))
        ));
        if (sections.length === 0) {
            sections.push(el('p', 'voicing-empty', 'No voicings available'));
        }
        ui.popupTitle.textContent = `${ChordTheory.chordSymbol(chord.tonic, chord.entry)} voicings`;
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
        const button = el('button', 'voicing-button',
            voicing.notes.map((note, i) => {
                const { name, octave } = ChordTheory.noteParts(note);
                return [i > 0 ? '–' : null, name, el('sub', null, String(octave))];
            }),
            ' ',
            el('span', 'voicing-span', `${voicing.span}st`));
        button.type = 'button';
        button.dataset.index = String(index);
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
        play(popup.chord, popup.voicings[Number(button.dataset.index)]);
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
    // there, keeping it clear of the piano dock and the info panel.
    function positionPopup(button) {
        const element = ui.popup;
        const host = element.offsetParent; // the positioned .container
        if (!host) return;
        const hostRect = host.getBoundingClientRect();
        const anchor = button.getBoundingClientRect();
        const gap = 8;
        const margin = 8;

        element.style.maxHeight = '';
        const visibleBottom = Math.min(
            window.innerHeight,
            ui.dock.getBoundingClientRect().top,
            isInfoSheetOpen() ? ui.info.getBoundingClientRect().top : Infinity);
        const spaceBelow = visibleBottom - anchor.bottom - gap - margin;
        const spaceAbove = anchor.top - gap - margin;
        const naturalHeight = element.offsetHeight;
        const above = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
        const room = Math.max(140, above ? spaceAbove : spaceBelow);
        if (naturalHeight > room) element.style.maxHeight = `${room}px`;

        const width = element.offsetWidth;
        const height = element.offsetHeight;
        const rightEdge = ui.chordSection.getBoundingClientRect().right - hostRect.left;
        const left = Math.max(margin, Math.min(anchor.left - hostRect.left, rightEdge - width - margin));
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
    // Chord info panel
    // ---------------------------------------------------------------------

    function isInfoSheetOpen() {
        return narrowScreen.matches && document.body.classList.contains('info-open');
    }

    // The info sheet can open over the chord that was just tapped: scroll that chord
    // to the top so it stays visible and its voicing popup has room below it
    function keepAboveInfoSheet(button) {
        if (!isInfoSheetOpen()) return;
        const rect = button.getBoundingClientRect();
        if (rect.bottom > ui.info.getBoundingClientRect().top - 8) {
            window.scrollBy(0, rect.top - 16);
        }
    }

    function setInfoOpen(open) {
        state.showInfo = open;
        saveSettings();
        syncInfoSheet();
    }

    // On narrow screens the panel is a sheet above the piano; it shows once something
    // has been played, unless the user closed it
    function syncInfoSheet() {
        const open = state.showInfo && Boolean(state.lastPlayed);
        document.body.classList.toggle('info-open', open);
        ui.infoToggle.disabled = !state.lastPlayed;
        ui.infoToggle.setAttribute('aria-expanded', String(open));
        updateBottomSpace();
    }

    function renderChordInfo() {
        if (!state.lastPlayed) {
            ui.infoBody.replaceChildren(el('p', 'info-muted',
                'Play a chord to see how it’s built, which keys it belongs to and which scales fit over it.'));
            return;
        }
        const { chord, voicing } = state.lastPlayed;
        const about = ChordTheory.describeChord(chord.entry, chord.tonic, state.accidentals);
        const facts = ChordTheory.describeVoicing(chord.entry, chord.tonic, voicing);

        ui.infoBody.replaceChildren(
            el('div', 'info-heading',
                el('span', 'info-symbol', about.symbol),
                el('span', 'info-family', about.family)),
            chord.entry.name ? el('p', 'info-name', chord.entry.name) : null,
            about.aliases.length > 0 ? el('p', 'info-aliases', `Also written ${about.aliases.slice(0, 5).join(' · ')}`) : null,
            el('p', 'info-recipe', about.recipe),
            about.description ? el('p', 'info-description', about.description) : null,

            infoSection('Notes', el('table', 'info-notes', el('tbody', null, about.tones.map((tone, i) =>
                el('tr', i === 0 ? 'root' : null,
                    el('th', null, tone.note),
                    el('td', 'info-degree', tone.degree),
                    el('td', 'info-interval', tone.interval)))))),

            infoSection('This voicing', el('dl', 'info-facts',
                fact('Shape', voicingLabel(voicing)),
                fact('Bass', facts.slash ? `${facts.bass}, written ${facts.slash}` : `${facts.bass} (the root)`),
                facts.figure ? fact('Figured bass', facts.figure) : null,
                fact('Span', `${facts.span} semitones (${facts.spanName})`),
                fact('Steps', facts.steps.map((step, i) => {
                    const abbr = el('abbr', null, step.short);
                    abbr.title = step.name;
                    return [i > 0 ? ' · ' : null, abbr];
                })))),

            infoSection('In keys', keyList(about.keys)),
            infoSection('Scales that fit', about.scales.length > 0
                ? el('div', 'info-chips', about.scales.map(name => el('span', 'info-chip', name)))
                : el('p', 'info-muted', 'No common scale contains all of its notes.'))
        );
    }

    function infoSection(title, content) {
        return el('section', 'info-section', el('h3', 'info-section-title', title), content);
    }

    function fact(term, description) {
        return [el('dt', null, term), el('dd', null, description)];
    }

    function keyList(keys) {
        if (keys.length === 0) {
            return el('p', 'info-muted', 'Not part of any major or minor key: some of its notes come from outside the key, as with altered and chromatic chords.');
        }
        const row = (label, found) => (found.length === 0 ? null : el('div', 'info-key-row',
            el('span', 'info-key-label', label),
            el('span', 'info-chips', found.map(key => {
                const chip = el('span', 'info-chip',
                    el('b', null, key.numeral), ` in ${key.key}`,
                    key.variant ? el('small', null, ` ${key.variant}`) : null);
                chip.title = `${key.numeral} in ${key.key} ${key.variant ? `${key.variant} ` : ''}${key.mode}`;
                return chip;
            }))));
        return el('div', 'info-keys',
            row('Major', keys.filter(key => key.mode === 'major')),
            row('Minor', keys.filter(key => key.mode === 'minor')));
    }

    // ---------------------------------------------------------------------
    // Playback
    // ---------------------------------------------------------------------

    /** Sound a voicing ({ notes, type, inversion }), light it up and describe it. */
    function play(chord, voicing) {
        state.lastPlayed = { chord, voicing };
        showNowPlaying(chord, voicing);
        renderChordInfo();
        syncInfoSheet();
        piano.highlight(voicing.notes.map(note => ({
            midi: ChordTheory.midi(note),
            label: ChordTheory.noteParts(note).name,
            root: ChordTheory.pitchClass(note) === chord.tonic
        })));
        piano.revealHighlight();
        sound(voicing.notes);
    }

    function replay() {
        if (!state.lastPlayed) return;
        const { chord, voicing } = state.lastPlayed;
        play(chord, voicing);
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

    function showNowPlaying(chord, voicing) {
        const degrees = ChordTheory.noteDegrees(voicing.notes, chord.pitchClasses, chord.entry.degrees);
        ui.nowChord.textContent = ChordTheory.chordSymbol(chord.tonic, chord.entry);
        ui.nowDetail.textContent = [chord.entry.name, voicingLabel(voicing)].filter(Boolean).join(' · ');
        ui.nowNotes.replaceChildren(...voicing.notes.map((note, i) => {
            const { name, octave } = ChordTheory.noteParts(note);
            const chip = el('span', 'note-chip',
                el('span', 'note-chip-name', name, el('sub', null, String(octave))),
                el('span', 'note-chip-degree', degrees[i]));
            chip.classList.toggle('root', ChordTheory.pitchClass(note) === chord.tonic);
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

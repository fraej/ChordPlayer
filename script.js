/**
 * Chord Player - app logic
 *
 * Wires the root picker, chord grid, voicings, chord info and 88-key piano
 * together and plays everything on a sampled grand piano or acoustic guitar.
 * Music theory lives in theory.js, the keyboards in keyboard.js, sample playback
 * in sample-player.js and the interface languages in i18n.js.
 *
 * Two layouts share the same elements:
 *  - wide screens: voicings in a popup next to the chord, chord info in a sidebar
 *  - phones/tablets: one sheet above the piano with Voicings and About tabs
 */
(function () {
    'use strict';

    // The instruments: sparse sample sets (a sample every three semitones) that the
    // player pitch-shifts in between. Both sets are CC BY 3.0, credited on the page.
    const INSTRUMENTS = {
        // Salamander Grand Piano, hosted by Tone.js
        piano: {
            baseUrl: 'https://tonejs.github.io/audio/salamander/',
            notes: [
                'A0', 'C1', 'D#1', 'F#1', 'A1', 'C2', 'D#2', 'F#2', 'A2', 'C3',
                'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5',
                'A5', 'C6', 'D#6', 'F#6', 'A6', 'C7', 'D#7', 'F#7', 'A7', 'C8'
            ],
            formats: ['ogg', 'mp3'],    // the first one the browser can play (Safari: MP3)
            release: 1,
            volume: 1
        },
        // Steel-string acoustic guitar from tonejs-instruments, served from npm by jsDelivr.
        // Only loaded once it's chosen.
        guitar: {
            baseUrl: 'https://cdn.jsdelivr.net/npm/tonejs-instrument-guitar-acoustic-mp3@1.1.2/',
            notes: ['D2', 'F2', 'G#2', 'B2', 'D3', 'F3', 'G#3', 'B3', 'D4', 'F4', 'G#4', 'B4', 'D5'],
            formats: ['mp3'],
            release: 0.4,       // a new chord damps the strings that were still ringing
            volume: 0.45        // every sample peaks at -3 dBFS: leave headroom for big chords
        }
    };
    const ARPEGGIO_STEP_MS = 140;
    // A strum rolls the notes this far apart, low to high (or high to low on the way up)
    const STRUM_STEP_MS = 25;
    // A strum this soon after a down-strum comes back up, like a strumming hand
    const STRUM_ALTERNATE_S = 0.4;
    // Touch: a pressed button sounds this long after the finger lands, unless it moves
    // further than TOUCH_SLOP_PX first (it's scrolling), which cancels the sound
    const TOUCH_HOLD_MS = 30;
    const TOUCH_SLOP_PX = 10;
    // Holding a chord this long adds it to (or removes it from) My chords
    const LONG_PRESS_MS = 500;
    // Seconds per chord when My chords plays as a progression
    const PROGRESSION_STEP_S = 1.2;
    const SETTINGS_KEY = 'chordPlayer.settings';
    // Playing an instrument whose samples failed to load tries again, at most this often
    const RETRY_AFTER_MS = 5000;

    // Interface text in the current language (see i18n.js)
    const t = (key, vars) => (window.I18n ? I18n.t(key, vars) : key);
    // `key in object` also accepts inherited names like "toString" (e.g. from corrupt storage)
    const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

    const state = {
        rootPc: 0,              // selected root as a pitch class (0 = C)
        accidentals: 'sharp',   // how black-key roots are spelled: 'sharp' | 'flat'
        octave: 4,
        playStyle: 'block',     // 'block' | 'arpeggio' | 'strum'
        instrument: 'piano',    // a key of INSTRUMENTS
        sheetTab: 'about',      // tab shown in the sheet on compact screens: 'voicings' | 'about'
        showDetails: true,      // open the voicings popup / sheet when a chord is clicked
        language: null,         // interface language picked by the user, or null to follow the browser
        keyTonic: null,         // pitch class of the chosen key's tonic, or null to show every chord on the root
        keyScale: 'major',      // a ChordTheory.KEY_SCALE_IDS id: 'major', 'dorian' … 'minor', 'locrian', 'harmonic', 'melodic'
        picks: [],              // My chords, in the order they were added (see "My chords" below)
        lastPlayed: null        // { chord, voicing }, for replay and the info panel
    };

    const audio = {
        unavailable: false,     // Tone.js didn't load: no sound at all
        instruments: {},        // per instrument, once it starts loading: { player, loaded, ready, failed, loading }
        lastStrum: null         // { time, direction } of the last strum, so quick strums alternate
    };

    // Below this width the sheet replaces the voicing popup and the info sidebar
    const compactLayout = window.matchMedia('(max-width: 999px)');

    let ui;
    let catalogue;              // chord types grouped for display (see theory.js)
    let chordsById;
    let rootKeyboard;
    let piano;
    let view = null;            // chord whose voicings are listed: { button, chord, voicings, container }
    let statusTimer;
    let progression = null;     // My chords playing in order: { timers }
    let keyDegrees = null;      // the chosen key's degrees (ChordTheory.keyChords), for numerals
    let statusMessage = null;   // { key, vars } of the status shown, so it can be retranslated

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    function init() {
        cacheElements();
        loadSettings();
        setupLanguagePicker();
        translateStaticText();
        watchBottomSpace();

        if (!window.Tonal || !window.ChordTheory) {
            showStatus('status.theoryFailed', 'error');
            return;
        }

        catalogue = ChordTheory.buildCatalogue();
        chordsById = new Map(catalogue.flatMap(group => group.chords).map(entry => [entry.id, entry]));

        renderKeyOptions();
        rootKeyboard = new RootKeyboard(ui.rootKeyboard, {
            names: noteNames(),
            selected: state.rootPc,
            onSelect: setRoot,
            label: t('rootNote'),
            spokenName,
            displayName: ChordTheory.formatNote
        });
        piano = new PianoKeyboard(ui.piano, {
            onNoteOn: startNote,
            onNoteOff: stopNote,
            label: t('pianoKeyboard'),
            letterName: ChordTheory.formatNote
        });
        // On narrow screens the piano scrolls: start in the middle of the selected octave
        piano.centerOn(12 * (state.octave + 1) + 6);

        bindEvents();
        syncControls();
        renderChords();
        renderChordInfo();
        syncSheetControls();

        if (window.Tone) {
            loadInstrument(state.instrument);
        } else {
            audio.unavailable = true;
            showStatus('status.audioFailed', 'error');
        }
    }

    function cacheElements() {
        const byId = id => document.getElementById(id);
        const popupElement = byId('voicingPopup');
        const infoElement = byId('chordInfo');
        ui = {
            rootName: byId('rootName'),
            keyTonic: byId('keyTonic'),
            keyScale: byId('keyScale'),
            language: byId('language'),
            languageCode: document.querySelector('.language-code'),
            instrument: byId('instrument'),
            instrumentControl: document.querySelector('.instrument-control'),
            instrumentName: document.querySelector('.instrument-name'),
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
            infoSummary: infoElement.querySelector('.info-summary'),
            infoBody: byId('sheetAbout'),
            infoClose: infoElement.querySelector('.info-panel-close'),
            sheetTabs: [...infoElement.querySelectorAll('.sheet-tabs [data-tab]')],
            sheetVoicings: byId('sheetVoicings'),
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
        ui.language.addEventListener('change', () => setLanguage(ui.language.value));
        ui.instrument.addEventListener('change', () => setInstrument(ui.instrument.value));
        ui.keyTonic.addEventListener('change', () => setKey(ui.keyTonic.value === '' ? null : Number(ui.keyTonic.value), state.keyScale));
        ui.keyScale.addEventListener('change', () => setKey(state.keyTonic, ui.keyScale.value));
        ui.octave.addEventListener('change', () => {
            state.octave = Number(ui.octave.value);
            closeChordView();
            saveSettings();
        });
        ui.accidentalButtons.forEach(button => {
            button.addEventListener('click', () => setAccidentals(button.dataset.accidentals));
        });
        ui.playStyleButtons.forEach(button => {
            button.addEventListener('click', () => setPlayStyle(button.dataset.playStyle));
        });
        ui.filter.addEventListener('input', () => {
            closeChordView();
            applyFilter();
        });
        const chordActions = {
            resolve: resolveChordButton,
            activate: activateChord,
            hold: button => togglePick(pickFromChordButton(button))
        };
        const voicingActions = {
            resolve: resolveVoicingButton,
            activate: activateVoicing,
            hold: button => togglePick(pickFromVoicingButton(button))
        };
        onPress(ui.chordGroups, '.chord-button', chordActions);
        ui.chordGroups.addEventListener('click', event => {
            if (event.target.closest('.picks-play')) toggleProgression();
        });
        onPress(ui.popupBody, '.voicing-button', voicingActions);
        onPress(ui.sheetVoicings, '.voicing-button', voicingActions);
        ui.popupClose.addEventListener('click', hideDetails);
        ui.infoClose.addEventListener('click', hideDetails);
        ui.sheetTabs.forEach(tab => {
            tab.addEventListener('click', () => setSheetTab(tab.dataset.tab));
        });
        onPress(ui.replay, 'button', {
            resolve: () => state.lastPlayed,
            activate: (button, event, sounded) => replay(sounded)
        });
        ui.infoToggle.addEventListener('click', toggleDetails);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && view) hideDetails();
        });
        // On wide screens a click elsewhere closes the popup; other chords switch it,
        // and clicks on the dock or the info sidebar leave it open
        document.addEventListener('pointerdown', event => {
            const target = event.target;
            if (!view || isCompact() || !(target instanceof Element)) return;
            if ([ui.popup, ui.dock, ui.info].some(area => area.contains(target)) || target.closest('.chord-button')) return;
            closeChordView();
        });
        window.addEventListener('resize', () => {
            if (view && !isCompact()) positionPopup(view.button);
        });
        // Popup and sheet don't carry over between layouts (e.g. when a tablet rotates)
        compactLayout.addEventListener('change', () => closeChordView());

        // Audio may only start during a user gesture, and a touch only counts once the
        // finger lifts (piano keys sound on touch-down), so retry on every gesture
        document.addEventListener('pointerdown', resumeAudio, true);
        document.addEventListener('pointerup', resumeAudio, true);
        document.addEventListener('keydown', resumeAudio, true);
    }

    /**
     * Wire up buttons (matching `selector` inside `element`) that make a sound.
     * `resolve(button)` says what the button plays ({ chord, voicing }, or null), and
     * `activate(button, event, sounded)` does the full action, skipping the sound when
     * it already started.
     *
     * A click only fires once the button is released, which delays the sound by however
     * long it's held (~100 ms), so:
     *  - mouse or pen: everything happens as the button goes down;
     *  - touch: the sound is scheduled TOUCH_HOLD_MS ahead on the audio clock as soon
     *    as the finger lands, and the rest (opening the details) waits for the tap to
     *    complete. If the finger moves first (it's scrolling the list), the sound is
     *    cancelled, or cut with a short fade if it already started, and nothing else
     *    happens. (The audio clock is used because browsers hold back page timers while
     *    a finger is down, to see whether it's going to scroll.)
     *  - keyboard (Enter/Space): a click with detail 0, as before.
     *
     * With `hold(button)`, holding a button for LONG_PRESS_MS (finger or mouse), a right
     * click or the context-menu key calls it instead of completing the tap.
     */
    function onPress(element, selector, { resolve, activate, hold = null }) {
        let mouseHandled = false;
        let touch = null;   // { pointerId, button, x, y, sounded }
        let press = null;   // pending or completed long press: { pointerId, button, x, y, timer, done, releasedAt }

        const dropTouch = ({ cut }) => {
            if (touch && cut && touch.sounded) cutSound();
            touch = null;
        };
        const fireHold = () => {
            clearTimeout(press.timer);
            press.done = true;
            hold(press.button);
        };
        const cancelHold = () => {
            if (press && !press.done) {
                clearTimeout(press.timer);
                press = null;
            }
        };

        element.addEventListener('pointerdown', event => {
            const button = event.target.closest(selector);
            if (press) clearTimeout(press.timer);
            press = null; // a new press: whatever the last one was is over
            if (!button || !element.contains(button)) return;
            if (hold && (event.pointerType === 'touch' || event.button === 0)) {
                press = { pointerId: event.pointerId, button, x: event.clientX, y: event.clientY, done: false };
                press.timer = setTimeout(fireHold, LONG_PRESS_MS);
            }
            if (event.pointerType === 'touch') {
                // While My chords plays in order, wait for the tap: a finger that starts
                // scrolling the list shouldn't stop the progression
                const target = progression ? null : resolve(button);
                touch = { pointerId: event.pointerId, button, x: event.clientX, y: event.clientY, sounded: false };
                if (target) touch.sounded = sound(target.voicing.notes, { delay: TOUCH_HOLD_MS / 1000 });
                return;
            }
            if (event.button !== 0) return;
            mouseHandled = true;
            activate(button, event, false);
        });

        element.addEventListener('pointermove', event => {
            if (touch && event.pointerId === touch.pointerId
                && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > TOUCH_SLOP_PX) {
                dropTouch({ cut: true });
            }
            if (press && event.pointerId === press.pointerId
                && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TOUCH_SLOP_PX) {
                cancelHold();
            }
        }, { passive: true });
        element.addEventListener('pointercancel', event => {
            if (touch && event.pointerId === touch.pointerId) dropTouch({ cut: true });
            if (press && event.pointerId === press.pointerId) cancelHold();
        });
        window.addEventListener('pointerup', event => {
            if (!press || event.pointerId !== press.pointerId) return;
            if (press.done) press.releasedAt = performance.now(); else cancelHold();
        });
        // The click that ends a long press is swallowed; it arrives right after the
        // release, or not at all if the button was redrawn meanwhile
        const endsLongPress = () => press && press.done
            && (press.releasedAt === undefined || performance.now() - press.releasedAt < 500);

        // Right click, the context-menu key, and the browser's own long-press menu on
        // phones: never show a menu over the buttons; count it as the long press
        element.addEventListener('contextmenu', event => {
            const button = event.target.closest(selector);
            if (!hold || !button || !element.contains(button)) return;
            event.preventDefault();
            if (endsLongPress() && press.button === button) return;   // this hold already fired
            if (press && press.button === button) {
                fireHold();                               // the browser noticed the hold first
            } else {
                press = { button, done: true, releasedAt: performance.now() };
                hold(button);
            }
        });

        element.addEventListener('click', event => {
            if (endsLongPress()) {
                press = null; // the press was a long press: the tap doesn't count
                dropTouch({ cut: false });
                mouseHandled = false;
                return;
            }
            press = null;
            if (mouseHandled && event.detail > 0) {
                mouseHandled = false; // already handled when the mouse button went down
                return;
            }
            mouseHandled = false;
            const button = event.target.closest(selector);
            const sounded = Boolean(touch && touch.button === button && touch.sounded);
            dropTouch({ cut: false });
            if (button && element.contains(button)) activate(button, event, sounded);
        });
    }

    const fromKeyboard = event => event.type === 'click' && event.detail === 0;

    // Keep the page padded so the fixed piano dock (and the sheet, when it sits at
    // the bottom) never covers the last chords
    function watchBottomSpace() {
        const observer = new ResizeObserver(updateBottomSpace);
        observer.observe(ui.dock);
        observer.observe(ui.info);
        window.addEventListener('resize', updateBottomSpace);
        updateBottomSpace();
    }

    function updateBottomSpace() {
        const style = document.documentElement.style;
        style.setProperty('--dock-height', `${ui.dock.offsetHeight}px`);
        // In landscape the sheet is a side panel and the layout makes room for it instead
        const sheet = isSheetOpen() ? ui.info.getBoundingClientRect() : null;
        const atBottom = sheet && sheet.width >= window.innerWidth - 1;
        style.setProperty('--sheet-height', `${atBottom ? Math.round(sheet.height) : 0}px`);
    }

    // ---------------------------------------------------------------------
    // Settings & controls
    // ---------------------------------------------------------------------

    const noteNames = () => (state.accidentals === 'flat' ? ChordTheory.FLAT_NAMES : ChordTheory.SHARP_NAMES);
    const rootName = () => ChordTheory.pitchClassName(state.rootPc, state.accidentals);
    const isCompact = () => compactLayout.matches;

    // ---------------------------------------------------------------------
    // Language
    // ---------------------------------------------------------------------

    /** The language in use: the user's pick, else the browser's, else English. */
    const currentLanguage = () => state.language || I18n.detect(navigator.languages || [navigator.language]);

    // Screen-reader name of a root key: "C#" -> "C sharp", "Do sostenido", "Cis"…
    const spokenName = name => t('spoken', { letter: name.charAt(0), accidental: name.slice(1) });

    function setupLanguagePicker() {
        ui.language.replaceChildren(...Object.entries(I18n.LANGUAGES).map(([code, name]) => {
            const option = el('option', null, name);
            option.value = code;
            option.lang = code;
            return option;
        }));
    }

    /** Apply the current language to the page's fixed text and the language picker. */
    function translateStaticText() {
        const code = I18n.setLanguage(currentLanguage());
        document.documentElement.lang = code;
        ui.language.value = code;
        ui.languageCode.textContent = code.toUpperCase();
        I18n.translatePage(document);
        renderInstrumentOptions();
        if (!state.lastPlayed) ui.nowDetail.textContent = t('hint');
        if (statusMessage && !ui.status.hidden) ui.status.textContent = t(statusMessage.key, statusMessage.vars);
    }

    function setLanguage(code) {
        state.language = hasOwn(I18n.LANGUAGES, code) ? code : null;
        saveSettings();
        translateStaticText();
        if (!catalogue) return; // the theory library didn't load: only the fixed text changes

        closeChordView();
        renderKeyOptions();
        // Note names change too in the languages that use Do, Re, Mi…
        rootKeyboard.setLabels({ label: t('rootNote'), spokenName, displayName: ChordTheory.formatNote });
        piano.setLabel(t('pianoKeyboard'));
        piano.setLetterNames(ChordTheory.formatNote);
        syncControls();
        renderChords();
        renderChordInfo();
        if (state.lastPlayed) {
            showNowPlaying(state.lastPlayed.chord, state.lastPlayed.voicing);
            highlightOnPiano(state.lastPlayed.chord, state.lastPlayed.voicing);
        }
    }

    function setRoot(pc) {
        state.rootPc = pc;
        closeChordView();
        syncControls();
        renderChords();
        saveSettings();
        // With a key chosen, every degree is listed: bring the picked root's chords into view
        const degree = ui.chordGroups.querySelector('.chord-group.current-degree');
        if (degree) {
            const top = degree.getBoundingClientRect().top;
            if (top < 0 || top > ui.dock.getBoundingClientRect().top - 120) degree.scrollIntoView({ block: 'start' });
        }
    }

    function setAccidentals(accidentals) {
        if (accidentals === state.accidentals) return;
        state.accidentals = accidentals;
        closeChordView();
        rootKeyboard.setNames(noteNames());
        renderKeyOptions(); // key names like F♯/G♭ follow the preference
        syncControls();
        renderChords();
        renderChordInfo();
        saveSettings();
    }

    /** Show only the chords of a key (tonic pitch class + scale id), or every chord with a null tonic. */
    function setKey(tonicPc, scale) {
        state.keyTonic = tonicPc;
        state.keyScale = scale;
        // Start from the key's home chord
        if (tonicPc !== null) state.rootPc = tonicPc;
        closeChordView();
        renderKeyOptions();
        syncControls();
        renderChords();
        saveSettings();
        // Show the top of the list, where the key's first degree now is
        if (ui.chordSection.getBoundingClientRect().top < 0) {
            ui.chordSection.scrollIntoView({ block: 'start' });
        }
    }

    // Tonic names depend on the scale (D♭ major but C♯ minor) and on ♯/♭ for F♯/G♭ and D♯/E♭
    function renderKeyOptions() {
        const any = el('option', null, t('key.all'));
        any.value = '';
        ui.keyTonic.replaceChildren(any, ...Array.from({ length: 12 }, (_, pc) => {
            const option = el('option', null,
                ChordTheory.formatNote(ChordTheory.keyTonicName(pc, state.keyScale, state.accidentals)));
            option.value = String(pc);
            return option;
        }));
        // Labels are the scale names used in the chord info ("major (Ionian)", "Dorian"…)
        const tonalNames = { harmonic: 'harmonic minor', melodic: 'melodic minor' };
        ui.keyScale.replaceChildren(...ChordTheory.KEY_SCALE_IDS.map(id => {
            const option = el('option', null, t(`scale.${tonalNames[id] || id}`));
            option.value = id;
            return option;
        }));
    }

    /** Pitch classes of the chosen key's scale, or null when no key is chosen. */
    function keyPitchClasses() {
        if (state.keyTonic === null) return null;
        return ChordTheory.keyChords([], state.keyTonic, state.keyScale, state.accidentals)
            .map(degree => pitchClassOf(degree.root));
    }

    const pitchClassOf = note => ChordTheory.midi(`${note}4`) % 12;

    function setPlayStyle(playStyle) {
        state.playStyle = playStyle;
        syncControls();
        saveSettings();
    }

    /** Switch to another instrument, loading its samples the first time. */
    function setInstrument(name) {
        if (!hasOwn(INSTRUMENTS, name) || name === state.instrument) return;
        stopProgression();
        const previous = currentPlayer();
        if (previous) previous.releaseAll(Tone.immediate(), 0.3);
        state.instrument = name;
        audio.lastStrum = null;
        saveSettings();
        syncInstrument();
        if (!audio.unavailable) showInstrumentStatus();
    }

    /**
     * Say where the current instrument stands, replacing whatever the status said about
     * the other one: ready, or loading (starting it, or retrying after a failure).
     */
    function showInstrumentStatus() {
        const entry = audio.instruments[state.instrument];
        if (entry && entry.ready) {
            showStatus(`status.ready.${state.instrument}`, 'success', 1500);
        } else {
            loadInstrument(state.instrument);
            showLoadingStatus();
        }
    }

    function renderInstrumentOptions() {
        ui.instrument.replaceChildren(...Object.keys(INSTRUMENTS).map(name => {
            const option = el('option', null, t(`instrument.${name}`));
            option.value = name;
            return option;
        }));
        syncInstrument();
    }

    function syncInstrument() {
        ui.instrument.value = state.instrument;
        ui.instrumentControl.dataset.instrument = state.instrument;
        ui.instrumentName.textContent = t(`instrument.${state.instrument}`);
    }

    function syncControls() {
        ui.rootName.textContent = ChordTheory.formatNote(rootName());
        ui.octave.value = String(state.octave);
        ui.keyTonic.value = state.keyTonic === null ? '' : String(state.keyTonic);
        ui.keyScale.value = state.keyScale;
        ui.keyScale.hidden = state.keyTonic === null;
        document.body.classList.toggle('key-mode', state.keyTonic !== null);
        rootKeyboard.select(state.rootPc);
        rootKeyboard.setMarked(keyPitchClasses());
        ui.accidentalButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.accidentals === state.accidentals));
        });
        ui.playStyleButtons.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.playStyle === state.playStyle));
        });
        syncInstrument();
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
        if (ui.playStyleButtons.some(button => button.dataset.playStyle === saved.playStyle)) {
            state.playStyle = saved.playStyle;
        }
        if (hasOwn(INSTRUMENTS, saved.instrument)) {
            state.instrument = saved.instrument;
        }
        if (saved.sheetTab === 'voicings' || saved.sheetTab === 'about') {
            state.sheetTab = saved.sheetTab;
        }
        if (typeof saved.showDetails === 'boolean') {
            state.showDetails = saved.showDetails;
        }
        if (window.I18n && hasOwn(I18n.LANGUAGES, saved.language)) {
            state.language = saved.language;
        }
        if (window.ChordTheory && ChordTheory.KEY_SCALE_IDS.includes(saved.keyScale)) {
            state.keyScale = saved.keyScale;
        }
        if (Number.isInteger(saved.keyTonic) && saved.keyTonic >= 0 && saved.keyTonic < 12) {
            state.keyTonic = saved.keyTonic;
        }
        if (Array.isArray(saved.picks)) {
            const voicingOk = voicing => voicing === undefined || (voicing && Array.isArray(voicing.notes)
                && voicing.notes.length > 0 && voicing.notes.every(note => /^[A-G](#{1,2}|b{1,2})?\d$/.test(note))
                && (voicing.type === 'close' || voicing.type === 'open') && Number.isInteger(voicing.inversion));
            state.picks = saved.picks.filter(pick => pick && typeof pick.id === 'string'
                && typeof pick.tonic === 'string' && /^[A-G](#{1,2}|b{1,2})?$/.test(pick.tonic)
                && voicingOk(pick.voicing));
        }
    }

    function saveSettings() {
        const {
            rootPc, accidentals, octave, playStyle, instrument, sheetTab, showDetails, language, keyTonic, keyScale, picks
        } = state;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                rootPc, accidentals, octave, playStyle, instrument, sheetTab, showDetails, language, keyTonic, keyScale, picks
            }));
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

    /**
     * Without a key: every chord type on the selected root, grouped by kind.
     * With a key: the chords of that key, one group per scale degree (I, ii, iii…),
     * with the selected root's degree marked.
     */
    function renderChords() {
        const group = (title, buttons) => el('section', 'chord-group',
            el('h3', 'chord-group-title', title),
            el('div', 'chord-grid', buttons));

        let sections;
        keyDegrees = null;
        if (state.keyTonic === null) {
            const tonic = rootName();
            sections = catalogue.map(chordGroup => group(ChordTheory.groupTitle(chordGroup),
                chordGroup.chords.map(entry => createChordButton(entry, tonic))));
        } else {
            const degrees = ChordTheory.keyChords(catalogueEntries(), state.keyTonic, state.keyScale, state.accidentals);
            keyDegrees = degrees;
            // First the chords everyone plays in the key: its triads, then its seventh chords
            const main = ['triad', 'seventh'].flatMap(shape => degrees.filter(degree => degree[shape])
                .map(degree => createChordButton(degree[shape].entry, degree.root, degree[shape].numeral)));
            const mainSection = group(t('key.main'), main);
            mainSection.classList.add('main-chords');
            sections = [mainSection].concat(degrees.map(degree => {
                    const title = [el('span', 'degree-numeral', degree.numeral), ` · ${ChordTheory.formatNote(degree.root)}`];
                    const section = group(title,
                        degree.chords.map(({ entry, numeral }) => createChordButton(entry, degree.root, numeral)));
                    section.classList.toggle('current-degree', pitchClassOf(degree.root) === state.rootPc);
                    return section;
                }));
        }
        ui.chordGroups.replaceChildren(...sections);
        renderPicks();
    }

    const catalogueEntries = () => catalogue.flatMap(chordGroup => chordGroup.chords);

    // ---------------------------------------------------------------------
    // My chords: picked by holding a chord, played in order as a progression
    // ---------------------------------------------------------------------

    // A pick is { id, tonic } for a chord (played in close root position at the current
    // octave), or { id, tonic, voicing: { notes, type, inversion } } for one exact voicing
    const voicingKey = voicing => (voicing ? voicing.notes.map(ChordTheory.midi).join(',') : '');
    const samePick = (a, b) => a.id === b.id && pitchClassOf(a.tonic) === pitchClassOf(b.tonic)
        && voicingKey(a.voicing) === voicingKey(b.voicing);
    const isPicked = pick => state.picks.some(existing => samePick(existing, pick));

    function pickFromChordButton(button) {
        const pick = { id: button.dataset.id, tonic: button.dataset.tonic };
        if (button.dataset.notes) {
            pick.voicing = {
                notes: button.dataset.notes.split(','),
                type: button.dataset.type,
                inversion: Number(button.dataset.inversion)
            };
        }
        return pick;
    }

    function pickFromVoicingButton(button) {
        const target = resolveVoicingButton(button);
        if (!target) return null;
        const { notes, type, inversion } = target.voicing;
        return { id: target.chord.entry.id, tonic: target.chord.tonic, voicing: { notes, type, inversion } };
    }

    /** "C7", or for a picked voicing its slash chord when inverted: "C7/E". */
    function pickSymbol(pick) {
        const symbol = ChordTheory.chordSymbol(pick.tonic, chordsById.get(pick.id));
        return pick.voicing && pick.voicing.inversion > 0
            ? `${symbol}/${ChordTheory.noteParts(pick.voicing.notes[0]).name}`
            : symbol;
    }

    /** Hold on a chord or a voicing: add it to My chords, or remove it if it's there already. */
    function togglePick(pick) {
        if (!pick) return;
        const entry = chordsById.get(pick.id);
        if (!entry) return;
        const index = state.picks.findIndex(existing => samePick(existing, pick));
        if (index >= 0) {
            state.picks.splice(index, 1);
        } else {
            state.picks.push(pick);
        }
        stopProgression({ silence: true }); // its chords were scheduled from the old list
        saveSettings();
        renderPicks();
        const label = pick.voicing ? `${pickSymbol(pick)} (${voicingLabel(pick.voicing)})` : pickSymbol(pick);
        showStatus(index >= 0 ? 'picks.removed' : 'picks.added', 'success', 1800, { chord: label });
        try {
            if (navigator.vibrate) navigator.vibrate(15);
        } catch (error) {
            // no vibration: the status message is enough
        }
    }

    /** Numerals of the chosen key's chords: "id|pitch class" -> "V7". */
    function keyNumerals() {
        const numerals = new Map();
        (keyDegrees || []).forEach(degree => degree.chords.forEach(({ entry, numeral }) => {
            numerals.set(`${entry.id}|${pitchClassOf(degree.root)}`, numeral);
        }));
        return numerals;
    }

    function picksSection() {
        const numerals = keyNumerals();
        const picks = state.picks.filter(pick => chordsById.has(pick.id));
        const playButton = el('button', 'picks-play'); // labelled by syncProgressionControls
        playButton.type = 'button';
        playButton.hidden = picks.length === 0;

        const section = el('section', 'chord-group picked-chords',
            el('div', 'picks-header', el('h3', 'chord-group-title', t('picks.title')), playButton),
            picks.length > 0
                ? el('div', 'chord-grid', picks.map(pick => createChordButton(chordsById.get(pick.id), pick.tonic,
                    numerals.get(`${pick.id}|${pitchClassOf(pick.tonic)}`) || null, pick.voicing)))
                : el('p', 'picks-hint', t('picks.hint')));
        return section;
    }

    /** Redraw My chords and the ★ marks, leaving the rest of the list (and an open popup) alone. */
    function renderPicks() {
        const old = ui.chordGroups.querySelector('.picked-chords');
        if (view && view.button && old && old.contains(view.button)) closeChordView();
        const section = picksSection();
        if (old) old.replaceWith(section); else ui.chordGroups.prepend(section);
        ui.chordGroups.querySelectorAll('.chord-group:not(.picked-chords) .chord-button').forEach(button => {
            button.classList.toggle('picked', isPicked(pickFromChordButton(button)));
        });
        markPickedVoicings();
        syncProgressionControls();
        applyFilter();
    }

    /**
     * Show whether My chords is playing (▶ Play in order / ■ Stop) without redrawing the
     * chords, so a chord button that was just pressed stays on the page.
     */
    function syncProgressionControls() {
        const section = ui.chordGroups.querySelector('.picked-chords');
        if (!section) return;
        const playing = Boolean(progression);
        const playButton = section.querySelector('.picks-play');
        playButton.replaceChildren(el('span', null, playing ? '■' : '▶'), ' ', t(playing ? 'picks.stop' : 'picks.play'));
        playButton.setAttribute('aria-pressed', String(playing));
        if (!playing) {
            section.querySelectorAll('.progression-current').forEach(button => button.classList.remove('progression-current'));
        }
    }

    // ★ on the voicings in the popup or sheet that are in My chords
    function markPickedVoicings() {
        if (!view) return;
        view.container.querySelectorAll('.voicing-button').forEach(button => {
            button.classList.toggle('picked', isPicked(pickFromVoicingButton(button)));
        });
    }

    function resolvePick(pick) {
        const entry = chordsById.get(pick.id);
        const pitchClasses = entry ? ChordTheory.chordNotes(entry.id, pick.tonic) : [];
        if (pitchClasses.length === 0) return null;
        return {
            chord: { entry, tonic: pick.tonic, pitchClasses },
            voicing: pick.voicing
                ? { ...pick.voicing, notes: [...pick.voicing.notes] }
                : { notes: ChordTheory.closeVoicing(pitchClasses, 0, state.octave), type: 'close', inversion: 0 }
        };
    }

    function toggleProgression() {
        if (progression) {
            stopProgression({ silence: true });
        } else {
            playProgression();
        }
    }

    /**
     * Play My chords in order, PROGRESSION_STEP_S each, in the current play style. The
     * notes are all scheduled on the audio clock up front; timers only follow along on
     * screen.
     */
    function playProgression() {
        const items = state.picks.map(resolvePick).filter(Boolean);
        if (items.length === 0 || !prepareAudio()) return;
        const player = currentPlayer();
        const lead = 0.05;
        const start = Tone.immediate() + lead;
        player.releaseAll(Tone.immediate());
        items.forEach((item, i) => {
            const duration = PROGRESSION_STEP_S * (i === items.length - 1 ? 2 : 1);
            scheduleChord(player, item.voicing.notes.map(playerNote), start + i * PROGRESSION_STEP_S,
                { duration, direction: 'down' });
        });

        const timers = items.map((item, i) => setTimeout(() => showProgressionStep(item, i),
            (lead + i * PROGRESSION_STEP_S) * 1000));
        timers.push(setTimeout(() => stopProgression(), (lead + items.length * PROGRESSION_STEP_S) * 1000));
        progression = { timers };
        syncProgressionControls();
    }

    function showProgressionStep(item, index) {
        play(item.chord, item.voicing, { sounded: true });
        const buttons = ui.chordGroups.querySelectorAll('.picked-chords .chord-button');
        buttons.forEach((button, i) => button.classList.toggle('progression-current', i === index));
    }

    /** Stop following a progression on screen; with `silence`, also stop its sound. */
    function stopProgression({ silence = false } = {}) {
        if (!progression) return;
        progression.timers.forEach(clearTimeout);
        progression = null;
        const player = currentPlayer();
        if (silence && player) player.releaseAll(Tone.immediate(), 0.15);
        syncProgressionControls();
    }

    /** A chord button; `numeral` (e.g. "V7") is its function in the chosen key, if any. */
    function createChordButton(entry, tonic, numeral = null, voicing = null) {
        const symbol = voicing ? pickSymbol({ id: entry.id, tonic, voicing }) : ChordTheory.chordSymbol(tonic, entry);
        const notes = voicing ? voicing.notes.map(ChordTheory.formatNote) : ChordTheory.chordNotes(entry.id, tonic).map(ChordTheory.formatNote);
        const name = ChordTheory.chordName(entry);
        // A picked voicing shows its notes instead of the chord's name
        const subtitle = voicing ? notes.join(' ') : name || entry.degrees.join(' ');
        const count = el('span', 'note-count', String(entry.size));
        count.setAttribute('aria-hidden', 'true');

        const button = el('button', 'chord-button',
            el('span', 'chord-info',
                el('span', 'chord-symbol', symbol),
                // Many chord types have no name in Tonal; show their formula instead
                el('span', 'chord-name', numeral ? [el('b', 'chord-numeral', numeral), ` ${subtitle}`] : subtitle)),
            count);
        button.type = 'button';
        button.dataset.id = entry.id;
        button.dataset.tonic = tonic;
        if (voicing) {
            button.dataset.notes = voicing.notes.join(',');
            button.dataset.type = voicing.type;
            button.dataset.inversion = String(voicing.inversion);
            button.classList.add('voicing-pick');
        }
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.title = `${numeral ? `${numeral} · ` : ''}${symbol}${name ? ` (${name})` : ''}: ${notes.join(' ')}`
            + (voicing ? ` · ${voicingLabel(voicing)}` : ` · ${entry.degrees.join(' ')}`);
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
            // My chords stays visible (with its hint) unless a filter leaves nothing in it
            section.hidden = shown === 0 && !(section.classList.contains('picked-chords') && !query.trim());
            total += shown;
        });
        ui.noMatches.hidden = total > 0;
        ui.noMatches.textContent = total > 0 ? '' : t('noMatches', { query: query.trim() });
    }

    /** What a chord button plays: its close root-position voicing, or the voicing picked into My chords. */
    function resolveChordButton(button) {
        return resolvePick(pickFromChordButton(button));
    }

    function activateChord(button, event, sounded) {
        const target = resolveChordButton(button);
        if (!target) return;
        const { chord, voicing } = target;
        play(chord, voicing, { sounded });

        if (view && view.button === button) {
            hideDetails(); // a second click on the same chord hides the details
        } else if (state.showDetails) {
            // Keyboard activation moves focus into the popup or sheet
            openChordView(button, chord, { focus: fromKeyboard(event), octave: listOctave(chord, voicing) });
        } else {
            closeChordView(); // details are off: just play (and drop any stale view)
        }
    }

    // ---------------------------------------------------------------------
    // Voicings: popup (wide screens) or sheet (compact screens)
    // ---------------------------------------------------------------------

    // "Close · Root position", "Open · 2nd inversion"
    function voicingLabel({ type, inversion }) {
        return `${t(type === 'close' ? 'voicing.close' : 'voicing.open')} · ${ChordTheory.inversionName(inversion)}`;
    }

    /**
     * The octave to list a chord's voicings in: the current one, unless the voicing that's
     * playing (a voicing picked into My chords) comes from another octave's list.
     */
    function listOctave(chord, voicing) {
        const key = voicing.notes.join();
        const bassOctave = ChordTheory.noteParts(voicing.notes[0]).octave;
        const inList = octave => ChordTheory.voicingGroups(chord.pitchClasses, octave)
            .some(group => group.voicings.some(candidate => candidate.notes.join() === key));
        return [state.octave, bassOctave, bassOctave + 1].find(inList) ?? state.octave;
    }

    /**
     * List a chord's voicings: in the popup next to `button` on wide screens, in
     * the sheet on compact ones. `button` may be null when the sheet is reopened
     * for a chord that's no longer on screen.
     */
    function openChordView(button, chord, { focus = false, octave = state.octave } = {}) {
        closeChordView();
        const compact = isCompact();
        const container = compact ? ui.sheetVoicings : ui.popupBody;
        const playing = state.lastPlayed && state.lastPlayed.chord === chord ? state.lastPlayed.voicing : null;
        const voicings = renderVoicingList(container, chord, playing, octave);
        view = { button, chord, voicings, container };
        markPickedVoicings();

        if (button) {
            button.classList.add('chord-active');
            button.setAttribute('aria-expanded', 'true');
        }
        if (compact) {
            document.body.classList.add('sheet-open');
            syncSheetControls();
            updateBottomSpace();
            if (button) keepClearOfSheet(button);
        } else {
            ui.popupTitle.textContent = t('voicings.of', { chord: ChordTheory.chordSymbol(chord.tonic, chord.entry) });
            ui.popup.hidden = false;
            positionPopup(button);
        }
        syncSheetControls();

        if (focus) {
            const target = compact && state.sheetTab === 'about'
                ? ui.sheetTabs.find(tab => tab.dataset.tab === 'about')
                : container.querySelector('.active-voicing, .voicing-button');
            if (target) target.focus();
        }
    }

    function closeChordView({ restoreFocus = false } = {}) {
        if (!view) return;
        const { button, container } = view;
        view = null;
        container.replaceChildren();
        ui.popup.hidden = true;
        document.body.classList.remove('sheet-open');
        syncSheetControls();
        updateBottomSpace();
        if (button) {
            button.classList.remove('chord-active');
            button.setAttribute('aria-expanded', 'false');
            if (restoreFocus && button.isConnected) button.focus();
        }
    }

    function renderVoicingList(container, chord, playing, octave = state.octave) {
        const voicings = [];
        const sections = ChordTheory.voicingGroups(chord.pitchClasses, octave).map(group => el('div', 'inversion-group',
            el('div', 'inversion-title', voicingLabel(group)),
            el('div', 'voicing-grid', group.voicings.map(voicing => {
                const index = voicings.push({ notes: voicing.notes, type: group.type, inversion: group.inversion }) - 1;
                return createVoicingButton(voicing, index);
            }))
        ));
        container.replaceChildren(...(sections.length > 0 ? sections : [el('p', 'voicing-empty', t('voicings.none'))]));
        container.scrollTop = 0;

        // Mark the voicing that's sounding (the close root position after a chord click)
        const sounding = playing ? playing.notes.join() : null;
        const index = sounding === null ? 0 : voicings.findIndex(voicing => voicing.notes.join() === sounding);
        const active = container.querySelector(`.voicing-button[data-index="${index}"]`);
        if (active) active.classList.add('active-voicing');
        return voicings;
    }

    function createVoicingButton(voicing, index) {
        const button = el('button', 'voicing-button',
            voicing.notes.map((note, i) => {
                const { name, octave } = ChordTheory.noteParts(note);
                return [i > 0 ? '–' : null, name, el('sub', null, String(octave))];
            }),
            ' ',
            el('span', 'voicing-span', t('span.short', { n: voicing.span })));
        button.type = 'button';
        button.dataset.index = String(index);
        button.title = t('span.title', { n: voicing.span });
        button.setAttribute('aria-label',
            t('span.aria', { notes: voicing.notes.map(ChordTheory.formatNote).join(' '), n: voicing.span }));
        return button;
    }

    function resolveVoicingButton(button) {
        return view ? { chord: view.chord, voicing: view.voicings[Number(button.dataset.index)] } : null;
    }

    function activateVoicing(button, event, sounded) {
        const target = resolveVoicingButton(button);
        if (!target) return;
        view.container.querySelectorAll('.active-voicing').forEach(active => active.classList.remove('active-voicing'));
        button.classList.add('active-voicing');
        play(target.chord, target.voicing, { sounded });
    }

    // Place the popup below its chord button, or above it when there's more room
    // there, keeping it clear of the piano dock and the info sidebar.
    function positionPopup(button) {
        const element = ui.popup;
        const host = element.offsetParent; // the positioned .container
        if (!host || !button) return;
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
    // Sheet (compact screens)
    // ---------------------------------------------------------------------

    function isSheetOpen() {
        return isCompact() && document.body.classList.contains('sheet-open');
    }

    /**
     * Close the popup or sheet because the user asked to (✕, Esc, the chord again or the
     * Details button), and keep it closed for the next chords until Details is pressed.
     */
    function hideDetails() {
        state.showDetails = false;
        saveSettings();
        closeChordView({ restoreFocus: true });
        syncSheetControls();
    }

    // The Details button in the dock: hides the details, or turns them back on and
    // shows them for whatever played last
    function toggleDetails() {
        if (view) {
            hideDetails();
            return;
        }
        state.showDetails = true;
        saveSettings();
        syncSheetControls();
        if (state.lastPlayed) {
            const { chord } = state.lastPlayed;
            const selector = `.chord-button[data-id="${CSS.escape(chord.entry.id)}"][data-tonic="${CSS.escape(chord.tonic)}"]`;
            // The chord's own place in the list, else its copy in My chords
            const button = ui.chordGroups.querySelector(`.chord-group:not(.picked-chords) ${selector}`)
                || ui.chordGroups.querySelector(selector);
            // The popup needs its chord button to sit next to; the sheet doesn't
            if (button || isCompact()) openChordView(button, chord, { octave: listOctave(chord, state.lastPlayed.voicing) });
        }
    }

    function setSheetTab(tab) {
        state.sheetTab = tab;
        saveSettings();
        syncSheetControls();
    }

    function syncSheetControls() {
        ui.info.dataset.tab = state.sheetTab;
        ui.sheetTabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.tab === state.sheetTab)));
        // An on/off switch (details on chord clicks), not a disclosure: aria-pressed only
        ui.infoToggle.setAttribute('aria-pressed', String(state.showDetails));
    }

    // Opening the sheet can cover the chord that was just tapped (or, in landscape,
    // reflow it out of view): scroll that chord to the top so it stays visible
    function keepClearOfSheet(button) {
        const sheet = ui.info.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        const sheetAtBottom = sheet.width >= window.innerWidth - 1;
        const visibleBottom = Math.min(ui.dock.getBoundingClientRect().top, sheetAtBottom ? sheet.top : Infinity) - 8;
        if (rect.top < 8 || rect.bottom > visibleBottom) {
            window.scrollBy(0, rect.top - 16);
        }
    }

    // ---------------------------------------------------------------------
    // Chord info (sidebar on wide screens, About tab on compact ones)
    // ---------------------------------------------------------------------

    function renderChordInfo() {
        if (!state.lastPlayed) {
            ui.infoSummary.replaceChildren();
            ui.infoBody.replaceChildren(el('p', 'info-muted', t('info.placeholder')));
            return;
        }
        const { chord, voicing } = state.lastPlayed;
        const about = ChordTheory.describeChord(chord.entry, chord.tonic, state.accidentals);
        const facts = ChordTheory.describeVoicing(chord.entry, chord.tonic, voicing);
        const name = ChordTheory.chordName(chord.entry);

        ui.infoSummary.replaceChildren(
            el('div', 'info-heading',
                el('span', 'info-symbol', about.symbol),
                el('span', 'info-family', about.family)),
            name ? el('p', 'info-name', name) : null);

        ui.infoBody.replaceChildren(
            about.aliases.length > 0 ? el('p', 'info-aliases', t('info.alsoWritten', { list: about.aliases.slice(0, 5).join(' · ') })) : null,
            el('p', 'info-recipe', about.recipe),
            about.description ? el('p', 'info-description', about.description) : null,

            infoSection(t('info.notes'), el('table', 'info-notes', el('tbody', null, about.tones.map((tone, i) =>
                el('tr', i === 0 ? 'root' : null,
                    el('th', null, tone.note),
                    el('td', 'info-degree', tone.degree),
                    el('td', 'info-interval', tone.interval)))))),

            infoSection(t('info.voicing'), el('dl', 'info-facts',
                fact(t('fact.shape'), voicingLabel(voicing)),
                fact(t('fact.bass'), facts.slash
                    ? t('bass.slash', { bass: facts.bass, slash: facts.slash })
                    : t('bass.root', { bass: facts.bass })),
                facts.figure ? fact(t('fact.figure'), facts.figure) : null,
                fact(t('fact.span'), t('span.value', { n: facts.span, name: facts.spanName })),
                fact(t('fact.steps'), facts.steps.map((step, i) => {
                    const abbr = el('abbr', null, step.short);
                    abbr.title = step.name;
                    return [i > 0 ? ' · ' : null, abbr];
                })))),

            infoSection(t('info.keys'), keyList(about.keys)),
            infoSection(t('info.scales'), about.scales.length > 0
                ? el('div', 'info-chips', about.scales.map(scale => el('span', 'info-chip', scale)))
                : el('p', 'info-muted', t('scales.none')))
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
            return el('p', 'info-muted', t('keys.none'));
        }
        const row = (label, found) => (found.length === 0 ? null : el('div', 'info-key-row',
            el('span', 'info-key-label', label),
            el('span', 'info-chips', found.map(key => {
                const chip = el('span', 'info-chip',
                    el('b', null, key.numeral), t('keys.in', { key: key.key }),
                    key.variant ? el('small', null, ` ${t(`variant.${key.variant}`)}`) : null);
                const mode = t(key.variant ? `mode.${key.mode}.${key.variant}` : `mode.${key.mode}`);
                chip.title = `${key.numeral}${t('keys.in', { key: key.key })} ${mode}`;
                return chip;
            }))));
        return el('div', 'info-keys',
            row(t('keys.major'), keys.filter(key => key.mode === 'major')),
            row(t('keys.minor'), keys.filter(key => key.mode === 'minor')));
    }

    // ---------------------------------------------------------------------
    // Playback
    // ---------------------------------------------------------------------

    /** Sound a voicing ({ notes, type, inversion }), light it up and describe it. */
    function play(chord, voicing, { sounded = false } = {}) {
        state.lastPlayed = { chord, voicing };
        if (!sounded) sound(voicing.notes); // first, so redrawing the page doesn't hold up the sound
        showNowPlaying(chord, voicing);
        renderChordInfo();
        syncSheetControls();
        highlightOnPiano(chord, voicing);
        piano.revealHighlight();
    }

    function highlightOnPiano(chord, voicing) {
        piano.highlight(voicing.notes.map(note => ({
            midi: ChordTheory.midi(note),
            label: ChordTheory.noteParts(note).name,
            root: ChordTheory.pitchClass(note) === chord.tonic
        })));
    }

    function replay(sounded = false) {
        if (!state.lastPlayed) return;
        const { chord, voicing } = state.lastPlayed;
        play(chord, voicing, { sounded });
    }

    /**
     * Play notes in the current play style, `delay` seconds from now, replacing whatever
     * was sounding. Everything is scheduled on the audio clock, so a busy page can't
     * hold notes up. Returns whether anything was played.
     */
    function sound(notes, { delay = 0 } = {}) {
        if (!prepareAudio()) return false;
        stopProgression(); // a chord played by hand takes over (its releaseAll cancels the rest)

        const player = currentPlayer();
        const start = Tone.immediate() + delay;
        player.releaseAll(start);
        scheduleChord(player, notes.map(playerNote), start);
        return true;
    }

    // The player gets sharp-spelled names; it doesn't need the chord spelling
    const playerNote = note => ChordTheory.midiToNoteName(ChordTheory.midi(note));

    /**
     * Start a chord's notes (low to high) at `start`: together (block), one after another
     * (arpeggio), or rolled quickly like a strum, with the first strings hit hardest.
     * A strum goes down (low to high) unless `direction` says otherwise or it follows a
     * down-strum within STRUM_ALTERNATE_S, when it comes back up. With a `duration`, all
     * the notes are released when it's up.
     *
     * Chords of more than three notes are played a little softer per note (√(3/n)), so a
     * six-note chord is about as loud as a triad instead of clipping.
     */
    function scheduleChord(player, names, start, { duration, direction } = {}) {
        const level = Math.min(1, Math.sqrt(3 / names.length));
        if (state.playStyle === 'block') {
            player.triggerAttack(names, start, level, duration);
            return;
        }
        const strum = state.playStyle === 'strum';
        const order = strum && (direction || strumDirection(start)) === 'up' ? [...names].reverse() : names;
        const step = (strum ? STRUM_STEP_MS : ARPEGGIO_STEP_MS) / 1000;
        order.forEach((name, i) => {
            const accent = strum ? 1 - (0.25 * i) / Math.max(1, order.length - 1) : 1;
            player.triggerAttack(name, start + i * step, level * accent, duration === undefined ? undefined : duration - i * step);
        });
    }

    function strumDirection(time) {
        const last = audio.lastStrum;
        const followsDown = last && last.direction === 'down' && time >= last.time && time - last.time < STRUM_ALTERNATE_S;
        const direction = followsDown ? 'up' : 'down';
        audio.lastStrum = { time, direction };
        return direction;
    }

    /** The current instrument's player, or null while it's loading (or failed to load). */
    function currentPlayer() {
        const entry = audio.instruments[state.instrument];
        return entry && entry.ready ? entry.player : null;
    }

    /** Silence everything at once, including notes not started yet (a touch that turned into a scroll). */
    function cutSound() {
        const player = currentPlayer();
        if (player) player.cut();
        audio.lastStrum = null; // that strum was never heard: the next one goes down
    }

    // Notes played on the 88-key piano
    function startNote(midi) {
        if (prepareAudio()) {
            currentPlayer().triggerAttack(ChordTheory.midiToNoteName(midi), Tone.immediate());
        }
    }

    // A key whose touch turned into a scroll of the keyboard is cut short
    function stopNote(midi, { cancelled = false } = {}) {
        const player = currentPlayer();
        if (player) player.triggerRelease(ChordTheory.midiToNoteName(midi), Tone.immediate(), cancelled ? 0.03 : undefined);
    }

    /** Report whether the current instrument can play yet (loading it if needed), resuming audio. */
    function prepareAudio() {
        if (audio.unavailable) {
            showStatus('status.audioFailed', 'error');
            return false;
        }
        const entry = audio.instruments[state.instrument];
        if (!entry || !entry.ready) {
            if (entry && entry.failed && performance.now() - entry.failedAt < RETRY_AFTER_MS) {
                showStatus(`status.samplesUnavailable.${state.instrument}`, 'error');
            } else {
                loadInstrument(state.instrument); // not loaded yet, or worth another try
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

    /**
     * Load an instrument's samples one by one, showing progress while it's the current
     * instrument. Does nothing if it's loaded or loading; tries again after a failure.
     */
    async function loadInstrument(name) {
        const existing = audio.instruments[name];
        if (existing && (existing.ready || existing.loading)) return;
        const instrument = INSTRUMENTS[name];
        const entry = { player: null, loaded: 0, ready: false, failed: false, failedAt: 0, loading: true };
        audio.instruments[name] = entry;
        const isCurrent = () => state.instrument === name;
        if (isCurrent()) showLoadingStatus();
        const format = instrument.formats.find(type => Tone.ToneAudioBuffer.supportsType(type))
            || instrument.formats[instrument.formats.length - 1];
        // One failed sample fails the instrument: stop downloading the others
        const downloads = new AbortController();
        try {
            const buffers = await Promise.all(instrument.notes.map(async note => {
                const url = `${instrument.baseUrl}${note.replace('#', 's')}.${format}`;
                const buffer = await SamplePlayer.loadBuffer(url, { signal: downloads.signal });
                entry.loaded++;
                if (isCurrent() && !entry.failed) showLoadingStatus();
                return [note, buffer];
            }));
            entry.player = new SamplePlayer({ release: instrument.release, volume: instrument.volume });
            buffers.forEach(([note, buffer]) => entry.player.add(note, buffer));
            entry.ready = true;
            if (isCurrent()) showStatus(`status.ready.${name}`, 'success', 2000);
        } catch (error) {
            downloads.abort();
            entry.failed = true;
            entry.failedAt = performance.now();
            console.error(`Could not load the ${name} samples:`, error);
            if (isCurrent()) showStatus(`status.samplesFailed.${name}`, 'error');
        } finally {
            entry.loading = false;
        }
    }

    function showLoadingStatus() {
        const entry = audio.instruments[state.instrument];
        const total = INSTRUMENTS[state.instrument].notes.length;
        // Whole tens, so screen readers aren't flooded with updates
        const percent = Math.floor(((entry ? entry.loaded : 0) / total) * 10) * 10;
        showStatus(`status.loading.${state.instrument}`, 'loading', 0, { percent });
    }

    /** Show a status message, given as an I18n key and its variables. */
    function showStatus(key, type, hideAfterMs = 0, vars = {}) {
        clearTimeout(statusTimer);
        statusMessage = { key, vars };
        const message = t(key, vars);
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
        ui.nowDetail.textContent = [ChordTheory.chordName(chord.entry), voicingLabel(voicing)].filter(Boolean).join(' · ');
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

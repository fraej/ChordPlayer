/**
 * Chord Player - app logic
 *
 * Wires the root picker, chord grid, voicings, chord info and 88-key piano
 * together and plays everything on a sampled grand piano (Tone.js).
 * Music theory lives in theory.js, the keyboards in keyboard.js and the
 * interface languages in i18n.js.
 *
 * Two layouts share the same elements:
 *  - wide screens: voicings in a popup next to the chord, chord info in a sidebar
 *  - phones/tablets: one sheet above the piano with Voicings and About tabs
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

    // Interface text in the current language (see i18n.js)
    const t = (key, vars) => (window.I18n ? I18n.t(key, vars) : key);

    const state = {
        rootPc: 0,              // selected root as a pitch class (0 = C)
        accidentals: 'sharp',   // how black-key roots are spelled: 'sharp' | 'flat'
        octave: 4,
        playStyle: 'block',     // 'block' | 'arpeggio'
        sheetTab: 'about',      // tab shown in the sheet on compact screens: 'voicings' | 'about'
        language: null,         // interface language picked by the user, or null to follow the browser
        lastPlayed: null        // { chord, voicing }, for replay and the info panel
    };

    const audio = {
        sampler: null,
        loadedSamples: 0,
        ready: false,
        failed: false,
        arpeggioTimers: []
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

        rootKeyboard = new RootKeyboard(ui.rootKeyboard, {
            names: noteNames(),
            selected: state.rootPc,
            onSelect: setRoot,
            label: t('rootNote'),
            spokenName
        });
        piano = new PianoKeyboard(ui.piano, { onNoteOn: startNote, onNoteOff: stopNote, label: t('pianoKeyboard') });
        // On narrow screens the piano scrolls: start in the middle of the selected octave
        piano.centerOn(12 * (state.octave + 1) + 6);

        bindEvents();
        syncControls();
        renderChords();
        renderChordInfo();
        syncSheetControls();

        if (window.Tone) {
            loadPiano();
        } else {
            audio.failed = true;
            showStatus('status.audioFailed', 'error');
        }
    }

    function cacheElements() {
        const byId = id => document.getElementById(id);
        const popupElement = byId('voicingPopup');
        const infoElement = byId('chordInfo');
        ui = {
            rootName: byId('rootName'),
            language: byId('language'),
            languageCode: document.querySelector('.language-code'),
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
        ui.chordGroups.addEventListener('click', handleChordClick);
        ui.popupBody.addEventListener('click', handleVoicingClick);
        ui.sheetVoicings.addEventListener('click', handleVoicingClick);
        ui.popupClose.addEventListener('click', () => closeChordView({ restoreFocus: true }));
        ui.infoClose.addEventListener('click', () => closeChordView({ restoreFocus: true }));
        ui.sheetTabs.forEach(tab => {
            tab.addEventListener('click', () => setSheetTab(tab.dataset.tab));
        });
        ui.replay.addEventListener('click', replay);
        ui.infoToggle.addEventListener('click', toggleSheet);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && view) {
                closeChordView({ restoreFocus: true });
            }
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
        document.addEventListener('pointerup', resumeAudio, true);
        document.addEventListener('keydown', resumeAudio, true);
    }

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
        if (!state.lastPlayed) ui.nowDetail.textContent = t('hint');
        if (statusMessage && !ui.status.hidden) ui.status.textContent = t(statusMessage.key, statusMessage.vars);
    }

    function setLanguage(code) {
        state.language = code in I18n.LANGUAGES ? code : null;
        saveSettings();
        translateStaticText();
        if (!catalogue) return; // the theory library didn't load: only the fixed text changes

        closeChordView();
        rootKeyboard.setLabels({ label: t('rootNote'), spokenName });
        piano.setLabel(t('pianoKeyboard'));
        renderChords();
        renderChordInfo();
        if (state.lastPlayed) showNowPlaying(state.lastPlayed.chord, state.lastPlayed.voicing);
    }

    function setRoot(pc) {
        state.rootPc = pc;
        closeChordView();
        syncControls();
        renderChords();
        saveSettings();
    }

    function setAccidentals(accidentals) {
        if (accidentals === state.accidentals) return;
        state.accidentals = accidentals;
        closeChordView();
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
        if (saved.sheetTab === 'voicings' || saved.sheetTab === 'about') {
            state.sheetTab = saved.sheetTab;
        }
        if (window.I18n && saved.language in I18n.LANGUAGES) {
            state.language = saved.language;
        }
    }

    function saveSettings() {
        const { rootPc, accidentals, octave, playStyle, sheetTab, language } = state;
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rootPc, accidentals, octave, playStyle, sheetTab, language }));
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
            el('h3', 'chord-group-title', ChordTheory.groupTitle(group)),
            el('div', 'chord-grid', group.chords.map(entry => createChordButton(entry, tonic)))
        ));
        ui.chordGroups.replaceChildren(...sections);
        applyFilter();
    }

    function createChordButton(entry, tonic) {
        const symbol = ChordTheory.chordSymbol(tonic, entry);
        const notes = ChordTheory.chordNotes(entry.id, tonic).map(ChordTheory.formatNote);
        const name = ChordTheory.chordName(entry);
        const count = el('span', 'note-count', String(entry.size));
        count.setAttribute('aria-hidden', 'true');

        const button = el('button', 'chord-button',
            el('span', 'chord-info',
                el('span', 'chord-symbol', symbol),
                // Many chord types have no name in Tonal; show their formula instead
                el('span', 'chord-name', name || entry.degrees.join(' '))),
            count);
        button.type = 'button';
        button.dataset.id = entry.id;
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.title = `${symbol}${name ? ` (${name})` : ''}: ${notes.join(' ')} · ${entry.degrees.join(' ')}`;
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
        ui.noMatches.textContent = total > 0 ? '' : t('noMatches', { query: query.trim() });
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

        if (view && view.button === button) {
            closeChordView(); // a second click on the same chord hides its voicings
        } else {
            // Keyboard activation (detail 0) moves focus into the popup or sheet
            openChordView(button, chord, { focus: event.detail === 0 });
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
     * List a chord's voicings: in the popup next to `button` on wide screens, in
     * the sheet on compact ones. `button` may be null when the sheet is reopened
     * for a chord that's no longer on screen.
     */
    function openChordView(button, chord, { focus = false } = {}) {
        closeChordView();
        const compact = isCompact();
        const container = compact ? ui.sheetVoicings : ui.popupBody;
        const playing = state.lastPlayed && state.lastPlayed.chord === chord ? state.lastPlayed.voicing : null;
        const voicings = renderVoicingList(container, chord, playing);
        view = { button, chord, voicings, container };

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

    function renderVoicingList(container, chord, playing) {
        const voicings = [];
        const sections = ChordTheory.voicingGroups(chord.pitchClasses, state.octave).map(group => el('div', 'inversion-group',
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

    function handleVoicingClick(event) {
        const button = event.target.closest('.voicing-button');
        if (!button || !view) return;
        view.container.querySelectorAll('.active-voicing').forEach(active => active.classList.remove('active-voicing'));
        button.classList.add('active-voicing');
        play(view.chord, view.voicings[Number(button.dataset.index)]);
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

    // The Details button in the dock: reopen the sheet for whatever played last
    function toggleSheet() {
        if (isSheetOpen()) {
            closeChordView();
        } else if (state.lastPlayed) {
            const { chord } = state.lastPlayed;
            const button = chord.tonic === rootName()
                ? ui.chordGroups.querySelector(`.chord-button[data-id="${CSS.escape(chord.entry.id)}"]`)
                : null;
            openChordView(button, chord);
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
        ui.infoToggle.disabled = !state.lastPlayed;
        ui.infoToggle.setAttribute('aria-expanded', String(isSheetOpen()));
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
    function play(chord, voicing) {
        state.lastPlayed = { chord, voicing };
        showNowPlaying(chord, voicing);
        renderChordInfo();
        syncSheetControls();
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
                showStatus('status.samplesUnavailable', 'error');
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
            showStatus('status.ready', 'success', 2000);
        } catch (error) {
            audio.failed = true;
            console.error('Could not load the piano samples:', error);
            showStatus('status.samplesFailed', 'error');
        }
    }

    function showLoadingStatus() {
        // Whole tens, so screen readers aren't flooded with updates
        const percent = Math.floor((audio.loadedSamples / SAMPLE_NOTES.length) * 10) * 10;
        showStatus('status.loading', 'loading', 0, { percent });
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

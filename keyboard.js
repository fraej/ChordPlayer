/**
 * SVG keyboard components
 *
 *  - RootKeyboard: a one-octave keyboard used to pick the root note. It behaves
 *    like a radio group, so it also works with Tab and the arrow keys.
 *  - PianoKeyboard: a full 88-key piano that shows which notes are sounding and
 *    can be played with the mouse or by touch.
 *
 * Colours come from CSS classes (.selected, .active, .root, .pressed).
 */
(function (root) {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
    const WHITE_KEY_LETTERS = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

    const pitchClassOf = midi => ((midi % 12) + 12) % 12;
    const isBlackKey = midi => BLACK_PITCH_CLASSES.has(pitchClassOf(midi));

    function svgElement(tag, attributes = {}) {
        const element = document.createElementNS(SVG_NS, tag);
        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, value);
        }
        return element;
    }

    function resolveContainer(container) {
        const element = typeof container === 'string' ? document.getElementById(container) : container;
        if (!element) {
            throw new Error('Keyboard container element not found');
        }
        return element;
    }

    // "C#" -> "C♯", "Bb" -> "B♭"
    const prettyName = name => name.charAt(0) + name.slice(1).replace(/#/g, '♯').replace(/b/g, '♭');
    // "C#" -> "C sharp", "Bb" -> "B flat" (for screen readers)
    const spokenName = name => name.charAt(0) + name.slice(1).replace(/#/g, ' sharp').replace(/b/g, ' flat');

    // ---------------------------------------------------------------------
    // Root picker
    // ---------------------------------------------------------------------

    // Fixed one-octave layout in viewBox units: [pitch class, x]
    const ROOT_LAYOUT = {
        whiteWidth: 50,
        blackWidth: 30,
        height: 80,
        blackHeight: 50,
        white: [[0, 0], [2, 50], [4, 100], [5, 150], [7, 200], [9, 250], [11, 300]],
        black: [[1, 35], [3, 85], [6, 185], [8, 235], [10, 285]]
    };

    class RootKeyboard {
        /**
         * @param {string|HTMLElement} container - Element (or its id) to draw into
         * @param {Object} options
         * @param {string[]} options.names - The 12 note names starting from C, e.g. "C#" or "Db"
         * @param {number} [options.selected=0] - Selected pitch class (0-11)
         * @param {function(number)} [options.onSelect] - Called with the pitch class the user picks
         */
        constructor(container, { names, selected = 0, onSelect = null } = {}) {
            this.container = resolveContainer(container);
            this.onSelect = onSelect;
            this.render();
            this.setNames(names);
            this.select(selected);
        }

        render() {
            const { whiteWidth, blackWidth, height, blackHeight } = ROOT_LAYOUT;
            this.svg = svgElement('svg', {
                class: 'root-keyboard',
                viewBox: `0 0 ${whiteWidth * 7} ${height}`,
                role: 'radiogroup',
                'aria-label': 'Root note'
            });
            this.keys = [];

            const addKey = (pc, x, black) => {
                const width = black ? blackWidth : whiteWidth;
                const keyHeight = black ? blackHeight : height;
                const key = svgElement('g', { class: `key ${black ? 'black' : 'white'}`, role: 'radio', 'data-pc': pc });
                key.appendChild(svgElement('rect', { x, y: 0, width, height: keyHeight, rx: 3 }));
                const label = svgElement('text', { x: x + width / 2, y: keyHeight - 10, 'aria-hidden': 'true' });
                key.appendChild(label);
                key.addEventListener('click', () => this.choose(pc));
                this.svg.appendChild(key);
                this.keys[pc] = { key, label };
            };

            // White keys first so the black keys are drawn on top of them
            ROOT_LAYOUT.white.forEach(([pc, x]) => addKey(pc, x, false));
            ROOT_LAYOUT.black.forEach(([pc, x]) => addKey(pc, x, true));

            this.svg.addEventListener('keydown', event => this.handleKeyDown(event));
            this.container.replaceChildren(this.svg);
        }

        /** Relabel the keys, e.g. when switching between sharps and flats. */
        setNames(names) {
            this.keys.forEach(({ key, label }, pc) => {
                label.textContent = prettyName(names[pc]);
                key.setAttribute('aria-label', spokenName(names[pc]));
            });
        }

        /** Mark a pitch class as selected without notifying the listener. */
        select(pc) {
            this.selected = pc;
            this.keys.forEach(({ key }, index) => {
                const checked = index === pc;
                key.classList.toggle('selected', checked);
                key.setAttribute('aria-checked', String(checked));
                key.setAttribute('tabindex', checked ? '0' : '-1');
            });
        }

        /** Select a pitch class as if the user had picked it. */
        choose(pc) {
            this.select(pc);
            if (typeof this.onSelect === 'function') {
                this.onSelect(pc);
            }
        }

        handleKeyDown(event) {
            const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
            let pc;
            if (event.key in steps) {
                pc = (this.selected + steps[event.key] + 12) % 12;
            } else if (event.key === 'Home') {
                pc = 0;
            } else if (event.key === 'End') {
                pc = 11;
            } else if (event.key === ' ' || event.key === 'Enter') {
                const key = event.target.closest('[data-pc]');
                pc = key ? Number(key.getAttribute('data-pc')) : this.selected;
            } else {
                return;
            }
            event.preventDefault();
            this.choose(pc);
            this.keys[pc].key.focus();
        }
    }

    // ---------------------------------------------------------------------
    // 88-key piano
    // ---------------------------------------------------------------------

    class PianoKeyboard {
        /**
         * @param {string|HTMLElement} container - Scrollable element (or its id) to draw into.
         *   Its `--piano-height` CSS variable sets the height of the keys.
         * @param {Object} options
         * @param {number} [options.low=21] - Lowest MIDI note (A0)
         * @param {number} [options.high=108] - Highest MIDI note (C8)
         * @param {number} [options.minWhiteKeyWidth=18] - Keys never get narrower than this;
         *   the container scrolls horizontally instead
         * @param {function(number)} [options.onNoteOn] - Called with a MIDI note when a key is pressed
         * @param {function(number)} [options.onNoteOff] - Called with a MIDI note when a key is released
         */
        constructor(container, { low = 21, high = 108, minWhiteKeyWidth = 18, onNoteOn = null, onNoteOff = null } = {}) {
            this.container = resolveContainer(container);
            this.low = low;
            this.high = high;
            this.minWhiteKeyWidth = minWhiteKeyWidth;
            this.onNoteOn = onNoteOn;
            this.onNoteOff = onNoteOff;
            this.highlighted = [];      // [{ midi, label, root }]
            this.pointers = new Map();  // pointerId -> MIDI note held by that pointer

            this.render();
            this.bindPointerEvents();

            // Redraw whenever the available width changes so the keys always fill it
            this.renderedWidth = this.container.clientWidth;
            new ResizeObserver(() => {
                if (this.container.clientWidth !== this.renderedWidth) {
                    this.renderedWidth = this.container.clientWidth;
                    this.render();
                }
            }).observe(this.container);
        }

        render() {
            let whiteCount = 0;
            for (let midi = this.low; midi <= this.high; midi++) {
                if (!isBlackKey(midi)) whiteCount++;
            }
            const keyWidth = Math.max(this.minWhiteKeyWidth, this.container.clientWidth / whiteCount);
            const width = keyWidth * whiteCount;
            const height = parseFloat(getComputedStyle(this.container).getPropertyValue('--piano-height')) || 120;
            const blackWidth = keyWidth * 0.6;
            const blackHeight = height * 0.62;

            const piano = svgElement('svg', {
                class: 'piano',
                width,
                height,
                viewBox: `0 0 ${width} ${height}`,
                'font-size': Math.min(11, Math.max(8, keyWidth * 0.4)).toFixed(1),
                role: 'img',
                'aria-label': 'Piano keyboard'
            });
            const whiteLayer = svgElement('g');
            const blackLayer = svgElement('g');
            piano.append(whiteLayer, blackLayer);

            this.keys = new Map();
            let whiteIndex = 0;
            for (let midi = this.low; midi <= this.high; midi++) {
                const black = isBlackKey(midi);
                // Black keys sit centred on the boundary between their two white neighbours
                const x = black ? whiteIndex * keyWidth - blackWidth / 2 : whiteIndex * keyWidth;
                const keyWidthHere = black ? blackWidth : keyWidth;
                const keyHeight = black ? blackHeight : height;
                const octave = Math.floor(midi / 12) - 1;
                const letter = WHITE_KEY_LETTERS[pitchClassOf(midi)];
                // White keys show their letter; each C also shows its octave
                const defaultLabel = letter === 'C' ? `C${octave}` : letter;

                const group = svgElement('g', {
                    class: `key ${black ? 'black' : 'white'}${letter === 'C' ? ' c-key' : ''}`,
                    'data-midi': midi
                });
                group.appendChild(svgElement('rect', { x, y: 0, width: keyWidthHere, height: keyHeight, rx: 2 }));
                const label = svgElement('text', { x: x + keyWidthHere / 2, y: keyHeight - (black ? 6 : 7) });
                label.textContent = defaultLabel;
                group.appendChild(label);
                (black ? blackLayer : whiteLayer).appendChild(group);

                this.keys.set(midi, { group, label, defaultLabel, x, width: keyWidthHere });
                if (!black) whiteIndex++;
            }

            this.container.replaceChildren(piano);
            this.applyHighlight();
            for (const midi of this.pointers.values()) {
                this.setPressed(midi, true);
            }
        }

        /** Show which notes are sounding: [{ midi, label, root }]. Replaces the previous highlight. */
        highlight(notes) {
            this.highlighted = notes;
            this.applyHighlight();
        }

        applyHighlight() {
            for (const key of this.keys.values()) {
                key.group.classList.remove('active', 'root');
                key.label.textContent = key.defaultLabel;
            }
            for (const { midi, label, root: isRoot } of this.highlighted) {
                const key = this.keys.get(midi);
                if (!key) continue;
                key.group.classList.add('active');
                key.group.classList.toggle('root', Boolean(isRoot));
                if (label) key.label.textContent = label;
            }
        }

        /** Scroll so a note sits in the middle of the visible part of the keyboard. */
        centerOn(midi) {
            const key = this.keys.get(midi);
            if (key) {
                this.container.scrollLeft = key.x + key.width / 2 - this.container.clientWidth / 2;
            }
        }

        /** Scroll so the highlighted notes are in view (centred, if any were off-screen). */
        revealHighlight() {
            const keys = this.highlighted.map(note => this.keys.get(note.midi)).filter(Boolean);
            if (keys.length === 0) return;
            const left = Math.min(...keys.map(key => key.x));
            const right = Math.max(...keys.map(key => key.x + key.width));
            const view = this.container;
            if (left >= view.scrollLeft && right <= view.scrollLeft + view.clientWidth) return;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            view.scrollTo({ left: (left + right) / 2 - view.clientWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
        }

        bindPointerEvents() {
            const keyAt = (x, y) => {
                const element = document.elementFromPoint(x, y);
                const key = element && element.closest ? element.closest('[data-midi]') : null;
                return key && this.container.contains(key) ? Number(key.getAttribute('data-midi')) : null;
            };

            this.container.addEventListener('pointerdown', event => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                const midi = keyAt(event.clientX, event.clientY);
                if (midi === null) return;
                if (event.pointerType === 'mouse') event.preventDefault(); // no text selection while dragging
                this.press(event.pointerId, midi);
            });

            // Glissando: dragging with a mouse or pen plays each key it crosses.
            // (Touch drags scroll the keyboard instead.)
            this.container.addEventListener('pointermove', event => {
                if (event.pointerType === 'touch' || !this.pointers.has(event.pointerId)) return;
                const midi = keyAt(event.clientX, event.clientY);
                if (midi !== null && midi !== this.pointers.get(event.pointerId)) {
                    this.press(event.pointerId, midi);
                }
            });

            const release = event => this.release(event.pointerId);
            window.addEventListener('pointerup', release);
            window.addEventListener('pointercancel', release);
        }

        press(pointerId, midi) {
            this.release(pointerId);
            this.pointers.set(pointerId, midi);
            this.setPressed(midi, true);
            if (typeof this.onNoteOn === 'function') this.onNoteOn(midi);
        }

        release(pointerId) {
            if (!this.pointers.has(pointerId)) return;
            const midi = this.pointers.get(pointerId);
            this.pointers.delete(pointerId);
            // Another finger may still be holding the same key
            if (![...this.pointers.values()].includes(midi)) {
                this.setPressed(midi, false);
                if (typeof this.onNoteOff === 'function') this.onNoteOff(midi);
            }
        }

        setPressed(midi, pressed) {
            const key = this.keys.get(midi);
            if (key) key.group.classList.toggle('pressed', pressed);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RootKeyboard, PianoKeyboard };
    } else {
        root.RootKeyboard = RootKeyboard;
        root.PianoKeyboard = PianoKeyboard;
    }
})(typeof window !== 'undefined' ? window : globalThis);

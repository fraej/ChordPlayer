/**
 * ChordTheory - chord catalogue, note spelling and voicing helpers built on Tonal.
 *
 * Everything in here is pure (no DOM access), so it can be reused or tested
 * outside the browser. Exposed as `window.ChordTheory` (or `module.exports`).
 */
(function (root) {
    'use strict';

    const Tonal = root.Tonal;
    if (!Tonal) {
        throw new Error('ChordTheory needs Tonal to be loaded first');
    }

    const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Voicings whose top note would sit above C7 are moved down an octave,
    // which keeps higher inversions of extended chords from sounding shrill...
    const MIDI_CEILING = 96;
    // ...as long as that doesn't push them off the bottom of the piano (A0).
    const MIDI_FLOOR = 21;

    // Curated groups, most common chords first. Symbols may be any Tonal alias;
    // every chord type not listed here ends up in "More chords".
    const CHORD_GROUPS = [
        { title: 'Triads', symbols: ['M', 'm', 'dim', 'aug', 'sus2', 'sus4'] },
        { title: 'Sevenths', symbols: ['7', 'maj7', 'm7', 'm7b5', 'dim7', 'mMaj7', '7sus4', 'maj7#5'] },
        { title: 'Sixths & added tones', symbols: ['6', 'm6', '69', 'm69', 'add9', 'madd9'] },
        { title: 'Extended', symbols: ['9', 'maj9', 'm9', '9sus4', '11', 'maj11', 'm11', '13', 'maj13', 'm13'] },
        { title: 'Altered dominants', symbols: ['7b9', '7#9', '7b5', '7#5', '7#11', '7b13', '7alt', '13b9', '13#11'] }
    ];

    // Friendlier display symbols where Tonal's primary alias is unusual
    const DISPLAY_SUFFIX = {
        'M': '',
        'maj#4': 'maj7#11',
        'm/ma7': 'mMaj7',
        'Madd9': 'add9',
        '6add9': '6/9',
        'M#5add9': '+add9',
        'mM9': 'mMaj9'
    };

    const INVERSION_NAMES = [
        'Root position', '1st inversion', '2nd inversion', '3rd inversion',
        '4th inversion', '5th inversion', '6th inversion'
    ];

    const mod12 = n => ((n % 12) + 12) % 12;
    const midiOf = note => Tonal.Note.midi(note);

    // ---------------------------------------------------------------------
    // Spelling & formatting
    // ---------------------------------------------------------------------

    /** Name of a pitch class (0-11), spelled with sharps or flats. */
    function pitchClassName(pc, accidentals) {
        return (accidentals === 'flat' ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
    }

    /** Sharp-spelled name of a MIDI note, e.g. 70 -> "A#4". */
    function midiToNoteName(midi) {
        return SHARP_NAMES[mod12(midi)] + (Math.floor(midi / 12) - 1);
    }

    function accidentalGlyphs(alt) {
        return alt > 0 ? '♯'.repeat(alt) : '♭'.repeat(-alt);
    }

    /**
     * Split a note into display parts using real accidentals:
     * "Bb4" -> { name: "B♭", octave: 4 }, "F#" -> { name: "F♯", octave: null }.
     */
    function noteParts(note) {
        const parsed = Tonal.Note.get(note);
        if (parsed.empty) return { name: note, octave: null };
        return {
            name: parsed.letter + accidentalGlyphs(parsed.alt),
            octave: typeof parsed.oct === 'number' ? parsed.oct : null
        };
    }

    /** "Bb4" -> "B♭4", "C#" -> "C♯". */
    function formatNote(note) {
        const { name, octave } = noteParts(note);
        return octave === null ? name : name + octave;
    }

    /** Chord suffix with real accidentals: "m7b5" -> "m7♭5", "7#9" -> "7♯9". */
    function formatSuffix(suffix) {
        return suffix.replace(/#/g, '♯').replace(/b(?=\d)/g, '♭');
    }

    /** Scale degree of an interval: "7m" -> "♭7", "5A" -> "♯5", "9M" -> "9". */
    function intervalDegree(interval) {
        const { num, alt } = Tonal.Interval.get(interval);
        return accidentalGlyphs(alt) + num;
    }

    // ---------------------------------------------------------------------
    // Chord catalogue
    // ---------------------------------------------------------------------

    function toEntry(type) {
        const id = type.aliases[0];
        return {
            id,                                   // Tonal's primary alias, used for lookups
            suffix: id in DISPLAY_SUFFIX ? DISPLAY_SUFFIX[id] : id,
            name: type.name,
            aliases: type.aliases,
            degrees: type.intervals.map(intervalDegree),
            size: type.intervals.length
        };
    }

    /**
     * Every Tonal chord type, grouped for display:
     * [{ title, chords: [{ id, suffix, name, aliases, degrees, size }] }].
     */
    function buildCatalogue() {
        const entries = new Map();
        Tonal.ChordType.all()
            .filter(type => type.aliases.length > 0)
            .forEach(type => entries.set(type.aliases[0], toEntry(type)));

        const used = new Set();
        const groups = CHORD_GROUPS.map(({ title, symbols }) => {
            const chords = symbols
                .map(symbol => Tonal.ChordType.get(symbol))
                .filter(type => !type.empty && type.aliases.length > 0)
                .map(type => entries.get(type.aliases[0]))
                .filter(entry => entry && !used.has(entry.id));
            chords.forEach(entry => used.add(entry.id));
            return { title, chords };
        }).filter(group => group.chords.length > 0);

        // Everything else, smallest chords first (sort is stable, so Tonal's order breaks ties)
        const rest = [...entries.values()]
            .filter(entry => !used.has(entry.id))
            .sort((a, b) => a.size - b.size);
        if (rest.length > 0) groups.push({ title: 'More chords', chords: rest });

        return groups;
    }

    const normalizeQuery = text => text.toLowerCase()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/\s+/g, ' ')
        .trim();

    /** Whether a catalogue entry matches a free-text filter (case-insensitive, ♯/♭ aware). */
    function entryMatches(entry, query) {
        const q = normalizeQuery(query);
        if (!q) return true;
        return [entry.suffix, entry.name, ...entry.aliases]
            .some(text => normalizeQuery(text).includes(q));
    }

    /** Spelled chord tones, e.g. ("7", "C") -> ["C", "E", "G", "Bb"]. */
    function chordNotes(id, tonic) {
        // Looking the type and tonic up separately avoids Tonal re-parsing a
        // joined string ("C" + "b9sus" would otherwise read as a C♭ chord).
        const chord = Tonal.Chord.getChord(id, tonic);
        return chord.empty ? [] : chord.notes;
    }

    // ---------------------------------------------------------------------
    // Voicings
    // ---------------------------------------------------------------------

    function shiftOctaves(notes, octaves) {
        return notes.map(note => {
            const { pc, oct } = Tonal.Note.get(note);
            return pc + (oct + octaves);
        });
    }

    const sortByPitch = notes => [...notes].sort((a, b) => midiOf(a) - midiOf(b));
    const rotate = (list, n) => list.slice(n).concat(list.slice(0, n));

    /** Stack pitch classes upwards from `octave`, each note strictly above the last. */
    function stackUp(pitchClasses, octave) {
        const notes = [];
        let oct = octave;
        let previous = -Infinity;
        for (const pc of pitchClasses) {
            let midi = midiOf(pc + oct);
            if (midi === null) return [];
            while (midi <= previous) {
                oct++;
                midi = midiOf(pc + oct);
            }
            notes.push(pc + oct);
            previous = midi;
        }
        return notes;
    }

    /** Move a voicing down whole octaves until its top note is at or below the ceiling. */
    function clampToRange(notes) {
        let result = notes;
        const top = () => Math.max(...result.map(midiOf));
        const bottom = () => Math.min(...result.map(midiOf));
        while (result.length > 0 && top() > MIDI_CEILING && bottom() - 12 >= MIDI_FLOOR) {
            result = shiftOctaves(result, -1);
        }
        return result;
    }

    /** Close-position voicing of an inversion, with its bass note in `octave`. */
    function closeVoicing(pitchClasses, inversion, octave) {
        return clampToRange(stackUp(rotate(pitchClasses, inversion), octave));
    }

    function raiseOctave(notes, indexes) {
        return notes.map((note, i) => (indexes.includes(i) ? shiftOctaves([note], 1)[0] : note));
    }

    /**
     * Close and open voicings for every inversion of a chord.
     * Open voicings raise one or two of the upper notes of the close voicing by an octave.
     * Returns [{ type: 'close' | 'open', inversion, voicings: [{ notes, span }] }],
     * close groups first, each group's voicings ordered from narrowest to widest.
     */
    function voicingGroups(pitchClasses, octave) {
        const seen = new Set();
        const closeGroups = [];
        const openGroups = [];

        const add = (group, notes) => {
            const sorted = sortByPitch(clampToRange(notes));
            const key = sorted.map(midiOf).join(',');
            if (sorted.length === 0 || seen.has(key)) return;
            seen.add(key);
            group.voicings.push({ notes: sorted, span: midiOf(sorted[sorted.length - 1]) - midiOf(sorted[0]) });
        };

        const count = pitchClasses.length;
        for (let inversion = 0; inversion < count; inversion++) {
            const base = stackUp(rotate(pitchClasses, inversion), octave);
            const close = { type: 'close', inversion, voicings: [] };
            const open = { type: 'open', inversion, voicings: [] };

            add(close, base);
            for (let i = 1; i < count; i++) {
                add(open, raiseOctave(base, [i]));
                for (let j = i + 1; j < count; j++) {
                    add(open, raiseOctave(base, [i, j]));
                }
            }
            closeGroups.push(close);
            openGroups.push(open);
        }

        return closeGroups.concat(openGroups)
            .filter(group => group.voicings.length > 0)
            .map(group => ({ ...group, voicings: group.voicings.sort((a, b) => a.span - b.span) }));
    }

    /** Degree label (e.g. "♭7") for each note of a voicing. */
    function noteDegrees(notes, pitchClasses, degrees) {
        return notes.map(note => degrees[pitchClasses.indexOf(Tonal.Note.pitchClass(note))] || '');
    }

    function inversionName(index) {
        return INVERSION_NAMES[index] || `Inversion ${index}`;
    }

    const ChordTheory = {
        SHARP_NAMES,
        FLAT_NAMES,
        MIDI_CEILING,
        pitchClassName,
        midiToNoteName,
        noteParts,
        formatNote,
        formatSuffix,
        intervalDegree,
        buildCatalogue,
        entryMatches,
        chordNotes,
        closeVoicing,
        voicingGroups,
        noteDegrees,
        inversionName,
        midi: midiOf,
        pitchClass: note => Tonal.Note.pitchClass(note)
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChordTheory;
    } else {
        root.ChordTheory = ChordTheory;
    }
})(typeof window !== 'undefined' ? window : globalThis);

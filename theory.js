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

    // Words come from I18n (i18n.js) when it's loaded; without it, the keys show
    const t = (key, vars) => (root.I18n ? root.I18n.t(key, vars) : key);
    const hasText = key => Boolean(root.I18n && root.I18n.has(key));

    const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Voicings whose top note would sit above C7 are moved down an octave,
    // which keeps higher inversions of extended chords from sounding shrill...
    const MIDI_CEILING = 96;
    // ...as long as that doesn't push them off the bottom of the piano (A0).
    const MIDI_FLOOR = 21;

    // Curated groups, most common chords first. Symbols may be any Tonal alias;
    // every chord type not listed here ends up in "More chords". Titles are I18n keys.
    const CHORD_GROUPS = [
        { key: 'group.triads', symbols: ['M', 'm', 'dim', 'aug', 'sus2', 'sus4'] },
        { key: 'group.sevenths', symbols: ['7', 'maj7', 'm7', 'm7b5', 'dim7', 'mMaj7', '7sus4', 'maj7#5'] },
        { key: 'group.sixths', symbols: ['6', 'm6', '69', 'm69', 'add9', 'madd9'] },
        { key: 'group.extended', symbols: ['9', 'maj9', 'm9', '9sus4', '11', 'maj11', 'm11', '13', 'maj13', 'm13'] },
        { key: 'group.altered', symbols: ['7b9', '7#9', '7b5', '7#5', '7#11', '7b13', '7alt', '13b9', '13#11'] }
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
            intervals: type.intervals,
            chroma: type.chroma,                  // 12-character pitch-class set relative to the root
            degrees: type.intervals.map(intervalDegree),
            size: type.intervals.length
        };
    }

    /** Display symbol of a chord, e.g. ("Bb", m7b5 entry) -> "B♭m7♭5". */
    function chordSymbol(tonic, entry) {
        return formatNote(tonic) + formatSuffix(entry.suffix);
    }

    /** Name of a chord type in the current language ("" when it has none). */
    function chordName(entry) {
        return hasText(`chord.${entry.id}`) ? t(`chord.${entry.id}`) : entry.name;
    }

    /** Title of a catalogue group in the current language. */
    function groupTitle(group) {
        return t(group.key);
    }

    /**
     * Every Tonal chord type, grouped for display:
     * [{ key, chords: [{ id, suffix, name, aliases, intervals, chroma, degrees, size }] }],
     * where `key` is the I18n key of the group's title (see groupTitle).
     */
    function buildCatalogue() {
        const entries = new Map();
        Tonal.ChordType.all()
            .filter(type => type.aliases.length > 0)
            .forEach(type => entries.set(type.aliases[0], toEntry(type)));

        const used = new Set();
        const groups = CHORD_GROUPS.map(({ key, symbols }) => {
            const chords = symbols
                .map(symbol => Tonal.ChordType.get(symbol))
                .filter(type => !type.empty && type.aliases.length > 0)
                .map(type => entries.get(type.aliases[0]))
                .filter(entry => entry && !used.has(entry.id));
            chords.forEach(entry => used.add(entry.id));
            return { key, chords };
        }).filter(group => group.chords.length > 0);

        // Everything else, smallest chords first (sort is stable, so Tonal's order breaks ties)
        const rest = [...entries.values()]
            .filter(entry => !used.has(entry.id))
            .sort((a, b) => a.size - b.size);
        if (rest.length > 0) groups.push({ key: 'group.more', chords: rest });

        return groups;
    }

    const normalizeQuery = text => text.toLowerCase()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/\s+/g, ' ')
        .trim();

    /**
     * Whether a catalogue entry matches a free-text filter (case-insensitive, ♯/♭ aware).
     * Both the English and the translated chord name count.
     */
    function entryMatches(entry, query) {
        const q = normalizeQuery(query);
        if (!q) return true;
        return [entry.suffix, entry.name, chordName(entry), ...entry.aliases]
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

    /** "Root position", "1st inversion"… in the current language. */
    function inversionName(index) {
        return t('inversion', index);
    }

    // ---------------------------------------------------------------------
    // Chord information (shown when a chord is played)
    // ---------------------------------------------------------------------

    /** "3M" -> "major third", "7m" -> "minor seventh", "8P" -> "octave" (in the current language). */
    function intervalName(interval) {
        const { num, q } = Tonal.Interval.get(interval);
        return t('interval', { num, q });
    }

    /** Short interval name: "3m" -> "m3", "4A" -> "A4". */
    function intervalShort(interval) {
        const { num, q } = Tonal.Interval.get(interval);
        return q + num;
    }

    /** Distance in semitones as words: 7 -> "perfect fifth", 19 -> "octave + perfect fifth". */
    function semitoneName(semitones) {
        const octaves = Math.floor(semitones / 12);
        const rest = semitones % 12;
        const simple = rest === 0 ? '' : intervalName(Tonal.Interval.fromSemitones(rest));
        if (octaves === 0) return simple || t('interval', { num: 1, q: 'P' });
        const octaveText = t('octaves', octaves);
        return simple ? `${octaveText} + ${simple}` : octaveText;
    }

    // A chord tone in a recipe: "minor 7th", "♭9th", "♯11th", "6th"
    function toneName(interval) {
        const { num, q, alt } = Tonal.Interval.get(interval);
        return t('recipe.tone', { num, q, degree: accidentalGlyphs(alt) + num });
    }

    /** Broad family a chord belongs to: Major, Minor, Dominant, Diminished… */
    function chordFamily(entry) {
        const has = interval => entry.intervals.includes(interval);
        if (entry.id === '5') return t('family.power');
        if (entry.id === '4') return t('family.quartal');
        if (has('3M') && has('7m')) return t('family.dominant');
        if (has('3m') && has('5d') && has('7m')) return t('family.halfDiminished');
        if (has('3m') && has('5d')) return t('family.diminished');
        if (has('3M') && has('5A')) return t('family.augmented');
        if (has('3M')) return t('family.major');
        if (has('3m')) return t('family.minor');
        return t('family.suspended');
    }

    /** How a chord is built, e.g. "Major triad + minor 7th + ♯9th". */
    function chordRecipe(entry) {
        if (entry.id === '4') return t('recipe.quartal');
        const rest = new Set(entry.intervals.filter(interval => interval !== '1P'));
        const take = (...wanted) => {
            if (!wanted.every(interval => rest.has(interval))) return false;
            wanted.forEach(interval => rest.delete(interval));
            return true;
        };
        let base;
        if (take('3M', '5P')) base = t('recipe.major');
        else if (take('3m', '5P')) base = t('recipe.minor');
        else if (take('3m', '5d')) base = t('recipe.diminished');
        else if (take('3M', '5A')) base = t('recipe.augmented');
        else if (take('3M', '5d')) base = t('recipe.majorFlat5');
        else if (take('3m', '5A')) base = t('recipe.minorSharp5');
        else if (take('3M')) base = t('recipe.major3');
        else if (take('3m')) base = t('recipe.minor3');
        else if (take('4P', '5P')) base = t('recipe.sus4');
        else if (take('2M', '5P')) base = t('recipe.sus2');
        else if (take('5P')) base = t('recipe.power');
        else base = t('recipe.root');
        return [base, ...[...rest].map(toneName)].join(' + ');
    }

    /** Other ways to write the chord, e.g. C7 -> ["Cdom"]. */
    function aliasSymbols(tonic, entry) {
        const root = formatNote(tonic);
        const shown = chordSymbol(tonic, entry);
        const symbols = entry.aliases.map(alias => root + formatSuffix(alias.replace(/\^/g, 'Δ')));
        return [...new Set(symbols)].filter(symbol => symbol !== shown);
    }

    /** Figured-bass label of an inverted triad or seventh chord ("6/4", "6/5"…), or null. */
    function figuredBass(entry, inversion) {
        const numbers = entry.intervals.map(interval => Tonal.Interval.get(interval).num).join(',');
        if (numbers === '1,3,5') return ['5/3', '6/3', '6/4'][inversion];
        if (numbers === '1,3,5,7') return ['7', '6/5', '4/3', '4/2'][inversion];
        return null;
    }

    const KEY_SCALES = [
        { mode: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
        { mode: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
        { mode: 'minor', variant: 'harmonic', steps: [0, 2, 3, 5, 7, 8, 11] },
        { mode: 'minor', variant: 'melodic', steps: [0, 2, 3, 5, 7, 9, 11] }
    ];
    const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    // Usual key names; the 6♯/6♭ ties (null) follow the sharp/flat preference
    const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', null, 'G', 'Ab', 'A', 'Bb', 'B'];
    const MINOR_KEY_NAMES = ['C', 'C#', 'D', null, 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

    /** Roman numeral of a chord on a scale degree (0-6): "V7", "ii7", "vii°", "iiø7". */
    function romanNumeral(degree, entry) {
        const minor = entry.intervals.includes('3m') && !entry.intervals.includes('3M');
        const numeral = minor ? NUMERALS[degree].toLowerCase() : NUMERALS[degree];
        // The numeral's case already says major/minor, so those symbols fold away
        const special = { 'M': '', 'm': '', 'dim': '°', 'aug': '+', 'm7b5': 'ø7', 'dim7': '°7' };
        let suffix = entry.id in special ? special[entry.id] : entry.suffix;
        if (!(entry.id in special) && minor && /^m(?!aj)/.test(suffix)) {
            suffix = suffix.slice(1);
        }
        return numeral + formatSuffix(suffix);
    }

    /**
     * Major and minor keys a chord belongs to, with its roman numeral there:
     * [{ mode: 'major' | 'minor', variant: undefined | 'harmonic' | 'melodic', tonicPc, numeral }],
     * major keys first, then by scale degree. Every chord tone has to sit on its own
     * scale degree, so C°7 is vii°7 in D♭ minor but not a chord on the 6th of E minor,
     * even though the same four pitches are in that scale.
     */
    function keyFunctions(entry, rootPc) {
        const found = new Map();
        for (const scale of KEY_SCALES) {
            for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
                const degree = scale.steps.indexOf(mod12(rootPc - tonicPc));
                if (degree < 0) continue;
                const fits = entry.intervals.every(interval => {
                    const { num, semitones } = Tonal.Interval.get(interval);
                    const step = scale.steps[(degree + num - 1) % 7] - scale.steps[degree];
                    return mod12(step) === mod12(semitones);
                });
                // Natural minor comes first, so the harmonic/melodic tag only shows when needed
                const id = `${scale.mode}:${tonicPc}:${degree}`;
                if (fits && !found.has(id)) {
                    found.set(id, { mode: scale.mode, variant: scale.variant, tonicPc, degree, numeral: romanNumeral(degree, entry) });
                }
            }
        }
        return [...found.values()].sort((a, b) =>
            (a.mode === b.mode ? a.degree - b.degree : a.mode === 'major' ? -1 : 1));
    }

    function keyName(tonicPc, mode, accidentals) {
        const names = mode === 'major' ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES;
        return names[mod12(tonicPc)] || pitchClassName(tonicPc, accidentals);
    }

    // Common scales to suggest over a chord, in order of preference (Tonal names;
    // the labels are the I18n keys "scale.<name>")
    const SCALE_SUGGESTIONS = [
        'major', 'minor', 'dorian', 'mixolydian', 'lydian', 'phrygian', 'locrian',
        'major pentatonic', 'minor pentatonic', 'minor blues', 'harmonic minor', 'melodic minor',
        'lydian dominant', 'altered', 'phrygian dominant', 'locrian #2',
        'half-whole diminished', 'diminished', 'whole tone', 'lydian augmented'
    ];

    /** Up to `limit` common scales built on the chord's root that contain every chord tone (labels). */
    function fittingScales(entry, limit = 5) {
        return SCALE_SUGGESTIONS
            .filter(name => {
                const scaleChroma = Tonal.ScaleType.get(name).chroma;
                return [...entry.chroma].every((bit, i) => bit === '0' || scaleChroma[i] === '1');
            })
            .slice(0, limit)
            .map(name => t(`scale.${name}`));
    }

    /**
     * Everything the info panel shows about a chord:
     * { symbol, family, recipe, description, aliases, tones, keys, scales }.
     */
    function describeChord(entry, tonic, accidentals) {
        const pitchClasses = chordNotes(entry.id, tonic);
        const root = formatNote(tonic);
        return {
            symbol: chordSymbol(tonic, entry),
            family: chordFamily(entry),
            recipe: chordRecipe(entry),
            description: hasText(`desc.${entry.id}`) ? t(`desc.${entry.id}`) : '',
            aliases: aliasSymbols(tonic, entry),
            tones: pitchClasses.map((pc, i) => ({
                note: formatNote(pc),
                degree: entry.degrees[i],
                interval: i === 0 ? t('interval.root') : intervalName(entry.intervals[i])
            })),
            keys: keyFunctions(entry, Tonal.Note.chroma(tonic)).map(found => ({
                ...found,
                key: formatNote(keyName(found.tonicPc, found.mode, accidentals))
            })),
            scales: fittingScales(entry).map(label => t('scale.chip', { root, scale: label }))
        };
    }

    /**
     * Facts about one voicing ({ notes, type, inversion }):
     * { inversion, bass, slash, figure, span, spanName, steps: [{ short, name }] }.
     */
    function describeVoicing(entry, tonic, voicing) {
        const { notes, type, inversion } = voicing;
        const bass = noteParts(notes[0]).name;
        const span = midiOf(notes[notes.length - 1]) - midiOf(notes[0]);
        return {
            inversion: inversionName(inversion),
            bass,
            slash: inversion > 0 ? `${chordSymbol(tonic, entry)}/${bass}` : null,
            figure: figuredBass(entry, inversion),
            span,
            spanName: semitoneName(span),
            steps: notes.slice(1).map((note, i) => {
                const interval = Tonal.Interval.distance(notes[i], note);
                return { short: intervalShort(interval), name: intervalName(interval) };
            })
        };
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
        chordSymbol,
        chordName,
        groupTitle,
        buildCatalogue,
        entryMatches,
        chordNotes,
        closeVoicing,
        voicingGroups,
        noteDegrees,
        inversionName,
        intervalName,
        chordFamily,
        chordRecipe,
        figuredBass,
        keyFunctions,
        fittingScales,
        describeChord,
        describeVoicing,
        midi: midiOf,
        pitchClass: note => Tonal.Note.pitchClass(note)
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChordTheory;
    } else {
        root.ChordTheory = ChordTheory;
    }
})(typeof window !== 'undefined' ? window : globalThis);

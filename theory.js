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

    /**
     * Every Tonal chord type, grouped for display:
     * [{ title, chords: [{ id, suffix, name, aliases, intervals, chroma, degrees, size }] }].
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

    // ---------------------------------------------------------------------
    // Chord information (shown when a chord is played)
    // ---------------------------------------------------------------------

    // What the common chords sound like and how they're used, keyed by Tonal id
    const DESCRIPTIONS = {
        'M': 'The most common chord: bright and stable, the home chord of a major key.',
        'm': 'Darker and softer than major; the home chord of a minor key.',
        'dim': 'Tense and unstable. It usually leads to the chord a half step above its root (vii° → I).',
        'aug': 'Dreamy and unsettled. Its notes split the octave into equal major 3rds, so any of them can sound like the root.',
        'sus2': 'Open and ambiguous: the 2nd replaces the 3rd, so it is neither major nor minor.',
        'sus4': 'The 4th replaces the 3rd and wants to fall back to it (sus4 → major), a classic suspension.',
        '5': 'Just a root and a 5th, neither major nor minor: the power chord of rock guitar.',
        '7': 'Tense and bluesy. The tritone between its 3rd and ♭7 pulls toward the chord a 5th below (V7 → I).',
        'maj7': 'Lush and relaxed; a staple of jazz, bossa nova and soul as a I or IV chord.',
        'm7': 'Mellow and smooth: the ii of the ii–V–I, and a common minor home chord.',
        'm7b5': 'Half-diminished: the ii chord of a minor ii–V–i, and the vii chord of a major key.',
        'dim7': 'A stack of minor 3rds, so it is symmetrical and very tense. Often a passing chord or a stand-in for a dominant 7th.',
        'm/ma7': 'A minor triad with a major 7th: dark and mysterious, the classic spy-movie sound.',
        '7sus4': 'A dominant with a 4th instead of the 3rd: less tense than a 7, common in gospel, funk and modal jazz.',
        'maj7#5': 'An augmented triad with a major 7th: bright but restless. It comes from the harmonic and melodic minor scales.',
        '6': 'Sweet and vintage; often used instead of maj7 as the final home chord.',
        'm6': 'Minor with a major 6th: bittersweet, a classic minor home chord in jazz.',
        '6add9': 'Major with an added 6th and 9th: open and warm, a favourite final chord in jazz and bossa nova.',
        'm69': 'Minor with an added 6th and 9th: rich and modern-sounding.',
        'Madd9': 'A major triad with an added 9th and no 7th: shimmering, very common in pop and rock.',
        'madd9': 'A minor triad with an added 9th: tender and wistful.',
        '9': 'A dominant 7th with a 9th on top: fuller and funkier than a plain 7.',
        'maj9': 'A major 7th with a 9th: spacious and dreamy.',
        'm9': 'A minor 7th with a 9th: smooth, a favourite in neo-soul and jazz.',
        '9sus4': 'A suspended dominant with a 9th: the floating sound of modal jazz.',
        '11': 'A dominant 11th. The 3rd is left out because it clashes with the 11th, so it sounds like a sus chord.',
        'maj11': 'A major 7th with a 9th and 11th. The 11th clashes with the 3rd, so players usually prefer maj9♯11.',
        'm11': 'A minor 7th with a 9th and 11th: open and modal, the classic Dorian sound.',
        '13': 'A dominant 7th with a 9th and 13th: a full, bluesy big-band sound.',
        'maj13': 'A major 7th with a 9th and 13th: very lush.',
        'm13': 'A minor 7th with a 9th and 13th: the full Dorian sound.',
        '7b9': 'A dominant with a ♭9: dark and dramatic, typical of V7 in minor keys.',
        '7#9': 'The major 3rd and the ♯9 (a minor 3rd an octave up) clash for a gritty, bluesy sound, often called the "Hendrix chord".',
        '7b5': 'A dominant with a ♭5. Its two tritones make it symmetrical, which ties it to the tritone substitution.',
        '7#5': 'An augmented dominant: the raised 5th pushes upward toward the resolution.',
        '7#11': 'Lydian dominant: a bright, modern dominant, often used as a tritone substitute.',
        '7b13': 'A dominant with a ♭13: a darker dominant that tends to resolve to a minor chord.',
        '7#5#9': 'An altered dominant: maximum tension before resolving, a jazz staple.',
        '13b9': 'A dominant 13th with a ♭9: rich and tense.',
        '13#11': 'A dominant 13th with a ♯11: the full Lydian dominant sound.'
    };

    const QUALITY_NAMES = {
        P: 'perfect', M: 'major', m: 'minor', A: 'augmented', d: 'diminished',
        AA: 'doubly augmented', dd: 'doubly diminished'
    };
    const NUMBER_NAMES = [
        '', 'unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave',
        'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'
    ];

    /** "3M" -> "major third", "7m" -> "minor seventh", "8P" -> "octave". */
    function intervalName(interval) {
        const { num, q } = Tonal.Interval.get(interval);
        if (num === 8 && q === 'P') return 'octave';
        return `${QUALITY_NAMES[q] || q} ${NUMBER_NAMES[num] || `${num}th`}`;
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
        if (octaves === 0) return simple || 'unison';
        const octaveText = octaves === 1 ? 'octave' : `${octaves} octaves`;
        return simple ? `${octaveText} + ${simple}` : octaveText;
    }

    // A chord tone in a recipe: "minor 7th", "♭9th", "♯11th", "6th"
    function toneName(interval) {
        const { num, q, alt } = Tonal.Interval.get(interval);
        if (num === 7) return `${QUALITY_NAMES[q]} 7th`;
        return accidentalGlyphs(alt) + num + (num === 2 ? 'nd' : num === 3 ? 'rd' : 'th');
    }

    /** Broad family a chord belongs to: Major, Minor, Dominant, Diminished… */
    function chordFamily(entry) {
        const has = interval => entry.intervals.includes(interval);
        if (entry.id === '5') return 'Power chord';
        if (entry.id === '4') return 'Quartal';
        if (has('3M') && has('7m')) return 'Dominant';
        if (has('3m') && has('5d') && has('7m')) return 'Half-diminished';
        if (has('3m') && has('5d')) return 'Diminished';
        if (has('3M') && has('5A')) return 'Augmented';
        if (has('3M')) return 'Major';
        if (has('3m')) return 'Minor';
        return 'Suspended';
    }

    /** How a chord is built, e.g. "Major triad + minor 7th + ♯9th". */
    function chordRecipe(entry) {
        if (entry.id === '4') return 'Stacked perfect 4ths';
        const rest = new Set(entry.intervals.filter(interval => interval !== '1P'));
        const take = (...wanted) => {
            if (!wanted.every(interval => rest.has(interval))) return false;
            wanted.forEach(interval => rest.delete(interval));
            return true;
        };
        let base;
        if (take('3M', '5P')) base = 'Major triad';
        else if (take('3m', '5P')) base = 'Minor triad';
        else if (take('3m', '5d')) base = 'Diminished triad';
        else if (take('3M', '5A')) base = 'Augmented triad';
        else if (take('3M', '5d')) base = 'Major triad with ♭5th';
        else if (take('3m', '5A')) base = 'Minor triad with ♯5th';
        else if (take('3M')) base = 'Major 3rd (no 5th)';
        else if (take('3m')) base = 'Minor 3rd (no 5th)';
        else if (take('4P', '5P')) base = 'Sus4 triad';
        else if (take('2M', '5P')) base = 'Sus2 triad';
        else if (take('5P')) base = 'Root + 5th';
        else base = 'Root';
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

    // Common scales to suggest over a chord, in order of preference: [Tonal name, label]
    const SCALE_SUGGESTIONS = [
        ['major', 'major (Ionian)'],
        ['minor', 'natural minor (Aeolian)'],
        ['dorian', 'Dorian'],
        ['mixolydian', 'Mixolydian'],
        ['lydian', 'Lydian'],
        ['phrygian', 'Phrygian'],
        ['locrian', 'Locrian'],
        ['major pentatonic', 'major pentatonic'],
        ['minor pentatonic', 'minor pentatonic'],
        ['minor blues', 'blues'],
        ['harmonic minor', 'harmonic minor'],
        ['melodic minor', 'melodic minor'],
        ['lydian dominant', 'Lydian dominant'],
        ['altered', 'altered'],
        ['phrygian dominant', 'Phrygian dominant'],
        ['locrian #2', 'Locrian ♯2'],
        ['half-whole diminished', 'half-whole diminished'],
        ['diminished', 'whole-half diminished'],
        ['whole tone', 'whole tone'],
        ['lydian augmented', 'Lydian augmented']
    ];

    /** Up to `limit` common scales built on the chord's root that contain every chord tone. */
    function fittingScales(entry, limit = 5) {
        return SCALE_SUGGESTIONS
            .filter(([name]) => {
                const scaleChroma = Tonal.ScaleType.get(name).chroma;
                return [...entry.chroma].every((bit, i) => bit === '0' || scaleChroma[i] === '1');
            })
            .slice(0, limit)
            .map(([, label]) => label);
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
            description: DESCRIPTIONS[entry.id] || '',
            aliases: aliasSymbols(tonic, entry),
            tones: pitchClasses.map((pc, i) => ({
                note: formatNote(pc),
                degree: entry.degrees[i],
                interval: i === 0 ? 'root' : intervalName(entry.intervals[i])
            })),
            keys: keyFunctions(entry, Tonal.Note.chroma(tonic)).map(found => ({
                ...found,
                key: formatNote(keyName(found.tonicPc, found.mode, accidentals))
            })),
            scales: fittingScales(entry).map(label => `${root} ${label}`)
        };
    }

    /**
     * Facts about one voicing ({ notes, type, inversion }):
     * { position, inversion, bass, slash, figure, span, spanName, steps: [{ short, name }] }.
     */
    function describeVoicing(entry, tonic, voicing) {
        const { notes, type, inversion } = voicing;
        const bass = noteParts(notes[0]).name;
        const span = midiOf(notes[notes.length - 1]) - midiOf(notes[0]);
        return {
            position: type === 'close' ? 'Close position' : 'Open position',
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

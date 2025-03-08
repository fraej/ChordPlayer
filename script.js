// Global variables
let piano;
let isLoaded = false;
let audioContextStarted = false;
let currentRoot = "C"; // Default root note
let statusMessage;
let currentRootDisplay;
let keyboard; // SVG Keyboard instance

// Wait for the window to fully load before initializing
window.onload = function() {
    console.log("Window loaded, initializing app...");
    statusMessage = document.getElementById('statusMessage');
    currentRootDisplay = document.getElementById('current-root');
    
    // Initialize the SVG Piano Keyboard using our library
    initializeKeyboard();
    
    // Add event listener to octave selector
    document.getElementById('octave').addEventListener('change', function() {
        generateChords();
        showVoicings(currentRoot, "M", document.getElementById('octave').value);
    });
    
    // Initialize audio on page load
    loadPiano();
    
    console.log("Generating initial chords and voicings...");
    // Generate chord buttons for default C root immediately
    generateChords();
    
    // Show default voicings for C major chord immediately
    showVoicings("C", "M", document.getElementById('octave').value);
    
    // Simple function to force chord and voicing generation after a short delay
    setTimeout(function() {
        console.log("Forcing chord and voicing generation...");
        try {
            // Force regeneration of chords for C
            currentRoot = "C";
            document.getElementById('current-root').textContent = `Root: C`;
            
            // Update keyboard selected note
            keyboard.selectNote("C");
            
            // Clear and regenerate chord buttons
            const chordButtonsContainer = document.getElementById('chordButtons');
            chordButtonsContainer.innerHTML = '';
            generateChords();
            
            // Clear and regenerate voicing buttons
            const voicingsContainer = document.getElementById('voicingButtons');
            voicingsContainer.innerHTML = '';
            showVoicings("C", "M", document.getElementById('octave').value);
            
            console.log("Chord and voicing generation completed");
        } catch (error) {
            console.error("Error during forced chord generation:", error);
        }
    }, 500); // 500ms delay to ensure everything is loaded
};

// Initialize the SVG Piano Keyboard
function initializeKeyboard() {
    // Create a new SVGKeyboard instance
    keyboard = new SVGKeyboard('piano-container', {
        initialSelectedNote: currentRoot,
        onNoteSelected: selectRootNote
    });
}

// Function to handle root note selection
function selectRootNote(note) {
    currentRoot = note;
    currentRootDisplay.textContent = `Root: ${note}`;
    
    // Generate chords for the new root note
    generateChords();
    
    // Show voicings for the major chord of the new root note
    showVoicings(note, "M", document.getElementById('octave').value);
}

// Function to initialize audio context and load piano
function initializeAudio() {
    if (audioContextStarted) return;
    
    // Start audio context without showing status
    Tone.start()
        .then(() => {
            console.log("Audio context started successfully");
            audioContextStarted = true;
        })
        .catch(error => {
            console.error("Failed to start audio context:", error);
            showStatus('Failed to start audio. Please try again.', 'error');
        });
}

// Function to load piano samples
function loadPiano() {
    showStatus('Loading piano sounds...', 'loading');
    
    // Create the piano sampler
    piano = new Tone.Sampler({
        urls: {
            // Full piano range
            "A0": "A0.mp3",
            "C1": "C1.mp3",
            "D#1": "Ds1.mp3",
            "F#1": "Fs1.mp3",
            "A1": "A1.mp3",
            "C2": "C2.mp3",
            "D#2": "Ds2.mp3",
            "F#2": "Fs2.mp3",
            "A2": "A2.mp3",
            "C3": "C3.mp3",
            "D#3": "Ds3.mp3",
            "F#3": "Fs3.mp3",
            "A3": "A3.mp3",
            "C4": "C4.mp3",
            "D#4": "Ds4.mp3",
            "F#4": "Fs4.mp3",
            "A4": "A4.mp3",
            "C5": "C5.mp3",
            "D#5": "Ds5.mp3",
            "F#5": "Fs5.mp3",
            "A5": "A5.mp3",
            "C6": "C6.mp3",
            "D#6": "Ds6.mp3",
            "F#6": "Fs6.mp3",
            "A6": "A6.mp3",
            "C7": "C7.mp3",
            "D#7": "Ds7.mp3",
            "F#7": "Fs7.mp3",
            "A7": "A7.mp3",
            "C8": "C8.mp3"
        },
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/",
        onload: () => {
            console.log("Piano loaded successfully");
            isLoaded = true;
            showStatus('Piano loaded successfully!', 'success');
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 2000);
        },
        onerror: (error) => {
            console.error("Error loading piano samples:", error);
            showStatus('Error loading piano. Please refresh and try again.', 'error');
        }
    }).toDestination();
    
    // Add progress indicator
    let lastProgress = 0;
    Tone.Buffer.on('progress', (progress) => {
        // Only update if progress has changed significantly (at least 5%)
        if (progress - lastProgress >= 0.05) {
            console.log(`Loading progress: ${Math.round(progress * 100)}%`);
            showStatus(`Loading piano sounds (${Math.round(progress * 100)}%)...`, 'loading');
            lastProgress = progress;
        }
    });
}

// Helper function to show status messages
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    
    // Remove all classes
    statusMessage.classList.remove('loading', 'success', 'error');
    
    // Add the appropriate class
    statusMessage.classList.add(type);
}

function getAvailableChordTypes() {
    // Get all chord types from Tonal.js
    return Tonal.ChordType.all()
        .sort((a, b) => a.aliases[0].localeCompare(b.aliases[0]))
        .map(chord => ({
            display: chord.name || chord.aliases[0], // Use full name if available
            symbol: chord.aliases[0]  // Symbol for Tonal.js
        }));
}

function generateChords() {
    console.log("Generating chords for root:", currentRoot);
    const octave = document.getElementById('octave').value;
    const rootNote = currentRoot; // Use the selected root note from piano
    const chordButtonsContainer = document.getElementById('chordButtons');
    
    // Clear existing chord buttons
    chordButtonsContainer.innerHTML = '';
    
    // Create a grid container for the chord buttons
    const chordGrid = document.createElement('div');
    chordGrid.className = 'chord-grid';
    chordButtonsContainer.appendChild(chordGrid);

    const chordTypes = getAvailableChordTypes();

    // Define chord categories from most common to least common
    const chordCategories = [
        // Basic triads - most common
        ['M', 'm', 'dim', 'aug', 'sus4', 'sus2'],
        
        // Common seventh chords
        ['7', 'm7', 'maj7', 'dim7', 'm7b5', '7sus4'],
        
        // Sixth chords
        ['6', 'm6', '69', 'm69'],
        
        // Extended chords
        ['9', 'm9', 'maj9', '11', 'm11', '13', 'm13', 'maj13'],
        
        // Added note chords
        ['add9', 'madd9', '7b9', '7#9'],
        
        // All other chords
        []
    ];
    
    // Process each category in order
    chordCategories.forEach(category => {
        if (category.length === 0) {
            // For the "all other chords" category
            const processedSymbols = chordCategories.flat();
            chordTypes.forEach(({display, symbol}) => {
                if (!processedSymbols.includes(symbol)) {
                    addChordButton(display, symbol);
                }
            });
        } else {
            // For specific categories
            category.forEach(symbol => {
                const matchingChord = chordTypes.find(chord => chord.symbol === symbol);
                if (matchingChord) {
                    addChordButton(matchingChord.display, matchingChord.symbol);
                }
            });
        }
    });
    
    function addChordButton(display, symbol) {
        const button = document.createElement('button');
        button.className = 'chord-button';
        
        // Get chord notes to count them
        const chordObj = Tonal.Chord.get(`${rootNote}${symbol}`);
        const noteCount = chordObj.notes.length;
        
        // Create main chord name element
        const nameElement = document.createElement('div');
        
        // If the text is long, add a line break before the chord type
        if (display.length > 8) {
            nameElement.innerHTML = `${rootNote}<br>${display}`;
        } else {
            nameElement.textContent = `${rootNote} ${display}`;
        }
        
        // Create note count element
        const countElement = document.createElement('div');
        countElement.className = 'note-count';
        countElement.textContent = `(${noteCount} notes)`;
        
        // Add elements to button
        button.appendChild(nameElement);
        button.appendChild(countElement);
        
        button.title = `${rootNote} ${display} - ${noteCount} notes`; // Add tooltip
        button.onclick = () => {
            playChord(rootNote, symbol, octave);
            showVoicings(rootNote, symbol, octave);
        };
        chordGrid.appendChild(button);
    }
}

function getChordNotes(root, type, octave) {
    return Tonal.Chord.get(`${root}${type}`).notes.map(note => `${note}${octave}`);
}

function playChord(root, type, octave) {
    // Check if audio is ready
    if (!isLoaded) {
        showStatus('Please wait for the piano to load...', 'loading');
        return;
    }
    
    // Ensure audio context is started if not already
    if (!audioContextStarted) {
        initializeAudio();
    }
    
    // Ensure audio context is running
    if (Tone.context.state !== "running") {
        Tone.context.resume();
    }
    
    // Get chord notes using Tonal.js
    const notes = getChordNotes(root, type, octave);
    
    // Stop any playing notes
    piano.releaseAll();
    
    // Play the chord
    piano.triggerAttackRelease(notes, "2n");
}

function getAllVoicings(rootNote, chordType, baseOctave) {
    const chord = Tonal.Chord.get(`${rootNote}${chordType}`);
    if (!chord || !chord.notes.length) return [];

    const octave = parseInt(baseOctave);
    const voicings = []; // Use array instead of Map
    
    // Helper function to sort notes by pitch (low to high)
    function sortByPitch(notes) {
        return [...notes].sort((a, b) => {
            const midiA = Tonal.Note.midi(a);
            const midiB = Tonal.Note.midi(b);
            return midiA - midiB;
        });
    }
    
    // Helper function to check if a voicing is a duplicate - better implementation
    function isDuplicate(newVoicing) {
        // Sort the new voicing by pitch for comparison
        const sortedNew = sortByPitch(newVoicing);
        
        // Compare with existing voicings
        return voicings.some(v => {
            // Sort existing voicing notes by pitch
            const sortedExisting = sortByPitch(v.notes);
            
            // If different number of notes, not a duplicate
            if (sortedExisting.length !== sortedNew.length) {
                return false;
            }
            
            // Compare each note
            for (let i = 0; i < sortedNew.length; i++) {
                if (sortedExisting[i] !== sortedNew[i]) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    // Helper function to add a voicing
    function addVoicing(notes, inversionIndex, type) {
        // Make sure all notes are valid
        if (!notes.every(note => Tonal.Note.midi(note))) {
            return;
        }
        
        // Don't add if it's a duplicate
        if (isDuplicate(notes)) {
            return;
        }
        
        // Calculate range
        const range = getVoicingRange(notes);
        
        // Create name based on inversion and type
        let name;
        if (type) {
            name = `Inversion ${inversionIndex + 1} (${type})`;
        } else {
            name = `Inversion ${inversionIndex + 1}`;
        }
        
        // Add to voicings array - always sort notes by pitch for consistency
        voicings.push({
            notes: sortByPitch(notes),  // Sort notes by pitch
            inversionIndex,
            type,
            name,
            range
        });
    }
    
    // Get all inversions
    const chordNotes = chord.notes;
    
    // For each inversion
    for (let invIndex = 0; invIndex < chordNotes.length; invIndex++) {
        // Create the inversion with the correct bass note
        let inversion = [...chordNotes];
        for (let j = 0; j < invIndex; j++) {
            inversion.push(inversion.shift());
        }
        
        // 1. Basic inversion - start with bass note, then add other notes in order
        const basicInversion = [];
        // First note (bass) in the current octave
        basicInversion.push(`${inversion[0]}${octave}`);
        
        // Find the best octave for remaining notes so they're higher than the bass
        let currOctave = octave;
        for (let i = 1; i < inversion.length; i++) {
            // Try current octave first
            let nextNote = `${inversion[i]}${currOctave}`;
            let nextMidi = Tonal.Note.midi(nextNote);
            let bassMidi = Tonal.Note.midi(basicInversion[0]);
            
            // If this note is lower than the bass note, move it up an octave
            if (nextMidi < bassMidi) {
                nextNote = `${inversion[i]}${currOctave + 1}`;
            }
            
            basicInversion.push(nextNote);
        }
        
        // Add the basic inversion (sorted by pitch)
        addVoicing(sortByPitch(basicInversion), invIndex, null);
        
        // 2. Close position - keep notes as close as possible
        const closePos = [];
        currOctave = octave;
        
        // Start with the bass note
        closePos.push(`${inversion[0]}${currOctave}`);
        
        for (let i = 1; i < inversion.length; i++) {
            const prevMidi = Tonal.Note.midi(closePos[i-1]);
            let currMidi = Tonal.Note.midi(`${inversion[i]}${currOctave}`);
            
            if (currMidi < prevMidi) {
                currOctave++;
                closePos.push(`${inversion[i]}${currOctave}`);
            } else {
                closePos.push(`${inversion[i]}${currOctave}`);
            }
        }
        
        // Only add close position if it's not a duplicate
        if (!isDuplicate(closePos)) {
            addVoicing(closePos, invIndex, "Close");
        }
        
        // 3. Standard piano voicings - G3-C4-E4 for C major second inversion, etc.
        // These are common practical voicings that pianists use
        if (inversion.length >= 3) {
            // Standard voicing with lower octave for bass note
            const standardVoicing = [
                `${inversion[0]}${octave - 1}`, // Bass note one octave lower
            ];
            
            // Upper notes in normal octave
            for (let i = 1; i < inversion.length; i++) {
                standardVoicing.push(`${inversion[i]}${octave}`);
            }
            
            addVoicing(standardVoicing, invIndex, "Piano");
            
            // If we're dealing with a second inversion triad (like G-C-E for C major)
            // Add the specific G3-C4-E4 voicing that pianists commonly use
            if (invIndex === 2 && inversion.length === 3) {
                const lowerOctaveVoicing = [
                    `${inversion[0]}${octave - 1}`, // Bass note one octave lower (G3 for C major)
                    `${inversion[1]}${octave}`,     // Middle note in normal octave (C4 for C major)
                    `${inversion[2]}${octave}`      // Top note in normal octave (E4 for C major)
                ];
                
                addVoicing(lowerOctaveVoicing, invIndex, "Standard");
            }
        }
        
        // 4. Spread voicing - spread notes across octaves
        if (inversion.length >= 3) {
            const spreadVoicing = [
                `${inversion[0]}${octave}`, // Bass note in base octave
            ];
            
            // Spread the remaining notes
            for (let i = 1; i < inversion.length; i++) {
                // Alternate between current octave + 1 and current octave + 2
                const noteOctave = octave + (i % 2) + 1;
                spreadVoicing.push(`${inversion[i]}${noteOctave}`);
            }
            
            // Add spread voicing (will be sorted by pitch automatically)
            addVoicing(spreadVoicing, invIndex, "Spread");
            
            // 5. Open voicing for triads
            if (inversion.length === 3) {
                const openVoicing = [
                    `${inversion[0]}${octave}`,     // Bass note
                    `${inversion[1]}${octave + 1}`, // Middle note up an octave
                    `${inversion[2]}${octave + 1}`  // Top note up an octave
                ];
                addVoicing(openVoicing, invIndex, "Open");
            }
            
            // 6. Drop 2 voicing for 4+ note chords
            if (inversion.length >= 4) {
                const drop2Voicing = [];
                
                // Add bass note
                drop2Voicing.push(`${inversion[0]}${octave}`);
                
                // Add second-from-top note an octave down
                for (let i = 1; i < inversion.length; i++) {
                    if (i === inversion.length - 2) {
                        drop2Voicing.push(`${inversion[i]}${octave - 1}`);
                    } else {
                        drop2Voicing.push(`${inversion[i]}${octave}`);
                    }
                }
                
                addVoicing(drop2Voicing, invIndex, "Drop 2");
            }
        }
    }
    
    // Sort voicings
    return voicings.sort((a, b) => {
        // First sort by inversion
        if (a.inversionIndex !== b.inversionIndex) {
            return a.inversionIndex - b.inversionIndex;
        }
        
        // Then sort by type (null comes first)
        if (!a.type && b.type) return -1;
        if (a.type && !b.type) return 1;
        
        // Then sort by range (smaller range first)
        return a.range - b.range;
    });
}

// Helper function to calculate the range of a voicing in semitones
function getVoicingRange(voicing) {
    if (voicing.length <= 1) return 0;
    
    const midiNotes = voicing.map(note => Tonal.Note.midi(note));
    const min = Math.min(...midiNotes);
    const max = Math.max(...midiNotes);
    return max - min;
}

function showVoicings(rootNote, chordType, baseOctave) {
    console.log("Showing voicings for:", rootNote, chordType, baseOctave);
    const voicingsContainer = document.getElementById('voicingButtons');
    voicingsContainer.innerHTML = '';
    
    const allVoicings = getAllVoicings(rootNote, chordType, baseOctave);
    console.log("Generated voicings:", allVoicings.length);
    
    if (allVoicings.length === 0) {
        voicingsContainer.innerHTML = '<p>No valid voicings found</p>';
        return;
    }

    // Create a grid for voicing buttons
    const voicingGrid = document.createElement('div');
    voicingGrid.style.display = 'grid';
    voicingGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    voicingGrid.style.gap = '10px';
    voicingsContainer.appendChild(voicingGrid);

    allVoicings.forEach((voicing, index) => {
        const button = document.createElement('button');
        button.className = 'voicing-button';
        
        // Format notes with clear spacing
        const formattedNotes = voicing.notes.join(' ');
        button.textContent = `${voicing.name}: ${formattedNotes} (${voicing.range} semitones)`;
        
        button.onclick = () => {
            // Check if audio is ready
            if (!isLoaded) {
                showStatus('Please wait for the piano to load...', 'loading');
                return;
            }
            
            // Ensure audio context is started if not already
            if (!audioContextStarted) {
                initializeAudio();
            }
            
            // Ensure audio context is running
            if (Tone.context.state !== "running") {
                Tone.context.resume();
            }
            
            // Stop any playing notes
            piano.releaseAll();
            
            // Play the voicing
            piano.triggerAttackRelease(voicing.notes, "2n");
        };
        voicingGrid.appendChild(button);
    });
} 
// Global variables
let piano;
let isLoaded = false;
let audioContextStarted = false;
let currentRoot = "C"; // Default root note
let statusMessage;
let currentRootDisplay;
let keyboard; // SVG Keyboard instance
let fixedKeyboard; // Fixed SVG Keyboard instance at the bottom
let initialLoadComplete = false; // Flag to track initial load
let currentlyPlayingNotes = []; // Track which notes are currently playing
let activePopupButton = null; // Track which chord button has the popup open

// Wait for the window to fully load before initializing
window.onload = function() {
    console.log("Window loaded, initializing app...");
    statusMessage = document.getElementById('statusMessage');
    currentRootDisplay = document.getElementById('current-root');
    
    // Initialize the SVG Piano Keyboard using our library
    initializeKeyboard();
    
    // Initialize the fixed keyboard at the bottom
    initializeFixedKeyboard();
    
    // Add event listener to octave selector
    document.getElementById('octave').addEventListener('change', function() {
        closeVoicingPopup();
        generateChords();
    });
    
    // Resize handler for fixed keyboard (registered once)
    let fixedKeyboardResizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(fixedKeyboardResizeTimer);
        fixedKeyboardResizeTimer = setTimeout(function() {
            const activeNotes = [...currentlyPlayingNotes];
            initializeFixedKeyboard();
            if (activeNotes.length > 0) {
                updateFixedKeyboard(activeNotes);
            }
        }, 150);
    });
    
    // Initialize audio on page load
    loadPiano();
    
    // Force initial chord and voicing generation
    forceInitialGeneration();
};

// Function to initialize the fixed keyboard at the bottom
function initializeFixedKeyboard() {
    try {
        console.log("Initializing fixed keyboard...");
        
        // Create a custom full 88-key keyboard
        const fixedPianoContainer = document.getElementById('fixed-piano');
        
        // Clear any existing content
        if (fixedPianoContainer) {
            fixedPianoContainer.innerHTML = '';
            
            // Get the container width
            const containerWidth = window.innerWidth;
            
            // Calculate key width based on container width (allow fractional for perfect fit)
            // We need to fit 52 white keys (88 total, 52 white)
            const whiteKeyWidth = containerWidth / 52; // fractional allowed to avoid right gap
            
            // Create SVG element - make it span the full width
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "piano-svg");
            
            // Calculate the total SVG width based on the number of white keys
            const totalWidth = whiteKeyWidth * 52; // equals containerWidth
            svg.setAttribute("viewBox", `0 0 ${totalWidth} 120`);
            svg.style.width = "100%";
            svg.style.height = "100%";
            fixedPianoContainer.appendChild(svg);
            
            // Define all 88 keys (A0 to C8)
            const allNotes = [];
            
            // Add all white keys first (A, B, C, D, E, F, G)
            const whiteKeyHeight = 120;
            let whiteKeyX = 0;
            
            // Start with A0, B0
            allNotes.push({ note: 'A0', isWhite: true, x: whiteKeyX });
            whiteKeyX += whiteKeyWidth;
            allNotes.push({ note: 'B0', isWhite: true, x: whiteKeyX });
            whiteKeyX += whiteKeyWidth;
            
            // Add C1 through B7
            for (let octave = 1; octave <= 7; octave++) {
                const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
                whiteKeys.forEach(note => {
                    allNotes.push({ note: `${note}${octave}`, isWhite: true, x: whiteKeyX });
                    whiteKeyX += whiteKeyWidth;
                });
            }
            
            // Add C8
            allNotes.push({ note: 'C8', isWhite: true, x: whiteKeyX });
            
            // Now add all black keys
            // A0 has a black key (A#0)
            allNotes.push({ note: 'A#0', isWhite: false, x: whiteKeyWidth * 0.7 });
            
            // Add black keys for C1 through B7
            for (let octave = 1; octave <= 7; octave++) {
                // C# and D#
                allNotes.push({ note: `C#${octave}`, isWhite: false, x: (whiteKeyWidth * 2) + (octave - 1) * 7 * whiteKeyWidth + whiteKeyWidth * 0.7 });
                allNotes.push({ note: `D#${octave}`, isWhite: false, x: (whiteKeyWidth * 3) + (octave - 1) * 7 * whiteKeyWidth + whiteKeyWidth * 0.7 });
                
                // F#, G#, and A#
                allNotes.push({ note: `F#${octave}`, isWhite: false, x: (whiteKeyWidth * 5) + (octave - 1) * 7 * whiteKeyWidth + whiteKeyWidth * 0.7 });
                allNotes.push({ note: `G#${octave}`, isWhite: false, x: (whiteKeyWidth * 6) + (octave - 1) * 7 * whiteKeyWidth + whiteKeyWidth * 0.7 });
                allNotes.push({ note: `A#${octave}`, isWhite: false, x: (whiteKeyWidth * 7) + (octave - 1) * 7 * whiteKeyWidth + whiteKeyWidth * 0.7 });
            }
            
            // Draw all white keys first (so they're behind black keys)
            allNotes.filter(key => key.isWhite).forEach(key => {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("class", "white-key");
                rect.setAttribute("x", key.x);
                rect.setAttribute("y", 0);
                rect.setAttribute("width", whiteKeyWidth);
                rect.setAttribute("height", whiteKeyHeight);
                rect.setAttribute("rx", 2);
                rect.setAttribute("data-note", key.note);
                rect.style.fill = "white";
                rect.style.stroke = "#ccc";
                rect.style.strokeWidth = "1";
                svg.appendChild(rect);
                
                // Add octave number at the bottom of each C key
                if (key.note.startsWith('C')) {
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", key.x + whiteKeyWidth / 2);
                    text.setAttribute("y", whiteKeyHeight - 5);
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("font-size", "8");
                    text.textContent = key.note.slice(-1); // Get the octave number
                    svg.appendChild(text);
                }
                
                // Add note name at the bottom of each key
                const noteText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                noteText.setAttribute("x", key.x + whiteKeyWidth / 2);
                noteText.setAttribute("y", whiteKeyHeight - 15);
                noteText.setAttribute("text-anchor", "middle");
                noteText.setAttribute("font-size", "8");
                noteText.textContent = key.note.slice(0, -1); // Get the note name without octave
                svg.appendChild(noteText);
            });
            
            // Then draw all black keys on top
            allNotes.filter(key => !key.isWhite).forEach(key => {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("class", "black-key");
                rect.setAttribute("x", key.x);
                rect.setAttribute("y", 0);
                rect.setAttribute("width", whiteKeyWidth * 0.6);
                rect.setAttribute("height", whiteKeyHeight * 0.65);
                rect.setAttribute("rx", 2);
                rect.setAttribute("data-note", key.note);
                rect.style.fill = "#333";
                rect.style.stroke = "#333";
                rect.style.strokeWidth = "1";
                svg.appendChild(rect);
            });
            
            // Store the SVG and all notes for later use
            fixedKeyboard = { 
                svg,
                allNotes
            };
            
            // Resize is handled by the single listener in window.onload
        }
    } catch (error) {
        console.error("Error initializing fixed keyboard:", error);
    }
}

// Function to update the fixed keyboard to show which notes are being played
function updateFixedKeyboard(notes) {
    if (!fixedKeyboard || !fixedKeyboard.svg) return;
    
    // Clear all active keys first
    clearActiveKeys();
    
    // Normalize all notes to the keyboard's naming convention (sharp-only)
    // This handles B#→C, E#→F, Cb→B, Fb→E, double sharps/flats, etc.
    const normalizedNotes = notes.map(n => normalizeNoteForKeyboard(n)).filter(n => n !== null);
    
    // Store the currently playing notes
    currentlyPlayingNotes = normalizedNotes;
    
    console.log("Highlighting notes:", notes, "→ normalized:", normalizedNotes);
    
    // Highlight the active keys
    normalizedNotes.forEach(note => {
        // Find the key with this note (should always match since we normalized)
        let key = fixedKeyboard.svg.querySelector(`rect[data-note="${note}"]`);
        
        if (key) {
            const isBlackKey = key.classList.contains('black-key');
            
            // Add active class
            key.classList.add('active-key');
            if (isBlackKey) {
                key.classList.add('active-black-key');
            }
            
            // Update the fill color
            key.style.fill = isBlackKey ? '#66bb6a' : '#4caf50';
            key.style.stroke = '#2e7d32';
            key.style.strokeWidth = '2px';
        } else {
            console.warn(`Could not find key for normalized note: ${note}`);
        }
    });
    
    // Scroll to the middle of the active keys if there are any
    if (normalizedNotes.length > 0) {
        scrollToActiveKeys();
    }
}

// The keyboard only uses sharp-based note names: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
// This maps MIDI pitch class (0-11) to the keyboard's note name
const MIDI_TO_KEYBOARD_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Normalize any note (including B#, E#, Cb, Fb, double sharps ##, double flats bb)
// to the keyboard's sharp-only naming convention using MIDI as the universal reference.
function normalizeNoteForKeyboard(note) {
    try {
        const midi = Tonal.Note.midi(note);
        if (midi === null) return null;
        
        const pitchClass = midi % 12;
        const octave = Math.floor(midi / 12) - 1; // MIDI octave convention
        return `${MIDI_TO_KEYBOARD_NAME[pitchClass]}${octave}`;
    } catch (e) {
        return null;
    }
}

// Function to get enharmonic equivalents of a note (kept for backward compat, but now uses MIDI)
function getEnharmonicEquivalents(note) {
    const normalized = normalizeNoteForKeyboard(note);
    if (normalized && normalized !== note) {
        return [note, normalized];
    }
    return [note];
}

// Function to scroll to the active keys
function scrollToActiveKeys() {
    const fixedPianoContainer = document.getElementById('fixed-piano');
    if (!fixedPianoContainer || !currentlyPlayingNotes.length) return;
    
    // Find all active keys
    const activeKeys = fixedKeyboard.svg.querySelectorAll('.active-key');
    if (!activeKeys.length) return;
    
    // Calculate the average x position of all active keys
    let totalX = 0;
    activeKeys.forEach(key => {
        totalX += parseFloat(key.getAttribute('x'));
    });
    
    const averageX = totalX / activeKeys.length;
    
    // Calculate the center position
    const containerWidth = fixedPianoContainer.clientWidth;
    const scrollPosition = Math.max(0, averageX - containerWidth / 2);
    
    // Scroll to the position with smooth animation
    fixedPianoContainer.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
    });
}

// Function to clear all active keys
function clearActiveKeys() {
    if (!fixedKeyboard || !fixedKeyboard.svg) return;
    
    // Reset all white keys to their default state
    fixedKeyboard.svg.querySelectorAll('.white-key').forEach(key => {
        // Remove active classes
        key.classList.remove('active-key');
        
        // Reset fill color
        key.style.fill = 'white';
        key.style.stroke = '#ccc';
        key.style.strokeWidth = '1px';
    });
    
    // Reset all black keys to their default state
    fixedKeyboard.svg.querySelectorAll('.black-key').forEach(key => {
        // Remove active classes
        key.classList.remove('active-key');
        key.classList.remove('active-black-key');
        
        // Reset fill color
        key.style.fill = '#333';
        key.style.stroke = '#333';
        key.style.strokeWidth = '1px';
    });
    
    // Clear the currently playing notes array
    currentlyPlayingNotes = [];
}

// Function to force initial chord generation
function forceInitialGeneration() {
    if (initialLoadComplete) return;
    
    console.log("Forcing initial chord generation...");
    
    currentRoot = "C";
    if (currentRootDisplay) {
        currentRootDisplay.textContent = `Root: C`;
    }
    
    updateKeyboardColors();
    
    const chordButtonsContainer = document.getElementById('chordButtons');
    if (chordButtonsContainer) {
        generateChords();
    }
    
    setTimeout(function() {
        const hasChords = chordButtonsContainer && chordButtonsContainer.children.length > 0;
        
        if (!hasChords) {
            console.log("Retrying chord generation...");
            if (chordButtonsContainer) chordButtonsContainer.innerHTML = '';
            generateChords();
            
            if (keyboard && typeof keyboard.selectNote === 'function') {
                keyboard.selectNote("C");
                updateKeyboardColors();
            }
        }
        
        initialLoadComplete = true;
    }, 500);
}

// Function to ensure UI is ready
function ensureUIReady() {
    console.log("Ensuring UI is ready...");
    generateChords();
    
    setTimeout(function() {
        try {
            currentRoot = "C";
            document.getElementById('current-root').textContent = `Root: C`;
            
            if (keyboard && typeof keyboard.selectNote === 'function') {
                keyboard.selectNote("C");
            }
            
            const chordButtonsContainer = document.getElementById('chordButtons');
            if (chordButtonsContainer) {
                chordButtonsContainer.innerHTML = '';
                generateChords();
            }
        } catch (error) {
            console.error("Error during forced chord generation:", error);
            setTimeout(forceInitialGeneration, 1000);
        }
    }, 500);
}

// Function to update keyboard colors
function updateKeyboardColors() {
    if (keyboard && typeof keyboard.selectNote === 'function') {
        // Force reselection of the current note to apply the new colors
        keyboard.selectNote(currentRoot);
    }
}

// Initialize the SVG Piano Keyboard
function initializeKeyboard() {
    try {
        console.log("Initializing keyboard...");
        // Create a new SVGKeyboard instance with red colors for selected keys
        // Using the same darker red for both white and black keys
        keyboard = new SVGKeyboard('piano-container', {
            initialSelectedNote: currentRoot,
            onNoteSelected: selectRootNote,
            selectedWhiteKeyColor: '#d32f2f', // Same darker red for selected white keys
            selectedBlackKeyColor: '#d32f2f'  // Darker red for selected black keys
        });

        // Handle resizing for responsive keyboard
        window.addEventListener('resize', () => {
            if (keyboard && typeof keyboard.resize === 'function') {
                keyboard.resize();
            }
        });
        
        // Ensure colors are applied
        setTimeout(updateKeyboardColors, 50);
        
        // Manually trigger initial chord and voicing generation
        // This is needed because the onNoteSelected callback might not fire on initialization
        setTimeout(() => {
            console.log("Manually triggering initial chord and voicing generation from keyboard init");
            forceInitialGeneration();
        }, 100);
    } catch (error) {
        console.error("Error initializing keyboard:", error);
        // If keyboard initialization fails, still try to generate chords and voicings
        setTimeout(forceInitialGeneration, 200);
    }
}

// Function to handle root note selection
function selectRootNote(note) {
    console.log("Root note selected:", note);
    currentRoot = note;
    
    // Close any open popup
    closeVoicingPopup();
    
    // Update the root note display
    if (currentRootDisplay) {
        currentRootDisplay.textContent = `Root: ${note}`;
    }
    
    // Generate chords for the new root note
    const chordButtonsContainer = document.getElementById('chordButtons');
    if (chordButtonsContainer) {
        generateChords();
    }
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
            "A0": "A0.ogg",
            "C1": "C1.ogg",
            "D#1": "Ds1.ogg",
            "F#1": "Fs1.ogg",
            "A1": "A1.ogg",
            "C2": "C2.ogg",
            "D#2": "Ds2.ogg",
            "F#2": "Fs2.ogg",
            "A2": "A2.ogg",
            "C3": "C3.ogg",
            "D#3": "Ds3.ogg",
            "F#3": "Fs3.ogg",
            "A3": "A3.ogg",
            "C4": "C4.ogg",
            "D#4": "Ds4.ogg",
            "F#4": "Fs4.ogg",
            "A4": "A4.ogg",
            "C5": "C5.ogg",
            "D#5": "Ds5.ogg",
            "F#5": "Fs5.ogg",
            "A5": "A5.ogg",
            "C6": "C6.ogg",
            "D#6": "Ds6.ogg",
            "F#6": "Fs6.ogg",
            "A6": "A6.ogg",
            "C7": "C7.ogg",
            "D#7": "Ds7.ogg",
            "F#7": "Fs7.ogg",
            "A7": "A7.ogg",
            "C8": "C8.ogg"
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

// Function to get available chord types
function getAvailableChordTypes() {
    // Try to get all chord types from Tonal.js
    try {
        return Tonal.ChordType.all()
            .filter(chord => chord.aliases && chord.aliases.length > 0)
            .map(chord => ({
                display: chord.name || chord.aliases[0], // Use full name if available
                symbol: chord.aliases[0]  // Symbol for Tonal.js
            }));
    } catch (error) {
        console.error("Error getting chord types from Tonal.js:", error);
        
        // Fallback to a predefined list if Tonal.js fails
        return [
            { symbol: 'M', display: ' Major' },
            { symbol: 'm', display: ' Minor' },
            { symbol: 'dim', display: ' Diminished' },
            { symbol: 'aug', display: ' Augmented' },
            { symbol: 'sus4', display: ' Sus4' },
            { symbol: 'sus2', display: ' Sus2' },
            { symbol: '7', display: ' Dominant 7' },
            { symbol: 'm7', display: ' Minor 7' },
            { symbol: 'maj7', display: ' Major 7' },
            { symbol: 'dim7', display: ' Diminished 7' },
            { symbol: 'm7b5', display: ' Half-Diminished' },
            { symbol: '7sus4', display: ' 7sus4' },
            { symbol: '6', display: ' Major 6' },
            { symbol: 'm6', display: ' Minor 6' },
            { symbol: '69', display: ' 6/9' },
            { symbol: 'm69', display: ' Minor 6/9' },
            { symbol: '9', display: ' Dominant 9' },
            { symbol: 'm9', display: ' Minor 9' },
            { symbol: 'maj9', display: ' Major 9' },
            { symbol: '11', display: ' Dominant 11' },
            { symbol: 'm11', display: ' Minor 11' },
            { symbol: '13', display: ' Dominant 13' },
            { symbol: 'm13', display: ' Minor 13' },
            { symbol: 'maj13', display: ' Major 13' },
            { symbol: 'add9', display: ' Add9' },
            { symbol: 'madd9', display: ' Minor Add9' },
            { symbol: '7b9', display: ' 7b9' },
            { symbol: '7#9', display: ' 7#9' }
        ];
    }
}

// Function to generate chord buttons
function generateChords() {
    const chordButtonsContainer = document.getElementById('chordButtons');
    chordButtonsContainer.innerHTML = '';
    
    // Create a grid container for the chord buttons
    const chordGrid = document.createElement('div');
    chordGrid.className = 'chord-grid';
    chordButtonsContainer.appendChild(chordGrid);
    
    // Get available chord types
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
    
    // Helper function to add a chord button
    function addChordButton(display, symbol) {
        // Get the current octave
        const octave = document.getElementById('octave').value;
        
        // Get the chord notes
        const notes = getChordNotes(currentRoot, symbol, octave);
        
        // Create the button
        const button = document.createElement('button');
        button.className = 'chord-button';
        button.dataset.symbol = symbol;
        button.dataset.display = display;
        
        // Set the button content - symbol + full name
        button.innerHTML = `
            <span class="chord-info">
                <span class="chord-name">${currentRoot}${symbol}</span>
                <span class="chord-full-name">${display}</span>
            </span>
            <span class="note-count">${notes.length}</span>
        `;
        button.title = `${currentRoot}${display} (${notes.length} notes)`;
        
        // Add click event to play chord and show voicing popup
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const oct = document.getElementById('octave').value;
            
            // Play the straight chord immediately
            playChordDirect(currentRoot, symbol, oct);
            
            // Show voicing popup near this button
            showVoicingPopup(button, currentRoot, symbol, oct);
        });
        
        // Add the button to the grid
        chordGrid.appendChild(button);
    }
}

// Function to get chord notes
function getChordNotes(root, type, octave) {
    try {
        // Get the chord notes using Tonal.js
        const chordObj = Tonal.Chord.get(`${root}${type}`);
        
        // Check if we got valid chord notes
        if (!chordObj || !chordObj.notes || chordObj.notes.length === 0) {
            console.warn(`Could not get notes for chord: ${root}${type}`);
            return [];
        }
        
        // Parse the base octave
        const baseOctave = parseInt(octave);
        
        // Get the root note with octave
        const rootWithOctave = `${root}${baseOctave}`;
        const rootMidi = Tonal.Note.midi(rootWithOctave);
        
        if (rootMidi === null) {
            console.warn(`Invalid root note: ${rootWithOctave}`);
            return [];
        }
        
        // Log the chord notes
        console.log(`Chord notes for ${root}${type}:`, chordObj.notes);
        
        // Map the notes to the appropriate octaves
        const result = [];
        let previousMidi = null;
        
        chordObj.notes.forEach(note => {
            // Get the note without octave
            const noteName = note.replace(/\d+$/, '');
            
            // Start with the note in the base octave
            let currentOctave = baseOctave;
            let noteWithOctave = `${noteName}${currentOctave}`;
            let noteMidi = Tonal.Note.midi(noteWithOctave);
            
            if (noteMidi === null) {
                console.warn(`Invalid note: ${noteWithOctave}`);
                return; // Skip this note
            }
            
            // For extended chords, we need to ensure notes are in the right octave
            // If this note is lower than the previous note, move it up an octave
            if (previousMidi !== null && noteMidi < previousMidi) {
                currentOctave++;
                noteWithOctave = `${noteName}${currentOctave}`;
                noteMidi = Tonal.Note.midi(noteWithOctave);
            }
            
            // If the note is lower than the root and it's not the root itself, 
            // it might need to be in a higher octave
            if (noteMidi < rootMidi && noteName !== root) {
                // Try moving it up an octave
                const higherOctave = currentOctave + 1;
                const noteInHigherOctave = `${noteName}${higherOctave}`;
                const higherMidi = Tonal.Note.midi(noteInHigherOctave);
                
                // If moving it up an octave makes it higher than the previous note,
                // use the higher octave
                if (previousMidi === null || higherMidi > previousMidi) {
                    noteWithOctave = noteInHigherOctave;
                    noteMidi = higherMidi;
                }
            }
            
            // Add the note to the result
            result.push(noteWithOctave);
            
            // Update the previous MIDI value
            previousMidi = noteMidi;
        });
        
        return result;
    } catch (error) {
        console.error(`Error getting notes for chord ${root}${type}:`, error);
        return [];
    }
}

// Play a chord directly (without opening popup or other side effects)
function playChordDirect(root, type, octave) {
    try {
        const notes = getChordNotes(root, type, octave);
        if (!notes || notes.length === 0) return;
        
        const validNotes = notes.filter(note => Tonal.Note.midi(note) !== null);
        const sortedNotes = sortNotesByPitch(validNotes);
        
        if (!audioContextStarted) initializeAudio();
        
        if (piano && isLoaded) {
            piano.releaseAll();
            sortedNotes.forEach(note => {
                try { piano.triggerAttack(note); } catch (e) { console.error(`Error playing note ${note}:`, e); }
            });
            updateFixedKeyboard(sortedNotes);
            console.log(`Playing chord: ${root}${type}`, sortedNotes);
        }
    } catch (error) {
        console.error(`Error playing chord ${root}${type}:`, error);
    }
}

// Close the voicing popup and clean up
function closeVoicingPopup() {
    const popup = document.getElementById('voicingPopup');
    if (popup) {
        popup.style.display = 'none';
        popup.innerHTML = '';
    }
    
    // Remove overlay
    const overlay = document.querySelector('.voicing-overlay');
    if (overlay) overlay.remove();
    
    // Remove active state from chord button
    if (activePopupButton) {
        activePopupButton.classList.remove('chord-active');
        activePopupButton = null;
    }
}

// Show the voicing popup near a chord button
function showVoicingPopup(buttonEl, rootNote, chordType, baseOctave) {
    const popup = document.getElementById('voicingPopup');
    if (!popup) return;
    
    // If clicking the same button again, toggle off
    if (activePopupButton === buttonEl && popup.style.display !== 'none') {
        closeVoicingPopup();
        return;
    }
    
    // Close any previous popup
    closeVoicingPopup();
    
    // Mark this button as active
    activePopupButton = buttonEl;
    buttonEl.classList.add('chord-active');
    
    // Create overlay to catch outside clicks
    const overlay = document.createElement('div');
    overlay.className = 'voicing-overlay';
    overlay.addEventListener('click', function() {
        closeVoicingPopup();
    });
    document.body.appendChild(overlay);
    
    // Get all voicings
    const allVoicings = getAllVoicings(rootNote, chordType, baseOctave);
    
    // Build popup content
    popup.innerHTML = '';
    
    // Header
    const header = document.createElement('div');
    header.className = 'voicing-popup-header';
    header.innerHTML = `
        <span class="voicing-popup-title">${rootNote}${chordType} voicings</span>
        <button class="voicing-popup-close" title="Close">✕</button>
    `;
    header.querySelector('.voicing-popup-close').addEventListener('click', function(e) {
        e.stopPropagation();
        closeVoicingPopup();
    });
    popup.appendChild(header);
    
    if (allVoicings.length === 0) {
        popup.innerHTML += '<div style="padding:4px;color:#999;font-size:0.8em;">No voicings available</div>';
    } else {
        // Group voicings by type-inversion
        const grouped = {};
        allVoicings.forEach(v => {
            const key = `${v.type}-${v.inversionIndex}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(v);
        });
        
        Object.keys(grouped).sort().forEach(groupKey => {
            const voicings = grouped[groupKey];
            const [type, invIdx] = groupKey.split('-');
            
            const group = document.createElement('div');
            group.className = 'inversion-group';
            
            // Compact title
            const shortType = type === 'close' ? 'Close' : 'Open';
            const shortInv = getInversionName(parseInt(invIdx)).replace('Position', 'Pos');
            
            const title = document.createElement('div');
            title.className = 'inversion-title';
            title.textContent = `${shortType} - ${shortInv}`;
            group.appendChild(title);
            
            const grid = document.createElement('div');
            grid.className = 'voicing-grid';
            
            voicings.forEach(voicing => {
                const { notes, range } = voicing;
                const validNotes = notes.filter(n => Tonal.Note.midi(n) !== null);
                if (validNotes.length !== notes.length) return;
                
                const btn = document.createElement('button');
                btn.className = 'voicing-button';
                
                // Format notes compactly
                const formatted = validNotes.map(n => {
                    const norm = normalizeNoteForKeyboard(n) || n;
                    return norm.replace(/([A-G]#?)(\d+)/, '$1<sub>$2</sub>');
                }).join('-');
                
                btn.innerHTML = `${formatted} <span style="color:#aaa;font-size:0.85em">${range}st</span>`;
                
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Highlight this voicing button
                    popup.querySelectorAll('.voicing-button').forEach(b => b.classList.remove('active-voicing'));
                    btn.classList.add('active-voicing');
                    // Play it
                    playVoicing(validNotes);
                });
                
                grid.appendChild(btn);
            });
            
            group.appendChild(grid);
            popup.appendChild(group);
        });
    }
    
    // Position the popup near the button
    popup.style.display = 'block';
    
    const btnRect = buttonEl.getBoundingClientRect();
    const container = popup.parentElement;
    const containerRect = container.getBoundingClientRect();
    
    // Position below the button, aligned to its left edge
    let left = btnRect.left - containerRect.left;
    let top = btnRect.bottom - containerRect.top + 6;
    
    // Ensure popup doesn't overflow right side of viewport
    const popupWidth = popup.offsetWidth;
    const maxLeft = containerRect.width - popupWidth - 10;
    if (left > maxLeft) left = Math.max(0, maxLeft);
    
    // If popup would go below the fixed piano, show it above the button instead
    const fixedPiano = document.querySelector('.fixed-piano-container');
    const pianoTop = fixedPiano ? fixedPiano.getBoundingClientRect().top : window.innerHeight;
    const popupBottom = btnRect.bottom + popup.offsetHeight + 10;
    
    if (popupBottom > pianoTop) {
        // Show above the button
        top = btnRect.top - containerRect.top - popup.offsetHeight - 6;
        // Move the arrow to the bottom
        popup.classList.add('popup-above');
    } else {
        popup.classList.remove('popup-above');
    }
    
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

// Function to play a chord (kept for backward compat)
function playChord(root, type, octave) {
    try {
        // Get the chord notes
        const notes = getChordNotes(root, type, octave);
        
        // Check if we have notes to play
        if (!notes || notes.length === 0) {
            console.warn(`No notes to play for chord: ${root}${type}`);
            return;
        }
        
        // Validate notes - ensure they are valid and have octave information
        const validNotes = notes.filter(note => Tonal.Note.midi(note) !== null);
        
        if (validNotes.length !== notes.length) {
            console.warn(`Some notes are invalid or missing octave:`, 
                notes.filter(note => Tonal.Note.midi(note) === null));
        }
        
        // Sort notes by pitch for better visualization
        const sortedNotes = sortNotesByPitch(validNotes);
        
        // Log the notes we're trying to play
        console.log(`Attempting to play chord ${root}${type} notes:`, sortedNotes);
        
        // Start audio context if not already started
        if (!audioContextStarted) {
            initializeAudio();
        }
        
        // Play the chord if piano is loaded
        if (piano && isLoaded) {
            // Release any currently playing notes
            piano.releaseAll();
            
            // Play each note in the chord
            sortedNotes.forEach(note => {
                try {
                    piano.triggerAttack(note);
                } catch (error) {
                    console.error(`Error playing note ${note}:`, error);
                }
            });
            
            // Update the fixed keyboard to show which notes are being played
            updateFixedKeyboard(sortedNotes);
            
            console.log(`Playing chord: ${root}${type}`, sortedNotes);
        } else {
            console.warn("Piano not loaded yet");
        }
    } catch (error) {
        console.error(`Error playing chord ${root}${type}:`, error);
    }
}

// Helper function to sort notes by pitch
function sortNotesByPitch(notes) {
    return [...notes].sort((a, b) => {
        const midiA = Tonal.Note.midi(a);
        const midiB = Tonal.Note.midi(b);
        
        if (midiA === null || midiB === null) {
            return 0;
        }
        
        return midiA - midiB;
    });
}

// Function to get all voicings for a chord
function getAllVoicings(rootNote, chordType, baseOctave) {
    try {
        // Get the chord notes using Tonal.js
        const chordObj = Tonal.Chord.get(`${rootNote}${chordType}`);
        
        // Check if we got valid chord notes
        if (!chordObj || !chordObj.notes || chordObj.notes.length === 0) {
            console.warn(`Could not get notes for chord: ${rootNote}${chordType}`);
            return [];
        }
        
        const chordNotes = chordObj.notes;
        console.log(`Generating voicings for ${rootNote}${chordType}:`, chordNotes);
        
        // Convert base octave to number
        const octave = parseInt(baseOctave);
        
        // Array to store all voicings
        const allVoicings = [];
        
        // Helper function to sort notes by pitch
        function sortByPitch(notes) {
            return [...notes].sort((a, b) => {
                return Tonal.Note.midi(a) - Tonal.Note.midi(b);
            });
        }
        
        // Helper function to check if a voicing is a duplicate
        function isDuplicate(newVoicing) {
            return allVoicings.some(existingVoicing => {
                // If note count is different, it's not a duplicate
                if (existingVoicing.notes.length !== newVoicing.length) {
                    return false;
                }
                
                // Check if all notes match
                return existingVoicing.notes.every((note, index) => {
                    return Tonal.Note.midi(note) === Tonal.Note.midi(newVoicing[index]);
                });
            });
        }
        
        // Helper function to add a voicing to the result array
        function addVoicing(notes, inversionIndex, type) {
            // Make sure all notes are valid
            const validNotes = notes.filter(note => {
                try {
                    return Tonal.Note.midi(note) !== null;
                } catch (error) {
                    console.warn(`Invalid note in voicing: ${note}`);
                    return false;
                }
            });
            
            // Skip if we lost notes in validation
            if (validNotes.length !== notes.length) {
                console.warn(`Skipping voicing due to invalid notes: ${notes.join(', ')}`);
                return;
            }
            
            // Sort notes by pitch
            const sortedNotes = sortByPitch(validNotes);
            
            // Skip if it's a duplicate
            if (isDuplicate(sortedNotes)) {
                return;
            }
            
            // Calculate the range of the voicing in semitones
            const range = getVoicingRange(sortedNotes);
            
            // Add the voicing to the result array
            allVoicings.push({
                notes: sortedNotes,
                inversionIndex,
                type,
                range
            });
        }
        
        // Generate close position voicings
        // MIDI ceiling: if any note exceeds this, shift the whole voicing down
        const MIDI_CEILING = 96; // C7 — keeps voicings in a comfortable range
        
        for (let inversionIndex = 0; inversionIndex < chordNotes.length; inversionIndex++) {
            // Rotate the chord notes so the bass note of this inversion comes first
            const rotated = [
                ...chordNotes.slice(inversionIndex),
                ...chordNotes.slice(0, inversionIndex)
            ];
            
            // Build the voicing: each note must be higher than the previous
            const voicing = [];
            let currentOctave = octave;
            let prevMidi = -Infinity;
            
            rotated.forEach((note) => {
                let noteWithOctave = `${note}${currentOctave}`;
                let midi = Tonal.Note.midi(noteWithOctave);
                
                // If this note isn't higher than the previous, bump up an octave
                while (midi !== null && midi <= prevMidi) {
                    currentOctave++;
                    noteWithOctave = `${note}${currentOctave}`;
                    midi = Tonal.Note.midi(noteWithOctave);
                }
                
                voicing.push(noteWithOctave);
                if (midi !== null) prevMidi = midi;
            });
            
            // If the highest note exceeds the ceiling, shift everything down an octave
            const midiValues = voicing.map(n => Tonal.Note.midi(n)).filter(m => m !== null);
            if (midiValues.length > 0 && Math.max(...midiValues) > MIDI_CEILING) {
                // Shift all notes down one octave
                const shifted = voicing.map(n => {
                    const name = n.replace(/\d+$/, '');
                    const oct = parseInt(n.match(/\d+$/)[0]);
                    return `${name}${oct - 1}`;
                });
                addVoicing(shifted, inversionIndex, 'close');
            } else {
                addVoicing(voicing, inversionIndex, 'close');
            }
        }
        
        // Generate open position voicings
        // For each inversion, try different octave combinations
        for (let inversionIndex = 0; inversionIndex < chordNotes.length; inversionIndex++) {
            // Build a properly-rotated close position base voicing (same logic as above)
            const rotated = [
                ...chordNotes.slice(inversionIndex),
                ...chordNotes.slice(0, inversionIndex)
            ];
            
            const baseVoicing = [];
            let curOct = octave;
            let pMidi = -Infinity;
            
            rotated.forEach((note) => {
                let nwo = `${note}${curOct}`;
                let m = Tonal.Note.midi(nwo);
                while (m !== null && m <= pMidi) {
                    curOct++;
                    nwo = `${note}${curOct}`;
                    m = Tonal.Note.midi(nwo);
                }
                baseVoicing.push(nwo);
                if (m !== null) pMidi = m;
            });
            
            // Helper: clamp a voicing so its highest note doesn't exceed MIDI_CEILING
            function clampVoicing(v) {
                const mids = v.map(n => Tonal.Note.midi(n)).filter(m => m !== null);
                if (mids.length > 0 && Math.max(...mids) > MIDI_CEILING) {
                    return v.map(n => {
                        const nm = n.replace(/\d+$/, '');
                        const o = parseInt(n.match(/\d+$/)[0]);
                        return `${nm}${o - 1}`;
                    });
                }
                return v;
            }
            
            // Try different octave combinations
            // For each note (except the bass note), try moving it up an octave
            for (let i = 1; i < baseVoicing.length; i++) {
                // Create a copy of the base voicing
                const openVoicing = [...baseVoicing];
                
                // Move this note up an octave
                const note = openVoicing[i];
                const noteName = note.replace(/\d+$/, '');
                const noteOctave = parseInt(note.match(/\d+$/)[0]);
                openVoicing[i] = `${noteName}${noteOctave + 1}`;
                
                // Add the voicing (clamped)
                addVoicing(clampVoicing(openVoicing), inversionIndex, 'open');
                
                // Try moving additional notes up an octave
                for (let j = i + 1; j < baseVoicing.length; j++) {
                    // Create a copy of the current voicing
                    const openVoicing2 = [...openVoicing];
                    
                    // Move this note up an octave
                    const note2 = openVoicing2[j];
                    const noteName2 = note2.replace(/\d+$/, '');
                    const noteOctave2 = parseInt(note2.match(/\d+$/)[0]);
                    openVoicing2[j] = `${noteName2}${noteOctave2 + 1}`;
                    
                    // Add the voicing (clamped)
                    addVoicing(clampVoicing(openVoicing2), inversionIndex, 'open');
                }
            }
        }
        
        // Sort voicings by range
        return allVoicings.sort((a, b) => a.range - b.range);
    } catch (error) {
        console.error(`Error generating voicings for ${rootNote}${chordType}:`, error);
        return [];
    }
}

// Function to get the range of a voicing in semitones
function getVoicingRange(voicing) {
    try {
        if (!voicing || voicing.length < 2) {
            return 0;
        }
        
        const midiNotes = voicing.map(note => {
            const midi = Tonal.Note.midi(note);
            if (midi === null) {
                throw new Error(`Invalid note: ${note}`);
            }
            return midi;
        });
        
        return Math.max(...midiNotes) - Math.min(...midiNotes);
    } catch (error) {
        console.error("Error calculating voicing range:", error);
        return 0;
    }
}

// Function to play a voicing
function playVoicing(notes) {
    try {
        // Check if we have notes to play
        if (!notes || notes.length === 0) {
            console.warn("No notes to play for voicing");
            return;
        }
        
        // Log the notes we're trying to play
        console.log("Attempting to play voicing notes:", notes);
        
        // Ensure all notes are valid
        const validNotes = notes.filter(note => {
            return Tonal.Note.midi(note) !== null;
        });
        
        if (validNotes.length !== notes.length) {
            console.warn("Some notes are invalid:", 
                notes.filter(note => Tonal.Note.midi(note) === null));
        }
        
        // Start audio context if not already started
        if (!audioContextStarted) {
            initializeAudio();
        }
        
        // Play the voicing if piano is loaded
        if (piano && isLoaded) {
            // Release any currently playing notes
            piano.releaseAll();
            
            // Play each note in the voicing
            validNotes.forEach(note => {
                try {
                    piano.triggerAttack(note);
                } catch (error) {
                    console.error(`Error playing note ${note}:`, error);
                }
            });
            
            // Update the fixed keyboard to show which notes are being played
            updateFixedKeyboard(validNotes);
            
            console.log("Playing voicing:", validNotes);
        } else {
            console.warn("Piano not loaded yet");
        }
    } catch (error) {
        console.error("Error playing voicing:", error);
    }
}

// Helper function to get inversion name
function getInversionName(inversionIndex) {
    const inversionNames = [
        'Root Position',
        'First Inversion',
        'Second Inversion',
        'Third Inversion',
        'Fourth Inversion',
        'Fifth Inversion',
        'Sixth Inversion'
    ];
    
    return inversionNames[inversionIndex] || `Inversion ${inversionIndex}`;
} 
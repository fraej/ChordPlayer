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
        generateChords();
        showVoicings(currentRoot, "M", document.getElementById('octave').value);
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
            
            // Calculate key width based on container width
            // We need to fit 52 white keys (88 keys total, but 52 white keys)
            const whiteKeyWidth = Math.max(20, Math.floor(containerWidth / 52));
            
            // Create SVG element - make it span the full width
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "piano-svg");
            
            // Calculate the total SVG width based on the number of white keys
            const totalWidth = whiteKeyWidth * 52;
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
            
            // Add window resize handler to adjust keyboard size
            window.addEventListener('resize', function() {
                // Recalculate key width based on new container width
                const newContainerWidth = window.innerWidth;
                const newWhiteKeyWidth = Math.max(20, Math.floor(newContainerWidth / 52));
                
                // Update the viewBox
                const newTotalWidth = newWhiteKeyWidth * 52;
                svg.setAttribute("viewBox", `0 0 ${newTotalWidth} 120`);
            });
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
    
    // Store the currently playing notes
    currentlyPlayingNotes = notes;
    
    console.log("Highlighting notes:", notes);
    
    // Highlight the active keys
    notes.forEach(note => {
        // Make sure we have a valid note format with octave
        if (!note.match(/^[A-G][#b]?\d+$/)) {
            console.warn(`Invalid note format: ${note}`);
            return;
        }
        
        // Find the key with this exact note (including octave)
        let key = fixedKeyboard.svg.querySelector(`rect[data-note="${note}"]`);
        
        // If the exact note isn't found, try to find it with enharmonic equivalents
        if (!key) {
            // Try to find enharmonic equivalents (e.g., C# = Db)
            const enharmonics = getEnharmonicEquivalents(note);
            for (const enharmonic of enharmonics) {
                key = fixedKeyboard.svg.querySelector(`rect[data-note="${enharmonic}"]`);
                if (key) {
                    console.log(`Found enharmonic equivalent for ${note}: ${enharmonic}`);
                    break;
                }
            }
        }
        
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
            console.warn(`Could not find key for note: ${note}`);
            
            // Try to find the note without the octave
            const noteName = note.replace(/\d+$/, '');
            const octave = note.match(/\d+$/)[0];
            console.log(`Trying to find key for note ${noteName} in octave ${octave}`);
            
            // Try to find a key with this note name in any octave
            const keys = fixedKeyboard.svg.querySelectorAll(`rect[data-note^="${noteName}"]`);
            if (keys.length > 0) {
                console.log(`Found ${keys.length} keys for note ${noteName} in different octaves`);
                
                // Find the key with the closest octave
                let closestKey = null;
                let minOctaveDiff = Infinity;
                
                keys.forEach(k => {
                    const keyOctave = k.getAttribute('data-note').match(/\d+$/)[0];
                    const octaveDiff = Math.abs(parseInt(keyOctave) - parseInt(octave));
                    
                    if (octaveDiff < minOctaveDiff) {
                        minOctaveDiff = octaveDiff;
                        closestKey = k;
                    }
                });
                
                if (closestKey) {
                    console.log(`Using key for note ${closestKey.getAttribute('data-note')} as fallback`);
                    
                    const isBlackKey = closestKey.classList.contains('black-key');
                    
                    // Add active class
                    closestKey.classList.add('active-key');
                    if (isBlackKey) {
                        closestKey.classList.add('active-black-key');
                    }
                    
                    // Update the fill color
                    closestKey.style.fill = isBlackKey ? '#66bb6a' : '#4caf50';
                    closestKey.style.stroke = '#2e7d32';
                    closestKey.style.strokeWidth = '2px';
                }
            }
        }
    });
    
    // Scroll to the middle of the active keys if there are any
    if (notes.length > 0) {
        scrollToActiveKeys();
    }
}

// Function to get enharmonic equivalents of a note
function getEnharmonicEquivalents(note) {
    // Extract note name and octave
    const match = note.match(/([A-G][#b]?)(\d+)/);
    if (!match) return [note];
    
    const noteName = match[1];
    const octave = match[2];
    
    // Common enharmonic equivalents
    const enharmonicMap = {
        'C#': 'Db',
        'Db': 'C#',
        'D#': 'Eb',
        'Eb': 'D#',
        'F#': 'Gb',
        'Gb': 'F#',
        'G#': 'Ab',
        'Ab': 'G#',
        'A#': 'Bb',
        'Bb': 'A#',
        // Special cases for B/C and E/F
        'B': ['C', (parseInt(octave) - 1).toString()],
        'C': ['B', (parseInt(octave) + 1).toString()],
        'E': ['F', (parseInt(octave) - 1).toString()],
        'F': ['E', (parseInt(octave) + 1).toString()]
    };
    
    const result = [note]; // Always include the original note
    
    if (enharmonicMap[noteName]) {
        if (Array.isArray(enharmonicMap[noteName])) {
            // Handle special cases for B/C and E/F
            const [enhName, enhOctave] = enharmonicMap[noteName];
            result.push(`${enhName}${enhOctave}`);
        } else {
            // Handle regular enharmonic equivalents
            result.push(`${enharmonicMap[noteName]}${octave}`);
        }
    }
    
    return result;
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

// Function to force initial chord and voicing generation
function forceInitialGeneration() {
    // Set a flag to prevent multiple initializations
    if (initialLoadComplete) return;
    
    console.log("Forcing initial chord and voicing generation...");
    
    // Set the current root explicitly
    currentRoot = "C";
    if (currentRootDisplay) {
        currentRootDisplay.textContent = `Root: C`;
    }
    
    // Update keyboard selection if available
    updateKeyboardColors();
    
    // Generate chords directly
    const chordButtonsContainer = document.getElementById('chordButtons');
    if (chordButtonsContainer) {
        generateChords();
    }
    
    // Generate voicings directly
    const voicingsContainer = document.getElementById('voicingButtons');
    if (voicingsContainer) {
        showVoicings("C", "M", document.getElementById('octave').value);
    }
    
    // Try again after a delay if needed
    setTimeout(function() {
        // Check if chords and voicings are populated
        const hasChords = chordButtonsContainer && chordButtonsContainer.children.length > 0;
        const hasVoicings = voicingsContainer && voicingsContainer.children.length > 0;
        
        if (!hasChords || !hasVoicings) {
            console.log("Retrying chord and voicing generation...");
            
            // Clear and regenerate
            if (chordButtonsContainer) chordButtonsContainer.innerHTML = '';
            if (voicingsContainer) voicingsContainer.innerHTML = '';
            
            // Regenerate
            generateChords();
            showVoicings("C", "M", document.getElementById('octave').value);
            
            // Update keyboard selection if available
            if (keyboard && typeof keyboard.selectNote === 'function') {
                keyboard.selectNote("C");
                updateKeyboardColors();
            }
        }
        
        // Mark initialization as complete
        initialLoadComplete = true;
    }, 500);
}

// Function to ensure UI is ready and generate initial chords and voicings
function ensureUIReady() {
    console.log("Ensuring UI is ready and generating initial chords and voicings...");
    
    // First attempt at generating chords and voicings
    generateChords();
    showVoicings("C", "M", document.getElementById('octave').value);
    
    // Force regeneration after a short delay to ensure everything is loaded
    setTimeout(function() {
        console.log("Forcing chord and voicing generation...");
        try {
            // Force regeneration of chords for C
            currentRoot = "C";
            document.getElementById('current-root').textContent = `Root: C`;
            
            // Update keyboard selected note if keyboard is initialized
            if (keyboard && typeof keyboard.selectNote === 'function') {
                keyboard.selectNote("C");
            }
            
            // Clear and regenerate chord buttons
            const chordButtonsContainer = document.getElementById('chordButtons');
            if (chordButtonsContainer) {
                chordButtonsContainer.innerHTML = '';
                generateChords();
            }
            
            // Clear and regenerate voicing buttons
            const voicingsContainer = document.getElementById('voicingButtons');
            if (voicingsContainer) {
                voicingsContainer.innerHTML = '';
                showVoicings("C", "M", document.getElementById('octave').value);
            }
            
            console.log("Chord and voicing generation completed");
        } catch (error) {
            console.error("Error during forced chord generation:", error);
            // Try again after a longer delay if there was an error
            setTimeout(forceInitialGeneration, 1000);
        }
    }, 500); // 500ms delay to ensure everything is loaded
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
    
    // Update the root note display
    if (currentRootDisplay) {
        currentRootDisplay.textContent = `Root: ${note}`;
    }
    
    // Generate chords for the new root note
    const chordButtonsContainer = document.getElementById('chordButtons');
    if (chordButtonsContainer) {
        generateChords();
    }
    
    // Show voicings for the major chord of the new root note
    const voicingsContainer = document.getElementById('voicingButtons');
    if (voicingsContainer) {
        showVoicings(note, "M", document.getElementById('octave').value);
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
        
        // Set the button content
        button.innerHTML = `
            ${currentRoot}${display}
            <span class="note-count">${notes.length} notes</span>
        `;
        
        // Add click event to play the chord
        button.addEventListener('click', function() {
            playChord(currentRoot, symbol, octave);
            
            // Show voicings for this chord
            showVoicings(currentRoot, symbol, octave);
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

// Function to play a chord
function playChord(root, type, octave) {
    try {
        // Get the chord notes
        const notes = getChordNotes(root, type, octave);
        
        // Check if we have notes to play
        if (!notes || notes.length === 0) {
            console.warn(`No notes to play for chord: ${root}${type}`);
            return;
        }
        
        // Validate notes - ensure they all have octave information
        const validNotes = notes.filter(note => note.match(/^[A-G][#b]?\d+$/));
        
        if (validNotes.length !== notes.length) {
            console.warn(`Some notes don't have octave information:`, 
                notes.filter(note => !note.match(/^[A-G][#b]?\d+$/)));
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
            
            // Also show voicings for this chord
            showVoicings(root, type, octave);
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
        for (let inversionIndex = 0; inversionIndex < chordNotes.length; inversionIndex++) {
            // Create the voicing in the specified octave
            const voicing = chordNotes.map((note, index) => {
                // Calculate the octave for this note
                let noteOctave = octave;
                
                // If the index is less than the inversion index, move to the next octave
                if (index < inversionIndex) {
                    noteOctave += 1;
                }
                
                return `${note}${noteOctave}`;
            });
            
            // Add the voicing
            addVoicing(voicing, inversionIndex, 'close');
        }
        
        // Generate open position voicings
        // For each inversion, try different octave combinations
        for (let inversionIndex = 0; inversionIndex < chordNotes.length; inversionIndex++) {
            // Start with the close position voicing
            const baseVoicing = chordNotes.map((note, index) => {
                let noteOctave = octave;
                if (index < inversionIndex) {
                    noteOctave += 1;
                }
                return `${note}${noteOctave}`;
            });
            
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
                
                // Add the voicing
                addVoicing(openVoicing, inversionIndex, 'open');
                
                // Try moving additional notes up an octave
                for (let j = i + 1; j < baseVoicing.length; j++) {
                    // Create a copy of the current voicing
                    const openVoicing2 = [...openVoicing];
                    
                    // Move this note up an octave
                    const note2 = openVoicing2[j];
                    const noteName2 = note2.replace(/\d+$/, '');
                    const noteOctave2 = parseInt(note2.match(/\d+$/)[0]);
                    openVoicing2[j] = `${noteName2}${noteOctave2 + 1}`;
                    
                    // Add the voicing
                    addVoicing(openVoicing2, inversionIndex, 'open');
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

// Function to show voicings for a chord
function showVoicings(rootNote, chordType, baseOctave) {
    const voicingsContainer = document.getElementById('voicingButtons');
    voicingsContainer.innerHTML = '';
    
    // Get all voicings for the chord
    const allVoicings = getAllVoicings(rootNote, chordType, baseOctave);
    
    if (allVoicings.length === 0) {
        console.warn(`No voicings found for ${rootNote}${chordType} in octave ${baseOctave}`);
        voicingsContainer.innerHTML = `<div class="no-voicings">No voicings available for ${rootNote}${chordType}</div>`;
        return;
    }
    
    // Group voicings by inversion
    const groupedVoicings = {};
    
    allVoicings.forEach(voicing => {
        const { notes, inversionIndex, type } = voicing;
        
        // Create a key for the inversion group
        const groupKey = `${type}-${inversionIndex}`;
        
        if (!groupedVoicings[groupKey]) {
            groupedVoicings[groupKey] = [];
        }
        
        groupedVoicings[groupKey].push(voicing);
    });
    
    // Create a section for each inversion group
    Object.keys(groupedVoicings).sort().forEach(groupKey => {
        const voicings = groupedVoicings[groupKey];
        const [type, inversionIndex] = groupKey.split('-');
        
        // Create a container for this inversion group
        const groupContainer = document.createElement('div');
        groupContainer.className = 'inversion-group';
        
        // Add a title for the inversion group
        const groupTitle = document.createElement('div');
        groupTitle.className = 'inversion-title';
        
        // Format the inversion name
        let inversionName = '';
        if (type === 'close') {
            inversionName = `Close Position - ${getInversionName(parseInt(inversionIndex))}`;
        } else {
            inversionName = `Open Position - ${getInversionName(parseInt(inversionIndex))}`;
        }
        
        groupTitle.textContent = inversionName;
        groupContainer.appendChild(groupTitle);
        
        // Create a grid for the voicings
        const voicingGrid = document.createElement('div');
        voicingGrid.className = 'voicing-grid';
        
        // Add buttons for each voicing in this group
        voicings.forEach(voicing => {
            const { notes, range } = voicing;
            
            // Validate notes - ensure they all have octave information
            const validNotes = notes.filter(note => note.match(/^[A-G][#b]?\d+$/));
            
            if (validNotes.length !== notes.length) {
                console.warn(`Skipping voicing with invalid notes: ${notes.join(', ')}`);
                return;
            }
            
            // Create button for this voicing
            const button = document.createElement('button');
            button.className = 'voicing-button';
            
            // Format notes for display
            const formattedNotes = validNotes.map(note => {
                // Format each note (e.g., "C4" -> "C<sub>4</sub>")
                return note.replace(/([A-G][#b]?)(\d+)/, '$1<sub>$2</sub>');
            }).join(' - ');
            
            // Set button content with notes and range
            button.innerHTML = `
                <div>${formattedNotes}</div>
                <div style="font-size: 0.8em; color: #666;">Range: ${range} semitones</div>
            `;
            
            // Add click event to play the voicing
            button.addEventListener('click', function() {
                // Log the notes we're about to play
                console.log(`Clicked voicing button with notes: ${validNotes.join(', ')}`);
                
                // Play the voicing
                playVoicing(validNotes);
            });
            
            voicingGrid.appendChild(button);
        });
        
        groupContainer.appendChild(voicingGrid);
        voicingsContainer.appendChild(groupContainer);
    });
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
        
        // Ensure all notes have octave information
        const validNotes = notes.filter(note => {
            // Check if the note has an octave number
            return note.match(/^[A-G][#b]?\d+$/);
        });
        
        if (validNotes.length !== notes.length) {
            console.warn("Some notes don't have octave information:", 
                notes.filter(note => !note.match(/^[A-G][#b]?\d+$/)));
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
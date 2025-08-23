/**
 * SVGKeyboard - A reusable SVG piano keyboard library
 * 
 * This library creates an interactive SVG piano keyboard that can be used
 * to select musical notes. It supports customizable key styling and click events.
 */

class SVGKeyboard {
    /**
     * Create a new SVG keyboard
     * @param {string|HTMLElement} container - The container element or its ID
     * @param {Object} options - Configuration options
     */
    constructor(container, options = {}) {
        // Default options
        this.options = {
            width: 'auto', // responsive width
            height: 80,
            initialSelectedNote: 'C',
            whiteKeyColor: 'white',
            blackKeyColor: '#333',
            selectedWhiteKeyColor: '#e3f2fd',
            selectedBlackKeyColor: '#666',
            onNoteSelected: null,
            ...options
        };

        // Get container element
        this.container = typeof container === 'string' 
            ? document.getElementById(container) 
            : container;
            
        if (!this.container) {
            throw new Error('Container element not found');
        }
        
        // SVG namespace
        this.svgNS = "http://www.w3.org/2000/svg";
        
        // Current selected note
        this.selectedNote = this.options.initialSelectedNote;
        
    // Create the keyboard
        this.createKeyboard();
    }
    
    /**
     * Create the SVG keyboard
     * @private
     */
    createKeyboard() {
        // Create SVG element
        this.svg = document.createElementNS(this.svgNS, "svg");
        this.svg.setAttribute("class", "piano-svg");
        // Determine current container width (fallback 350)
        const containerWidth = this.container.clientWidth || 350;
        this.actualWidth = containerWidth;
        // Compute base white key width (float)
        const baseWhiteKeyWidth = containerWidth / 7;
        // Build white keys ensuring last key absorbs any rounding remainder
        this.whiteKeys = [];
        for (let i = 0; i < 7; i++) {
            const x = i * baseWhiteKeyWidth;
            const width = (i === 6) ? (containerWidth - baseWhiteKeyWidth * 6) : baseWhiteKeyWidth;
            this.whiteKeys.push({ note: 'CDEFGAB'[i], x, width });
        }
        // Black key width proportional
        const blackWidth = baseWhiteKeyWidth * 0.6;
        const centerBetween = idx => (idx + 0.5) * baseWhiteKeyWidth; // center between white idx and next
        this.blackKeys = [
            { note: 'C#', x: centerBetween(0) - blackWidth / 2 },
            { note: 'D#', x: centerBetween(1) - blackWidth / 2 },
            { note: 'F#', x: centerBetween(3) - blackWidth / 2 },
            { note: 'G#', x: centerBetween(4) - blackWidth / 2 },
            { note: 'A#', x: centerBetween(5) - blackWidth / 2 }
        ];
        this.blackKeyWidth = blackWidth;
        this.whiteKeyWidth = baseWhiteKeyWidth; // for reference
        this.svg.setAttribute("viewBox", `0 0 ${containerWidth} ${this.options.height}`);
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.setAttribute('preserveAspectRatio', 'none');
        this.container.appendChild(this.svg);

        // Create white keys
        this.whiteKeys.forEach(key => {
            const rect = document.createElementNS(this.svgNS, "rect");
            rect.setAttribute("class", "white-key");
            if (key.note === this.selectedNote) {
                rect.classList.add("selected");
            }
            rect.setAttribute("x", key.x);
            rect.setAttribute("y", 0);
            rect.setAttribute("width", key.width);
            rect.setAttribute("height", this.options.height);
            rect.setAttribute("rx", 3);
            rect.setAttribute("data-note", key.note);
            rect.style.fill = key.note === this.selectedNote 
                ? this.options.selectedWhiteKeyColor 
                : this.options.whiteKeyColor;
            rect.style.stroke = "#ccc";
            rect.style.strokeWidth = "1";
            rect.style.cursor = "pointer";
            
            // Add click event
            rect.addEventListener("click", () => this.selectNote(key.note));
            
            this.svg.appendChild(rect);
            
            // Add key label
            const text = document.createElementNS(this.svgNS, "text");
            text.setAttribute("class", "key-text");
            text.setAttribute("x", key.x + key.width / 2);
            text.setAttribute("y", this.options.height - 10);
            text.style.fontSize = "10px";
            text.style.textAnchor = "middle";
            text.style.userSelect = "none";
            text.style.pointerEvents = "none";
            // Set text color to white if the key is selected and using a dark color
            if (key.note === this.selectedNote && this.options.selectedWhiteKeyColor === '#d32f2f') {
                text.setAttribute("fill", "white");
            } else {
                text.setAttribute("fill", "black");
            }
            text.textContent = key.note;
            this.svg.appendChild(text);
        });
        
        // Create black keys (on top of white keys)
        this.blackKeys.forEach(key => {
            const rect = document.createElementNS(this.svgNS, "rect");
            rect.setAttribute("class", "black-key");
            if (key.note === this.selectedNote) {
                rect.classList.add("selected");
            }
            rect.setAttribute("x", key.x);
            rect.setAttribute("y", 0);
            rect.setAttribute("width", blackWidth);
            rect.setAttribute("height", this.options.height * 0.625); // 50/80
            rect.setAttribute("rx", 3);
            rect.setAttribute("data-note", key.note);
            rect.style.fill = key.note === this.selectedNote 
                ? this.options.selectedBlackKeyColor 
                : this.options.blackKeyColor;
            rect.style.stroke = this.options.blackKeyColor;
            rect.style.strokeWidth = "1";
            rect.style.cursor = "pointer";
            
            // Add click event
            rect.addEventListener("click", () => this.selectNote(key.note));
            
            this.svg.appendChild(rect);
            
            // Add key label
            const text = document.createElementNS(this.svgNS, "text");
            text.setAttribute("class", "key-text");
            text.setAttribute("x", key.x + blackWidth / 2);
            text.setAttribute("y", this.options.height * 0.5);
            text.setAttribute("fill", "white");
            text.style.fontSize = "10px";
            text.style.textAnchor = "middle";
            text.style.userSelect = "none";
            text.style.pointerEvents = "none";
            text.textContent = key.note;
            this.svg.appendChild(text);
        });
    }
    
    /**
     * Select a note on the keyboard
     * @param {string} note - The note to select (e.g., 'C', 'D#')
     * @public
     */
    selectNote(note) {
        this.selectedNote = note;
        
        // Update selected key visual
        this.svg.querySelectorAll('rect').forEach(key => {
            const keyNote = key.getAttribute('data-note');
            const isWhiteKey = key.classList.contains('white-key');
            
            if (keyNote === note) {
                key.classList.add('selected');
                key.style.fill = isWhiteKey 
                    ? this.options.selectedWhiteKeyColor 
                    : this.options.selectedBlackKeyColor;
                
                // Find and update the corresponding text color
                if (isWhiteKey && this.options.selectedWhiteKeyColor === '#d32f2f') {
                    const keyTexts = this.svg.querySelectorAll('.key-text');
                    keyTexts.forEach(text => {
                        if (text.textContent === keyNote) {
                            text.setAttribute("fill", "white");
                        }
                    });
                }
            } else {
                key.classList.remove('selected');
                key.style.fill = isWhiteKey 
                    ? this.options.whiteKeyColor 
                    : this.options.blackKeyColor;
                
                // Reset text color for white keys
                if (isWhiteKey) {
                    const keyTexts = this.svg.querySelectorAll('.key-text');
                    keyTexts.forEach(text => {
                        if (text.textContent === keyNote) {
                            text.setAttribute("fill", "black");
                        }
                    });
                }
            }
        });
        
        // Call the onNoteSelected callback if provided
        if (typeof this.options.onNoteSelected === 'function') {
            this.options.onNoteSelected(note);
        }
    }
    
    /**
     * Get the currently selected note
     * @returns {string} The selected note
     * @public
     */
    getSelectedNote() {
        return this.selectedNote;
    }
    
    /**
     * Update keyboard options
     * @param {Object} newOptions - New options to apply
     * @public
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        
        // Clear the container and recreate the keyboard
        this.container.innerHTML = '';
        this.createKeyboard();
    }

    /**
     * Rebuild keyboard on resize when width is auto
     */
    resize() {
        if (this.options.width !== 'auto') return;
        const prev = this.selectedNote;
        this.container.innerHTML = '';
        this.createKeyboard();
        this.selectNote(prev);
    }
}

// Export the SVGKeyboard class for use in other files
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = SVGKeyboard;
} else {
    window.SVGKeyboard = SVGKeyboard;
} 
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
            width: 350,
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
        
        // Define key layouts
        this.whiteKeys = [
            { note: 'C', x: 0 },
            { note: 'D', x: 50 },
            { note: 'E', x: 100 },
            { note: 'F', x: 150 },
            { note: 'G', x: 200 },
            { note: 'A', x: 250 },
            { note: 'B', x: 300 }
        ];
        
        this.blackKeys = [
            { note: 'C#', x: 35 },
            { note: 'D#', x: 85 },
            { note: 'F#', x: 185 },
            { note: 'G#', x: 235 },
            { note: 'A#', x: 285 }
        ];
        
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
        this.svg.setAttribute("viewBox", `0 0 ${this.options.width} ${this.options.height}`);
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
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
            rect.setAttribute("width", 50);
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
            text.setAttribute("x", key.x + 25);
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
            rect.setAttribute("width", 30);
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
            text.setAttribute("x", key.x + 15);
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
}

// Export the SVGKeyboard class for use in other files
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = SVGKeyboard;
} else {
    window.SVGKeyboard = SVGKeyboard;
} 
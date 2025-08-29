class ScoreManager {
    constructor (app) {
        this.app = app;
        this.abcString = '';
        this.midi2abcReady = false;
        this.midi2abc = null;
        this.abcjs = null;
        this.modulesLoaded = false;
        this.currentBarStart = 0; // Track current bar position for score following
        this.scoreFollowerActive = false;
        this.scoreShown = false;
        this.scoreAvailable = true;
        this.lastPolledBar = null; // To avoid redundant updates
        this.abcOutput = ""; // Store output from WASM module
        this.currentKeySignature = 'C'; // Track current key signature
        this.updateTimeout = null;
    }

    async init() {
        // Load required modules first
        await this.loadModules();
    }

    loadModules() {
        return new Promise((resolve, reject) => {
            if (this.modulesLoaded) {
                resolve();
                return;
            }

            const modules = [
                {
                    src: `./src/midi2abc/midi2abc.js?v=${Date.now()}`,
                    type: 'wasm'
                },
                {
                    src: 'https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.5.1/abcjs-basic-min.min.js',
                    integrity: 'sha512-g2wj9XoJ7DsQgUBGWlAXhRlCV2eOUB7VV5XUsrLKf0I0hvDvOBGOLIP1XBOiXdE6Gp6MUoMkr/mbdwz4C/kwDw==',
                    crossOrigin: 'anonymous',
                    referrerPolicy: 'no-referrer'
                }
            ];

            let loadedCount = 0;
            const totalModules = modules.length;

            modules.forEach(module => {
                const script = document.createElement('script');
                script.src = module.src;
                
                if (module.integrity) script.integrity = module.integrity;
                if (module.crossOrigin) script.crossOrigin = module.crossOrigin;
                if (module.referrerPolicy) script.referrerPolicy = module.referrerPolicy;
                
                script.onload = () => {
                    loadedCount++;
                    
                    // Initialize WASM module if this is the midi2abc script
                    if (module.type === 'wasm' && window.midi2abcModule) {
                        this.initializeMidi2abc().then(() => {
                            if (loadedCount === totalModules) {
                                this.modulesLoaded = true;
                                this.abcjs = window.ABCJS;
                                resolve();
                            }
                        }).catch(reject);
                    } else {
                        if (loadedCount === totalModules) {
                            this.modulesLoaded = true;
                            this.abcjs = window.ABCJS;
                            resolve();
                        }
                    }
                };
                
                script.onerror = () => {
                    console.warn(`Failed to load module: ${module.src}`);
                    loadedCount++;
                    if (loadedCount === totalModules) {
                        this.modulesLoaded = true;
                        this.abcjs = window.ABCJS;
                        resolve();
                    }
                };
                
                document.head.appendChild(script);
            });
        });
    }

    initializeMidi2abc() {
        return new Promise((resolve, reject) => {
            if (!window.midi2abcModule) {
                reject(new Error('midi2abcModule not found'));
                return;
            }

            // Initialize output variable at class level
            this.abcOutput = "";

            // Instantiate midi2abc WASM module
            window.midi2abcModule({
                print: (text) => {
                    this.abcOutput += text + "\n";
                    // console.log('WASM output:', text);
                },
                printErr: (text) => {
                    console.error('WASM error:', text);
                },
                onRuntimeInitialized: () => {
                    this.midi2abcReady = true;
                    // console.log('midi2abc WASM module initialized');
                    resolve();
                }
            }).then((Module) => {
                this.midi2abc = Module;
            }).catch((error) => {
                console.error('Failed to initialize WASM module:', error);
                reject(error);
            });
        });
    }

    async generateABCStringfromMIDI(midiFile) {
        if (!this.midi2abcReady || !this.midi2abc || !this.midi2abc.FS) {
            console.error('midi2abc WASM module not ready');
            this.handleAbcGenerationFailure('WASM module not ready');
            return '';
        }

        try {

            this.abcString = "";
            // Convert the Midi object to array buffer
            const midiArrayBuffer = midiFile.toArray();
            const data = new Uint8Array(midiArrayBuffer);
            
            // Reset output before each conversion
            this.abcOutput = "";
            
            // Ensure the file system is clean
            try {
                this.midi2abc.FS.unlink('/input.mid');
            } catch (e) {
                // File doesn't exist, that's fine
            }
            
            // Write MIDI data to WASM filesystem
            this.midi2abc.FS.writeFile('/input.mid', data);
            
            // Verify file was written correctly
            const writtenData = this.midi2abc.FS.readFile('/input.mid');
            
            // Call midi2abc conversion with -b flag to limit to 4 bars
            const result = this.midi2abc.callMain(['input.mid', '-sr', '4', '-bpl', '4', '-ga']);

            // Get the output (this should be captured by the print function)
            let abcOutput = this.abcOutput;
            
            if (!abcOutput || abcOutput.trim().length === 0) {
                console.warn('No ABC output generated');
                this.showAbcErrorNotification('No ABC output generated from MIDI');
                return '';
            }
            
            // Clean up the output - remove everything before the first X:
            abcOutput = abcOutput.replace(/^[\s\S]*?(?=^X:)/m, '');

            // Store the result
            this.abcString = abcOutput;
            return abcOutput;
            
        } catch (error) {
            console.error('Error generating ABC notation:', error);
            console.error('Error stack:', error.stack);
            this.showAbcErrorNotification(`ABC generation error: ${error.message}`);
            return '';
        }
    }

    showAbcErrorNotification(errorMessage) {
        
        // Hide score container if it's showing
        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'none';
        }

        // fold all accordion sections
        const accordions = document.querySelectorAll('.accordion-collapse.show');
        accordions.forEach(accordion => {
            accordion.classList.remove('show');
        });

        // Also update the button states to reflect collapsed state
        const accordionButtons = document.querySelectorAll('.accordion-button:not(.collapsed)');
        accordionButtons.forEach(button => {
            button.classList.add('collapsed');
            button.setAttribute('aria-expanded', 'false');
        });

        // Remove existing notification if present
        const existingModal = document.getElementById('abcErrorModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Check if using local file
        const isLocalFile = this.app.localFile === true;

        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'abcErrorModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.63);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;

        // Conditional button HTML based on file type
        const buttonHtml = isLocalFile ? `
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button id="reloadPage" class="btn btn-primary" style="
                    background: #3498db;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                ">
                    🔄 Reload Page
                </button>
                <button id="continueWithoutScore" class="btn btn-secondary" style="
                    background: #7f8c8d;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                ">
                    Continue Without Score
                </button>
            </div>
        ` : `
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button id="reloadWithSettings" class="btn btn-primary" style="
                    background: #3498db;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                ">
                    🔄 Reload with Current Settings
                </button>
                <button id="continueWithoutScore" class="btn btn-secondary" style="
                    background: #7f8c8d;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                ">
                    Continue Without Score
                </button>
            </div>
        `;

        modal.innerHTML = `
            <div style="
                background: #2c3e50;
                border-radius: 10px;
                padding: 30px;
                max-width: 500px;
                margin: 20px;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            ">
                <h3 style="color: #e7ab3cff; margin-bottom: 20px;">
                    ⚠️ Score Generation Failed
                </h3>
                <p style="margin-bottom: 15px; line-height: 1.5;">
                    The musical score could not be generated from the current MIDI file.
                </p>
                <p style="margin-bottom: 25px; font-size: 0.9em; color: #bdc3c7;">
                    <strong>Error:</strong> ${errorMessage}
                </p>
                <p style="margin-bottom: 25px; line-height: 1.4;">
                    You can continue using the app without the score feature${isLocalFile ? ', or reload the page to try again.' : ', or reload the page to try again with your current settings.'}
                </p>
                ${buttonHtml}
            </div>
        `;

        // Add click handlers based on file type
        if (isLocalFile) {
            modal.querySelector('#reloadPage').addEventListener('click', () => {
                window.location.reload();
            });
        } else {
            modal.querySelector('#reloadWithSettings').addEventListener('click', () => {
                this.reloadPageWithSettings();
            });
        }

        modal.querySelector('#continueWithoutScore').addEventListener('click', () => {
            this.dismissAbcErrorNotification();
        });

        // Add to page
        document.body.appendChild(modal);

        // Auto-dismiss on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.dismissAbcErrorNotification();
            }
        });
    }

    // Add method to reload page with current settings
    reloadPageWithSettings() {
        try {
            // Get current settings from settingsManager
            if (this.app.modules.settingsManager && this.app.modules.settingsManager.share) {
                const shareUrl = this.app.modules.settingsManager.share();
                console.log('Reloading with settings:', shareUrl);
                
                // Reload the page
                window.location = shareUrl;
            } else {
                console.warn('Settings manager not available, performing simple reload');
                window.location.reload();
            }
        } catch (error) {
            console.error('Error reloading with settings:', error);
            // Fallback to simple reload
            window.location.reload();
        }
    }

    // Add method to dismiss the error notification
    dismissAbcErrorNotification() {
        // Hide show score button since score won't be available
        const showScoreBtn = document.getElementById("showScore");
        if (showScoreBtn) {
            showScoreBtn.style.display = 'none';
        }
        this.scoreAvailable = false;
        const modal = document.getElementById('abcErrorModal');
        if (modal) {
            modal.remove();
        }
    }

    // New method to detect if a voice is percussion
    isPercussionVoice(voiceLines) {
        return voiceLines.some(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('%%MIDI channel 10') || trimmed.includes('channel 10');
        });
    }

    // New method to get key signature sharps/flats
    getKeySignatureAccidentals(keySignature) {
        const keySignatures = {
            // Major keys
            'C': { sharps: [], flats: [] },
            'G': { sharps: ['F'], flats: [] },
            'D': { sharps: ['F', 'C'], flats: [] },
            'A': { sharps: ['F', 'C', 'G'], flats: [] },
            'E': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
            'B': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
            'F#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
            'C#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
            
            'F': { sharps: [], flats: ['B'] },
            'Bb': { sharps: [], flats: ['B', 'E'] },
            'Eb': { sharps: [], flats: ['B', 'E', 'A'] },
            'Ab': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
            'Db': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
            'Gb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
            'Cb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] },
            
            // Minor keys
            'Am': { sharps: [], flats: [] },
            'Em': { sharps: ['F'], flats: [] },
            'Bm': { sharps: ['F', 'C'], flats: [] },
            'F#m': { sharps: ['F', 'C', 'G'], flats: [] },
            'C#m': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
            'G#m': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
            'D#m': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
            'A#m': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
            
            'Dm': { sharps: [], flats: ['B'] },
            'Gm': { sharps: [], flats: ['B', 'E'] },
            'Cm': { sharps: [], flats: ['B', 'E', 'A'] },
            'Fm': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
            'Bbm': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
            'Ebm': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] }
        };
        
        return keySignatures[keySignature] || { sharps: [], flats: [] };
    }

    // Updated normalizeNoteForDrums to accept key signature parameter
normalizeNoteForDrums(noteString, keySignature = 'C') {
    if (!noteString || !keySignature) {
        return noteString;
    }

    const accidentals = this.getKeySignatureAccidentals(keySignature);
    
    // Extract note components using regex
    const noteMatch = noteString.match(/^(\^*|_*|=*)([A-Ga-g])([#b]*)([',]*)/);
    if (!noteMatch) {
        return noteString;
    }

    const [, explicitAccidental, noteLetter, explicitSymbols, octaveMarkers] = noteMatch;
    const baseNote = noteLetter.toUpperCase();
    
    // If there's already an explicit accidental (^, _, or =), use the note as-is
    if (explicitAccidental || explicitSymbols) {
        // console.log(`Note ${noteString} has explicit accidental, using as-is`);
        return noteString;
    }
    
    let normalizedNote = noteLetter;
    
    // Apply key signature effects
    // If the note is in the sharp list of the key signature, it should be treated as sharp
    if (accidentals.sharps.includes(baseNote)) {
        normalizedNote = '^' + noteLetter;
        // console.log(`Note ${baseNote} is sharp in key ${keySignature}, treating as ${normalizedNote}`);
    }
    // If the note is in the flat list of the key signature, it should be treated as flat
    else if (accidentals.flats.includes(baseNote)) {
        normalizedNote = '_' + noteLetter;
        // console.log(`Note ${baseNote} is flat in key ${keySignature}, treating as ${normalizedNote}`);
    }
    
    // Reconstruct the full note with octave markers
    const result = normalizedNote + octaveMarkers;
    
    // console.log(`Normalized ${noteString} (key: ${keySignature}) -> ${result}`);
    return result;
}

// Updated transposeDrumNotes to preserve ALL non-note characters in their exact positions
transposeDrumNotes(line, keySignature = 'C') {
    try {
        // console.log('Input line for drum transposition:', line);
        // console.log('Using key signature for drums:', keySignature);
        
        // First, clean up any existing style markers to avoid conflicts, but preserve everything else
        let cleanLine = line.replace(/[+ox](?=[A-Ga-g])/g, ''); // Only remove style markers directly before notes
        // console.log('After cleanup (should be identical unless style markers removed):', cleanLine);
        
        // GM Drum Kit MIDI note mapping to ABC percussion notation
        const gmDrumMapping = {
            // MIDI 35 (Bass Drum 2) - B0
            'B,,,': 'C',      // Bass drum -> C line
            '=B,,,': 'C',     // Natural B -> C line
            
            // MIDI 36 (Bass Drum 1) - C1
            'C,,': 'F',       // Bass drum -> F line
            '=C,,': 'F',      // Natural C -> F line
            
            // MIDI 40 (Snare Drum 2) - E1
            'E,,': 'B',      // Snare -> B line with open notehead
            '=E,,': 'B',     // Natural E -> B line
            
            // MIDI 42 (Closed Hi-hat) - F#1
            '^F,,': 'ng',     // Hi-hat -> g line with cross notehead
            '=F,,': 'ng',     // Natural F -> g line (shouldn't happen for hi-hat but kept for safety)
            
            // MIDI 46 (Open Hi-hat) - F#2 
            '^F,': 'ng',      // Open Hi-hat -> g line with cross notehead
            
            // MIDI 38 (Snare Drum 1) - D1
            'D,,': 'D',       // MIDI 38 - Snare Drum 1
            '=D,,': 'D',      // Natural D
            
            // MIDI 37 (Side Stick) - C#1
            '^C,,': 'oD',     // MIDI 37 - Side Stick  
            
            // MIDI 39 (Hand Clap) - D#1
            '^D,,': '^D',     // MIDI 39 - Hand Clap
            
            // MIDI 41 (Low Tom 2) - F1
            'F,,': 'A',       // MIDI 41 - Low Tom 2
            '=F,,': 'A',      // Natural F
            
            // MIDI 43 (Low Tom 1) - G#1
            '^G,,': 'A',     // MIDI 43 - Low Tom 1
            'G,,': 'A',      // Natural G (for flat keys where G# might appear as Ab)
            
            // MIDI 45 (Mid Tom 2) - A1
            'A,,': 'c',      // MIDI 45 - Mid Tom 2
            '=A,,': 'c',     // Natural A
            
            // MIDI 47 (Mid Tom 1) - B1
            'B,,': 'c',       // MIDI 47 - Mid Tom 1
            '=B,,': 'c',      // Natural B
            
            // MIDI 48 (High Tom 2) - C2
            'C,': 'ne',       // MIDI 48 - High Tom 2
            '=C,': 'ne',      // Natural C
            
            // MIDI 50 (High Tom 1) - D2
            'D,': 'ne',        // MIDI 50 - High Tom 1
            '=D,': 'ne',       // Natural D
            
            // MIDI 51 (Ride Cymbal 1) - D#2
            '^D,': 'na',       // MIDI 51 - Ride Cymbal 1
            
            // MIDI 49 (Crash Cymbal 1) - C#2
            '^C,': 'nb',      // Crash cymbal -> b line with plus notehead
            'C,': 'nb',       // Natural C -> b line (for enharmonic equivalents)
            
            // MIDI 52 (Chinese Cymbal) - E2
            'E,': 'ob',       // MIDI 52 - Chinese Cymbal
            '=E,': 'ob',      // Natural E
            
            // MIDI 53 (Ride Bell) - F2
            'F,': 'nb',       // MIDI 53 - Ride Bell
            '=F,': 'nb',      // Natural F
            
            // MIDI 54 (Tambourine) - F#2
            '^F,': 'oc',      // MIDI 54 - Tambourine
            
            // MIDI 55 (Splash Cymbal) - G2
            'G,': 'nc',       // MIDI 55 - Splash Cymbal
            '=G,': 'nc',      // Natural G
            
            // MIDI 56 (Cowbell) - G#2
            '^G,': 'od',      // MIDI 56 - Cowbell
            'G,': 'od',       // Natural G (for enharmonic)
            
            // MIDI 57 (Crash Cymbal 2) - A2
            'A,': 'nd',       // MIDI 57 - Crash Cymbal 2
            '=A,': 'nd',      // Natural A
            
            // MIDI 58 (Vibra Slap) - A#2
            '^A,': 'ne',      // MIDI 58 - Vibra Slap
            'A,': 'ne',       // Natural A (for enharmonic)
            
            // MIDI 59 (Ride Cymbal 2) - B2
            'B,': 'oa',       // MIDI 59 - Ride Cymbal 2
            '=B,': 'oa',      // Natural B
            
            // Higher octave mappings
            'C': 'nf',        // MIDI 60+ 
            '=C': 'nf',       // Natural C
            'D': 'ng',        
            '=D': 'ng',       // Natural D
            'E': 'na',        
            '=E': 'na',       // Natural E
            'F': 'nb',        
            '=F': 'nb',       // Natural F
            'G': 'nc',        
            '=G': 'nc',       // Natural G
            'A': 'nd',        
            '=A': 'nd',       // Natural A
            'B': 'ne',        
            '=B': 'ne'        // Natural B
        };
        
        // Replace ONLY note patterns with percussion symbols, preserving ALL other characters
        // This regex will match notes but the replacement function will preserve everything else
        let processedLine = cleanLine.replace(/(\^*|_*|=*)([A-Ga-g])([#b]*)([',]*)/g, (match, accidental, note, symbols, octaveModifier) => {
            const originalNote = match;
            
            // First normalize the note to apply key signature effects
            const normalizedNote = this.normalizeNoteForDrums(originalNote, keySignature);

            // console.log(`Processing: ${originalNote} -> normalized: ${normalizedNote}`);

            // Check our GM drum mapping table
            if (gmDrumMapping[normalizedNote]) {
                // console.log(`Mapped ${normalizedNote} to ${gmDrumMapping[normalizedNote]}`);
                return gmDrumMapping[normalizedNote];
            }
            
            // Also try the original note in case normalization wasn't needed
            if (gmDrumMapping[originalNote]) {
                // console.log(`Mapped ${originalNote} to ${gmDrumMapping[originalNote]}`);
                return gmDrumMapping[originalNote];
            }
            
            // Log unmapped notes for debugging
            // console.log(`No mapping found for: ${originalNote} (normalized: ${normalizedNote}), using default`);

            // Default mapping for unmapped notes based on register
            if (octaveModifier.includes(',')) {
                // Low register - likely drums
                if (accidental.includes('^') || symbols.includes('#')) {
                    const result = 'o' + note; // Cross notehead for accented drums
                    // console.log(`Default low register mapping ${originalNote} to ${result}`);
                    return result;
                } else {
                    const result = note; // Normal notehead for toms
                    // console.log(`Default low register mapping ${originalNote} to ${result}`);
                    return result;
                }
            } else {
                // Higher register - likely cymbals/hi-hats
                const result = 'n' + note; // Cross notehead for cymbals
                // console.log(`Default high register mapping ${originalNote} to ${result}`);
                return result;
            }
        });

        // console.log('Processed line:', processedLine);
        return processedLine;
        
    } catch (error) {
        console.warn('Error transposing drum notes in line:', line, error);
        return line; // Return original on error
    }
}
    
    renderScore(containerId = 'score') {
        if (!this.abcjs || !this.abcString.trim()) {
            console.warn('No ABC data or abcjs library to render');
            return;
        }

        try {
            // Clear only the score content area, not the entire container
            const scoreElement = document.getElementById(containerId);
            if (!scoreElement) return;
            
            scoreElement.innerHTML = ''; // Clear previous score content
            
            // Set maximum height constraint
            const maxHeight = window.innerHeight - 150;
            scoreElement.style.maxHeight = `${maxHeight}px`;
            scoreElement.style.overflowY = 'auto';
            scoreElement.style.overflowX = 'hidden';
            
            // Enhanced render options for percussion support
            const renderOptions = {
                responsive: 'resize',
                staffwidth: 740,
                scale: 1.0,
                foregroundColor: '#000000',
                backgroundColor: 'transparent',
                // Add percussion-specific options
                percussion: true,
                drumBars: 1
            };
            
            const visualOptions = {
                add_classes: true,
                staffwidth: 740,
                responsive: 'resize',
                // Enable drum notation
                displayPercussion: true
            };
            
            this.abcjs.renderAbc(containerId, this.abcString, renderOptions, visualOptions);
            
            // Scale the rendered content to fit height constraint
            setTimeout(() => {
                const scoreElement = document.getElementById(containerId);
                if (scoreElement) {
                    // Get the rendered SVG element
                    const svgElement = scoreElement.querySelector('svg');
                    if (svgElement) {
                        const naturalHeight = svgElement.getBoundingClientRect().height;

                        // Calculate scale factor if content exceeds max height
                        if (naturalHeight > maxHeight) {
                            const scaleFactor = maxHeight / naturalHeight;
                            
                            // Apply transform to scale down while preserving proportions
                            svgElement.style.transform = `scale(${scaleFactor})`;
                            svgElement.style.transformOrigin = 'top center';
                            
                            // Calculate the actual scaled height and adjust container
                            const scaledHeight = naturalHeight * scaleFactor;
                            scoreElement.style.height = `${scaledHeight}px`;
                            scoreElement.style.overflow = 'hidden';
                            scoreElement.style.paddingBottom = '10px';

                            // console.log(`Scaled score by ${scaleFactor.toFixed(2)} to fit ${maxHeight}px height (actual: ${scaledHeight}px)`);

                        } else {
                            // If no scaling needed, set container height to natural height
                            scoreElement.style.height = `${naturalHeight}px`;
                            scoreElement.style.overflow = 'hidden';
                        }
                    }
                    
                    // Enhanced CSS for drum notation
                    const style = document.createElement('style');
                    style.textContent = `
                        #${containerId} {
                            max-height: ${maxHeight}px;
                            overflow-y: hidden;
                            overflow-x: hidden;
                        }
                        #${containerId} .abcjs-note,
                        #${containerId} .abcjs-note_selected,
                        #${containerId} .abcjs-staff,
                        #${containerId} .abcjs-clef,
                        #${containerId} .abcjs-key-signature,
                        #${containerId} .abcjs-time-signature,
                        #${containerId} .abcjs-bar,
                        #${containerId} .abcjs-stem,
                        #${containerId} .abcjs-ledger,
                        #${containerId} .abcjs-slur,
                        #${containerId} .abcjs-tie {
                            fill: #000000 !important;
                            stroke: #000000 !important;
                            color: #000000 !important;
                        }
                        #${containerId} text {
                            fill: #000000 !important;
                            color: #000000 !important;
                        }
                    `;
                    document.head.appendChild(style);
                }
            }, 100);
            
            // console.log('ABC score rendered successfully');
        } catch (error) {
            console.error('Error rendering ABC score:', error);
        }
    }
    
    extractBarsFromVoice(voiceLines, startBar, numBars, isPercussion = false, originalKeySignature = 'C') {
        // console.log(voiceLines);
        let voiceHeader = '';
        let currentBar = 0;
        let collectedBars = [];
        let remainingBarsNeeded = numBars;

        // First pass: collect ONLY the specific bars we need for clef detection
        let relevantBarsContent = [];
        let tempCurrentBar = 0;
        
        // Check if this voice is a percussion track (MIDI channel 10)
        const isPercussionTrack = voiceLines.some(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('%%MIDI channel 10') || trimmed.includes('channel 10');
        });
        
        for (let lineIndex = 0; lineIndex < voiceLines.length; lineIndex++) {
            const line = voiceLines[lineIndex];
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('V:')) {
                voiceHeader = line;
                continue;
            }

            if (trimmedLine.length === 0) continue;

            // Skip ABC directives
            if (trimmedLine.startsWith('%%') || trimmedLine.startsWith('%')) {
                continue;
            }

            // Split line into individual bars by pipe symbols
            const barSections = trimmedLine.split('|').filter(section => section.trim().length > 0);
            const lineHasBars = barSections.length > 0;
            
            if (!lineHasBars) {
                if (tempCurrentBar >= startBar && tempCurrentBar < startBar + numBars) {
                    relevantBarsContent.push(line.trim());
                }
                tempCurrentBar++;
                continue;
            }

            // Extract only the specific bars we need from this line
            for (let i = 0; i < barSections.length; i++) {
                if (tempCurrentBar >= startBar && tempCurrentBar < startBar + numBars) {
                    relevantBarsContent.push(barSections[i].trim());
                }
                tempCurrentBar++;
            }
        }

        // Now check clef only for the specific bars being displayed
        const combinedRelevantContent = relevantBarsContent.join(' ');
        
        const hasBassNotes = /([FEDC],|[A-G],{2,})/.test(combinedRelevantContent);
        const hasTrebleNotes = /([a-g]|[A-G](?![,])|[GAB],(?![,]))/.test(combinedRelevantContent);

        // Apply clef to voice header
        if (voiceHeader && !voiceHeader.includes('clef=')) {
            if (isPercussionTrack || isPercussion) {
                voiceHeader = voiceHeader.trim() + ' clef=perc';
            }
            else if (hasBassNotes) {
                voiceHeader = voiceHeader.trim() + ' clef=bass';
            }
            else if (hasTrebleNotes) {
                voiceHeader = voiceHeader.trim() + ' clef=treble';
            }
            else {
                voiceHeader = voiceHeader.trim() + ' clef=treble';
            }
        }

        // Second pass: actually extract the bars (reusing existing logic)
        currentBar = 0;
        
        for (let lineIndex = 0; lineIndex < voiceLines.length; lineIndex++) {
            const line = voiceLines[lineIndex];
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('V:')) {
                continue;
            }

            if (trimmedLine.length === 0) continue;

            // Skip ABC directives (they don't count as bars)
            if (trimmedLine.startsWith('%%') || trimmedLine.startsWith('%')) {
                if (startBar === 0 && remainingBarsNeeded === numBars) {
                    collectedBars.push(line);
                }
                continue;
            }

            // Split line into individual bars by pipe symbols
            const barSections = trimmedLine.split('|').filter(section => section.trim().length > 0);
            const lineHasBars = barSections.length > 0;
            
            if (!lineHasBars) {
                if (currentBar >= startBar && currentBar < startBar + numBars && remainingBarsNeeded > 0) {
                    collectedBars.push(line);
                    remainingBarsNeeded--;
                }
                currentBar++;
                continue;
            }

            // Process each bar in this line
            let lineResult = [];
            let barsAddedFromThisLine = 0;
            
            for (let i = 0; i < barSections.length && remainingBarsNeeded > 0; i++) {
                const barSection = barSections[i];
                
                if (currentBar >= startBar && currentBar < startBar + numBars) {
                    lineResult.push(barSection);
                    barsAddedFromThisLine++;
                    remainingBarsNeeded--;
                }
                currentBar++;
            }
            
            if (lineResult.length > 0) {
                const reconstructedLine = lineResult.join('|');
                collectedBars.push(reconstructedLine + '|');
            }
            
            if (remainingBarsNeeded <= 0) {
                break;
            }
        }

        let combinedBars = '';
        if (collectedBars.length > 0) {
            const directives = collectedBars.filter(bar => bar.trim().startsWith('%%') || bar.trim().startsWith('%'));
            const musicalBars = collectedBars.filter(bar => !bar.trim().startsWith('%%') && !bar.trim().startsWith('%'));
            
            const combinedMusical = musicalBars.join(' ').replace(/\|\s*\|/g, '|');
            
            if (combinedMusical.trim()) {
                combinedBars = combinedMusical;
                if (!combinedBars.endsWith('|')) {
                    combinedBars += '|';
                }
            } else if (directives.length > 0) {
                combinedBars = directives.join('\n');
            }
        }

        // Process extracted bars for percussion if needed
        let processedBars = combinedBars ? [combinedBars] : [];
        
        if ((isPercussion || isPercussionTrack) && processedBars.length > 0) {
            // console.log('Processing extracted percussion bars with key signature:', originalKeySignature);
            processedBars = processedBars.map(bar => {
                if (bar.trim().startsWith('%%') || bar.trim().startsWith('%')) {
                    return bar; // Don't process directive lines
                }
                // console.log('Processing percussion bar:', bar);
                const processedBar = this.transposeDrumNotes(bar, originalKeySignature);
                // console.log('Transposed drum bar:', processedBar);
                return processedBar;
            });
        }

        return {
            voiceHeader,
            bars: processedBars
        };
    }

    extractBarsFromABC(abcString, startBar = 0, numBars = 4) {
        if (!abcString || !abcString.trim()) {
            console.warn('Empty ABC string provided to extractBarsFromABC');
            return '';
        }

        const lines = abcString.split('\n');
        const result = [];
        let inMusicSection = false;
        let voiceLines = {};
        let headerLines = [];
        let originalKeySignature = 'C'; // Track the original key signature

        // First pass: collect headers and identify voices
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines
            if (trimmedLine.length === 0) continue;
            
            // Header lines (before music starts)
            if (trimmedLine.startsWith('X:') || trimmedLine.startsWith('T:') || 
                trimmedLine.startsWith('M:') || trimmedLine.startsWith('L:') || 
                trimmedLine.startsWith('K:')) {
                
                // Capture original key signature
                if (trimmedLine.startsWith('K:')) {
                    const keyMatch = trimmedLine.match(/K:\s*([A-G][#b]?m?)/);
                    if (keyMatch) {
                        originalKeySignature = keyMatch[1];
                        // console.log('Detected original key signature:', originalKeySignature);
                    }
                }
                
                headerLines.push(line);
                continue;
            }

            // Skip Q: (tempo) lines completely
            if (trimmedLine.startsWith('Q:')) {
                continue;
            }

            // Voice definition or music line
            if (trimmedLine.startsWith('V:') || (inMusicSection && trimmedLine.length > 0)) {
                inMusicSection = true;
                
                // Handle voice lines
                if (trimmedLine.startsWith('V:')) {
                    const voiceMatch = trimmedLine.match(/V:\s*([^\s]+)/);
                    const voiceId = voiceMatch ? voiceMatch[1] : 'default';
                    if (!voiceLines[voiceId]) {
                        voiceLines[voiceId] = [];
                    }
                    voiceLines[voiceId].push(line);
                } else if (trimmedLine.length > 0) {
                    // Find the current voice (last voice declared)
                    const voiceIds = Object.keys(voiceLines);
                    const currentVoice = voiceIds[voiceIds.length - 1] || 'default';
                    if (!voiceLines[currentVoice]) {
                        voiceLines[currentVoice] = [];
                    }
                    voiceLines[currentVoice].push(line);
                }
            }
        }

        // If no voices found, treat everything as one voice
        if (Object.keys(voiceLines).length === 0) {
            voiceLines['default'] = [];
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.length > 0 && 
                    !trimmedLine.startsWith('X:') && !trimmedLine.startsWith('T:') && 
                    !trimmedLine.startsWith('M:') && !trimmedLine.startsWith('L:') && 
                    !trimmedLine.startsWith('K:') && !trimmedLine.startsWith('Q:')) {
                    voiceLines['default'].push(line);
                }
            }
        }

        // Helper function to check if a voice has actual musical content
        const hasMusicalContent = (voiceContent) => {
            for (const line of voiceContent) {
                const trimmed = line.trim();
                
                // Skip voice headers and directives
                if (trimmed.startsWith('V:') || trimmed.startsWith('%%') || trimmed.startsWith('%') || trimmed.length === 0) {
                    continue;
                }
                
                // Check if line contains actual notes (A-G)
                const hasNotes = /[A-Ga-g]/.test(trimmed);
                
                // If we find any line with actual notes, this voice has musical content
                if (hasNotes) {
                    return true;
                }
            }
            
            return false;
        };

        // Second pass: extract exactly numBars for each voice that has musical content
        const extractedVoices = {};
        let hasPercussion = false;
        
        for (const [voiceId, voiceContent] of Object.entries(voiceLines)) {
            // Check if voice has actual musical content
            if (!hasMusicalContent(voiceContent)) {
                continue;
            }
            
            // Check if this voice is percussion
            const isPercussion = this.isPercussionVoice(voiceContent);
            if (isPercussion) {
                hasPercussion = true;
                // console.log(`Voice ${voiceId} is percussion, will process after extraction`);
            }
            
            // Extract bars and pass percussion info for processing
            extractedVoices[voiceId] = this.extractBarsFromVoice(voiceContent, startBar, numBars, isPercussion, originalKeySignature);
            
            // Double-check that the extracted content actually has notes
            const extractedContent = extractedVoices[voiceId];
            if (extractedContent.bars.length === 0 || 
                extractedContent.bars.every(bar => /^[zZ0-9\s|]*$/.test(bar))) {
                delete extractedVoices[voiceId];
            }
        }

        // Only proceed if we have voices with content
        if (Object.keys(extractedVoices).length === 0) {
            return '';
        }

        // Reconstruct ABC with headers and extracted bars from active voices only
        result.push(...headerLines);
        
        // Add percussion style directives if we have percussion
        if (hasPercussion) {
            result.push('U:n=!style=x!');
            result.push('U:o=!style=harmonic!');
            result.push('U:^=!style=triangle!');
            // console.log('Added percussion style directives to extracted ABC');
        }
        
        for (const [voiceId, extractedContent] of Object.entries(extractedVoices)) {
            if (extractedContent.voiceHeader) {
                result.push(extractedContent.voiceHeader);
            }
            result.push(...extractedContent.bars);
        }

        const finalResult = result.join('\n');
        
        if (!finalResult || !finalResult.trim()) {
            return '';
        }

        // console.log('Extracted ABC with percussion processing:', finalResult);
        return finalResult;
    }

    // Add debugging to generateScoreFollower
    generateScoreFollower(startBar = 0) {
        if (!this.abcString || !this.abcString.trim()) {
            console.warn('No ABC data available for score following');
            return '';
        }

        // console.log(`=== generateScoreFollower called with startBar=${startBar} ===`);
        // console.log('Full ABC string length:', this.abcString.length);
        // console.log('First 200 chars of ABC:', this.abcString.substring(0, 200));
        
        // Always try to extract exactly 4 bars, no fallback to full score
        const followingABC = this.extractBarsFromABC(this.abcString, startBar, 4);
        
        // console.log('Extraction result length:', followingABC.length);
        // console.log('Extraction result:', followingABC);
        
        if (!followingABC || !followingABC.trim()) {
            console.warn(`Bar extraction returned empty result for bars ${startBar}-${startBar + 3}`);
            return '';
        }
        
        // console.log('Extracted ABC length:', followingABC.length);
        return followingABC;
    }

    // Fix initial rendering issue
    renderScoreFollower(containerId = 'score', startBar = 0) {
        // console.log(`Rendering score follower: bars ${startBar}-${startBar + 3}`);
        
        const followingABC = this.generateScoreFollower(startBar);
        
        if (!followingABC || !followingABC.trim()) {
            this.showAbcErrorNotification(`No ABC data to render for bars ${startBar}-${startBar + 3}`);
            return;
        }

        // Temporarily store original ABC and use following ABC
        const originalABC = this.abcString;
        this.abcString = followingABC;
        
        // Render the score follower
        this.renderScore(containerId);
        
        // Restore original ABC
        this.abcString = originalABC;
        
        // console.log('Score follower rendered successfully');
    }

    // Enhanced reset method with better fallback
    resetScoreFollower(containerId = 'score') {
        // console.log('Resetting score follower to beginning');
        this.currentBarStart = 0;
        this.lastPolledBar = null; // Reset polling state
        
        // Check if we have ABC data before trying to render
        if (!this.abcString || !this.abcString.trim()) {
            console.warn('No ABC data available for reset, regenerating...');
            // Try to regenerate the score
            const transport = this.app.modules.transport;
            if (transport && transport.createCurrentMidi) {
                const currentMidi = transport.createCurrentMidi();
                if (currentMidi) {
                    const abcNotation = this.generateABCStringfromMIDI(currentMidi);
                    if (!abcNotation) {
                        const scoreElement = document.getElementById(containerId);
                        if (scoreElement) {
                            scoreElement.innerHTML = '<p>Could not generate score data</p>';
                        }
                        return;
                    }
                    // Update the stored abcString with the regenerated notation
                    this.abcString = abcNotation;
                }
                else {
                    console.warn('No current MIDI available for regeneration');
                }
            }
            this.renderScoreFollower(containerId, this.currentBarStart);
        }
        else {
            setTimeout(() => {
                this.renderScoreFollower(containerId, this.currentBarStart);
            }, 500);
        }

        // Update display
        const display = document.getElementById('currentBarDisplay');
        if (display) {
            display.textContent = this.currentBarStart;
        }
    }

    // Modified showMidiScore to handle when ABC generation has failed
    showMidiScore(useScoreFollowing = false) {
        const scoreDiv = document.getElementById('score');
        
        if (!scoreDiv || !this.app.modules.transport.originalMidi) {
            console.error('no file loaded or score elements not found');
            return;
        }
        
        // Check if we have a valid ABC string already
        if (!this.abcString || this.abcString.trim().length === 0) {
            // Try to regenerate ABC
            try {
                const transport = this.app.modules.transport;
                if (!transport) {
                    console.error('Transport module not available');
                    return;
                }

                const currentMidi = transport.createCurrentMidi();
                if (!currentMidi) {
                    console.error('Failed to create current MIDI');
                    return;
                }

                // Clear only the score content area, not the header
                scoreDiv.innerHTML = '<p>Generating score...</p>';

                const abcNotation = this.generateABCStringfromMIDI(currentMidi);
                if (!abcNotation) {
                    // generateABCStringfromMIDI will handle the error notification
                    return;
                }
            } catch (error) {
                console.error('Error regenerating score:', error);
                this.handleAbcGenerationFailure(`Score regeneration failed: ${error.message}`);
                return;
            }
        }
        
        // Clear only the score content area, not the header
        scoreDiv.innerHTML = '<p>Generating score...</p>';
        
        // Show the container
        document.getElementById("showScore").style.display = 'none';
        
        // Use score following or regular rendering
        if (useScoreFollowing) {
            // console.log('Starting score follower mode');
            
            // Determine starting bar based on playback state
            let startBar = 0;
            const transport = this.app.modules.transport;
            if (transport && transport.playing) {
                // Get current playback position and calculate bar
                startBar = this.getCurrentPlaybackBar();
                // console.log('Playback is active, starting score follower at bar:', startBar);
            } else {
                // console.log('Playback not active, starting score follower at beginning');
            }
            
            this.startScoreFollowing('score', startBar);
            
            // If playback is already running, start polling immediately
            if (transport && transport.playing) {
                this.startPollingForPlayback('score');
            }
            
        } else {
            this.renderScore('score');
        }
    }

    // Add manual controls for score follower (for testing/debugging)
    addScoreFollowerControls(container) {
        // Check if controls already exist
        if (container.querySelector('.score-follower-controls')) {
            return;
        }
        
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'score-follower-controls';
        controlsDiv.style.cssText = 'margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px;';
        
        controlsDiv.innerHTML = `
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.resetScoreFollower('score')">Reset</button>
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.advanceScoreFollower('score', 4)">Next 4 Bars</button>
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.advanceScoreFollower('score', -4)">Prev 4 Bars</button>
            <span style="margin-left: 10px; color: #ccc;">Current Bar: <span id="currentBarDisplay">${this.currentBarStart}</span></span>
        `;
        // controlsDiv.style.maxWidth = '870px';

        // Insert after the header
        const header = container.querySelector('.score-header');
        if (header && header.nextSibling) {
            container.insertBefore(controlsDiv, header.nextSibling);
        } else {
            container.appendChild(controlsDiv);
        }
    }

    // Add method to handle downbeat information
    setFirstMusicalBar(downbeat) {
        this.firstDownbeat = downbeat;
        
        // If you need to show the detected downbeat in UI:
        console.log(`First downbeat detected at: ${downbeat.time.toFixed(2)}s (${downbeat.method})`);
    }

    // Method to get current playback bar position
    getCurrentPlaybackBar() {
        const transport = this.app.modules.transport;
        if (!transport || !transport.playing) {
            return 0;
        }
        
        try {
            if (window.Tone && window.Tone.Transport) {
                // Use Tone.js position directly for more accurate timing
                const position = window.Tone.Transport.position;
                const state = this.app.state;
                
                // Parse the position string (format: "bars:beats:sixteenths")
                const positionParts = position.split(':');
                let currentBar = parseInt(positionParts[0]) || 0;
                
                // Account for reversed playback
                if (state.reversedPlayback) {
                    const originalMidi = transport.originalMidi;
                    if (originalMidi && originalMidi.header) {
                        const ppq = originalMidi.header.ppq || 96;
                        const timeSignature = originalMidi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
                        const [numerator] = timeSignature;
                        
                        // Calculate total bars in the piece
                        const totalTicks = originalMidi.durationTicks || 0;
                        const ticksPerMeasure = (ppq * 4 * numerator) / 4; // Assuming 4/4 for simplicity
                        const totalBars = Math.ceil(totalTicks / ticksPerMeasure);
                        
                        currentBar = Math.max(0, totalBars - currentBar - 1);
                    }
                }
                
                return Math.max(0, currentBar);
            }
        } catch (error) {
            console.warn('Could not get current playback bar:', error);
        }
        
        return 0;
    }



    // Centralized update logic
    updateScoreFollower(containerId, barNumber, immediately = false) {
        // Update current bar display
        const display = document.getElementById('currentBarDisplay');
        if (display) {
            display.textContent = `Bar: ${barNumber + 1} (Window: ${this.currentBarStart + 1}-${this.currentBarStart + 4})`;
        }
        
        // Calculate which 4-bar window this bar belongs to
        const targetWindow = Math.floor(barNumber / 4) * 4;
        
        // Update if we've moved to a different 4-bar window or immediately requested
        if (targetWindow !== this.currentBarStart || immediately) {
            this.currentBarStart = targetWindow;
            console.log(`Score follower updating to bars ${this.currentBarStart}-${this.currentBarStart + 3} (current bar: ${barNumber})`);
            
            // Clear any pending updates
            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
                this.updateTimeout = null;
            }
            
            // Update immediately without delay
            this.renderScoreFollower(containerId, this.currentBarStart);
        }
    }

    // Enhanced score following with playback integration
    startScoreFollowing(containerId = 'score', startBar = 0) {
        console.log(`Starting score following at bar ${startBar}...`);
        this.scoreFollowerActive = true;
        
        // Get the actual current playback position instead of using startBar parameter
        const currentBar = this.getCurrentPlaybackBar();
        this.currentBarStart = Math.floor(currentBar / 4) * 4; // Align to 4-bar boundaries
        this.lastPolledBar = null; // Reset polling state
        
        console.log(`Score follower starting at bar ${currentBar}, window: ${this.currentBarStart}-${this.currentBarStart + 3}`);
        
        // Initial render with immediate update
        this.renderScoreFollower(containerId, this.currentBarStart);
        
        console.log('Score follower ready - starting polling immediately');
        
        // Start polling immediately rather than waiting
        this.startPollingForPlayback(containerId);
    }

    // Method to start polling when playback starts
    startPollingForPlayback(containerId) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        if (!this.scoreFollowerActive) {
            return;
        }

        // Start polling immediately with higher frequency
        this.pollingInterval = setInterval(() => {
            const transport = this.app.modules.transport;
            
            // Only poll if transport is actually playing
            if (!transport || !transport.playing) {
                this.stopPollingForPlayback();
                return;
            }
            
            const currentBar = this.getCurrentPlaybackBar();
            
            // Update immediately if bar has changed
            if (currentBar !== null && currentBar !== this.lastPolledBar) {
                this.lastPolledBar = currentBar;
                // Update immediately without timeout
                this.updateScoreFollower(containerId, currentBar);
            }
        }, 50); // Even more frequent polling for better responsiveness
    }

    // Method to stop polling when playback stops
    stopPollingForPlayback() {
        if (this.pollingInterval) {
            // console.log('Stopping score following polling (playback stopped)');
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // Enhanced stop method
    stopScoreFollowing() {
        // console.log('Stopping score following...');
        this.scoreFollowerActive = false;
        this.lastPolledBar = null;
        
        // Clear any pending updates
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        
        // Stop polling
        this.stopPollingForPlayback();
        
        // Remove controls
        const controls = document.querySelector('.score-follower-controls');
        if (controls) {
            controls.remove();
        }
    }

    // Enhanced advance method with better display updates
    advanceScoreFollower(containerId = 'score', bars = 4) {
        const newStart = Math.max(0, this.currentBarStart + bars);
        
        // Basic bounds checking - don't go beyond reasonable limits
        if (newStart >= 0) {
            this.currentBarStart = newStart;
            // console.log(`Manually advancing to bar ${this.currentBarStart}`);
            this.renderScoreFollower(containerId, this.currentBarStart);
            
            // Update display
            const display = document.getElementById('currentBarDisplay');
            if (display) {
                display.textContent = this.currentBarStart;
            }
        }
    }

    // Enhanced hide method to clean up score following
    hideScore() {
        // console.log('Hiding score and cleaning up score follower');
        this.stopScoreFollowing();
        this.scoreShown = false;
        this.abcString = "";

        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'none';
            document.getElementById("showScore").style.display = 'block';
        }
    }

    showScore() {
        this.scoreShown = true;
        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'block';
            document.getElementById("showScore").style.display = 'none';
        }
        
        // Always use score following when showing the score
        const transport = this.app.modules.transport;
        const useScoreFollowing = true; // Always enable score following
        
        this.showMidiScore(useScoreFollowing);
        
        // Add manual controls
        this.addScoreFollowerControls(scoreContainer);
    }

    // Add debugging method to check sync
    debugCurrentPosition() {
        const transport = this.app.modules.transport;
        if (transport && transport.playing) {
            const tonePosition = window.Tone.Transport.position;
            const calculatedBar = this.getCurrentPlaybackBar();
            const currentWindow = Math.floor(calculatedBar / 4) * 4;
            
            console.log('=== SCORE SYNC DEBUG ===');
            console.log('Tone.Transport.position:', tonePosition);
            console.log('Calculated bar:', calculatedBar);
            console.log('Current 4-bar window:', `${currentWindow}-${currentWindow + 3}`);
            console.log('Score showing window:', `${this.currentBarStart}-${this.currentBarStart + 3}`);
            console.log('========================');
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NegativeHarmonyApp;
}
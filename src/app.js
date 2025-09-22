/**
 * Core Application Module
 * Main application class that coordinates all modules and handles negative harmony transformations.
 * Manages application lifecycle, module initialization, and core music theory operations.
 */

/**
 * Main application class for the Negative Harmony application
 * Coordinates all modules and provides core transformation functionality
 * @class NegativeHarmonyApp
 */
class NegativeHarmonyApp {
    /**
     * Creates an instance of NegativeHarmonyApp
     */
    constructor() {
        /** @type {Object} Container for all application modules */
        this.modules = {};
        /** @type {boolean} Whether the application has been fully initialized */
        this.initialized = false;

        // Device detection for performance optimization
        /** @type {boolean} Whether the app is running on a mobile device */
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        /** @type {number} Audio buffer size optimized for device type */
        this.bufferSize = this.isMobile ? 2048 : 512; // Larger buffer for mobile to prevent dropouts
        
        // Core audio and timing properties
        /** @type {AudioContext|null} Web Audio API context for all audio processing */
        this.audioContext = null;
        /** @type {number} Current tempo in beats per minute */
        this.bpm = 120;
        /** @type {number} Duration of loaded MIDI track in seconds */
        this.track_duration = 0;
        /** @type {boolean} Whether a MIDI file has been successfully loaded */
        this.midiFileRead = false;
        /** @type {boolean} Internal flag for mode state management */
        this.normal = false;
        /** @type {boolean} Whether the current file is loaded locally vs from URL */
        this.localFile = false;
        /** @type {Object} Original file settings for reset functionality */
        this.fileSettings = {};

        // Application state object containing all user-configurable settings
        this.state = {
            /** @type {string} URL or path to loaded MIDI file */
            midiFile: "",
            /** @type {number} Playback speed multiplier (0.5-2.0) */
            speed: 1.0,
            /** @type {number} Selected impulse response index for reverb */
            irUrl: 1,
            /** @type {number} Reverb send level (0.0-1.0) */
            reverbGain: 0.5,
            /** @type {boolean} Whether playback is in reverse mode */
            reversedPlayback: false,
            /** @type {Object} User-modified channel settings */
            userSettings: { "channels": {} },
            /** @type {number|null} Root note for negative harmony transformation (0-11, null for auto-detect) */
            negRoot: null,
            /** @type {number} Transformation mode: 0=normal, 1=inversion, 2=negative harmony */
            mode: 2,
            /** @type {number} Inversion scope: 1=per octave, 2=per voice range */
            perOktave: 2,
        };
    }

    /**
     * Initialize the application and all its modules
     * Loads external libraries, creates modules, and sets up the UI
     * @async
     */
    async init() {
        if (this.initialized) return;

        try {
            // Load external libraries first (Tone.js, WebAudioFont, etc.)
            await this.loadLibraries();
            
            // Load application modules
            await this.loadModules();
            
            // Initialize all modules in dependency order
            this.initializeModules();
            
            // Set up UI components and event handlers
            this.initializeUI();
            
            this.initialized = true;
            console.log('Negative Harmony App initialized successfully');
            
            // Make app globally available for debugging and external access
            window.app = this;
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            throw error;
        }
    }

    /**
     * Loads external JavaScript libraries required by the application
     * @async
     */
    async loadLibraries() {
        try {
            // Load utilities first as other modules depend on it
            await this.loadScript('./src/utils.js');
            
            // Load core audio and MIDI processing libraries
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.35/Tone.js');
            // WebAudioFont is now loaded on-demand by AudioEngine
            await this.loadScript('https://unpkg.com/@tonejs/midi@2.0.24');
            
        } catch (error) {
            console.error('Error loading libraries:', error);
            throw error;
        }
    }

    /**
     * Helper method to load external JavaScript files
     * @param {string} src - URL or path to the script
     * @returns {Promise<void>} Resolves when script is loaded
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Loads application modules dynamically
     * @returns {Promise<void>} Resolves when all modules are loaded
     */
    loadModules() {
        return new Promise((resolve, reject) => {
            const modules = [
                './src/midi-manager.js',
                './src/audio-engine.js',
                './src/settings-manager.js',
                './src/transport.js',
                './src/score-manager.js'
            ];

            let loadedCount = 0;
            const totalModules = modules.length;

            modules.forEach(src => {
                const script = document.createElement('script');
                script.type = 'application/javascript';
                script.src = src;
                script.onload = () => {
                    loadedCount++;
                    if (loadedCount === totalModules) {
                        resolve();
                    }
                };
                script.onerror = () => reject(new Error(`Failed to load module: ${src}`));
                document.head.appendChild(script);
            });
        });
    }

    /**
     * Initialize application modules in the correct dependency order
     * Each module receives a reference to the main app instance
     * @async
     */
    async initializeModules() {
        // Initialize modules in dependency order
        this.modules.midiManager = new MidiManager(this);
        this.modules.audioEngine = new AudioEngine(this);
        this.modules.settingsManager = new SettingsManager(this);
        this.modules.transport = new Transport(this);
        this.modules.scoreManager = new ScoreManager(this);

        // Call init() on each module to set up event handlers and state
        await this.modules.midiManager.init();
        await this.modules.audioEngine.init();
        await this.modules.settingsManager.init();
        await this.modules.transport.init();
        await this.modules.scoreManager.init();
    }

    /**
     * Transform a MIDI note based on the current negative harmony settings
     * This is the core transformation engine that applies various musical transformations
     * @param {number} note - MIDI note number (0-127)
     * @param {number} channel - MIDI channel for context-aware transformations
     * @returns {number} Transformed MIDI note number
     */
    transformNote(note, channel) {
        const { mode, negRoot, perOktave } = this.state;

        switch (mode) {
            case 0: // Normal mode - no transformation
                return note;
                
            case 1: // Inversion mode - mirror notes around an axis
                return this.leftHandPianoNote(note, perOktave, channel);
                
            case 2: // Negative harmony mode - apply negative harmony transformation
                return this.negativeHarmonyTransform(note, perOktave, negRoot, channel);

            default:
                return note;
        }
    }

    /**
     * Apply simple inversion transformation (mode 1)
     * Can invert globally, per octave, or per voice range
     * @param {number} note - MIDI note number (0-127)
     * @param {number} perOktave - Inversion scope: 0=global, 1=per octave, 2=per voice
     * @param {number} channel - MIDI channel for voice-specific inversion
     * @returns {number} Inverted note
     */
    leftHandPianoNote(note, perOktave, channel) {
        if (!perOktave) {
            // Global inversion around middle of piano range (C4-G5)
            return (82 - (note - 21)) + 21;
        } else {
            if (perOktave === 1) {
                // Per-octave inversion - invert within each octave
                const okt = Math.floor((note + 2) / 12) * 12;
                let mod_note = ((82 - (note + 2 - 21)) + 21) % 12;
                mod_note = (mod_note < 9) ? mod_note : mod_note - 12;
                return okt + mod_note + 2;
            } else if (perOktave === 2) {
                // Per-voice inversion - invert around the middle of each voice's range
                const rangeData = this.modules.transport.parts[channel]?.['noteRange'];
                if (!rangeData) {
                    // Fallback if range data not available
                    return this.leftHandPianoNote(note, 0, channel);
                }
                
                const rangeMiddle = (rangeData.lowest + rangeData.highest) / 2;
                
                // Find the D note closest to the middle of the range
                // D notes provide a natural axis for musical inversion
                const dNotes = [];
                for (let d = 2; d <= 122; d += 12) {
                    dNotes.push(d);
                }
                
                // Find the D closest to the range middle
                let closestD = dNotes[0];
                let minDistance = Math.abs(rangeMiddle - closestD);
                
                for (const d of dNotes) {
                    const distance = Math.abs(rangeMiddle - d);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestD = d;
                    }
                }
                
                // Invert around the closest D using the formula: 2 * axis - note
                const invertedNote = 2 * closestD - note;
                
                return Math.max(0, Math.min(127, invertedNote)); // Clamp to valid MIDI range
            } else {
                // Fallback to original behavior
                return note;
            }
        }
    }

    /**
     * Apply negative harmony transformation (mode 2)
     * Implements the negative harmony concept where the tonic-dominant axis becomes
     * the axis of symmetry for pitch reflection
     * @param {number} note - MIDI note number (0-127)
     * @param {number} perOctave - Transformation scope: 1=per octave, 2=per voice
     * @param {number} negRoot - Root note for the transformation (0-11)
     * @param {number} channel - MIDI channel for voice-specific transformation
     * @returns {number} Transformed note according to negative harmony
     */
    negativeHarmonyTransform(note, perOctave, negRoot, channel) {
        if (perOctave == 1) {
            // Per-octave negative harmony transformation
            const neg = (negRoot - 3) % 12; // Backwards compatibility offset
            const octave = Math.floor(note / 12);
            const semitone = note % 12;
            
            // Calculate the axis of symmetry (halfway between tonic and dominant)
            // In negative harmony, this axis is at tonic + 3.5 semitones
            const axis = (neg + 3.5) % 12;
            
            // Reflect the note across the axis
            let reflectedSemitone = 2 * axis - semitone;

            // Handle negative results properly with modular arithmetic
            reflectedSemitone = ((reflectedSemitone % 12) + 12) % 12;
            
            let transformedNote = octave * 12 + reflectedSemitone;

            // Apply octave adjustments to maintain musical coherence
            if (semitone <= neg) {
                transformedNote -= 12;
            }
            if (reflectedSemitone - neg > 9) {
                transformedNote -= 12;
            } else if (neg - reflectedSemitone > 2) {
                transformedNote += 12;
            }

            return transformedNote;
        }
        else if (perOctave == 2 && channel != 9) {
            // Per-voice negative harmony transformation
            // Uses the range of each voice to position the transformation axis
            if (!this.modules.transport.parts[channel]) {
                console.warn(`No note range data for channel ${channel}:`, this.modules.transport.parts);
                // Fallback to per-octave behavior
                this.modules.transport.forceUpdateChannel = true;
                return this.negativeHarmonyTransform(note, 1, negRoot, channel);
            }
            
            const rangeData = this.modules.transport.parts[channel]['noteRange'];
            if (!rangeData) {
                console.log(`No rangeData for channel ${channel}, ${JSON.stringify(this.modules.transport.parts[channel])}`);
            }
            
            const rangeMiddle = (rangeData.lowest + rangeData.highest) / 2;
            
            // Calculate the axis based on negRoot, positioned at the range middle
            const neg = (negRoot - 3) % 12; // Backwards compatibility offset
            const axisSemitone = (neg + 3.5) % 12; // Same axis calculation as perOctave == 1
            
            // Find the note with axisSemitone that's closest to the range middle
            const axisOctaves = [];
            for (let octave = 0; octave <= 10; octave++) {
                const axisNote = octave * 12 + axisSemitone;
                if (axisNote >= 0 && axisNote <= 127) {
                    axisOctaves.push(axisNote);
                }
            }
        
            // Find the axis note closest to the range middle
            let closestAxis = axisOctaves[0];
            let minDistance = Math.abs(rangeMiddle - closestAxis);
            
            for (const axisNote of axisOctaves) {
                const distance = Math.abs(rangeMiddle - axisNote);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestAxis = axisNote;
                }
            }
            
            // Reflect the note across the closest axis
            const transformedNote = 2 * closestAxis - note;
            
            return Math.max(0, Math.min(127, transformedNote)); // Clamp to valid MIDI range
        } else {
            // Simple reflection for non-per-octave mode
            const reflectedNote = 2 * negRoot - note + 1;
            return reflectedNote;
        }
    }

    /**
     * Start the audio system and initialize audio context
     * Must be called after user interaction due to browser autoplay policies
     * @async
     */
    async start() {
        // Create audio context with device-appropriate settings
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: this.isMobile ? 'playback' : 'interactive',
            bufferSize: this.bufferSize
        });
        
        // Make audioContext globally available for WebAudioFont and legacy code
        if (typeof window !== 'undefined') {
            window.audioContext = this.audioContext;
            // Also set the global variable for backward compatibility
            if (typeof audioContext !== 'undefined') {
                audioContext = this.audioContext;
            }
        }
        
        // Initialize Tone.js with the audio context
        await Tone.start();
        // AudioEngine will load WebAudioFont on-demand when setupGMPlayer is called
        await this.modules.audioEngine.setupGMPlayer();
        
        // Hide start prompt and show main interface
        document.getElementById("start_prompt").hidden = true;
        document.getElementById("col_transport").style = "";
        
        // Check for URL parameters to restore shared settings
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.toString().length > 0) {
            await this.modules.settingsManager.checkForParamsInUrl(urlParams);
            this.modules.settingsManager.share();
            Utils.setPlayButtonActive(true);
        }
    }

    /**
     * Updates UI visibility based on the current transformation mode
     * Shows/hides controls relevant to the selected mode
     */
    setModeSettingsHidden() {
        // Negative harmony root selection (only for mode 2)
        const negRoots = document.getElementById("negRoots");
        negRoots.hidden = (this.state.mode == 2) ? false : true;
        
        // Per-octave/per-voice settings (for modes 1 and 2)
        const perOkt = document.getElementById("perOkt");
        perOkt.hidden = (this.state.mode == 0) ? true : false;
        this.normal = perOkt.hidden;
    }

    /**
     * Sets the transformation mode and updates the interface
     * @param {string|number} value - Mode value: 0=normal, 1=inversion, 2=negative harmony
     */
    setMode(value) {
        // Convert to integer to ensure proper switch statement matching
        this.state.mode = parseInt(value, 10);

        // Update UI visibility
        this.setModeSettingsHidden();

        // Re-transform all currently scheduled notes
        this.modules.transport.updateChannels();
        
        // Stop any playing notes to prevent harmonic conflicts
        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("mode", this.state.mode, -1);
    }

    /**
     * Sets the negative harmony root note
     * @param {string|number} value - Root note value (0-11)
     */
    setNegRoot(value) {
        const intValue = parseInt(value, 10);
        this.state.negRoot = intValue;
        
        // Re-transform all notes with the new root
        this.modules.transport.updateChannels();

        // Clear playing notes to avoid dissonance
        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("negRoot", intValue, -1);
    }

    /**
     * Sets the per-octave transformation scope
     * @param {string|number} value - Scope value: 1=per octave, 2=per voice
     */
    setPerOctave(value) {
        const intValue = parseInt(value, 10);
        this.state.perOktave = intValue;

        // Re-transform with new scope
        this.modules.transport.updateChannels();
        
        // Clear playing notes
        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("perOktave", intValue, -1);
    }

    // Methods moved from inline JavaScript in index.html for better organization

    /**
     * Called when all modules are loaded and ready
     * Shows the transport controls to the user
     */
    moduleLoaded() {
        document.getElementById("transportButton").style.visibility = "visible";
        const toggler = document.getElementsByClassName("st-toggle")[0];
        if (toggler)
            toggler.style.display = "none";
    }

    /**
     * Initializes the audio system when user clicks the start button
     * Required for browser autoplay policy compliance
     * @param {HTMLElement} element - The button element that was clicked
     */
    toggleTransport(element) {
        this.start();
        var transportButton = document.getElementById("transportButton");
        transportButton.style.display = "none";
        // Hide the label too
        var transportLabel = document.getElementById("transportLabel");
        transportLabel.style.display = "none";
    }

    /**
     * Loads a MIDI file from a URL entered by the user
     * Supports both direct MIDI files and search integration
     */
    reloadWithUrl() {
        const midiFileUrl = document.getElementById("midiUrl").value;
        if (midiFileUrl) {
            if (!midiFileUrl.endsWith(".mid") && !midiFileUrl.endsWith(".midi")) {
                // Delegate to BitMidiSearch module for non-MIDI URLs
                if (window.BitMidiSearch) {
                    window.BitMidiSearch.search(midiFileUrl, 0);
                }
                return;
            }
            
            Utils.setPlayButtonActive(false);
            this.state.midiFileUrl = midiFileUrl;
            
            fetch(midiFileUrl)
                .then(response => response.arrayBuffer())
                .then(data => {
                    this.localFile = false;
                    // Clean up previous file
                    this.modules.transport.preclean();
                    this.modules.transport.cleanup();
                    // Parse new MIDI file
                    this.modules.midiManager.parseMidiFile(new Midi(data));
                    this.modules.settingsManager.share();
                    this.state.midiFile = midiFileUrl;
                    document.getElementById("midiUrl").value = midiFileUrl;
                    Utils.setPlayButtonActive(true);
                    // Generate share URL
                    const settingsManager = this.modules.settingsManager;
                    settingsManager.share();
                })
                .catch(error => {
                    console.log(error);
                    alert('Error fetching MIDI file: ' + error);
                });
        }
    }

    /**
     * Initialize UI components like tooltips and load example files
     */
    initializeUI() {
        // Initialize Bootstrap tooltips for help text
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'))
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl)
        });

        // Load example MIDI files for demo purposes
        this.loadExamples();

        // Initialize BitMidiSearch module if available
        window.BitMidiSearch?.init();
    }

    /**
     * Loads example MIDI files from examples.json and creates clickable links
     * Provides users with demo content to explore negative harmony
     */
    loadExamples() {
        fetch("examples.json")
            .then(response => response.json())
            .then(data => {
                const container = document.getElementById("examples");
                container.innerHTML = ""; // Clear previous content

                const list = document.createElement("ul");

                // Create nested lists organized by artist
                for (const artist in data) {
                    const artistItem = document.createElement("li");
                    const artistHeader = document.createElement("h4");
                    artistHeader.textContent = artist + ":";
                    artistItem.appendChild(artistHeader);

                    const songList = document.createElement("ol");

                    // Create clickable links for each song
                    for (const song in data[artist]) {
                        const songItem = document.createElement("li");
                        const link = document.createElement("a");

                        link.href = "javascript:void(0);";
                        link.onclick = () => {
                            try {
                                // Hide score if currently shown
                                const scoreFollower = this.modules.scoreManager;
                                if (scoreFollower && scoreFollower.scoreShown) {
                                    scoreFollower.hideScore();
                                }
                                
                                // Clean up current state
                                this.modules.transport.preclean();
                                
                                // Load the example with a small delay for cleanup
                                setTimeout(() => {
                                    const settingsManager = this.modules.settingsManager;
                                    settingsManager.checkForParamsInUrl(new URL(data[artist][song]).searchParams);
                                }, 100);
                                
                            } catch (error) {
                                console.error('Error loading example:', error);
                                Utils.showError('Failed to load example: ' + error.message);
                            }
                        };
                        link.textContent = song;

                        songItem.appendChild(link);
                        songList.appendChild(songItem);
                    }

                    artistItem.appendChild(songList);
                    list.appendChild(artistItem);
                }

                container.appendChild(list);
            })
            .catch(error => console.error("Error loading examples:", error));
    }

}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NegativeHarmonyApp;
}
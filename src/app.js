/**
 * Core Application Module
 * Handles main application initialization and module coordination
 */

class NegativeHarmonyApp {
    constructor() {
        this.modules = {};
        this.initialized = false;

        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.bufferSize = this.isMobile ? 2048 : 512; // Larger buffer for mobile
        this.audioContext = null;
        this.bpm = 120;
        this.track_duration = 0;
        this.midiFileRead = false;
        this.normal = false;
        this.localFile = false;
        this.fileSettings = {};

        // Global state
        this.state = {
            midiFile: "",
            speed: 1.0,
            irUrl: 1,
            reverbGain: 0.5,
            reversedPlayback: false,
            userSettings: { "channels": {} },
            negRoot: null,
            mode: 2,    // Default mode
            perOktave: 1, // Default per octave value
        };
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;

        try {
            // Initialize other modules
            await this.initializeModules();
            
            this.initialized = true;
            console.log('Negative Harmony App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            throw error;
        }
        app.start().then(async () => {
            var startPrompt = document.getElementById("start_prompt");
            startPrompt.hidden = true;
            document.getElementById("col_transport").style = "";
        });
    }

    /**
     * Initialize application modules
     */
    async initializeModules() {
        // Initialize modules in dependency order
        this.modules.midiManager = new MidiManager(this);
        this.modules.audioEngine = new AudioEngine(this);
        this.modules.settingsManager = new SettingsManager(this);
        this.modules.transport = new Transport(this);

        // Initialize each module
        await this.modules.midiManager.init();
        await this.modules.audioEngine.init();
        await this.modules.settingsManager.init();
        await this.modules.transport.init();
    }

    /**
     * Transform a MIDI note based on the current negative harmony settings
     * @param {number} note - MIDI note number (0-127)
     * @returns {number} - Transformed MIDI note number
     */
    transformNote(note) {
        const { mode, negRoot, perOktave } = this.state;
        
        switch (mode) {
            case 0: // Normal mode - no transformation
                // console.log("Normal mode, returning note:", note);
                return note;
                
            case 1: // Inversion mode
                return this.leftHandPianoNote(note, perOktave);
                
            case 2: // Negative harmony mode
                return this.negativeHarmonyTransform(note, perOktave, negRoot);

            default:
                return note;
        }
    }

    /**
     * Apply simple inversion transformation
     * @param {number} note - MIDI note number
     * @param {number} perOktave - Inversion factor
     * @returns {number} - Inverted note
     */
    leftHandPianoNote(note, perOktave) {
        if (!perOktave) {
            // console.log("No perOktave set, returning inverted note:", (82 - (note - 21)) + 21);
            return (82 - (note - 21)) + 21;
        } else {
            const okt = Math.floor((note + 2) / 12) * 12;
            let mod_note = ((82 - (note + 2 - 21)) + 21) % 12;
            mod_note =(mod_note < 9) ? mod_note : mod_note - 12;
            // console.log("Returning inverted note per octave:", okt + mod_note + 2);
            return okt + mod_note + 2;
        }
    }

    /**
     * Apply negative harmony transformation
     * @param {number} note - MIDI note number
     * @param {number} negRoot - Negative root (0-11)
     * @returns {number} - Transformed note
     */
    negativeHarmonyTransform(note, perOctave, negRoot) {
        if (perOctave) {
            const neg = (negRoot - 3) % 12; // this is for backwards compatibility - neg is the actual negative root
            const octave = Math.floor(note / 12);
            const semitone = note % 12;
            
            // Calculate the axis of symmetry (between tonic and dominant)
            const axis = (neg + 3.5) % 12;
            
            // Reflect the note across the axis
            let reflectedSemitone = 2 * axis - semitone;

            // Handle negative results properly
            reflectedSemitone = ((reflectedSemitone % 12) + 12) % 12;
            
            let transformedNote = octave * 12 + reflectedSemitone;

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
        else {
            // For non-perOctave mode, just reflect the note across negRoot + 0.5
            const reflectedNote = 2 * negRoot - note + 1;
            console.log("Reflected note:", reflectedNote, "from original note:", note, "with negRoot:", negRoot);
            return reflectedNote;
        }
    }

    async start() {
        // Create and initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: this.isMobile ? 'playback' : 'interactive',
            bufferSize: this.bufferSize
        });
        
        // Make audioContext available globally for WebAudioFont
        if (typeof window !== 'undefined') {
            window.audioContext = this.audioContext;
            // Also set the global variable for backward compatibility
            if (typeof audioContext !== 'undefined') {
                audioContext = this.audioContext;
            }
        }
        
        await Tone.start();
        await this.modules.audioEngine.setupGMPlayer();
        
        // Hide start prompt and setup initial state
        document.getElementById("start_prompt").hidden = true;
        document.getElementById("col_transport").style = "";
        
        // Check for URL parameters
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.toString().length > 0) {
            await this.modules.settingsManager.checkForParamsInUrl(urlParams);
            this.modules.settingsManager.share();
        }
    }

    setModeSettingsHidden() {
        const negRoots = document.getElementById("negRoots");
        negRoots.hidden = (this.state.mode == 2) ? false : true;
        
        const perOkt = document.getElementById("perOkt");
        perOkt.hidden = (this.state.mode == 0) ? true : false;
        this.normal = perOkt.hidden;
    }

    setMode(value) {
        // Convert to integer to ensure proper switch statement matching
        this.state.mode = parseInt(value, 10);

        this.setModeSettingsHidden();

        this.modules.transport.updateChannels();
        
        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("mode", this.state.mode, -1);
    }

    setNegRoot(value) {
        const intValue = parseInt(value, 10);
        this.state.negRoot = intValue;

        this.modules.transport.updateChannels();

        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("negRoot", intValue, -1);
    }

    setPerOctave(value) {
        const intValue = parseInt(value, 10);
        this.state.perOktave = intValue;

        this.modules.transport.updateChannels();
        
        this.modules.midiManager.sendEvent_allNotesOff();
        this.modules.settingsManager.debouncedUpdateUserSettings("perOktave", intValue, -1);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NegativeHarmonyApp;
}

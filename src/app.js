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
            perOktave: 2, // Default per voice value
        };
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;

        try {
            // Load external libraries first
            await this.loadLibraries();
            // console.log('All libraries loaded successfully');
            
            // Load modules after libraries
            await this.loadModules();
            // console.log('All modules loaded successfully');
            
            // Initialize modules after everything is loaded
            this.initializeModules();
            
            // Initialize UI components
            this.initializeUI();
            
            this.initialized = true;
            console.log('Negative Harmony App initialized successfully');
            
            // Make app globally available
            window.app = this;
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            throw error;
        }
    }

    async loadLibraries() {
        try {
            // Load utilities first as other modules depend on it
            await this.loadScript('./src/utils.js');
            
            // Load other libraries
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.35/Tone.js');
            await this.loadScript('https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js');
            await this.loadScript('https://unpkg.com/@tonejs/midi@2.0.24');
            
        } catch (error) {
            console.error('Error loading libraries:', error);
            throw error;
        }
    }

    /**
     * Helper method to load external scripts
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
     * Initialize application modules
     */
    async initializeModules() {
        // Initialize modules in dependency order
        this.modules.midiManager = new MidiManager(this);
        this.modules.audioEngine = new AudioEngine(this);
        this.modules.settingsManager = new SettingsManager(this);
        this.modules.transport = new Transport(this);
        this.modules.scoreManager = new ScoreManager(this);

        // Initialize each module
        await this.modules.midiManager.init();
        await this.modules.audioEngine.init();
        await this.modules.settingsManager.init();
        await this.modules.transport.init();
        await this.modules.scoreManager.init();
    }

    /**
     * Transform a MIDI note based on the current negative harmony settings
     * @param {number} note - MIDI note number (0-127)
     * @returns {number} - Transformed MIDI note number
     */
    transformNote(note, channel) {
        const { mode, negRoot, perOktave } = this.state;

        switch (mode) {
            case 0: // Normal mode - no transformation
                // console.log("Normal mode, returning note:", note);
                return note;
                
            case 1: // Inversion mode
                return this.leftHandPianoNote(note, perOktave, channel);
                
            case 2: // Negative harmony mode
                // console.log("Transforming note:", note, "Channel:", channel, "Mode:", mode, "NegRoot:", negRoot, "PerOktave:", perOktave);
                return this.negativeHarmonyTransform(note, perOktave, negRoot, channel);

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
    leftHandPianoNote(note, perOktave, channel) {
        if (!perOktave) {
            // console.log("No perOktave set, returning inverted note:", (82 - (note - 21)) + 21);
            return (82 - (note - 21)) + 21;
        } else {
            if (perOktave === 1) {
                const okt = Math.floor((note + 2) / 12) * 12;
                let mod_note = ((82 - (note + 2 - 21)) + 21) % 12;
                mod_note = (mod_note < 9) ? mod_note : mod_note - 12;
                // console.log("Returning inverted note per octave:", okt + mod_note + 2);
                return okt + mod_note + 2;
            } else if (perOktave === 2) {
                // get the note's channel's range from transport modules. parts[] for per-voice inversion using channel-specific range
                const rangeData = this.modules.transport.parts[channel]['noteRange'];
                const rangeMiddle = (rangeData.lowest + rangeData.highest) / 2;
                
                // Find the D note closest to the middle of the range
                // D notes are at MIDI numbers: 2, 14, 26, 38, 50, 62, 74, 86, 98, 110, 122
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
                
                // Invert around the closest D
                // The axis is at closestD, so inversion formula is: 2 * axis - note
                const invertedNote = 2 * closestD - note;
                
                return Math.max(0, Math.min(127, invertedNote)); // Clamp to valid MIDI range
            } else {
                // Fallback to original behavior
                return note;
            }
        }
    }

    /**
     * Apply negative harmony transformation
     * @param {number} note - MIDI note number
     * @param {number} negRoot - Negative root (0-11)
     * @returns {number} - Transformed note
     */
    negativeHarmonyTransform(note, perOctave, negRoot, channel) {
        if (perOctave == 1) {
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
        else if (perOctave == 2 && channel != 9) {
            // get the note's channel's range from transport modules. parts[] for per-voice inversion using channel-specific range
            if (!this.modules.transport.parts[channel]) {
                // console.warn(`No note range data for channel ${channel}:`, this.modules.transport.parts);
                // Fallback to perOctave=1 behavior, should be fixed in transport.js, line 572
                this.modules.transport.forceUpdateChannel = true;
                return this.negativeHarmonyTransform(note, 1, negRoot, channel);
            }
            const rangeData = this.modules.transport.parts[channel]['noteRange'];
            if (!rangeData) {
                console.log(`No rangeData for channel ${channel}, ${JSON.stringify(this.modules.transport.parts[channel])}`);
            }
            const rangeMiddle = (rangeData.lowest + rangeData.highest) / 2;
            
            // Calculate the axis based on negRoot, but positioned at the range middle
            const neg = (negRoot - 3) % 12; // backwards compatibility
            const axisSemitone = (neg + 3.5) % 12; // same axis calculation as perOctave == 1
            
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
            // For non-perOctave mode, just reflect the note across negRoot + 0.5
            const reflectedNote = 2 * negRoot - note + 1;
            // console.log("Reflected note:", reflectedNote, "from original note:", note, "with negRoot:", negRoot);
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
            Utils.setPlayButtonActive(true);
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

    // Methods moved from inline JavaScript in index.html
    
    moduleLoaded() {
        document.getElementById("transportButton").style.visibility = "visible";
        const toggler = document.getElementsByClassName("st-toggle")[0];
        if (toggler)
            toggler.style.display = "none";
    }

    toggleTransport(element) {
        this.start();
        var transportButton = document.getElementById("transportButton");
        transportButton.style.display = "none";
        // hide the label too
        var transportLabel = document.getElementById("transportLabel");
        transportLabel.style.display = "none";
    }

    reloadWithUrl() {
        const midiFileUrl = document.getElementById("midiUrl").value;
        if (midiFileUrl) {
            if (!midiFileUrl.endsWith(".mid") && !midiFileUrl.endsWith(".midi")) {
                // delegate to BitMidiSearch module
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
                    this.modules.transport.preclean();
                    this.modules.transport.cleanup();
                    this.modules.midiManager.parseMidiFile(new Midi(data));
                    this.modules.settingsManager.share();
                    this.state.midiFile = midiFileUrl;
                    document.getElementById("midiUrl").value = midiFileUrl;
                    Utils.setPlayButtonActive(true);
                    const settingsManager = this.modules.settingsManager;
                    settingsManager.share();
                })
                .catch(error => {
                    console.log(error);
                    alert('Error fetching MIDI file: ' + error);
                });
        }
    }

    // Initialize UI components like tooltips and examples
    initializeUI() {
        // Initialize Bootstrap tooltips
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'))
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl)
        });

        // Load examples
        this.loadExamples();

        // Initialize BitMidiSearch module
        window.BitMidiSearch?.init();
    }

    loadExamples() {
        fetch("examples.json")
            .then(response => response.json())
            .then(data => {
                const container = document.getElementById("examples");
                container.innerHTML = ""; // Clear previous content

                const list = document.createElement("ul");

                for (const artist in data) {
                    const artistItem = document.createElement("li");
                    const artistHeader = document.createElement("h4");
                    artistHeader.textContent = artist + ":";
                    artistItem.appendChild(artistHeader);

                    const songList = document.createElement("ol");

                    for (const song in data[artist]) {
                        const songItem = document.createElement("li");
                        const link = document.createElement("a");

                        link.href = "javascript:void(0);";
                        link.onclick = () => {
                            try {
                                const scoreFollower = this.modules.scoreManager;
                                if (scoreFollower && scoreFollower.scoreShown) {
                                    scoreFollower.hideScore();
                                }
                                
                                // Ensure transport is properly cleaned before loading new content
                                this.modules.transport.preclean();
                                
                                // Add a small delay to ensure cleanup is complete
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

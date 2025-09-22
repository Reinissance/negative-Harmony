/**
 * Audio Engine Module
 * Handles WebAudioFont integration, instrument loading, audio processing,
 * and real-time audio synthesis for MIDI playback
 */

/**
 * Manages all audio processing including instrument synthesis, effects processing,
 * and WebAudioFont integration for MIDI playback
 * @class AudioEngine
 */
class AudioEngine {
    /**
     * Creates an instance of AudioEngine
     * @param {Object} app - Reference to the main application instance
     */
    constructor(app) {
        this.app = app;
        /** @type {Object|null} WebAudioFontPlayer instance for audio synthesis */
        this.player = null;
        /** @type {ConvolverNode|null} Web Audio API convolver node for reverb */
        this.reverb = null;
        /** @type {GainNode|null} Gain node controlling reverb send level */
        this.reverbGain = null;
        /** @type {Map<number, Object>} Map of loaded instruments by MIDI channel */
        this.loadedChannelInstruments = new Map();
        /** @type {Map<number, Object>} Available instruments by program number */
        this.availableInstrumentsForProgramChange = new Map();
        /** @type {Object|null} Drum instrument configuration and audio nodes */
        this.drumInstrument = null;
        /** @type {Map<number, Object>} Available drum sounds by MIDI note number */
        this.availableDrumSoundsForNote = new Map();
        /** @type {Map<number, Map<number, number>>} MIDI control change values by channel */
        this.loadedChannelControlValues = new Map();
        /** @type {Map<string, Promise>} Cache for preset loading promises to avoid duplicates */
        this._presetPromiseCache = new Map();
        /** @type {boolean} Tracks whether WebAudioFont has been loaded */
        this.webAudioFontLoaded = false;
    }

    /**
     * Initialize the audio engine
     * @async
     */
    async init() {
        // Audio engine will be initialized when audio context is ready
    }

    /**
     * Dynamically loads the WebAudioFont library when needed
     * Similar to how SettingsManager loads ShareThis - loads on demand to improve initial page load
     * @returns {Promise<void>} Resolves when WebAudioFont is loaded or if already loaded
     */
    loadWebAudioFont() {
        return new Promise((resolve, reject) => {
            if (this.webAudioFontLoaded) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';
            
            script.onload = () => {
                this.webAudioFontLoaded = true;
                resolve();
            };
            
            script.onerror = () => {
                console.error('Failed to load WebAudioFont library');
                this.webAudioFontLoaded = false;
                reject(new Error('Failed to load WebAudioFont'));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Sets up the WebAudioFont player and creates audio processing nodes
     * Loads WebAudioFont dynamically if not already loaded, then initializes the player
     * @async
     */
    async setupGMPlayer() {
        // Load WebAudioFont dynamically when actually needed
        await this.loadWebAudioFont();
        
        const audioContext = this.app.audioContext;
        
        if (typeof WebAudioFontPlayer === 'undefined') {
            console.error('WebAudioFontPlayer is not available after loading!');
            return;
        }
        
        this.player = new WebAudioFontPlayer();

        // Create reverb processing chain
        this.reverb = audioContext.createConvolver();
        this.reverbGain = audioContext.createGain();
        this.reverbGain.gain.value = 0.5;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(audioContext.destination);
    }

    /**
     * Loads a drum sound from WebAudioFont repository
     * @param {string} url - Relative path to the drum sound file
     * @returns {Promise<string>} Promise resolving to the preset name
     */
    loadDrumSound = (url) => {
        return new Promise((resolve) => {
            const name = '_drum_' + url;
            const domainedUrl = "https://surikov.github.io/webaudiofontdata/sound/128" + url + ".js";
            this.player.loader.startLoad(audioContext, domainedUrl, name);
            resolve(name);
        });
    };

    /**
     * Loads an instrument preset from WebAudioFont repository
     * @param {string} url - Full URL to the preset JavaScript file
     * @returns {Promise<string>} Promise resolving to the preset name
     */
    loadPreset = (url) => {
        return new Promise((resolve) => {
            if (!this.player || !this.player.loader) {
                console.error('loadPreset - player or player.loader is null:', this.player);
                resolve(null);
                return;
            }
            const name = '_tone_' + url.split('/').pop().replace('.js', '');
            this.player.loader.startLoad(audioContext, url, name);
            resolve(name);
        });
    };

    /**
     * Handles MIDI note on events for a specific channel
     * Triggers audio synthesis with appropriate instrument and applies velocity
     * @param {Object} note - Note object containing MIDI note number and timing
     * @param {number} velocity - MIDI velocity (0-127)
     * @param {number} channel - MIDI channel number (0-15)
     */
    handleNoteOnForChannel(note, velocity, channel) {
        const midiManager = this.app.modules.midiManager;
        const audioContext = this.app.audioContext;

        // Stop any existing note on this channel/pitch
        this.handleNoteOff(channel, note.midi);
        
        // Check solo channel filtering
        if (midiManager.getSoloChannels().size > 0 && !midiManager.getSoloChannels().has(channel)) {
            return;
        }

        let envelope;
        
        if (channel === 9) {
            // Handle drum channel (GM standard channel 10, zero-indexed as 9)
            if (!this.drumInstrument || !this.drumInstrument.notes.has(note.midi)) {
                return;
            }
            
            const drumPreset = this.drumInstrument.notes.get(note.midi);
            if (drumPreset === "loading" || drumPreset === undefined || !window[drumPreset]) {
                return;
            }
            
            // Synthesize drum sound with infinite duration (stopped manually)
            envelope = this.player.queueWaveTable(
                audioContext, 
                this.drumInstrument.gainNode, 
                window[drumPreset],
                audioContext.currentTime, 
                note.midi, 
                9999, // Infinite duration - will be stopped by note off
                velocity
            );
        } else {
            // Handle regular instrument channels
            const instrument = this.loadedChannelInstruments.get(channel);
            if (!instrument) {
                return;
            }
            
            if (instrument.preset === "loading" || instrument.preset === undefined) {
                return;
            }
            
            // Verify preset is loaded in global scope
            const presetData = window[instrument.preset];
            if (!presetData) {
                console.warn('Preset not yet loaded:', instrument.preset, 'for channel:', channel);
                return;
            }
            
            // Synthesize instrument sound
            envelope = this.player.queueWaveTable(
                audioContext, 
                instrument.gainNode, 
                presetData,
                audioContext.currentTime, 
                note.midi, 
                9999, // Infinite duration - controlled by MIDI note off
                velocity
            );
        }

        // Store note envelope for later stopping
        if (envelope) {
            const midiNote = {
                channel: channel,
                pitch: note.midi,
                envelope: envelope
            };
            
            midiManager.addMidiNote(midiNote);
        }
    }

    /**
     * Handles MIDI note off events, stopping active notes
     * Supports sustain pedal functionality by deferring note stopping
     * @param {number} channel - MIDI channel number
     * @param {Object} note - Note object containing MIDI note number
     */
    handleNoteOff(channel, note) {
        const midiManager = this.app.modules.midiManager;
        let noteRemoved = false;
        
        // Filter out the matching note and stop its envelope
        const filteredNotes = midiManager.midiNotes.filter((midiNote) => {
            if (!noteRemoved && midiNote.pitch === note.midi && midiNote.channel === channel) {
                if (midiNote.envelope) {
                    if (!midiManager.getSustainState(channel)) {
                        // Immediate note off
                        midiNote.envelope.cancel();
                    } else {
                        // Sustain pedal is active - defer note off
                        midiManager.setSustainedNode(channel, note.midi, midiNote.envelope);
                    }
                }
                noteRemoved = true;
                return false;
            }
            return true;
        });
        
        midiManager.midiNotes = filteredNotes;
    }

    /**
     * Applies pitch bend to an active note
     * @param {Object} note - Note object containing envelope information
     * @param {number} semitones - Number of semitones to bend (can be fractional)
     */
    handlePitchBend(note, semitones) {
        if (note.envelope && note.envelope.audioBufferSourceNode) {
            if (note.envelope.audioBufferSourceNode.detune !== undefined) {
                // Use detune if available (more accurate)
                note.envelope.audioBufferSourceNode.detune.value = semitones * 100;
            } else {
                // Fallback to playback rate adjustment
                note.envelope.audioBufferSourceNode.playbackRate.value = Math.pow(2, semitones / 12);
            }
        }
    }

    /**
     * Changes the program (instrument) for a MIDI channel
     * Loads new instrument preset and updates UI controls
     * @param {Event} event - DOM event from instrument selection
     * @param {number} channel - MIDI channel number
     * @param {number} programNumber - MIDI program number (0-127)
     */
    changeProgramForChannel(event, channel, programNumber) {
        const select = event.target;
        
        // Ensure the program data exists before trying to access it
        if (!this.availableInstrumentsForProgramChange.has(programNumber)) {
            // Load the instrument data first, then try again
            this.loadInstrumentsForProgramChange(channel, programNumber, 0, 'loading...');
            // Retry after a short delay to allow loading
            setTimeout(() => {
                this.changeProgramForChannel(event, channel, programNumber);
            }, 500);
            return;
        }
        
        const programData = this.availableInstrumentsForProgramChange.get(programNumber);
        if (!programData) {
            console.error('changeProgramForChannel: Program data is null for program', programNumber);
            return;
        }
        
        // Set loading state to prevent concurrent loads
        programData.preset = "loading";
        
        // Ensure channel instrument exists
        if (!this.loadedChannelInstruments.has(channel)) {
            this.loadedChannelInstruments.set(channel, this.createChannelInstrumentForChannel(channel, "loading", 0));
        }
        this.loadedChannelInstruments.get(channel).preset = "loading";
        
        // Get the instrument URL from selected soundfont
        let instrumentUrl = this.availableInstrumentsForProgramChange.get(programNumber).urls[select.selectedIndex];
        if (instrumentUrl === undefined) {
            // Fallback to first available soundfont
            instrumentUrl = this.availableInstrumentsForProgramChange.get(programNumber).urls[0];
        }
        
        // Load the preset asynchronously
        this.loadPreset("https://surikov.github.io/webaudiofontdata/sound/" + instrumentUrl + ".js")
            .then((preset) => {
                // Update both program data and channel instrument
                this.availableInstrumentsForProgramChange.get(programNumber).preset = preset;
                this.loadedChannelInstruments.get(channel).preset = preset;
                this.loadedChannelInstruments.get(channel).sfIndex = select.selectedIndex;
                
                // Update user settings if this wasn't loaded from file
                if (!event.target.classList.contains("fromFile")) {
                    const settingsManager = this.app.modules.settingsManager;
                    if (settingsManager) {
                        settingsManager.debouncedUpdateUserSettings(event.target.id, event.target.value, channel);
                        settingsManager.showResetButtonIfNeeded(channel);
                    }
                } else {
                    // Remove "fromFile" class after processing
                    event.target.classList.remove("fromFile");
                }
            })
            .catch((error) => console.error('Error loading preset:', error));

        // Update transport with new program change
        const transport = this.app.modules.transport;
        if (transport) {
            transport.setProgramChange(channel, programNumber);
        }
    }

    /**
     * Gets the drum instrument configuration
     * @returns {Object|null} Drum instrument object with audio nodes and note mappings
     */
    getDrumInstrument() {
        return this.drumInstrument;
    }

    /**
     * Gets the instrument configuration for a specific channel
     * @param {number} channel - MIDI channel number
     * @returns {Object|undefined} Channel instrument object
     */
    getChannelInstrument(channel) {
        return this.loadedChannelInstruments.get(channel);
    }

    /**
     * Gets all available instruments for program changes
     * @returns {Map<number, Object>} Map of program numbers to instrument data
     */
    getAvailableInstruments() {
        return this.availableInstrumentsForProgramChange;
    }

    /**
     * Gets all available drum sounds mapped by MIDI note number
     * @returns {Map<number, Object>} Map of MIDI notes to drum sound data
     */
    getAvailableDrumSounds() {
        return this.availableDrumSoundsForNote;
    }

    /**
     * Gets the WebAudioFont player instance
     * @returns {Object|null} WebAudioFontPlayer instance
     */
    getPlayer() {
        return this.player;
    }

    /**
     * Gets loaded MIDI control change values for all channels
     * @returns {Map<number, Map<number, number>>} Nested map: channel -> CC number -> value
     */
    getLoadedChannelControlValues() {
        return this.loadedChannelControlValues;
    }

    /**
     * Sets the impulse response for the convolution reverb effect
     * @param {string} irUrl - Filename of the impulse response (without extension)
     */
    setIR(irUrl) {
        const audioContext = this.app.audioContext;
        fetch("IRs/" + irUrl + ".wav")
            .then(response => response.arrayBuffer())
            .then(data => audioContext.decodeAudioData(data))
            .then(buffer => {
                this.reverb.buffer = buffer;
                const reverbSelect = document.getElementById("reverbSelect");
                // Update settings to persist reverb selection
                this.app.modules.settingsManager.updateUserSettings("irUrl", reverbSelect.selectedIndex, -1);
            })
            .catch(error => console.error('Error loading impulse response:', error));
    }

    /**
     * Sets the reverb send level (wet/dry mix)
     * @param {number} value - Gain value (0.0 to 1.0+)
     */
    setReverbGain(value) {
        this.reverbGain.gain.value = value;
        // Persist reverb gain setting
        this.app.modules.settingsManager.updateUserSettings("reverbGain", value, -1);
        
        // Update UI label to reflect current value
        const revLabel = document.querySelector('label[for="reverbVolume"]');
        if (revLabel) {
            revLabel.innerHTML = "Reverb Volume: " + parseFloat(value).toFixed(2);
        }
    }

    /**
     * Loads and configures instruments for a specific MIDI program change
     * Creates audio processing chain and UI controls for the channel
     * @param {number} channel - MIDI channel number
     * @param {number} programNumber - MIDI program number (0-127)
     * @param {number} sfIndex - SoundFont index to use
     * @param {string} name - Display name for the instrument
     */
    loadInstrumentsForProgramChange(channel, programNumber, sfIndex, name) {
        if (!this.availableInstrumentsForProgramChange.has(programNumber)) {
            // First time loading this program - get available soundfonts
            const links = this.linksForProgramChange(programNumber);
            const instrumentUrl = "https://surikov.github.io/webaudiofontdata/sound/" + links.urls[sfIndex] + ".js";
            const channelInstrument = this.createChannelInstrumentForChannel(channel, "loading", sfIndex);
            
            // Store the channel instrument immediately for UI creation
            this.loadedChannelInstruments.set(channel, channelInstrument);
            this.loadedChannelInstruments.get(channel).programNumber = programNumber;
            this.loadedChannelInstruments.get(channel).sfIndex = sfIndex;

            // Load preset asynchronously
            this.loadPreset(instrumentUrl)
                .then((preset) => {
                    // Update both program data and channel instrument
                    this.availableInstrumentsForProgramChange.get(programNumber).preset = preset;
                    channelInstrument.preset = preset;
                    this.loadedChannelInstruments.get(channel).preset = preset;
                    
                    // Create UI controls for the channel
                    this.app.modules.settingsManager.createControlsForChannel(channel, programNumber, sfIndex, name);
                    this.cleanCashed(); // Clean up unused presets
                })
                .catch((error) => {
                    console.error('Error loading preset:', error);
                });
        } else {
            // Program data already exists
            if (this.availableInstrumentsForProgramChange.get(programNumber).preset === "loading") {
                // Still loading - retry after delay
                setTimeout(() => {
                    this.loadInstrumentsForProgramChange(channel, programNumber, sfIndex, name);
                }, 300);
                return;
            } else {
                // Use existing preset
                this.loadedChannelInstruments.set(channel, this.createChannelInstrumentForChannel(channel, this.availableInstrumentsForProgramChange.get(programNumber).preset, sfIndex));
                this.loadedChannelInstruments.get(channel).programNumber = programNumber;
                
                this.app.modules.settingsManager.createControlsForChannel(channel, programNumber, sfIndex, name);
                this.cleanCashed();
            }
        }
    }

    /**
     * Loads a drum sound for a specific MIDI note
     * Handles GM drum kit mapping and creates UI controls
     * @param {number} note - MIDI note number (35-81 for GM drums)
     * @param {number} sfIndex - SoundFont index to use
     * @param {string} callerId - ID of UI element that triggered the load
     * @param {number} overriddenNote - Alternative note number if remapped
     */
    loadDrumSoundForNote(note, sfIndex, callerId, overriddenNote) {
        const availableDrumSoundsForNote = this.availableDrumSoundsForNote;
        
        if (!availableDrumSoundsForNote.has(note)) {
            // First time loading this drum note
            const links = this.linksForDrumSound(note);
            const drumSoundUrl = links.urls[sfIndex];
            this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, "loading");
            
            if (drumSoundUrl != undefined) {
                this.loadDrumSound(drumSoundUrl)
                    .then((preset) => {
                        availableDrumSoundsForNote.get(note).preset = preset;
                        this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, preset);
                        
                        // Create UI controls for this drum note
                        this.app.modules.settingsManager.createDrumInstrumentControl(note, sfIndex, callerId);
                        this.cleanCashed();
                    })
                    .catch((error) => {
                        console.error('Error loading drum sound:', error);
                    });
            } else {
                console.warn("No drum sound URL found for note:", note);
            }
        } else {
            // Drum sound data already exists
            if (availableDrumSoundsForNote.get((overriddenNote) ? overriddenNote : note).preset === "loading") {
                // Still loading - retry after delay
                setTimeout(() => {
                    this.loadDrumSoundForNote(note, sfIndex, callerId, overriddenNote);
                }, 300);
                return;
            } else {
                // Use existing preset
                this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, availableDrumSoundsForNote.get(note).preset);
                this.cleanCashed();
            }
        }
    }

    /**
     * Adds a note to the drum instrument configuration
     * Creates drum instrument audio chain if it doesn't exist
     * @param {number} note - MIDI note number
     * @param {string} preset - Preset name to associate with the note
     */
    addNoteToDrumInstrument(note, preset) {
        const audioContext = this.app.audioContext;

        if (!this.drumInstrument) {
            // Create drum instrument audio processing chain
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;
            const panNode = audioContext.createStereoPanner();
            panNode.pan.value = 0;
            gainNode.connect(panNode);
            panNode.connect(audioContext.destination);
            
            // Initialize drum instrument object
            this.drumInstrument = { 
                notes: new Map(), // MIDI note -> preset mapping
                overriddenNotes: new Map(), // Note remapping (e.g., map kick to snare)
                gainNode: gainNode, 
                panNode: panNode 
            };
            
            // Set default file settings for drum channel (channel 9)
            const resetSetting = this.app.fileSettings[9] || {};
            resetSetting["volumeSlider_drum"] = 127.0;
            resetSetting["panSlider_drum"] = 0.0;
            this.app.fileSettings[9] = resetSetting;
        }
        this.drumInstrument.notes.set(note, preset);
    }

    /**
     * Gets available soundfonts for a MIDI program number
     * Populates the availableInstrumentsForProgramChange map
     * @param {number} i - MIDI program number (0-127)
     * @returns {Object} Object containing instrument name, available URLs, and preset status
     */
    linksForProgramChange(i) {
        if (i === undefined) {
            console.error('linksForProgramChange called with undefined index');
        }
        
        // Format program number with leading zeros for file filtering
        let filter = "";
        if (i < 10) {
            filter = "00" + i;
        } else if (i < 100) {
            filter = "0" + i;
        } else {
            filter = i.toString();
        }
        
        // Get instrument information from WebAudioFont
        const nn = this.player.loader.findInstrument(i);
        const instrumentData = { 
            name: this.player.loader.instrumentInfo(nn).title, 
            urls: this.player.loader.instrumentKeys().filter(url => url.startsWith(filter)), 
            preset: "loading" 
        };
        
        this.availableInstrumentsForProgramChange.set(i, instrumentData);
        
        // Maintain legacy global compatibility
        if (typeof window !== 'undefined' && typeof availableInstrumentsForProgramChange !== 'undefined') {
            availableInstrumentsForProgramChange.set(i, instrumentData);
        }
        
        return this.availableInstrumentsForProgramChange.get(i);
    }

    /**
     * Gets available soundfonts for a drum MIDI note
     * Populates the availableDrumSoundsForNote map
     * @param {number} i - MIDI note number (35-81 for GM drums)
     * @returns {Object} Object containing drum name, available URLs, and preset status
     */
    linksForDrumSound(i) {
        const filter = i.toString();
        const nn = this.player.loader.findDrum(i);
        const info = this.player.loader.drumInfo(nn);
        this.availableDrumSoundsForNote.set(i, { 
            name: info.title, 
            urls: this.player.loader.drumKeys().filter(url => url.startsWith(filter)), 
            preset: "loading" 
        });
        return this.availableDrumSoundsForNote.get(i);
    }

    /**
     * Creates a complete audio processing chain for a MIDI channel
     * Includes gain, panning, and reverb send controls
     * @param {number} channel - MIDI channel number
     * @param {string} preset - Initial preset name
     * @param {number} sfIndex - SoundFont index
     * @returns {Object} Channel instrument object with audio nodes
     */
    createChannelInstrumentForChannel(channel, preset, sfIndex) {
        if (this.loadedChannelInstruments.has(channel)) {
            // Update existing instrument
            this.loadedChannelInstruments.get(channel).preset = preset;
            this.loadedChannelInstruments.get(channel).sfIndex = sfIndex;
            return this.loadedChannelInstruments.get(channel);
        }

        const audioContext = this.app.audioContext;
        
        // Create audio processing chain: gain -> pan -> destination + reverb send
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        const panNode = audioContext.createStereoPanner();
        panNode.pan.value = 0;
        gainNode.connect(panNode);
        panNode.connect(audioContext.destination);
        
        // Set default file settings for reset functionality
        const resetSetting = this.app.fileSettings[channel] || {};
        resetSetting["volumeSlider_" + channel] = 127.0;
        resetSetting["reverbSlider_" + channel] = 0.7;
        resetSetting["panSlider_" + channel] = 0.0;
        this.app.fileSettings[channel] = resetSetting;

        // Create and connect reverb send gain node
        const reverbSendGainNode = this.createReverbSendGainNode();
        panNode.connect(reverbSendGainNode);

        const channelInstrument = { 
            preset: preset, 
            sfIndex: 0, 
            panNode: panNode, 
            gainNode: gainNode, 
            reverbSendGainNode: reverbSendGainNode 
        };
        return channelInstrument;
    }

    /**
     * Creates a gain node for reverb send control
     * @returns {GainNode} Gain node connected to reverb input
     */
    createReverbSendGainNode() {
        const audioContext = this.app.audioContext;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.7; // Default reverb send level
        gainNode.connect(this.reverb);
        return gainNode;
    }

    /**
     * Cleans up unused cached instruments to free memory
     * Removes presets that are no longer in use by any channel or drum note
     */
    cleanCashed() {
        let inUse = [];
        
        // Collect all presets currently in use by loaded channel instruments
        for (const inst of this.loadedChannelInstruments.keys()) {
            if (this.availableInstrumentsForProgramChange.has(this.loadedChannelInstruments.get(inst).programNumber)) {
                inUse.push(this.availableInstrumentsForProgramChange.get(this.loadedChannelInstruments.get(inst).programNumber).preset);
            }
        }
        
        // Collect all presets currently in use by drum sounds
        for (const note of this.availableDrumSoundsForNote.keys()) {
            if (this.availableDrumSoundsForNote.has(note)) {
                inUse.push(this.availableDrumSoundsForNote.get(note).preset);
            }
        }
        
        // Clean up cached instruments that are not in use
        if (this.player && this.player.loader && this.player.loader.cached) {
            for (let i = this.player.loader.cached.length - 1; i >= 0; i--) {
                const cachedInstr = this.player.loader.cached[i];
                if (!inUse.includes(cachedInstr) && window[cachedInstr] !== undefined) {
                    // Release the cached instrument from global scope
                    window[cachedInstr] = null;
                    // Remove from cached array
                    this.player.loader.cached.splice(i, 1);
                    console.log('unused instrument removed:', cachedInstr.variableName);
                }
            }
        }
    }

    /**
     * Comprehensive cleanup of all audio engine resources
     * Resets all state, clears caches, and removes UI elements
     */
    cleanup() {
        // Reset application state
        this.app.state.userSettings = { "channels": {} };
        this.app.fileSettings = {};
        this.app.state.reversedPlayback = false;
        
        // Clean cached instruments first
        this.cleanCashed();
        
        // Clear all data structures
        this.loadedChannelInstruments.clear();
        this.availableInstrumentsForProgramChange.clear();
        this.availableDrumSoundsForNote.clear();
        this.loadedChannelControlValues.clear();
        
        // Reset drum instrument
        if (this.drumInstrument) {
            if (this.drumInstrument.notes) {
                this.drumInstrument.notes.clear();
            }
            if (this.drumInstrument.overriddenNotes) {
                this.drumInstrument.overriddenNotes.clear();
            }
        }
        this.drumInstrument = null;
        
        // Clear all cached instruments from memory
        if (this.player && this.player.loader && this.player.loader.cached) {
            for (let i = this.player.loader.cached.length - 1; i >= 0; i--) {
                const cachedInstr = this.player.loader.cached[i];
                window[cachedInstr] = null;
                this.player.loader.cached.splice(i, 1);
            }
        }
        
        // Clear UI elements
        const element = document.getElementById("file_controls");
        if (element) {
            for (let i = element.childNodes.length - 1; i >= 0; i--) {
                element.childNodes[i].remove();
            }
        }
        
        // Reset UI form fields
        const midiFileName = document.getElementById("midiFileName");
        if (midiFileName) {
            midiFileName.innerHTML = "";
        }
        
        const midiUrl = document.getElementById("midiUrl");
        if (midiUrl) {
            midiUrl.value = "";
        }
        
        // Reset reverse playback checkbox
        const reverseCheckbox = document.getElementById('reverseMidi');
        if (reverseCheckbox) {
            reverseCheckbox.checked = false;
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}

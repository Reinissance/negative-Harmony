/**
 * MIDI Manager Module
 * Handles MIDI device detection, setup, message processing, and file parsing.
 * Manages both hardware MIDI devices and WebAudioFont synthesis.
 */

/**
 * Manages all MIDI functionality including device I/O, file parsing, and message routing
 * @class MidiManager
 */
class MidiManager {
    /**
     * Creates an instance of MidiManager
     * @param {Object} app - Reference to the main application instance
     */
    constructor(app) {
        this.app = app;
        /** @type {MIDIAccess|null} Web MIDI API access object */
        this.midiAccess = null;
        /** @type {Array<MIDIInput>} Available MIDI input devices */
        this.midiInputs = [];
        /** @type {MIDIOutput|null} Currently selected MIDI output port */
        this.midioutPort = null;
        /** @type {HTMLSelectElement|null} MIDI outputs dropdown element */
        this.midiOutputsSelect = null;
        /** @type {boolean} Whether MIDI is available in the browser */
        this.noMidi = true;
        /** @type {Array<Object>} Currently active MIDI notes with envelopes */
        this.midiNotes = [];
        /** @type {Map<number, boolean>} Sustain pedal state by MIDI channel */
        this.sustain = new Map();
        /** @type {Map<string, Object>} Notes held by sustain pedal (key: "channel-pitch") */
        this.sustainedNodes = new Map();
        /** @type {Set<number>} Channels currently in solo mode */
        this.soloChannels = new Set();
        /** @type {Object|string} Currently loaded MIDI file data */
        this.file = "";
    }

    /**
     * Initialize the MIDI manager and request MIDI access
     * @async
     */
    async init() {
        // Setup file upload handler during initialization
        this.setupFileUploadHandler();
        
        // Request MIDI device access from user
        if (navigator.requestMIDIAccess) {
            try {
                const midiAccess = await navigator.requestMIDIAccess();
                this.onMIDISuccess(midiAccess);
            } catch (error) {
                console.warn('MIDI access denied or failed:', error);
                this.onMIDIFailure(error);
            }
        } else {
            this.onMIDIFailure('MIDI not supported in this browser');
        }
    }

    /**
     * Handles successful MIDI access and sets up devices
     * @param {MIDIAccess} midiAccess - Web MIDI API access object
     */
    onMIDISuccess(midiAccess) {
        this.noMidi = false;
        this.midiInputs = Array.from(midiAccess.inputs.values());
        
        this.setupMidiInputs();
        this.setupMidiOutputs(midiAccess);
    }

    /**
     * Sets up MIDI input device selection and event handling
     */
    setupMidiInputs() {
        const midiInputsSelect = document.getElementById("midiInputs");
        
        // Add MidiPlayer as first option (for file playback)
        const playerOption = document.createElement("option");
        playerOption.value = 0;
        playerOption.text = "MidiPlayer";
        midiInputsSelect.add(playerOption);

        // Add available hardware MIDI inputs
        this.midiInputs.forEach((input, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.text = input.name;
            midiInputsSelect.add(option);
        });

        // Preselect first input (MidiPlayer)
        if (this.midiInputs.length > 0) {
            midiInputsSelect.selectedIndex = 0;
        }

        // Handle input selection changes
        midiInputsSelect.onchange = () => {
            const selectedInput = this.midiInputs[midiInputsSelect.value];
            // Clear all existing input handlers
            this.midiInputs.forEach(input => input.onmidimessage = null);
            
            // Set up handler for selected hardware input (skip index 0 = MidiPlayer)
            if (selectedInput && midiInputsSelect.selectedIndex > 0) {
                selectedInput.onmidimessage = (message) => this.onMIDIMessage(message);
            }
        };
    }

    /**
     * Sets up MIDI output device selection and routing
     * @param {MIDIAccess} midiAccess - Web MIDI API access object
     */
    setupMidiOutputs(midiAccess) {
        this.midiOutputsSelect = document.getElementById("midiOutputs");
        const midiOutputs = Array.from(midiAccess.outputs.values());
        
        // Add WebAudioFont as first option (internal synthesis)
        const webAudioOption = document.createElement("option");
        webAudioOption.value = -1;
        webAudioOption.text = "WebAudioFont";
        this.midiOutputsSelect.add(webAudioOption);

        // Add available hardware MIDI outputs
        midiOutputs.forEach((output, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.text = output.name;
            this.midiOutputsSelect.add(option);
        });

        // Preselect first output (WebAudioFont)
        if (midiOutputs.length > 0) {
            this.midiOutputsSelect.selectedIndex = 0;
        }

        // Handle output selection changes
        this.midiOutputsSelect.onchange = () => {
            this.handleOutputChange(midiOutputs);
        };
    }

    /**
     * Sets up file upload handler for MIDI file loading
     */
    setupFileUploadHandler() {
        document.getElementById('midiUpload').addEventListener('change', (event) => {
            // Reset negative harmony root detection
            this.app.state.negRoot = null;
            
            // Clean up previous file state
            const transport = this.app.modules.transport;
            if (transport) {
                transport.preclean();
            }

            const load = event.target.files[0];
            if (load) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Mark as local file for UI behavior
                    this.app.localFile = true;

                    // Parse the MIDI file using midi.js library
                    this.parseMidiFile(new Midi(e.target.result));
                    
                    // Enable playback controls
                    Utils.setPlayButtonActive(true);
                };
                reader.readAsArrayBuffer(load);
            } else {
                console.error("No MIDI file selected.");
            }
        });
    }

    /**
     * Parses a MIDI file and sets up the application for playback
     * Extracts tempo, duration, and schedules events for playback
     * @param {Object} midiData - Parsed MIDI data from midi.js
     */
    parseMidiFile(midiData) {
        // Clear previous channel controls
        document.getElementById("file_controls").innerHTML = "";
        
        // Update application state
        const state = this.app.state;
        this.app.midiFileRead = true;
        this.app.track_duration = midiData.duration;
        state.speed = 1.0;
        
        // Extract BPM from MIDI file header
        if (midiData.header.tempos.length > 0) {
            this.app.bpm = midiData.header.tempos[0]["bpm"];
        } else {
            // Default to 120 BPM if no tempo information
            this.app.bpm = 120.0;
        }
        
        // Synchronize Tone.js transport with file tempo
        Tone.Transport.bpm.value = this.app.bpm;

        // Reset playback speed to normal
        const transport = this.app.modules.transport;
        if (transport) {
            transport.setSpeed(1.0);
        } else {
            console.error("Transport module not found, cannot set playback speed.");
        }
        
        // Update MIDI file name display in UI
        const midiFileName = document.getElementById("midiFileName");
        if (midiFileName) {
            if (midiData.header.name) {
                midiFileName.innerHTML = midiData.header.name;
            } else {
                midiFileName.innerHTML = "";
            }
        }
        
        // Schedule all MIDI events for playback through transport
        if (transport && !(midiData === this.file)) {
            this.file = midiData; // Store reference to avoid re-processing
            transport.scheduleMIDIEvents(midiData);
        } else {
            console.error("Transport module not found, cannot schedule MIDI events.");
        }
    }

    /**
     * Handles changes to MIDI output device selection
     * Sends all notes off when switching to prevent hanging notes
     * @param {Array<MIDIOutput>} midiOutputs - Available MIDI output devices
     */
    handleOutputChange(midiOutputs) {
        if (!this.midioutPort) {
            // Switching from WebAudioFont - stop all internal synthesis
            setTimeout(() => {
                for (const note of this.midiNotes) {
                    this.app.modules.audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
                }
            }, 500);
        } else {
            // Switching from external device - send MIDI all notes off
            for (let channel = 0; channel < 12; channel++) {
                this.midioutPort.send([0xB0 + channel, 120, 0]); // CC 120 = All Notes Off
            }
        }

        // Set new output port
        this.midioutPort = midiOutputs[this.midiOutputsSelect.value];
        if (this.midioutPort) {
            this.midioutPort.onmidimessage = (message) => this.onMidiOutMessage(message);
        }
    }

    /**
     * Handles MIDI access failure and updates UI accordingly
     * @param {string|Error} msg - Error message or error object
     */
    onMIDIFailure(msg) {
        document.getElementById("midiIn").innerHTML = "No extern MIDI available.";
        document.getElementById("midiOut").innerHTML = "";
        console.warn(`Failed to get MIDI access - ${msg}`);
    }

    /**
     * Handles MIDI messages from input devices
     * @param {MIDIMessageEvent} message - MIDI message event from input device
     */
    onMIDIMessage(message) {
        this.onMidiOutMessage(message.data);
    }

    /**
     * Routes MIDI messages to appropriate output (external device or WebAudioFont)
     * @param {Uint8Array|Array<number>} message - Raw MIDI message bytes
     */
    onMidiOutMessage(message) {
        if (!this.noMidi && this.midiOutputsSelect.selectedIndex !== 0) {
            // Route to external MIDI device
            try {
                this.midioutPort.send(message);
            } catch (error) {
                console.error("Error sending MIDI message:", error);
            }
        } else {
            // Route to internal WebAudioFont synthesis
            this.handleWebAudioFontMessage(message);
        }
    }

    /**
     * Processes MIDI messages for internal WebAudioFont synthesis
     * Decodes MIDI message types and routes to appropriate handlers
     * @param {Uint8Array|Array<number>} message - Raw MIDI message bytes
     */
    handleWebAudioFontMessage(message) {
        if (this.noMidi || (this.midiOutputsSelect && this.midiOutputsSelect.selectedIndex === 0)) {
            const channel = message[0] & 0x0F; // Extract channel from status byte
            const audioEngine = this.app.modules.audioEngine;

            // Decode MIDI message type from status byte
            if (message[0] >= 0x80 && message[0] < 0x90 && channel !== 9) {
                // Note off (0x80-0x8F, excluding drum channel)
                audioEngine.handleNoteOff(channel, { midi: message[1] });
            } else if (message[0] >= 0x90 && message[0] < 0xA0) {
                // Note on/off (0x90-0x9F)
                if (message[2] === 0 && channel !== 9) {
                    // Velocity 0 = note off (common MIDI practice)
                    audioEngine.handleNoteOff(channel, { midi: message[1] });
                } else {
                    // True note on with velocity
                    audioEngine.handleNoteOnForChannel({ midi: message[1] }, message[2] / 127, channel);
                }
            } else if (message[0] >= 0xB0 && message[0] < 0xC0) {
                // Control change (0xB0-0xBF)
                this.handleControlChange(message, channel);
            } else if (message[0] >= 0xC0 && message[0] < 0xD0) {
                // Program change (0xC0-0xCF)
                this.handleProgramChange(message, channel);
            } else if (message[0] >= 0xE0 && message[0] < 0xF0) {
                // Pitch bend (0xE0-0xEF)
                this.handlePitchBend(message, channel);
            }
        }
    }

    /**
     * Processes MIDI control change messages
     * Handles volume, pan, reverb send, sustain pedal, and all notes off
     * @param {Array<number>} message - MIDI control change message [status, controller, value]
     * @param {number} channel - MIDI channel number (0-15)
     */
    handleControlChange(message, channel) {
        const audioEngine = this.app.modules.audioEngine;
        
        if (message[1] === 120) {
            // CC 120: All Notes Off - emergency stop for all notes
            for (const note of this.midiNotes) {
                audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
            }
        } else if (message[1] === 7) {
            // CC 7: Main Volume
            this.handleControlSettingFromFile(channel, "volume", message[2] / 127);
        } else if (message[1] === 10) {
            // CC 10: Pan Position (center = 64, converted to -1 to +1 range)
            this.handleControlSettingFromFile(channel, "pan", (message[2] - 64) / 64);
        } else if (message[1] === 91) {
            // CC 91: Reverb Send Level
            this.handleControlSettingFromFile(channel, "reverb", message[2] / 127);
        } else if (message[1] === 64) {
            // CC 64: Sustain Pedal (0-63 = off, 64-127 = on)
            this.handleSustainPedal(message[2], channel);
        }
    }

    /**
     * Handles control changes that originate from MIDI file data
     * Updates UI controls and audio parameters while respecting user overrides
     * @param {number} channel - MIDI channel number
     * @param {string} setting - Setting name ("volume", "pan", "reverb")
     * @param {number} value - Normalized control value (0.0-1.0)
     */
    handleControlSettingFromFile(channel, setting, value) {
        const settingsManager = this.app.modules.settingsManager;
        
        // Schedule UI updates on the main thread
        Tone.Draw.schedule(() => {
            const slider = settingsManager.setResettable(channel, setting, value, "slider");
            
            // Check if user has manually overridden this setting
            if (slider === null || this.isUserSettingOverride(channel, slider.id)) {
                console.warn("User setting overrides channel:", channel, "setting:", setting, "value:", value);
                return;
            }

            // Apply the control change to audio processing
            this.updateControlNode(channel, setting, value);
            // Update the UI slider and label
            this.updateSliderAndLabel(slider, setting, value, channel);
        }, Tone.now());
    }

    /**
     * Checks if a user has manually overridden a setting
     * @param {number} channel - MIDI channel number
     * @param {string} sliderId - DOM ID of the slider element
     * @returns {boolean} True if user has overridden this setting
     */
    isUserSettingOverride(channel, sliderId) {
        const userSettings = this.app.state.userSettings;
        return userSettings.channels[channel] !== undefined && 
               userSettings.channels[channel][sliderId];
    }

    /**
     * Updates the actual audio processing node with new control value
     * @param {number} channel - MIDI channel number
     * @param {string} setting - Setting name ("volume", "pan", "reverb")
     * @param {number} value - Control value to apply
     */
    updateControlNode(channel, setting, value) {
        const audioEngine = this.app.modules.audioEngine;
        
        if (channel === 9) {
            // Handle drum channel (special case)
            const drumInstrument = audioEngine.getDrumInstrument();
            const controlNode = (setting === "volume") ? 
                drumInstrument.gainNode.gain : drumInstrument.panNode.pan;
            controlNode.value = value;
        } else {
            // Handle regular instrument channels
            const instrument = audioEngine.getChannelInstrument(channel);
            if (instrument) {
                let controlNode;
                if (setting === "volume") {
                    controlNode = instrument.gainNode.gain;
                } else if (setting === "pan") {
                    controlNode = instrument.panNode.pan;
                } else if (setting === "reverb") {
                    controlNode = instrument.reverbSendGainNode.gain;
                }
                if (controlNode) controlNode.value = value;
            }
        }
    }

    /**
     * Updates the UI slider position and label text to reflect current value
     * @param {HTMLElement} slider - Slider DOM element
     * @param {string} setting - Setting name for label formatting
     * @param {number} value - Current control value
     * @param {number} channel - MIDI channel number
     */
    updateSliderAndLabel(slider, setting, value, channel) {
        // Convert normalized value back to slider range (pan stays -1 to +1, others 0-127)
        slider.value = (setting === "pan") ? value : value * 127;
        
        // Update the corresponding label
        const labelId = setting + "_label_" + ((channel !== 9) ? channel : "drum");
        const label = document.getElementById(labelId);
        
        if (label) {
            label.innerHTML = setting.charAt(0).toUpperCase() + setting.slice(1) + 
                             ": " + value.toFixed(2);
        }
    }

    /**
     * Handles sustain pedal (damper pedal) control changes
     * Manages note sustain and release based on pedal state
     * @param {number} value - MIDI control value (0-127)
     * @param {number} channel - MIDI channel number
     */
    handleSustainPedal(value, channel) {
        if (value > 0) {
            // Pedal pressed - enable sustain for this channel
            this.sustain.set(channel, true);
        } else {
            // Pedal released - release all sustained notes for this channel
            for (const [key, node] of this.sustainedNodes.entries()) {
                const [nodeChannel, pitch] = key.split('-').map(Number);
                if (nodeChannel === channel) {
                    node.cancel(); // Stop the sustained note
                    this.sustainedNodes.delete(key);
                }
            }
            this.sustain.set(channel, false);
        }
    }

    /**
     * Handles MIDI program change messages to switch instruments
     * Updates UI controls and loads new instruments as needed
     * @param {Array<number>} message - MIDI program change message [status, program]
     * @param {number} channel - MIDI channel number
     */
    handleProgramChange(message, channel) {
        const settingsManager = this.app.modules.settingsManager;
        
        // Schedule UI updates on the main thread
        Tone.Draw.schedule(() => {
            if (channel === 9) return; // No program change on GM drum channel
            
            // Set up resettable program change control
            const select = settingsManager.setResettable(channel, "instrumentSelect_" + channel, message[1], "select");
            
            // Check for user override
            if (select === null || this.isUserSettingOverride(channel, select.id)) {
                console.warn("Program user setting overrides channel:", channel, "value:", message[1]);
                return;
            }
            
            // Update UI and trigger instrument change if needed
            if (select.selectedIndex !== message[1]) {
                select.selectedIndex = message[1];
                select.classList.add("fromFile"); // Mark as coming from file (not user input)
                select.dispatchEvent(new Event('change'));
            }
        }, Tone.now());
    }

    /**
     * Handles MIDI pitch bend messages for expressive pitch control
     * Applies pitch bend to all currently playing notes on the channel
     * @param {Array<number>} message - MIDI pitch bend message [status, LSB, MSB]
     * @param {number} channel - MIDI channel number
     */
    handlePitchBend(message, channel) {
        // Reconstruct 14-bit pitch bend value from LSB and MSB
        const pitchBendValue = (message[2] << 7) | message[1];
        // Normalize to -1.0 to +1.0 range (8192 = center/no bend)
        const normalizedBend = (pitchBendValue - 8192) / 8192;
        // Standard pitch bend range is ±2 semitones
        const pitchBendRange = 2;
        const bendInSemitones = normalizedBend * pitchBendRange;
        
        // Apply pitch bend to all currently playing notes on this channel
        const channelNotes = this.midiNotes.filter(note => note.channel === channel);
        const audioEngine = this.app.modules.audioEngine;
        
        for (const note of channelNotes) {
            audioEngine.handlePitchBend(note, bendInSemitones);
        }
    }

    /**
     * Sends all notes off and all sound off messages to stop all audio
     * Used for emergency stops and when switching between files
     */
    sendEvent_allNotesOff() {
        const audioEngine = this.app.modules.audioEngine;
        
        if (!audioEngine) {
            console.warn('Audio engine not available for allNotesOff');
            return;
        }
        
        // Stop all currently playing notes via WebAudioFont
        for (const note of this.midiNotes) {
            audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
        }
        
        // Send MIDI control change messages for all channels
        for (let channel = 0; channel < 16; channel++) {
            const allNotesOffMessage = [0xB0 + channel, 120, 0]; // CC 120 = All Notes Off
            this.onMidiOutMessage(allNotesOffMessage);
            
            const allSoundOffMessage = [0xB0 + channel, 123, 0]; // CC 123 = All Sound Off
            this.onMidiOutMessage(allSoundOffMessage);
        }
        
        // Clear internal note tracking
        this.clearMidiNotes();
    }

    /**
     * Sends sustain pedal off messages for all channels
     * Releases all sustained notes and clears sustain state
     */
    sendEvent_sustainPedalOff() {
        for (let channel = 0; channel < 16; channel++) {
            if (this.noMidi || (this.midiOutputsSelect && this.midiOutputsSelect.selectedIndex === 0)) {
                this.handleSustainPedal(0, channel); // 0 = pedal off
            }
            
            // Also send MIDI message for external devices
            const sustainPedalOffMessage = [0xB0 + channel, 64, 0]; // CC 64 = Sustain Pedal Off
            this.onMidiOutMessage(sustainPedalOffMessage);
        }
    }
    
    /**
     * Adds a MIDI note to the active notes tracking
     * @param {Object} note - Note object with channel, pitch, and envelope
     */
    addMidiNote(note) {
        this.midiNotes.push(note);
    }

    /**
     * Removes a specific MIDI note from active tracking
     * @param {number} channel - MIDI channel number
     * @param {number} pitch - MIDI note number
     */
    removeMidiNote(channel, pitch) {
        this.midiNotes = this.midiNotes.filter(note => 
            !(note.channel === channel && note.pitch === pitch)
        );
    }

    /**
     * Gets the current sustain pedal state for a channel
     * @param {number} channel - MIDI channel number
     * @returns {boolean} True if sustain pedal is pressed
     */
    getSustainState(channel) {
        return this.sustain.get(channel);
    }

    /**
     * Stores a note envelope that should be sustained until pedal release
     * @param {number} channel - MIDI channel number
     * @param {number} pitch - MIDI note number
     * @param {Object} envelope - WebAudioFont envelope object
     */
    setSustainedNode(channel, pitch, envelope) {
        const key = `${channel}-${pitch}`;
        this.sustainedNodes.set(key, envelope);
    }

    /**
     * Gets the set of channels currently in solo mode
     * @returns {Set<number>} Set of soloed channel numbers
     */
    getSoloChannels() {
        return this.soloChannels;
    }

    /**
     * Clears all tracked MIDI notes
     */
    clearMidiNotes() {
        this.midiNotes = [];
    }

    /**
     * Alias for onMIDIMessage for compatibility with other modules
     * @param {MIDIMessageEvent|Object} message - MIDI message to handle
     */
    handleMIDIMessage(message) {
        return this.onMIDIMessage(message);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiManager;
}

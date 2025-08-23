/**
 * MIDI Manager Module
 * Handles MIDI device detection, setup, and message processing
 */

class MidiManager {
    constructor(app) {
        this.app = app;
        this.midiAccess = null;
        this.midiInputs = [];
        this.midioutPort = null;
        this.midiOutputsSelect = null;
        this.noMidi = true;
        this.midiNotes = [];
        this.sustain = new Map();
        this.sustainedNodes = new Map();
        this.soloChannels = new Set();
        this.file = "";
    }

    async init() {
        // Setup file upload handler during initialization
        this.setupFileUploadHandler();
        
        // request midi devices acces from user
        if (navigator.requestMIDIAccess) {
            try {
                console.log('Requesting MIDI access after user gesture...');
                const midiAccess = await navigator.requestMIDIAccess();
                
                this.onMIDISuccess(midiAccess);
                    console.log('MIDI access granted and handled by modular system');
            } catch (error) {
                console.warn('MIDI access denied or failed:', error);
                this.onMIDIFailure(error);
            }
        } else {
            this.onMIDIFailure('MIDI not supported in this browser');
        }
    }

    onMIDISuccess(midiAccess) {
        this.noMidi = false;
        this.midiInputs = Array.from(midiAccess.inputs.values());
        
        this.setupMidiInputs();
        this.setupMidiOutputs(midiAccess);
    }

    setupMidiInputs() {
        const midiInputsSelect = document.getElementById("midiInputs");
        
        // Add MidiPlayer as first option
        const playerOption = document.createElement("option");
        playerOption.value = 0;
        playerOption.text = "MidiPlayer";
        midiInputsSelect.add(playerOption);

        // Add available MIDI inputs
        this.midiInputs.forEach((input, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.text = input.name;
            midiInputsSelect.add(option);
        });

        // Preselect first input
        if (this.midiInputs.length > 0) {
            midiInputsSelect.selectedIndex = 0;
        }

        // Handle input selection changes
        midiInputsSelect.onchange = () => {
            const selectedInput = this.midiInputs[midiInputsSelect.value];
            this.midiInputs.forEach(input => input.onmidimessage = null);
            
            if (selectedInput && midiInputsSelect.selectedIndex > 0) {
                selectedInput.onmidimessage = (message) => this.onMIDIMessage(message);
            }
        };
    }

    setupMidiOutputs(midiAccess) {
        this.midiOutputsSelect = document.getElementById("midiOutputs");
        const midiOutputs = Array.from(midiAccess.outputs.values());
        
        // Add WebAudioFont as first option
        const webAudioOption = document.createElement("option");
        webAudioOption.value = -1;
        webAudioOption.text = "WebAudioFont";
        this.midiOutputsSelect.add(webAudioOption);

        // Add available MIDI outputs
        midiOutputs.forEach((output, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.text = output.name;
            this.midiOutputsSelect.add(option);
        });

        // Preselect first output
        if (midiOutputs.length > 0) {
            this.midiOutputsSelect.selectedIndex = 0;
        }

        // Handle output selection changes
        this.midiOutputsSelect.onchange = () => {
            this.handleOutputChange(midiOutputs);
        };
    }

    setupFileUploadHandler() {
        document.getElementById('midiUpload').addEventListener('change', (event) => {
            // Call transport preclean
            this.app.state.negRoot = null
            const transport = this.app.modules.transport;
            if (transport) {
                transport.preclean();
            }

            const load = event.target.files[0];
            if (load) {
                const reader = new FileReader();
                reader.onload = (e) => {

                    this.app.localFile = true;

                    // Parse the MIDI file
                    this.parseMidiFile(new Midi(e.target.result));
                    
                    // Set play button active through transport
                    Utils.setPlayButtonActive(true);
                };
                reader.readAsArrayBuffer(load);
            } else {
                console.error("No MIDI file selected.");
            }
        });
    }

    parseMidiFile(midiData) {
        // Clear previous controls
        document.getElementById("file_controls").innerHTML = "";
        
        // Update app state
        const state = this.app.state;
        this.app.midiFileRead = true;
        this.app.track_duration = midiData.duration;
        state.speed = 1.0;
        
        // Get BPM from MIDI file if present
        if (midiData.header.tempos.length > 0) {
            this.app.bpm = midiData.header.tempos[0]["bpm"];
        } else {
            this.app.bpm = 120.0;
        }
        
        // Update Tone.js transport
        Tone.Transport.bpm.value = this.app.bpm;

        // Set playback speed through transport module
        const transport = this.app.modules.transport;
        if (transport) {
            transport.setSpeed(1.0);
        } else {
            console.error("Transport module not found, cannot set playback speed.");
        }
        
        // Update MIDI file name display
        const midiFileName = document.getElementById("midiFileName");
        if (midiFileName) {
            if (midiData.header.name) {
                midiFileName.innerHTML = midiData.header.name;
            } else {
                midiFileName.innerHTML = "";
            }
        }
        
        // Schedule MIDI events through transport module
        if (transport && !(midiData === this.file)) {
            this.file = midiData; // Store the file reference
            transport.scheduleMIDIEvents(midiData);
        } else {
            console.error("Transport module not found, cannot schedule MIDI events.");
        }
    }

    handleOutputChange(midiOutputs) {
        if (!this.midioutPort) {
            // Send all notes off for WebAudioFont
            setTimeout(() => {
                for (const note of this.midiNotes) {
                    this.app.modules.audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
                }
            }, 500);
        } else {
            // Send all notes off for external MIDI devices
            for (let channel = 0; channel < 12; channel++) {
                this.midioutPort.send([0xB0 + channel, 120, 0]);
            }
        }

        this.midioutPort = midiOutputs[this.midiOutputsSelect.value];
        if (this.midioutPort) {
            this.midioutPort.onmidimessage = (message) => this.onMidiOutMessage(message);
            console.log("Selected MIDI output:", this.midioutPort.name);
        }
    }

    onMIDIFailure(msg) {
        document.getElementById("midiIn").innerHTML = "No extern MIDI available.";
        document.getElementById("midiOut").innerHTML = "";
        console.warn(`Failed to get MIDI access - ${msg}`);
    }

    onMIDIMessage(message) {
        this.onMidiOutMessage(message.data);
    }

    onMidiOutMessage(message) {
        if (!this.noMidi && this.midiOutputsSelect.selectedIndex !== 0) {
            // External MIDI
            try {
                this.midioutPort.send(message);
                console.log("MIDI out message:", message, "to port:", this.midioutPort.name);
            } catch (error) {
                console.error("Error sending MIDI message:", error);
            }
        } else {
            this.handleWebAudioFontMessage(message);
        }
    }

    handleWebAudioFontMessage(message) {
        if (this.noMidi || (this.midiOutputsSelect && this.midiOutputsSelect.selectedIndex === 0)) {
            const channel = message[0] & 0x0F;
            const audioEngine = this.app.modules.audioEngine;

            if (message[0] >= 0x80 && message[0] < 0x90 && channel !== 9) {
                // Note off
                audioEngine.handleNoteOff(channel, { midi: message[1] });
            } else if (message[0] >= 0x90 && message[0] < 0xA0) {
                // Note on/off
                if (message[2] === 0 && channel !== 9) {
                    audioEngine.handleNoteOff(channel, { midi: message[1] });
                } else {
                    audioEngine.handleNoteOnForChannel({ midi: message[1] }, message[2] / 127, channel);
                }
            } else if (message[0] >= 0xB0 && message[0] < 0xC0) {
                // Control change
                this.handleControlChange(message, channel);
            } else if (message[0] >= 0xC0 && message[0] < 0xD0) {
                // Program change
                this.handleProgramChange(message, channel);
            } else if (message[0] >= 0xE0 && message[0] < 0xF0) {
                // Pitch bend
                this.handlePitchBend(message, channel);
            }
        }
    }

    handleControlChange(message, channel) {
        const audioEngine = this.app.modules.audioEngine;
        
        if (message[1] === 120) {
            // All notes off
            for (const note of this.midiNotes) {
                audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
            }
        } else if (message[1] === 7) {
            // Volume
            this.handleControlSettingFromFile(channel, "volume", message[2] / 127);
        } else if (message[1] === 10) {
            // Pan
            this.handleControlSettingFromFile(channel, "pan", (message[2] - 64) / 64);
        } else if (message[1] === 91) {
            // Reverb send
            this.handleControlSettingFromFile(channel, "reverb", message[2] / 127);
        } else if (message[1] === 64) {
            // Sustain pedal
            this.handleSustainPedal(message[2], channel);
        }
    }

    handleControlSettingFromFile(channel, setting, value) {
        const settingsManager = this.app.modules.settingsManager;
        
        Tone.Draw.schedule(() => {
            const slider = settingsManager.setResettable(channel, setting, value, "slider");
            
            if (slider === null || this.isUserSettingOverride(channel, slider.id)) {
                console.warn("User setting overrides channel:", channel, "setting:", setting, "value:", value);
                return;
            }

            this.updateControlNode(channel, setting, value);
            this.updateSliderAndLabel(slider, setting, value, channel);
        }, Tone.now());
    }

    isUserSettingOverride(channel, sliderId) {
        const userSettings = this.app.state.userSettings;
        return userSettings.channels[channel] !== undefined && 
               userSettings.channels[channel][sliderId];
    }

    updateControlNode(channel, setting, value) {
        const audioEngine = this.app.modules.audioEngine;
        
        if (channel === 9) {
            const drumInstrument = audioEngine.getDrumInstrument();
            const controlNode = (setting === "volume") ? 
                drumInstrument.gainNode.gain : drumInstrument.panNode.pan;
            controlNode.value = value;
        } else {
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

    updateSliderAndLabel(slider, setting, value, channel) {
        slider.value = (setting === "pan") ? value : value * 127;
        const labelId = setting + "_label_" + ((channel !== 9) ? channel : "drum");
        const label = document.getElementById(labelId);
        
        if (label) {
            label.innerHTML = setting.charAt(0).toUpperCase() + setting.slice(1) + 
                             ": " + value.toFixed(2);
        }
    }

    handleSustainPedal(value, channel) {
        if (value > 0) {
            this.sustain.set(channel, true);
        } else {
            // Only cancel sustained nodes for this specific channel
            for (const [key, node] of this.sustainedNodes.entries()) {
                const [nodeChannel, pitch] = key.split('-').map(Number);
                if (nodeChannel === channel) {
                    node.cancel();
                    this.sustainedNodes.delete(key);
                }
            }
            this.sustain.set(channel, false);
        }
    }

    handleProgramChange(message, channel) {
        const settingsManager = this.app.modules.settingsManager;
        
        Tone.Draw.schedule(() => {
            if (channel === 9) return; // No program change on drum channel
            
            const select = settingsManager.setResettable(channel, "instrumentSelect_" + channel, message[1], "select");
            
            if (select === null || this.isUserSettingOverride(channel, select.id)) {
                console.warn("Program user setting overrides channel:", channel, "value:", message[1]);
                return;
            }
            
            if (select.selectedIndex !== message[1]) {
                select.selectedIndex = message[1];
                select.classList.add("fromFile");
                select.dispatchEvent(new Event('change'));
            }
        }, Tone.now());
    }

    handlePitchBend(message, channel) {
        const pitchBendValue = (message[2] << 7) | message[1];
        const normalizedBend = (pitchBendValue - 8192) / 8192;
        const pitchBendRange = 2;
        const bendInSemitones = normalizedBend * pitchBendRange;
        
        const channelNotes = this.midiNotes.filter(note => note.channel === channel);
        const audioEngine = this.app.modules.audioEngine;
        
        for (const note of channelNotes) {
            audioEngine.handlePitchBend(note, bendInSemitones);
        }
    }

    sendEvent_allNotesOff() {
        // Send all notes off using the audio engine instead of loader
        const audioEngine = this.app.modules.audioEngine;
        
        if (!audioEngine) {
            console.warn('Audio engine not available for allNotesOff');
            return;
        }
        
        // Turn off all currently playing notes
        for (const note of this.midiNotes) {
            audioEngine.handleNoteOff(note.channel, { midi: note.pitch });
        }
        
        // Send MIDI all notes off control change messages for all channels
        for (let channel = 0; channel < 16; channel++) {
            const allNotesOffMessage = [0xB0 + channel, 120, 0]; // CC 120 = All Notes Off
            this.onMidiOutMessage(allNotesOffMessage);
            
            const allSoundOffMessage = [0xB0 + channel, 123, 0]; // CC 123 = All Sound Off
            this.onMidiOutMessage(allSoundOffMessage);
        }
        
        // Clear the midi notes array
        this.clearMidiNotes();
    }

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
    
    addMidiNote(note) {
        this.midiNotes.push(note);
    }

    removeMidiNote(channel, pitch) {
        this.midiNotes = this.midiNotes.filter(note => 
            !(note.channel === channel && note.pitch === pitch)
        );
    }

    getSustainState(channel) {
        return this.sustain.get(channel);
    }

    setSustainedNode(channel, pitch, envelope) {
        const key = `${channel}-${pitch}`;
        this.sustainedNodes.set(key, envelope);
    }

    getSoloChannels() {
        return this.soloChannels;
    }

    clearMidiNotes() {
        this.midiNotes = [];
    }

    // Aliases for compatibility with main.js calls
    

    handleMIDIMessage(message) {
        return this.onMIDIMessage(message);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiManager;
}


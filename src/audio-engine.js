/**
 * Audio Engine Module
 * Handles WebAudioFont integration, instrument loading, and audio processing
 */

class AudioEngine {
    constructor(app) {
        this.app = app;
        this.player = null;
        this.reverb = null;
        this.reverbGain = null;
        this.loadedChannelInstruments = new Map();
        this.availableInstrumentsForProgramChange = new Map();
        this.drumInstrument = null;
        this.availableDrumSoundsForNote = new Map();
        this.loadedChannelControlValues = new Map();
        this._presetPromiseCache = new Map(); // url -> Promise
    }

    async init() {
        // Audio engine will be initialized when audio context is ready
    }

    async setupGMPlayer() {
        const audioContext = this.app.audioContext;
        
        if (typeof WebAudioFontPlayer === 'undefined') {
            console.error('WebAudioFontPlayer is not available!');
            return;
        }
        
        this.player = new WebAudioFontPlayer();

        // Create reverb nodes
        this.reverb = audioContext.createConvolver();
        this.reverbGain = audioContext.createGain();
        this.reverbGain.gain.value = 0.5;
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(audioContext.destination);
    }

    loadDrumSound = (url) => {
            return new Promise((resolve) => {
                const name = '_drum_' + url;
                const domainedUrl = "https://surikov.github.io/webaudiofontdata/sound/128" + url + ".js";
                this.player.loader.startLoad(audioContext, domainedUrl, name);
                resolve(name);
            });
        };

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

    handleNoteOnForChannel(note, velocity, channel) {
        const midiManager = this.app.modules.midiManager;
        const audioContext = this.app.audioContext;

        this.handleNoteOff(channel, note.midi);
        
        if (midiManager.getSoloChannels().size > 0 && !midiManager.getSoloChannels().has(channel)) {
            return;
        }

        let envelope;
        
        if (channel === 9) {
            // Drum channel
            if (!this.drumInstrument || !this.drumInstrument.notes.has(note.midi)) {
                // console.log('Drum instrument not available for note:', note.midi);
                return;
            }
            
            const drumPreset = this.drumInstrument.notes.get(note.midi);
            if (drumPreset === "loading" || drumPreset === undefined || !window[drumPreset]) {
                // console.log('Drum sound is missing or still loading:', note.midi, drumPreset);
                return;
            }
            
            envelope = this.player.queueWaveTable(
                audioContext, 
                this.drumInstrument.gainNode, 
                window[drumPreset],
                audioContext.currentTime, 
                note.midi, 
                9999, 
                velocity
            );
        } else {
            // Regular instrument channel
            const instrument = this.loadedChannelInstruments.get(channel);
            if (!instrument) {
                // console.log('No instrument loaded for channel:', channel);
                return;
            }
            
            if (instrument.preset === "loading" || instrument.preset === undefined) {
                // console.log('Instrument still loading for channel:', channel, 'preset:', instrument.preset);
                return;
            }
            
            // Check if the preset is actually available in the global scope
            const presetData = window[instrument.preset];
            if (!presetData) {
                console.warn('Preset not yet loaded:', instrument.preset, 'for channel:', channel);
                return;
            }
            
            envelope = this.player.queueWaveTable(
                audioContext, 
                instrument.gainNode, 
                presetData,
                audioContext.currentTime, 
                note.midi, 
                9999, 
                velocity
            );
        }

        // Store note for later stopping only if envelope was created
        if (envelope) {
            const midiNote = {
                channel: channel,
                pitch: note.midi,
                envelope: envelope
            };
            
            midiManager.addMidiNote(midiNote);
        }
    }

    handleNoteOff(channel, note) {
        const midiManager = this.app.modules.midiManager;
        let noteRemoved = false;
        
        const filteredNotes = midiManager.midiNotes.filter((midiNote) => {
            if (!noteRemoved && midiNote.pitch === note.midi && midiNote.channel === channel) {
                if (midiNote.envelope) {
                    if (!midiManager.getSustainState(channel)) {
                        midiNote.envelope.cancel();
                    } else {
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

    handlePitchBend(note, semitones) {
        if (note.envelope && note.envelope.audioBufferSourceNode) {
            if (note.envelope.audioBufferSourceNode.detune !== undefined) {
                note.envelope.audioBufferSourceNode.detune.value = semitones * 100;
            } else {
                note.envelope.audioBufferSourceNode.playbackRate.value = Math.pow(2, semitones / 12);
            }
        }
    }

    changeProgramForChannel(event, channel, programNumber) {
        const select = event.target;
        
        // Ensure the program data exists before trying to access it
        if (!this.availableInstrumentsForProgramChange.has(programNumber)) {
            // Load the instrument data first, then try again
            this.loadInstrumentsForProgramChange(channel, programNumber, 0, 'loading...');
            // Retry after a short delay
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
        
        // make sure to set loading state   
        programData.preset = "loading";
        
        // Ensure channel instrument exists
        if (!this.loadedChannelInstruments.has(channel)) {
            this.loadedChannelInstruments.set(channel, this.createChannelInstrumentForChannel(channel, "loading", 0));
        }
        this.loadedChannelInstruments.get(channel).preset = "loading";
        
        // Get the instrument URL
        let instrumentUrl = this.availableInstrumentsForProgramChange.get(programNumber).urls[select.selectedIndex];
        if (instrumentUrl === undefined) {
            instrumentUrl = this.availableInstrumentsForProgramChange.get(programNumber).urls[0];
        }
        
        // Load the preset
        this.loadPreset("https://surikov.github.io/webaudiofontdata/sound/" + instrumentUrl + ".js")
            .then((preset) => {
                this.availableInstrumentsForProgramChange.get(programNumber).preset = preset;
                this.loadedChannelInstruments.get(channel).preset = preset;
                this.loadedChannelInstruments.get(channel).sfIndex = select.selectedIndex;
                
                
                if (!event.target.classList.contains("fromFile")) {
                    // Update settings through the settings manager
                    const settingsManager = this.app.modules.settingsManager;
                    if (settingsManager) {
                        settingsManager.debouncedUpdateUserSettings(event.target.id, event.target.value, channel);
                        settingsManager.showResetButtonIfNeeded(channel);
                    }
                } else {
                    // Remove "fromFile" class
                    event.target.classList.remove("fromFile");
                }
            })
            .catch((error) => console.error('Error loading preset:', error));

        // inject the programchange to the channel part in transport
        const transport = this.app.modules.transport;
        if (transport) {
            transport.setProgramChange(channel, programNumber);
        }
    }

    // Getters for other modules
    getDrumInstrument() {
        return this.drumInstrument;
    }

    getChannelInstrument(channel) {
        return this.loadedChannelInstruments.get(channel);
    }

    getAvailableInstruments() {
        return this.availableInstrumentsForProgramChange;
    }

    getAvailableDrumSounds() {
        return this.availableDrumSoundsForNote;
    }

    getPlayer() {
        return this.player;
    }

    getLoadedChannelControlValues() {
        return this.loadedChannelControlValues;
    }

    setIR(irUrl) {
        const audioContext = this.app.audioContext;
        fetch("IRs/" + irUrl + ".wav")
            .then(response => response.arrayBuffer())
            .then(data => audioContext.decodeAudioData(data))
            .then(buffer => {
                this.reverb.buffer = buffer;
                const reverbSelect = document.getElementById("reverbSelect");
                // Call updateSettings if available
                // if (typeof updateSettings !== 'undefined') {
                    this.app.modules.settingsManager.updateUserSettings("irUrl", reverbSelect.selectedIndex, -1);
                // }

            })
            .catch(error => console.error('Error loading impulse response:', error));
    }

    setReverbGain(value) {
        this.reverbGain.gain.value = value;
        // Call updateSettings if available
        // if (typeof updateSettings !== 'undefined') {
            this.app.modules.settingsManager.updateUserSettings("reverbGain", value, -1);
        // }
        // update the label
        const revLabel = document.querySelector('label[for="reverbVolume"]');
        if (revLabel) {
            revLabel.innerHTML = "Reverb Volume: " + parseFloat(value).toFixed(2);
        }
    }

    loadInstrumentsForProgramChange(channel, programNumber, sfIndex, name) {
        if (!this.availableInstrumentsForProgramChange.has(programNumber)) {
            const links = this.linksForProgramChange(programNumber);
            const instrumentUrl = "https://surikov.github.io/webaudiofontdata/sound/" + links.urls[sfIndex] + ".js";
            const channelInstrument = this.createChannelInstrumentForChannel(channel, "loading", sfIndex);
            
            // Store the channel instrument immediately so it's available for createControlsForChannel
            this.loadedChannelInstruments.set(channel, channelInstrument);
            this.loadedChannelInstruments.get(channel).programNumber = programNumber;
            this.loadedChannelInstruments.get(channel).sfIndex = sfIndex;

            this.loadPreset(instrumentUrl)
                .then((preset) => {
                    this.availableInstrumentsForProgramChange.get(programNumber).preset = preset;
                    channelInstrument.preset = preset;
                    // Update the already stored channel instrument
                    this.loadedChannelInstruments.get(channel).preset = preset;
                    
                    // Create controls for the channel
                    this.app.modules.settingsManager.createControlsForChannel(channel, programNumber, sfIndex, name);
                    this.cleanCashed();
                })
                .catch((error) => {
                    console.error('Error loading preset:', error);
                });
        } else {
            if (this.availableInstrumentsForProgramChange.get(programNumber).preset === "loading") {
                setTimeout(() => {
                    this.loadInstrumentsForProgramChange(channel, programNumber, sfIndex, name);
                }, 300);
                return;
            } else {
                this.loadedChannelInstruments.set(channel, this.createChannelInstrumentForChannel(channel, this.availableInstrumentsForProgramChange.get(programNumber).preset, sfIndex));
                this.loadedChannelInstruments.get(channel).programNumber = programNumber;
                
                this.app.modules.settingsManager.createControlsForChannel(channel, programNumber, sfIndex, name);
                this.cleanCashed();
            }
        }
    }

    loadDrumSoundForNote(note, sfIndex, callerId, overriddenNote) {
        const availableDrumSoundsForNote = this.availableDrumSoundsForNote;
        
        if (!availableDrumSoundsForNote.has(note)) {
            const links = this.linksForDrumSound(note);
            const drumSoundUrl = links.urls[sfIndex];
            this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, "loading");
            
            if (drumSoundUrl != undefined) {
                this.loadDrumSound(drumSoundUrl)
                    .then((preset) => {
                        availableDrumSoundsForNote.get(note).preset = preset;
                        this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, preset);
                        
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
            if (availableDrumSoundsForNote.get((overriddenNote) ? overriddenNote : note).preset === "loading") {
                setTimeout(() => {
                    this.loadDrumSoundForNote(note, sfIndex, callerId, overriddenNote);
                }, 300);
                return;
            } else {
                this.addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, availableDrumSoundsForNote.get(note).preset);
                // if (typeof cleanCashed !== 'undefined') {
                this.cleanCashed();
                // }
            }
        }
    }

    addNoteToDrumInstrument(note, preset) {
        const audioContext = this.app.audioContext;

        if (!this.drumInstrument) {
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;
            const panNode = audioContext.createStereoPanner();
            panNode.pan.value = 0;
            gainNode.connect(panNode);
            panNode.connect(audioContext.destination);
            this.drumInstrument = { 
                notes: new Map(), 
                overriddenNotes: new Map(), 
                gainNode: gainNode, 
                panNode: panNode 
            };
            
            const resetSetting = this.app.fileSettings[9] || {};
            resetSetting["volumeSlider_drum"] = 127.0;
            resetSetting["panSlider_drum"] = 0.0;
            this.app.fileSettings[9] = resetSetting;
        }
        this.drumInstrument.notes.set(note, preset);
    }

    linksForProgramChange(i) {
        if (i === undefined) {
            console.error('linksForProgramChange called with undefined index');
        }
        let filter = "";
        if (i < 10) {
            filter = "00" + i;
        } else if (i < 100) {
            filter = "0" + i;
        } else {
            filter = i.toString();
        }
        
        const nn = this.player.loader.findInstrument(i);
        const instrumentData = { 
            name: this.player.loader.instrumentInfo(nn).title, 
            urls: this.player.loader.instrumentKeys().filter(url => url.startsWith(filter)), 
            preset: "loading" 
        };
        
        this.availableInstrumentsForProgramChange.set(i, instrumentData);
        
        // Also populate global availableInstrumentsForProgramChange for legacy compatibility
        if (typeof window !== 'undefined' && typeof availableInstrumentsForProgramChange !== 'undefined') {
            availableInstrumentsForProgramChange.set(i, instrumentData);
        }
        
        return this.availableInstrumentsForProgramChange.get(i);
    }

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

    createChannelInstrumentForChannel(channel, preset, sfIndex) {
        if (this.loadedChannelInstruments.has(channel)) {
            this.loadedChannelInstruments.get(channel).preset = preset;
            this.loadedChannelInstruments.get(channel).sfIndex = sfIndex;
            return this.loadedChannelInstruments.get(channel);
        }

        const audioContext = this.app.audioContext;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        const panNode = audioContext.createStereoPanner();
        panNode.pan.value = 0;
        gainNode.connect(panNode);
        panNode.connect(audioContext.destination);
        
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

    createReverbSendGainNode() {
        const audioContext = this.app.audioContext;
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.7;
        gainNode.connect(this.reverb);
        return gainNode;
    }

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

    cleanup() {
        this.app.state.userSettings = { "channels": {} };
        this.app.fileSettings = {};
        // this.app.state.negRoot = null;
        this.app.state.reversedPlayback = false;
        
        // First clean cached instruments
        this.cleanCashed();
        
        // Clear all Maps
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
        
        // Clear cached instruments if player exists
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
        
        // Reset UI fields
        const midiFileName = document.getElementById("midiFileName");
        if (midiFileName) {
            midiFileName.innerHTML = "";
        }
        
        const midiUrl = document.getElementById("midiUrl");
        if (midiUrl) {
            midiUrl.value = "";
        }
        
        // Reset reverse checkbox
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

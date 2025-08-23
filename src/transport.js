/**
 * Transport Module
 * Handles play/pause/stop functionality, progress tracking, and speed control
 */

class Transport {
    constructor(app) {
        this.app = app;
        this.playing = false;
        this.parts = [];
        this.progressSlider = null;
        this.forceUpdateChannel = false; // Flag to force update channel ranges
        this.originalMidi = null;
    }

    async init() {
        this.progressSlider = document.getElementById('progress-input');
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Play/Stop button
        const playButton = document.getElementById('playMidi');
        if (playButton) {
            playButton.addEventListener('click', () => this.togglePlayback());
        }

        // Speed control
        const speedControl = document.getElementById('speedControl');
        if (speedControl) {
            speedControl.addEventListener('input', (event) => this.handleSpeedChange(event));
        }

        this.setupTransportControls();
    }

    setupTransportControls() {
    // Reverse MIDI checkbox
        document.getElementById('reverseMidi').addEventListener('click', (event) => {
            const state = this.app.state;
            if (state.reversedPlayback === event.target.checked) {
                return;
            }
            state.reversedPlayback = event.target.checked;
            const position = this.app.track_duration / state.speed - Tone.Transport.seconds;
            Tone.Transport.seconds = position;
            
            const settingsManager = this.app.modules.settingsManager;
            if (settingsManager) {
                settingsManager.updateUserSettings("reversedPlayback", state.reversedPlayback, -1);
            }
            
            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                if (midiManager) {
                    midiManager.sendEvent_allNotesOff();
                }
            }, 300);
        });

        // Progress slider
        this.setupProgressSlider();
        
    }

    setupProgressSlider() {
        const progressSlider = document.getElementById('progress-input');
        if (!progressSlider) return;
        const state = this.app.state;

        progressSlider.oninput = (event) => {
            const state = this.app.state;
            const position = (event.target.value / 100) * (this.app.track_duration / state.speed);
            Tone.Transport.seconds = state.reversedPlayback ? 
                (this.app.track_duration / state.speed) - position : position;

            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                if (midiManager) {
                    midiManager.sendEvent_allNotesOff();
                }
            }, 300);
        };
    }

    togglePlayback() {
        const state = this.app.state;
        const playBtn = document.getElementById('playMidi');

        if (!this.playing) {
            if (this.app.midiFileRead) {
                this.startPlayback(playBtn);
            } else {
                Utils.showError("Please upload a MIDI file or paste a URL first");
            }
        } else {
            this.stopPlayback(playBtn);
        }
    }

    startPlayback(playBtn) {
        playBtn.innerText = "Stop Playback";
        this.playing = true;
        Tone.Transport.position = 0;
        Tone.Transport.start();
        
        if (this.progressSlider) {
            this.progressSlider.style.display = "block";
            const state = this.app.state;
            // Update the progress slider during playback
            Tone.Transport._scheduledRepeatId = Tone.Transport.scheduleRepeat((time) => {
                const position = Tone.Transport.seconds;
                const progress = ((state.reversedPlayback ? (this.app.track_duration / state.speed) - position : position) / (this.app.track_duration / state.speed)) * 100;
                this.progressSlider.value = progress;
                // console.log("POSITION (seconds):", Tone.Transport.seconds, " / ", track_duration / speed, Tone.Transport.position, "PROGRESS:", progress);

                if ((!state.reversedPlayback && progress >= 100) || (state.reversedPlayback && progress <= 0)) {
                    // console.log("Stopping playback...");
                    playBtn.innerText = "Play MIDI";
                    setTimeout(() => {
                        this.playing = false;
                        Tone.Transport.stop(time);
                        Tone.Transport.position = 0;
                        this.progressSlider.value = 0;
                    }, 200);
                    this.progressSlider.style.display = "none";
                    this.app.modules.midiManager.sendEvent_allNotesOff();
                }
            }, "4n");
        }
    }

    stopPlayback(playBtn) {
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        playBtn.innerText = "Play MIDI";
        
        if (this.progressSlider) {
            this.progressSlider.value = 0;
            this.progressSlider.style.display = "none";
        }

        // Clear any existing scheduled repeat events
        if (Tone.Transport._scheduledRepeatId) {
            Tone.Transport.clear(Tone.Transport._scheduledRepeatId);
        }

        //send all notes off after 0.5 seconds to ensure all notes are released
        setTimeout(() => {
            this.app.modules.midiManager.sendEvent_allNotesOff();
            // send sustain pedal off
            this.app.modules.midiManager.sendEvent_sustainPedalOff();
        }, 500);
        
        this.playing = false;
    }

    setSpeed(value) {
        const state = this.app.state;
        const wasPlaying = this.playing;
        const currentPosition = Tone.Transport.seconds;
        
        // Stop transport and clear all scheduled events if playing
        if (wasPlaying) {
            Tone.Transport.stop();
            Tone.Transport.cancel(); // Clear ALL scheduled events
            
            // Send immediate all notes off
            const midiManager = this.app.modules.midiManager;
            midiManager.sendEvent_allNotesOff();
            midiManager.sendEvent_sustainPedalOff();
        }
        
        state.speed = parseFloat(value);
        Tone.Transport.bpm.value = (this.app.bpm * state.speed).toFixed(2);

        // Update UI
        const label = document.querySelector('label[for="speedControl"]');
        if (label) {
            label.textContent = "Playback Speed: " + (this.app.bpm * state.speed).toFixed(2) + " BPM";
        }

        const speedSlider = document.getElementById("speedControl");
        if (speedSlider) {
            speedSlider.value = state.speed;
        }
        
        const resetBtn = document.getElementById("resetSpeed");
        if (resetBtn) {
            resetBtn.style.display = (state.speed === 1.0) ? "none" : "block";
        }

        // If was playing, restart from adjusted position
        if (wasPlaying) {
            // Restart parts with new timing
            this.parts.forEach(part => {
                part.stop();
                part.start(0.1);
            });
            
            // Set position and restart transport
            setTimeout(() => {
                // Adjust position for new speed
                const adjustedPosition = currentPosition;
                Tone.Transport.seconds = adjustedPosition;
                Tone.Transport.start();
            }, 100);
        } else {
            // Just send notes off if not playing
            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                midiManager.sendEvent_allNotesOff();
                midiManager.sendEvent_sustainPedalOff();
            }, 100);
        }

        this.app.modules.settingsManager.updateUserSettings("speed", state.speed, -1);
    }

    handleSpeedChange(event) {
        this.setSpeed(parseFloat(event.target.value));
    }

    preclean() {
        const state = this.app.state;
        
        if (this.playing) {
            Tone.Transport.stop();
            this.playing = false;
            state.reversedPlayback = false;
            
            // Update UI elements
            const reverseMidiCheckbox = document.getElementById("reverseMidi");
            if (reverseMidiCheckbox) {
                reverseMidiCheckbox.checked = false;
            }
            
            const playButton = document.getElementById('playMidi');
            if (playButton) {
                playButton.innerText = "Play MIDI";
            }
            
            if (this.progressSlider) {
                this.progressSlider.value = 0;
                this.progressSlider.style.display = "none";
            }
            
            // Clear transport state
            Tone.Transport.cancel();
            Tone.Transport.position = 0;
            Tone.Transport.seconds = 0;
            
            // Send all notes off
            const midiManager = this.app.modules.midiManager;
            if (midiManager) {
                midiManager.sendEvent_allNotesOff();
            } else {
                console.warn('No MIDI manager available to send all notes off');
            }
            document.getElementById("hiddenShareButton").style.display = "none";
            const shares = document.getElementById("st-1")
            if (shares) {
                shares.style.display = "none";
            }
        }
        
        // Make play button unresponsive
        Utils.setPlayButtonActive(false);
        
        // Clean up if MIDI file was read
        if (this.app.midiFileRead) {
            // Use audio engine cleanup if available
            this.app.modules.audioEngine.cleanup();
        }
    }

    fireMidiEvent(event, time) {
        const state = this.app.state;
        
        if (event.reversed !== state.reversedPlayback) {
            return;
        }
        
        switch (event.type) {
            case 'note':
                this.handleMidiMessage({
                    data: [0x90 + event.channel, event.midi, event.velocity]
                });
                
                const noteOffTime = Tone.Transport.seconds + event.duration / state.speed;
                Tone.Transport.schedule((releaseTime) => {
                    this.handleMidiMessage({
                        data: [0x80 + event.channel, event.midi, 0]
                    });
                }, noteOffTime);
                break;
                
            case 'controlChange':
                this.handleMidiMessage({
                    data: [0xB0 + event.channel, event.number, Math.floor(event.value * 127)]
                });
                break;
                
            case 'programChange':
                this.handleMidiMessage({
                    data: [0xC0 + event.channel, event.number]
                });
                break;
                
            case 'pitchBend':
                this.handleMidiMessage({
                    data: [0xE0 + event.channel, event.value & 0x7F, event.value >> 7]
                });
                break;
                
            case 'tempo':
                Tone.Draw.schedule((time) => {
                    const label = document.querySelector('label[for="speedControl"]');
                    if (label) {
                        label.textContent = "Playback Speed: " + (this.app.bpm * state.speed).toFixed(2) + " BPM";
                    }
                }, Tone.now());
                break;
        }
    }

    handleMidiMessage(message) {
        // Delegate to MIDI manager if available
        const midiManager = this.app.modules.midiManager;
        if (midiManager) {
            midiManager.handleMIDIMessage(message);
        } else {
            console.warn('No MIDI message handler available');
        }
    }

    scheduleMIDIEvents(midi) {
        console.log('Scheduling MIDI events:', midi);
        this.originalMidi = midi;

        // Clear any previous scheduled parts
        this.parts.forEach(part => part.dispose());
        this.parts = [];

        // RESET Transport completely
        Tone.Transport.stop();
        Tone.Transport.cancel(); // Cancel all scheduled events
        Tone.Transport.position = 0;
        Tone.Transport.seconds = 0;
        
        const state = this.app.state;
        const loadTime = Tone.now() + 0.1;

        // Get player from audio engine instead of global
        const audioEngine = this.app.modules.audioEngine;
        const player = audioEngine?.getPlayer();


        let channelNoteRanges = new Map(); // Track note ranges per channel
        
        if (!player) {
            console.error('scheduleMIDIEvents: No player available from audio engine');
            return;
        }

        // Create a part for each channel
        const channelParts = {};

        // Schedule tempos from header
        if (Array.isArray(midi.header.tempos)) {
            midi.header.tempos.forEach(tempo => {
                if (!channelParts[0]) {
                    channelParts[0] = new Tone.Part();
                }
                channelParts[0].add(tempo.time, {
                    type: 'tempo',
                    bpm: tempo.bpm,
                    reversed: false
                });
                channelParts[0].add(this.app.track_duration - tempo.time, {
                    type: 'tempo',
                    bpm: tempo.bpm,
                    reversed: true
                });
            });
        }

        // Set timeSignature
        if (midi.header.timeSignatures.length > 0) {
            const timeSignature = midi.header.timeSignatures[0];
            Tone.Transport.timeSignature = timeSignature.timeSignature;
        }

        let lastPC = 0;
        
        // Get the loadedChannelControlValues from audio engine
        const loadedChannelControlValues = audioEngine?.getLoadedChannelControlValues() || new Map();

        // Loop through each track in the MIDI file
        midi.tracks.forEach((track, trackIndex) => {
            // exclude empty tracks
            if (track.notes.length === 0 && Object.keys(track.controlChanges).length === 0 && track.pitchBends.length === 0) {
                return;
            }

            const channel = track.channel;
            if (!channelParts[channel]) {
                channelParts[channel] = new Tone.Part();
            }

            // Schedule note events
            track.notes.forEach(note => {
                const velocity = (channel === 9) ? Math.floor(note.velocity * 127) : Math.floor(Math.pow(note.velocity, 2) * 127);
                const transformedMidi = (channel === 9) ? note.midi : this.app.transformNote(note.midi, channel);
                const noteEvent = {
                    type: 'note',
                    midi: transformedMidi,
                    originalMidi: note.midi,
                    duration: note.duration,
                    velocity: velocity,
                    channel: channel,
                    reversed: false
                };
                channelParts[channel].add(note.time, noteEvent);
                const reversedNoteEvent = {
                    ...noteEvent,
                    reversed: true
                };
                const note_length = (note.duration <= Tone.Time("4n").toSeconds()) ? note.time : (note.time + ((channel != 9) ? note.duration : 0));
                const revTime = this.app.track_duration - note_length;
                channelParts[channel].add(revTime, reversedNoteEvent);
            });

            // Schedule control change events
            Object.values(track.controlChanges).forEach(controlChange => {
                let nextCCtime = 0;
                controlChange.forEach(cc => {
                    // add the first to loadedChannelControlValues
                    if (!loadedChannelControlValues.has(channel)) {
                        loadedChannelControlValues.set(channel, new Map());
                    }
                    if (!loadedChannelControlValues.get(channel).has(cc.number)) {
                        loadedChannelControlValues.get(channel).set(cc.number, cc.value);
                    }
                    channelParts[channel].add(cc.time, {
                        type: 'controlChange',
                        number: cc.number,
                        value: cc.value,
                        channel: channel,
                        reversed: false
                    });
                    channelParts[channel].add(this.app.track_duration - nextCCtime, {
                        type: 'controlChange',
                        number: cc.number,
                        value: cc.value,
                        channel: channel,
                        reversed: true
                    });
                    nextCCtime = cc.time;
                });
            });

            // Schedule program change events
            if (track.instrument !== undefined) {
                const programChange = track.instrument["number"] || lastPC;
                lastPC = programChange;
                if (channel != 9 && channel >= 0) {
                    // preload the instruments for the program change and setup mixer channels
                    const audioEngine = app?.modules.audioEngine;
                    audioEngine?.loadInstrumentsForProgramChange(channel, programChange, 0, track.name);
                }
                const programChangeTime = track.notes.length > 0 ? track.notes[0].time : 0;
                channelParts[channel].add(programChangeTime, {
                    type: 'programChange',
                    number: track.instrument.number,
                    channel: channel,
                    reversed: false
                });
                channelParts[channel].add(this.app.track_duration - programChangeTime, {
                    type: 'programChange',
                    number: track.instrument.number,
                    channel: channel,
                    reversed: true
                });
                if (channel === 9) {
                    track.notes.forEach(note => {
                        const audioEngine = this.app.modules.audioEngine;
                        const drumSoundsMap = audioEngine?.getAvailableDrumSounds() || new Map();
                        
                        if (!drumSoundsMap.has(note.midi)) {
                            // preload the drum sounds for each used note
                            if (audioEngine) {
                                audioEngine.loadDrumSoundForNote(note.midi, 0);
                            } else {
                                console.warn(`No audio engine available to preload drum sound for note ${note.midi}`);
                            }
                        }
                    });
                }
            }

            // Schedule pitch bend events
            if (track.pitchBends.length > 0) {
                track.pitchBends.forEach(bend => {
                    const originalValue = bend.value;
                    let transformedValue = originalValue;
                    
                    // Apply pitch bend transformation based on mode
                    const state = this.app.state;
                    if (state.mode !== 0) { // If not in normal mode (negative harmony or left hand piano)
                        const normal = this.app.normal;
                        const factor = (!normal) ? -1 : 1;
                        transformedValue = originalValue * factor;
                    }
                    
                    channelParts[channel].add(bend.time, {
                        type: 'pitchBend',
                        value: (transformedValue + 1) * 8192,
                        originalValue: originalValue, // Store original for re-transformation
                        channel: channel,
                        reversed: false
                    });
                    channelParts[channel].add(this.app.track_duration - bend.time, {
                        type: 'pitchBend',
                        value: (transformedValue + 1) * 8192,
                        originalValue: originalValue,
                        channel: channel,
                        reversed: true
                    });
                });
            }

            // Store notes from all channels to track ranges
            if (track.notes.length > 0 && channel != 9) {
                // Initialize channel tracking if not exists
                if (!channelNoteRanges.has(channel)) {
                    channelNoteRanges.set(channel, {
                        lowest: Infinity,
                        highest: -Infinity,
                        lastNotes: []
                    });
                }
                
                const channelData = channelNoteRanges.get(channel);
                const lastNote = track.notes[track.notes.length - 1];
                
                // Track all notes in this track for range calculation
                track.notes.forEach(note => {
                    channelData.lowest = Math.min(channelData.lowest, note.midi);
                    channelData.highest = Math.max(channelData.highest, note.midi);
                });
                
                // Handle last notes for key detection (only if negRoot is null)
                if (state.negRoot === null) {
                    if (channelData.lastNotes.length && lastNote.time > channelData.lastNotes[channelData.lastNotes.length - 1].time) {
                        // clear the array if the last note is played later than the last note in the array
                        channelData.lastNotes = [];
                    }
                    if (!channelData.lastNotes.some(note => note.midi === lastNote.midi)) {
                        channelData.lastNotes.push(lastNote);
                    }
                }
            }
            //end of looping trackchannels
        });

        // Store note ranges in the channel parts
        Object.entries(channelParts).forEach(([channel, part]) => {
            const channelNum = parseInt(channel);
            // console.warn(`Storing note range for channel ${channel}:`, channelNoteRanges.get(channelNum));
            if (channelNoteRanges.has(channelNum)) {
                const rangeData = channelNoteRanges.get(channelNum);
                part.noteRange = {
                    lowest: rangeData.lowest,
                    highest: rangeData.highest
                };
                part.channel = channelNum < 9 ? channelNum : channelNum - 1; // Store channel number in part, excluding drums channel
            }
            else {
                console.warn(`No note range data for channel ${channelNum}!`); // should never happen... Haha
                this.forceUpdateChannel = true; // Set flag to force update channel ranges later
            }
        });

        // Key detection logic
        // Collect all last notes from all channels
        let allLastNotes = [];
        channelNoteRanges.forEach((channelData) => {
            allLastNotes = allLastNotes.concat(channelData.lastNotes);
        });
        
        if (allLastNotes.length > 0) {
            // get the lowest note across all channels
            const lowestNote = Math.min(...allLastNotes.map(note => note.midi));
            // set root input to the lowest note
            const negRootSelect = document.getElementById("parameter_negRoot");
            if (state.negRoot === null) {
            // find the options value that matches the lowest note
            for (const option of negRootSelect.options) {
                if (parseInt(option.value - 3) % 12 === lowestNote % 12) {
                    state.negRoot = parseInt(option.value + 3); //backwards compatibility: this is haunting you...
                    negRootSelect.selectedIndex = option.index;
                    negRootSelect.dispatchEvent(new Event('change'));
                    break;
                }
            }
            }
        }

        // Start all parts
        Object.values(channelParts).forEach(part => {
            part.callback = (time, event) => {
                this.fireMidiEvent(event, time);
            };
            part.start(0.1);
            this.parts.push(part);
        });
    }

    setProgramChange(channel, programNumber) {
        // Convert channel to number to ensure proper comparison
        const channelNum = parseInt(channel);
        const part = this.parts.find(p => p.channel === channelNum);
        if (part) {
        
            // Get the events array from the part
            const events = part._events;
            let programChangeEvent = null;
            
            // Search through the events to delete all program change events
            for (let i = 0; i < events.length; i++) {
                // Find all program change events
                const event = events.get(i);
                if (event && event.value && event.value.type === 'programChange') {
                    event.original = { number: event.value.number };
                    events.number = programNumber; // Update to new program number
                    i--; // Decrement i to account for the removed event
                }
            }
        }
    }

    setControlChange(channel, number, value) {
        
        // Convert channel to number to ensure proper comparison
        const channelNum = parseInt(channel);
        const part = this.parts.find(p => p.channel === channelNum);
        
        if (part) {
            // Get the events array from the part
            const events = part._events;

            // loop through the events to find all control change with the same number to delete it
            for (let i = 0; i < events.length; i++) {
                const event = events.get(i);
                if (event && event.value && event.value.type === 'controlChange' && event.value.number === parseInt(number)) {
                    event.original = { number: event.value.number, value: event.value.value };
                    events.value.number = parseInt(number);
                    events.value.value = parseInt(value);
                    i--; // Decrement i to account for the removed event
                }
            }
        } else {
            console.warn("No part found for channel:", channelNum);
        }
    }

    restoreOriginalValuesForChannel(channel) {
        const channelNum = parseInt(channel);
        const part = this.parts.find(p => p.channel === channelNum);
        if (part) {
            const events = part._events;
            for (let i = 0; i < events.length; i++) {
                const event = events.get(i);
                if (event && event.original && event.value.number) {
                    event.value.number = event.original.number;
                    console.log("Restored original number for event:", event);
                }
                if (event && event.original && event.value.value) {
                    event.value.value = event.original.value;
                    console.log("Restored original value for event:", event);
                }
            }
        }
    }

    updateChannels() {
        this.parts.forEach(part => {
            // console.log("Updating part:", part, "with channel:", part.channel);
            if (part._events) {
                part._events.forEach(event => {
                    // Update notes
                    // Check if this is a note event and not channel 9 (drums)
                    if (event.value && event.value.type === 'note' && event.value.channel !== 9) {
                        // console.log("Updating channel:", event.value.channel, "original note:", event.value.midi);
                        // Transform the note using the current app settings
                        const transformedNote = this.app.transformNote(event.value.originalMidi, part.channel);
                        event.value.midi = transformedNote;
                        // console.log("Transformed to:", event.value.midi);
                    }
                    
                    // Update pitch bend events
                    if (event.value && event.value.type === 'pitchBend') {
                        const state = this.app.state;
                        let transformedValue = event.value.originalValue;
                        
                        if (state.mode !== 0) { // If not in normal mode
                            const normal = this.app.normal;
                            const factor = (!normal) ? -1 : 1;
                            transformedValue = event.value.originalValue * factor;
                        }
                        else {
                            transformedValue = event.value.originalValue;
                        }

                        event.value.value = (transformedValue + 1) * 8192;
                    }
                });
            }
        });
    }

    cleanup() {
        if (this.playing) {
            this.stopPlayback(document.getElementById('playMidi'));
        }
        
        this.parts.forEach(part => part.dispose());
        this.parts = [];
    }

    downloadCurrentMidi() {
    try {
        if (!this.originalMidi) {
            alert('No original MIDI data available for export');
            return;
        }

        console.log('Creating new MIDI file from original with updated data:', this.app.state.userSettings);

        // Create a new empty MIDI file
        const midi = new Midi();
        
        console.log('Adding tracks with current transformations...');
        
        // Process each track from the original MIDI
        this.originalMidi.tracks.forEach((originalTrack, trackIndex) => {
            const channel = originalTrack.channel;
            
            // Create a new track
            const track = midi.addTrack();
            track.name = originalTrack.name || `Track ${trackIndex}`;
            track.channel = channel;
            
            // Add notes with current transformations
            originalTrack.notes.forEach(note => {
                let transformedMidi = note.midi;
                if (channel !== 9) { // Skip drums channel
                    transformedMidi = this.app.transformNote(note.midi, channel);
                }
                
                track.addNote({
                    midi: transformedMidi,
                    time: note.time,
                    duration: note.duration,
                    velocity: note.velocity
                });
            });
            
            // Add control changes using current user settings
            if (originalTrack.controlChanges) {
                const trackSettings = this.app.state.userSettings["channels"][channel];
                let volSet = false;
                let revSet = false;
                let panSet = false;
                const volSliderId = "volumeSlider_" + channel;
                const panSliderId = "panSlider_" + channel;
                const reverbSliderId = "reverbSlider_" + channel;

                Object.entries(originalTrack.controlChanges).forEach(([ccNumber, ccEvents]) => {
                    ccEvents.forEach(cc => {
                        let currentValue = cc.value * 127;

                        // Use current track setting value if available
                        if (trackSettings !== undefined) {
                            if (ccNumber == 7 && trackSettings[volSliderId] !== undefined) {
                                currentValue = parseInt(trackSettings[volSliderId]);
                                console.log('Using volume slider value:', currentValue);
                                volSet = true;
                            }
                            else if (ccNumber == 10 && trackSettings[panSliderId] !== undefined) {
                                currentValue = parseInt(trackSettings[panSliderId]) * 127;
                                console.log('Using pan slider value:', currentValue);
                                panSet = true;
                            }
                            else if (ccNumber == 91 && trackSettings[reverbSliderId] !== undefined) {
                                currentValue = parseInt(trackSettings[reverbSliderId]) * 127;
                                console.log('Using reverb slider value:', currentValue);
                                revSet = true;
                            }
                        }
                        console.log("Handling CC:", ccNumber, "Value:", currentValue, trackSettings);
                        
                        track.addCC({
                            number: parseInt(ccNumber),
                            value: currentValue,
                            time: cc.time
                        });
                    });
                });


                if (!volSet && trackSettings !== undefined && trackSettings[volSliderId] !== undefined) {
                    track.addCC({
                        number: 7,
                        value: parseInt(trackSettings[volSliderId]),
                        time: 0
                    });
                    console.log("added missing volume CC:", parseInt(trackSettings[volSliderId]) * 127);
                }
                if (!panSet && trackSettings !== undefined && trackSettings[panSliderId] !== undefined) {
                    track.addCC({
                        number: 10,
                        value: parseInt(trackSettings[panSliderId]) * 127,
                        time: 0
                    });
                    console.log("added missing pan CC:", parseInt(trackSettings[panSliderId]) * 127);
                }
                if (!revSet && trackSettings !== undefined && trackSettings[reverbSliderId] !== undefined) {
                    track.addCC({
                        number: 91,
                        value: parseInt(trackSettings[reverbSliderId]) * 127,
                        time: 0
                    });
                    console.log("added missing reverb CC:", parseInt(trackSettings[reverbSliderId]) * 127);
                }
            }
            
            // Add pitch bends with transformations
            if (originalTrack.pitchBends && originalTrack.pitchBends.length > 0) {
                originalTrack.pitchBends.forEach(bend => {
                    const state = this.app.state;
                    let transformedValue = bend.value;
                    
                    // Apply pitch bend transformation based on current mode
                    if (state.mode !== 0) { // If not in normal mode
                        const normal = this.app.normal;
                        const factor = (!normal) ? -1 : 1;
                        // Convert from MIDI pitch bend range back to normalized range
                        const normalizedValue = (bend.value / 8192) - 1;
                        transformedValue = (normalizedValue * factor + 1) * 8192;
                    }
                    
                    track.addPitchBend({
                        value: transformedValue,
                        time: bend.time
                    });
                });
            }
            
            // Set instrument using current user settings
            let programNumber = originalTrack.instrument?.number;
            const userSettings = this.app.state.userSettings;
            
            // Use current program change setting if available
            const upId = "instrumentSelect_" + channel;
            if (userSettings && userSettings.channels && userSettings.channels[channel] && userSettings.channels[channel][upId] !== undefined) {
                programNumber = parseInt(userSettings.channels[channel][upId]);
                console.log('Using instrument select value:', programNumber);
            } else {
                console.log("no instrument select setting found:", upId, userSettings);
            }
            
            if (programNumber !== undefined) {
                track.instrument = {
                    number: programNumber
                };
            }
            
            console.log(`Added track ${trackIndex} (channel ${channel}) with ${originalTrack.notes.length} notes`);
        });
        
        // Update tempo if speed has changed
        const state = this.app.state;
        if (state.speed !== 1.0) {
            // Apply speed to existing tempos
            midi.header.tempos.forEach(tempo => {
                tempo.bpm = tempo.bpm * state.speed;
            });
            console.log(`Updated tempo by speed factor: ${state.speed}`);
        }
        
        console.log('Exporting MIDI file...');
        const arrayBuffer = midi.toArray();
        const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'negative_harmony.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('MIDI file exported successfully');
        
    } catch (error) {
        console.error('Error creating MIDI file:', error);
        console.error('Error stack:', error.stack);
        alert('Failed to create MIDI file. Please check the console for details.');
    }
}
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Transport;
}

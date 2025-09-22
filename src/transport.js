/**
 * Transport Module
 * Handles MIDI playback control, timing, speed adjustment, and score synchronization.
 * Manages Tone.js transport integration and MIDI event scheduling.
 */

/**
 * Manages MIDI playback transport, including play/pause/stop, progress tracking, 
 * speed control, and real-time score following synchronization
 * @class Transport
 */
class Transport {
    /**
     * Creates an instance of Transport
     * @param {Object} app - Reference to the main application instance
     */
    constructor(app) {
        this.app = app;
        /** @type {boolean} Whether playback is currently active */
        this.playing = false;
        /** @type {Array} Array of Tone.Part instances for scheduled MIDI events */
        this.parts = [];
        /** @type {HTMLElement|null} Progress slider element for playback position */
        this.progressSlider = null;
        /** @type {boolean} Flag to force channel range updates after MIDI loading */
        this.forceUpdateChannel = false;
        /** @type {Object|null} Original MIDI data before transformations */
        this.originalMidi = null;
    }

    /**
     * Initialize the transport module and set up event listeners
     * @async
     */
    async init() {
        this.progressSlider = document.getElementById('progress-input');
        this.setupEventListeners();
    }

    /**
     * Sets up event listeners for transport controls
     */
    setupEventListeners() {
        // Play/Stop button
        const playButton = document.getElementById('playMidi');
        if (playButton) {
            playButton.addEventListener('click', () => this.togglePlayback());
        }

        // Speed control slider
        const speedControl = document.getElementById('speedControl');
        if (speedControl) {
            speedControl.addEventListener('input', (event) => this.handleSpeedChange(event));
        }

        this.setupTransportControls();
    }

    /**
     * Sets up additional transport controls (reverse, progress slider)
     */
    setupTransportControls() {
        // Reverse MIDI checkbox - handles reversed playback mode
        document.getElementById('reverseMidi').addEventListener('click', (event) => {
            const state = this.app.state;
            if (state.reversedPlayback === event.target.checked) {
                return;
            }
            state.reversedPlayback = event.target.checked;
            // Adjust playback position for reverse mode
            const position = this.app.track_duration / state.speed - Tone.Transport.seconds;
            Tone.Transport.seconds = position;
            
            const settingsManager = this.app.modules.settingsManager;
            if (settingsManager) {
                settingsManager.updateUserSettings("reversedPlayback", state.reversedPlayback, -1);
            }
            
            // Update score and stop all notes after mode change
            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                if (midiManager) {
                    midiManager.sendEvent_allNotesOff();
                    const scoreManager = this.app.modules.scoreManager;
                    if (scoreManager) {
                        const updatedMidiData = this.createCurrentMidi();
                        scoreManager.generateABCStringfromMIDI(updatedMidiData);
                        scoreManager.updateScoreFollower('score', scoreManager.currentBarStart, true);
                    }
                }
            }, 300);
        });

        // Progress slider for manual seek
        this.setupProgressSlider();
    }

    /**
     * Sets up the progress slider for manual playback position control
     */
    setupProgressSlider() {
        const progressSlider = document.getElementById('progress-input');
        if (!progressSlider) return;

        progressSlider.oninput = (event) => {
            const state = this.app.state;
            const position = (event.target.value / 100) * (this.app.track_duration / state.speed);
            // Handle reversed playback positioning
            Tone.Transport.seconds = state.reversedPlayback ? 
                (this.app.track_duration / state.speed) - position : position;

            // Stop all notes after seeking to prevent hanging notes
            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                if (midiManager) {
                    midiManager.sendEvent_allNotesOff();
                }
            }, 300);
        };
    }

    /**
     * Toggles between play and stop states
     */
    togglePlayback() {
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

    /**
     * Starts MIDI playback and initializes score following if needed
     * @param {HTMLElement} playBtn - The play button element to update
     */
    startPlayback(playBtn) {
        playBtn.innerText = "Stop Playback";
        this.playing = true;
        Tone.Transport.position = 0;
        
        // Notify score manager BEFORE starting transport for proper synchronization
        const scoreManager = this.app.modules.scoreManager;
        if (scoreManager && scoreManager.scoreShown) {
            // Start polling for score following immediately
            scoreManager.currentBarStart = 0;
            scoreManager.startScoreFollowing('score', 0);
        }
        
        // Start transport after score manager is ready
        Tone.Transport.start();
        
        // Set up progress tracking and auto-stop detection
        if (this.progressSlider) {
            this.progressSlider.style.display = "block";
            const state = this.app.state;
            
            // Schedule regular progress updates during playback
            Tone.Transport._scheduledRepeatId = Tone.Transport.scheduleRepeat((time) => {
                const position = Tone.Transport.seconds;
                const progress = ((state.reversedPlayback ? 
                    (this.app.track_duration / state.speed) - position : position) / 
                    (this.app.track_duration / state.speed)) * 100;
                this.progressSlider.value = progress;

                // Auto-stop at end of track
                if ((!state.reversedPlayback && progress >= 100) || 
                    (state.reversedPlayback && progress <= 0)) {
                    playBtn.innerText = "Play MIDI";
                    setTimeout(() => {
                        this.playing = false;
                        Tone.Transport.stop(time);
                        Tone.Transport.position = 0;
                        this.progressSlider.value = 0;
                        
                        // Notify score manager that playback stopped
                        const scoreManager = this.app.modules.scoreManager;
                        if (scoreManager) {
                            scoreManager.stopPollingForPlayback();
                        }
                    }, 200);
                    this.progressSlider.style.display = "none";
                    this.app.modules.midiManager.sendEvent_allNotesOff();
                }
            }, "4n"); // Update every quarter note
        }
    }

    /**
     * Stops MIDI playback and resets transport position
     * @param {HTMLElement} playBtn - The play button element to update
     */
    stopPlayback(playBtn) {
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        playBtn.innerText = "Play MIDI";
        
        // Notify score manager that playback stopped
        const scoreManager = this.app.modules.scoreManager;
        if (scoreManager) {
            scoreManager.stopPollingForPlayback();
            
            // Reset score follower to beginning if active
            if (scoreManager.scoreShown && scoreManager.scoreFollowerActive) {
                scoreManager.resetScoreFollower('score');
            }
        }
        
        if (this.progressSlider) {
            this.progressSlider.value = 0;
            this.progressSlider.style.display = "none";
        }

        // Clear any existing scheduled repeat events
        if (Tone.Transport._scheduledRepeatId) {
            Tone.Transport.clear(Tone.Transport._scheduledRepeatId);
        }

        // Send all notes off after delay to ensure all notes are released
        setTimeout(() => {
            this.app.modules.midiManager.sendEvent_allNotesOff();
            this.app.modules.midiManager.sendEvent_sustainPedalOff();
        }, 500);
        
        this.playing = false;
    }

    /**
     * Sets playback speed and updates all related systems
     * @param {number} value - Speed multiplier (0.5 to 2.0)
     */
    setSpeed(value) {
        const state = this.app.state;
        const wasPlaying = this.playing;
        const currentPosition = Tone.Transport.seconds;
        
        // Stop transport and clear all scheduled events if currently playing
        if (wasPlaying) {
            Tone.Transport.stop();
            Tone.Transport.cancel();
            
            const midiManager = this.app.modules.midiManager;
            midiManager.sendEvent_allNotesOff();
            midiManager.sendEvent_sustainPedalOff();
        }
        
        state.speed = parseFloat(value);
        Tone.Transport.bpm.value = (this.app.bpm * state.speed).toFixed(2);

        // Update UI elements to reflect new speed
        const label = document.querySelector('label[for="speedControl"]');
        if (label) {
            label.textContent = "Playback Speed: " + (this.app.bpm * state.speed).toFixed(2) + " BPM";
        }

        const speedSlider = document.getElementById("speedControl");
        if (speedSlider) {
            speedSlider.value = state.speed;
        }
        
        // Show/hide speed reset button
        const resetBtn = document.getElementById("resetSpeed");
        if (resetBtn) {
            resetBtn.style.display = (state.speed === 1.0) ? "none" : "block";
        }

        // Notify score manager of speed change for timing adjustments
        const scoreManager = this.app.modules.scoreManager;
        if (scoreManager && scoreManager.scoreShown) {
            // Reset score follower position to account for timing changes
            setTimeout(() => {
                const currentBar = scoreManager.getCurrentPlaybackBar();
                scoreManager.updateScoreFollower('score', currentBar, true);
            }, 200);
        }

        // Restart playback if it was active
        if (wasPlaying) {
            this.parts.forEach(part => {
                part.stop();
                part.start(0.1);
            });
            
            setTimeout(() => {
                const adjustedPosition = currentPosition;
                Tone.Transport.seconds = adjustedPosition;
                Tone.Transport.start();
            }, 100);
        } else {
            // Ensure all notes are off when speed changes during pause
            setTimeout(() => {
                const midiManager = this.app.modules.midiManager;
                midiManager.sendEvent_allNotesOff();
                midiManager.sendEvent_sustainPedalOff();
            }, 100);
        }

        this.app.modules.settingsManager.updateUserSettings("speed", state.speed, -1);
    }

    /**
     * Handles speed control slider changes
     * @param {Event} event - Input event from speed slider
     */
    handleSpeedChange(event) {
        this.setSpeed(parseFloat(event.target.value));
    }

    /**
     * Performs cleanup before loading new MIDI file
     * Stops playback, resets transport, and cleans up resources
     */
    preclean() {
        const state = this.app.state;
        
        if (this.playing) {
            Tone.Transport.stop();
            this.playing = false;
            state.reversedPlayback = false;
            
            // Update UI elements to reflect stopped state
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
            
            // Clear transport state completely
            Tone.Transport.cancel();
            Tone.Transport.position = 0;
            Tone.Transport.seconds = 0;
            
            // Send all notes off to prevent hanging notes
            const midiManager = this.app.modules.midiManager;
            if (midiManager) {
                midiManager.sendEvent_allNotesOff();
            } else {
                console.warn('No MIDI manager available to send all notes off');
            }
            
            // Hide sharing UI elements
            document.getElementById("hiddenShareButton").style.display = "none";
            const shares = document.getElementById("st-1")
            if (shares) {
                shares.style.display = "none";
            }
            
            // Clear score data
            const scoreManager = this.app.modules.scoreManager;
            if (scoreManager) {
                scoreManager.abcString = "";
            }
        }
        
        // Disable play button during cleanup
        Utils.setPlayButtonActive(false);
        
        // Clean up audio engine resources
        if (this.app.midiFileRead) {
            this.app.modules.audioEngine.cleanup();
        }
    }

    /**
     * Fires a MIDI event during playback, handling direction and timing
     * @param {Object} event - MIDI event object with type, timing, and data
     * @param {number} time - Scheduled time for the event
     */
    fireMidiEvent(event, time) {
        const state = this.app.state;
        
        // Only fire events that match current playback direction
        if (event.reversed !== state.reversedPlayback) {
            return;
        }
        
        switch (event.type) {
            case 'note':
                // Send note on message
                this.handleMidiMessage({
                    data: [0x90 + event.channel, event.midi, event.velocity]
                });
                
                // Schedule note off message
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
                // Update tempo display in real-time
                Tone.Draw.schedule((time) => {
                    const label = document.querySelector('label[for="speedControl"]');
                    if (label) {
                        label.textContent = "Playback Speed: " + (this.app.bpm * state.speed).toFixed(2) + " BPM";
                    }
                }, Tone.now());
                break;
        }
    }

    /**
     * Routes MIDI messages to the appropriate handler
     * @param {Object} message - MIDI message object with data array
     */
    handleMidiMessage(message) {
        // Delegate to MIDI manager if available
        const midiManager = this.app.modules.midiManager;
        if (midiManager) {
            midiManager.handleMIDIMessage(message);
        } else {
            console.warn('No MIDI message handler available');
        }
    }

    /**
     * Detects the first bar that contains actual musical content (notes)
     * @param {Object} midi - MIDI file object to analyze
     * @returns {Object} Information about the first musical bar
     */
    detectFirstBarWithMusic(midi) {
        const ppq = midi.header.ppq || 96;
        const timeSignature = midi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
        const [numerator, denominator] = timeSignature;
        
        // Calculate timing values based on time signature
        const ticksPerBeat = ppq * (4 / denominator);
        const ticksPerMeasure = ticksPerBeat * numerator;
        
        // Collect all musical events (notes only, not control changes)
        const musicalEvents = [];
        midi.tracks.forEach(track => {
            // Only count actual notes as musical events
            if (track.notes && track.notes.length > 0) {
                track.notes.forEach(note => {
                    musicalEvents.push(note.ticks);
                });
            }
        });
        
        if (musicalEvents.length === 0) {
            return { ticks: 0, time: 0, method: 'noMusic' };
        }
        
        // Sort events by time to find the earliest
        musicalEvents.sort((a, b) => a - b);
        
        // Find the first musical event
        const firstEventTicks = musicalEvents[0];
        
        // Calculate which bar this event falls into
        const barNumber = Math.floor(firstEventTicks / ticksPerMeasure);
        
        // Calculate the first beat of that bar
        const firstBeatOfFirstMusicalBar = barNumber * ticksPerMeasure;
        
        return {
            ticks: firstBeatOfFirstMusicalBar,
            time: this.ticksToSeconds ? this.ticksToSeconds(firstBeatOfFirstMusicalBar, 
                midi.header.tempos || [{ bpm: 120, ticks: 0 }], ppq) : 0,
            method: 'firstMusicalBar',
            barNumber: barNumber + 1, // Human-readable bar number (1-based)
            firstEventTicks: firstEventTicks
        };
    }

    /**
     * Aligns MIDI file timing to start at the first musical bar and end on a downbeat
     * This ensures proper score following and eliminates empty space at the beginning
     * @param {Object} midi - MIDI file object to align
     * @returns {Object} Aligned MIDI file object
     */
    alignMidiToFirstMusicalBar(midi) {
        const firstBarInfo = this.detectFirstBarWithMusic(midi);
        
        // Calculate measure length for end alignment
        const ppq = midi.header.ppq || 96;
        const timeSignature = midi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
        const [numerator, denominator] = timeSignature;
        const ticksPerBeat = ppq * (4 / denominator);
        const ticksPerMeasure = ticksPerBeat * numerator;
        
        // If already starts at the first beat of the first musical bar, nothing to do for start
        let startAligned = false;
        if (firstBarInfo.ticks === 0) {
            // console.log('MIDI already starts at first beat of first musical bar');
            startAligned = true;
        }
        
        const firstBarTicks = firstBarInfo.ticks;
        
        // Check if there are any musical events before the first bar (only if not already aligned)
        let hasMusicalEventsBeforeFirstBar = false;
        let hasImportantHeaderEvents = false;
        
        if (!startAligned) {
            midi.tracks.forEach(track => {
                // Only check for actual musical content (notes)
                if (track.notes && track.notes.some(note => note.ticks < firstBarTicks)) {
                    hasMusicalEventsBeforeFirstBar = true;
                }
            });
            
            // Check for important header events before first bar
            if (midi.header.tempos && midi.header.tempos.some(tempo => tempo.ticks > 0 && tempo.ticks < firstBarTicks)) {
                hasImportantHeaderEvents = true;
            }
            if (midi.header.timeSignatures && midi.header.timeSignatures.some(ts => ts.ticks > 0 && ts.ticks < firstBarTicks)) {
                hasImportantHeaderEvents = true;
            }
        }
        
        // Handle start alignment
        let startPaddingTicks = 0;
        let startOffsetTicks = 0;
        
        if (!startAligned) {
            if (hasMusicalEventsBeforeFirstBar || hasImportantHeaderEvents) {
                // Add padding to preserve any pickup notes or important events
                startPaddingTicks = firstBarTicks;
                // console.log(`Adding ${startPaddingTicks} ticks of padding to preserve content before first musical bar (bar ${firstBarInfo.barNumber})`);
            } else {
                // No musical events before first bar - safe to shift backward
                startOffsetTicks = firstBarTicks;
                // console.log(`Shifting MIDI backward: moving first musical bar from tick ${startOffsetTicks} to tick 0 (was bar ${firstBarInfo.barNumber})`);
            }
        }
        
        // Calculate current end position and determine end padding needed
        let currentEndTicks = midi.durationTicks;
        
        // Adjust end position based on start changes
        if (startPaddingTicks > 0) {
            currentEndTicks += startPaddingTicks;
        } else if (startOffsetTicks > 0) {
            currentEndTicks -= startOffsetTicks;
        }
        
        // Calculate how much padding is needed to align end to next downbeat
        const endPaddingTicks = ticksPerMeasure - (currentEndTicks % ticksPerMeasure);
        const needsEndPadding = endPaddingTicks !== ticksPerMeasure; // Don't add full measure if already aligned
        
        if (needsEndPadding) {
            // console.log(`Adding ${endPaddingTicks} ticks of padding to align end to downbeat`);
        } else {
            // console.log('MIDI already ends on a downbeat');
        }
        
        // Apply start alignment transformations
        if (startPaddingTicks > 0 || startOffsetTicks > 0) {
            // Shift everything for start alignment
            midi.tracks.forEach(track => {
                // Shift notes
                if (track.notes) {
                    track.notes.forEach(note => {
                        if (startPaddingTicks > 0) {
                            note.ticks += startPaddingTicks;
                        } else {
                            note.ticks = Math.max(0, note.ticks - startOffsetTicks);
                        }
                    });
                }
                
                // Shift control changes
                if (track.controlChanges) {
                    Object.values(track.controlChanges).forEach(ccArray => {
                        ccArray.forEach(cc => {
                            if (startPaddingTicks > 0) {
                                cc.ticks += startPaddingTicks;
                            } else {
                                cc.ticks = Math.max(0, cc.ticks - startOffsetTicks);
                            }
                        });
                    });
                }
                
                // Shift pitch bends
                if (track.pitchBends) {
                    track.pitchBends.forEach(bend => {
                        if (startPaddingTicks > 0) {
                            bend.ticks += startPaddingTicks;
                        } else {
                            bend.ticks = Math.max(0, bend.ticks - startOffsetTicks);
                        }
                    });
                }
                
                // Shift program changes
                if (track.programChanges) {
                    track.programChanges.forEach(pc => {
                        if (startPaddingTicks > 0) {
                            pc.ticks += startPaddingTicks;
                        } else {
                            pc.ticks = Math.max(0, pc.ticks - startOffsetTicks);
                        }
                    });
                }
            });
            
            // Shift header events
            if (midi.header.tempos) {
                midi.header.tempos.forEach(tempo => {
                    if (startPaddingTicks > 0) {
                        tempo.ticks += startPaddingTicks;
                    } else {
                        tempo.ticks = Math.max(0, tempo.ticks - startOffsetTicks);
                    }
                });
                
                // Ensure there's always a tempo at tick 0 when shifting backward
                if (startOffsetTicks > 0 && (midi.header.tempos.length === 0 || midi.header.tempos[0].ticks > 0)) {
                    midi.header.tempos.unshift({
                        bpm: midi.header.tempos[0]?.bpm || 120,
                        ticks: 0
                    });
                }
            }
            
            if (midi.header.timeSignatures) {
                midi.header.timeSignatures.forEach(ts => {
                    if (startPaddingTicks > 0) {
                        ts.ticks += startPaddingTicks;
                    } else {
                        ts.ticks = Math.max(0, ts.ticks - startOffsetTicks);
                    }
                });
                
                // Ensure there's always a time signature at tick 0 when shifting backward
                if (startOffsetTicks > 0 && (midi.header.timeSignatures.length === 0 || midi.header.timeSignatures[0].ticks > 0)) {
                    midi.header.timeSignatures.unshift({
                        timeSignature: midi.header.timeSignatures[0]?.timeSignature || [4, 4],
                        ticks: 0
                    });
                }
            }
            
            if (midi.header.keySignatures) {
                midi.header.keySignatures.forEach(ks => {
                    if (startPaddingTicks > 0) {
                        ks.ticks += startPaddingTicks;
                    } else {
                        ks.ticks = Math.max(0, ks.ticks - startOffsetTicks);
                    }
                });
            }
        }
        
        // Add end padding if needed by extending the last notes
        if (needsEndPadding) {
            // console.log(`Extending last notes by ${endPaddingTicks} ticks to align end to downbeat`);

            // Find the actual last note(s) across all tracks
            let lastNoteTime = 0;
            let lastNotes = [];
            
            midi.tracks.forEach(track => {
                if (track.notes && track.notes.length > 0) {
                    track.notes.forEach(note => {
                        const noteEndTime = note.ticks + (note.durationTicks || note.duration * (midi.header.ppq || 96));
                        if (noteEndTime > lastNoteTime) {
                            lastNoteTime = noteEndTime;
                            lastNotes = [note]; // Start new array with this note
                        } else if (noteEndTime === lastNoteTime) {
                            lastNotes.push(note); // Add to existing last notes
                        }
                    });
                }
            });
            
            if (lastNotes.length > 0) {
                // Extend the duration of all notes that end at the last time
                lastNotes.forEach(note => {
                    const currentDuration = note.durationTicks || note.duration * (midi.header.ppq || 96);
                    const newDuration = currentDuration + endPaddingTicks;
                    
                    // Update both tick-based and time-based duration
                    note.durationTicks = newDuration;
                    if (note.duration) {
                        // Convert back to seconds if time-based duration exists
                        const ppq = midi.header.ppq || 96;
                        const bpm = midi.header.tempos?.[0]?.bpm || 120;
                        note.duration = (newDuration / ppq) * (60 / bpm);
                    }
                });
                
                // console.log(`Extended ${lastNotes.length} last note(s) by ${endPaddingTicks} ticks`);
            } else {
                console.warn('No last notes found to extend - MIDI may not end properly aligned');
            }
        }
        
        // Store alignment info in MIDI object
        midi._startPaddingTicks = startPaddingTicks;
        midi._startOffsetTicks = startOffsetTicks;
        midi._endPaddingTicks = needsEndPadding ? endPaddingTicks : 0;
        midi._originalFirstBarOffset = startOffsetTicks;
        midi._alignmentInfo = {
            startAligned: startAligned || (startPaddingTicks > 0) || (startOffsetTicks > 0),
            endAligned: true,
            originalEndTicks: midi.durationTicks,
            finalEndTicks: currentEndTicks + (needsEndPadding ? endPaddingTicks : 0)
        };
        
        return midi;
    }

    /**
     * Helper method for converting MIDI ticks to seconds based on tempo changes
     * @param {number} ticks - Number of ticks to convert
     * @param {Array} tempos - Array of tempo change events
     * @param {number} ppq - Pulses per quarter note
     * @returns {number} Time in seconds
     */
    ticksToSeconds(ticks, tempos, ppq) {
        if (!tempos || tempos.length === 0) {
            // Default tempo if none provided
            return (ticks / ppq) * (60 / 120); // 120 BPM default
        }
        
        let seconds = 0;
        let currentTicks = 0;
        let currentTempo = tempos[0];
        let tempoIndex = 0;
        
        while (currentTicks < ticks && tempoIndex < tempos.length) {
            const nextTempoTicks = (tempoIndex + 1 < tempos.length) ? 
                tempos[tempoIndex + 1].ticks : ticks;
            const ticksInThisSection = Math.min(nextTempoTicks, ticks) - currentTicks;
            
            const secondsPerTick = 60 / (currentTempo.bpm * ppq);
            seconds += ticksInThisSection * secondsPerTick;
            
            currentTicks += ticksInThisSection;
            if (currentTicks >= nextTempoTicks && tempoIndex + 1 < tempos.length) {
                tempoIndex++;
                currentTempo = tempos[tempoIndex];
            }
        }
        
        return seconds;
    }

    /**
     * Schedules all MIDI events for playback using Tone.js Parts
     * Handles note transformations, tempo changes, and both forward/reverse playback
     * @param {Object} midi - MIDI file object to schedule
     */
    scheduleMIDIEvents(midi) {
        // Align MIDI to start at first beat of first musical bar for better score sync
        this.originalMidi = this.alignMidiToFirstMusicalBar(midi);
        
        // Store alignment info for score following
        this.firstMusicalBar = { ticks: 0, time: 0, method: 'aligned' };
        
        // Notify score manager of the alignment
        if (this.app.modules.scoreManager) {
            this.app.modules.scoreManager.setFirstMusicalBar(this.firstMusicalBar);
        }

        // Clear any previous scheduled parts
        this.parts.forEach(part => part.dispose());
        this.parts = [];

        // RESET Transport completely to ensure clean state
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        Tone.Transport.seconds = 0;
        
        const state = this.app.state;
        const loadTime = Tone.now() + 0.1;

        // Get player from audio engine instead of global
        const audioEngine = this.app.modules.audioEngine;
        const player = audioEngine?.getPlayer();

        const midiPPQ = midi.header.ppq || 96;
        Tone.Transport.PPQ = midiPPQ;

        if (midi.header.tempos && midi.header.tempos.length > 0) {
            Tone.Transport.bpm.value = midi.header.tempos[0].bpm;
        } else {
            Tone.Transport.bpm.value = 120;
        }


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
                    if (state.mode !== 0) { // If not in normal mode
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

    /**
     * Updates program change for a specific MIDI channel
     * @param {number} channel - MIDI channel number
     * @param {number} programNumber - New program number (instrument)
     */
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

    /**
     * Updates control change values for a specific MIDI channel
     * @param {number} channel - MIDI channel number  
     * @param {number} number - Control change number (CC#)
     * @param {number} value - New control value
     */
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

    /**
     * Restores original MIDI values for a channel (used when resetting settings)
     * @param {number} channel - MIDI channel number to restore
     */
    restoreOriginalValuesForChannel(channel) {
        const channelNum = parseInt(channel);
        const part = this.parts.find(p => p.channel === channelNum);
        if (part) {
            const events = part._events;
            for (let i = 0; i < events.length; i++) {
                const event = events.get(i);
                if (event && event.original && event.value.number) {
                    event.value.number = event.original.number;
                    // console.log("Restored original number for event:", event);
                }
                if (event && event.original && event.value.value) {
                    event.value.value = event.original.value;
                    // console.log("Restored original value for event:", event);
                }
            }
        }
    }

    /**
     * Updates all scheduled MIDI events to reflect current transformation settings
     * Used when harmony mode, root note, or other settings change
     */
    updateChannels() {        
        try {
            this.parts.forEach(part => {
                // console.log("Processing part:", part);
                // console.log("Updating part:", part, "with channel:", part.channel);
                if (part._events) {
                    part._events.forEach(event => {
                        // Update note transformations based on current settings
                        if (event.value && event.value.type === 'note' && event.value.channel !== 9) {
                            const transformedNote = this.app.transformNote(event.value.originalMidi, part.channel);
                            event.value.midi = transformedNote;
                        }
                        
                        // Update pitch bend transformations
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
            
            // Update score if visible
            const scoreFollower = this.app.modules.scoreManager;
            if (scoreFollower && scoreFollower.scoreShown) {
                const updatedMidi = this.createCurrentMidi();
                scoreFollower.generateABCStringfromMIDI(updatedMidi);
                scoreFollower.updateScoreFollower('score', scoreFollower.currentBarStart, true);
            }

        } catch (error) {
            console.error("Error during score follower update:", error);
        }
    }

    /**
     * Cleans up transport resources and stops playback
     */
    cleanup() {
        if (this.playing) {
            this.stopPlayback(document.getElementById('playMidi'));
        }
        
        this.parts.forEach(part => part.dispose());
        this.parts = [];
    }

    /**
     * Downloads the currently transformed MIDI file
     * Applies all current settings (harmony mode, speed, etc.) to the export
     */
    downloadCurrentMidi() {
        const midi = this.createCurrentMidi();
        const name = this.originalMidi.header.name + "_negative_harmony.mid" || "negative_harmony.mid";
        if (!midi) {
            console.error('Failed to create MIDI file');
            return;
        }

        // Create download link and trigger download
        const arrayBuffer = midi.toArray();
        const blob = new Blob([arrayBuffer], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Creates a new MIDI file with all current transformations applied
     * Handles note transformations, speed changes, reversed playback, and validation
     * @returns {Object|null} Transformed MIDI object or null if creation fails
     */
    createCurrentMidi() {
        try {
            if (!this.originalMidi) {
                console.error('No original MIDI data available for export');
                return null;
            }

            // Validate original MIDI structure
            if (!this.originalMidi.tracks || !Array.isArray(this.originalMidi.tracks)) {
                console.error('Invalid MIDI tracks structure');
                return null;
            }

            // Create new MIDI file with transformations
            const midi = new Midi();
            
            const state = this.app.state;
            const speedFactor = state.speed || 1.0;
            const isReversed = state.reversedPlayback || false;

            // Deep copy and validate the header
            try {
                midi.header = JSON.parse(JSON.stringify(this.originalMidi.header));
            } catch (error) {
                console.error('Error copying MIDI header:', error);
                midi.header = { ppq: 96 }; // Fallback header
            }

            // Get and validate total ticks for bounds checking
            const totalTicks = this.originalMidi.durationTicks;
            if (!totalTicks || totalTicks <= 0 || !isFinite(totalTicks)) {
                console.error('Invalid total ticks:', totalTicks);
                return null;
            }

            // Update tempo based on speed factor
            if (speedFactor !== 1.0 && midi.header.tempos && Array.isArray(midi.header.tempos)) {
                midi.header.tempos.forEach(tempo => {
                    if (tempo && typeof tempo.bpm === 'number' && isFinite(tempo.bpm)) {
                        tempo.bpm = parseFloat((this.app.bpm * speedFactor).toFixed(2));
                        // Clamp BPM to reasonable range to prevent invalid MIDI
                        tempo.bpm = Math.max(20, Math.min(300, tempo.bpm));
                    }
                    if (tempo && typeof tempo.ticks === 'number') {
                        tempo.ticks = Math.max(0, Math.min(totalTicks, tempo.ticks));
                    }
                });
            }

            // Set limits to prevent memory issues with large files
            const MAX_TRACKS = 16;
            const MAX_NOTES_PER_TRACK = 10000;
            const MAX_TOTAL_EVENTS = 50000;
            
            let totalEvents = 0;
            let validTracksCount = 0;
            
            const tracksToProcess = this.originalMidi.tracks.slice(0, MAX_TRACKS);
            
            // Process each track with comprehensive validation
            tracksToProcess.forEach((originalTrack, trackIndex) => {
                if (!originalTrack || typeof originalTrack !== 'object') {
                    console.warn(`Skipping invalid track ${trackIndex}`);
                    return;
                }

                const channel = originalTrack.channel;
                
                // Validate channel number
                if (typeof channel !== 'number' || channel < 0 || channel > 15) {
                    console.warn(`Skipping track ${trackIndex} with invalid channel:`, channel);
                    return;
                }
                
                // Skip empty tracks or if event limit exceeded
                if (!originalTrack.notes || !Array.isArray(originalTrack.notes) || 
                    originalTrack.notes.length === 0 || totalEvents >= MAX_TOTAL_EVENTS) {
                    return;
                }
                
                // Limit notes per track to prevent excessive memory usage
                const notesToProcess = originalTrack.notes.slice(0, MAX_NOTES_PER_TRACK);
                
                // Create new track with validation
                const track = midi.addTrack();
                track.name = (typeof originalTrack.name === 'string') ? 
                    originalTrack.name.substring(0, 100) : `Track ${trackIndex}`;
                track.channel = channel;
                
                let validNotesCount = 0;
                
                // Process notes with comprehensive validation and transformation
                notesToProcess.forEach((note, noteIndex) => {
                    if (totalEvents >= MAX_TOTAL_EVENTS) return;
                    
                    // Validate note structure
                    if (!note || typeof note !== 'object') {
                        console.warn(`Skipping invalid note ${noteIndex} in track ${trackIndex}`);
                        return;
                    }
                    
                    // Validate MIDI note number
                    if (typeof note.midi !== 'number' || !isFinite(note.midi) || 
                        note.midi < 0 || note.midi > 127) {
                        console.warn(`Skipping note with invalid MIDI value:`, note.midi);
                        return;
                    }
                    
                    // Validate timing
                    if (typeof note.ticks !== 'number' || !isFinite(note.ticks) || 
                        note.ticks < 0 || note.ticks > totalTicks) {
                        console.warn(`Skipping note with invalid ticks:`, note.ticks);
                        return;
                    }
                    
                    // Validate duration
                    if (typeof note.durationTicks !== 'number' || !isFinite(note.durationTicks) || 
                        note.durationTicks <= 0) {
                        console.warn(`Note has invalid duration, using default:`, note.durationTicks);
                        note.durationTicks = Math.min(96, totalTicks / 32); // Safe default
                    }

                    // Apply note transformation (skip for drums on channel 9)
                    let transformedMidi = note.midi;
                    if (channel !== 9) {
                        try {
                            transformedMidi = this.app.transformNote(note.midi, channel);
                            // Validate transformed result
                            if (!isFinite(transformedMidi) || transformedMidi < 0 || transformedMidi > 127) {
                                console.warn('Transform produced invalid note, clamping:', transformedMidi);
                                transformedMidi = Math.max(0, Math.min(127, Math.round(transformedMidi)));
                            }
                        } catch (error) {
                            console.error('Error transforming note:', error);
                            transformedMidi = note.midi; // Fallback to original
                        }
                    }
                    
                    // Calculate final timing (handle reversed playback)
                    let finalTicks = note.ticks;
                    let finalDurationTicks = Math.min(note.durationTicks, totalTicks - finalTicks);
                    
                    if (isReversed && note.ticks !== 0) {
                        // Calculate reversed timing safely
                        try {
                            const noteLength = (note.duration && note.duration <= Tone.Time("8n").toSeconds()) ? 
                                note.ticks : (note.ticks + ((channel !== 9) ? note.durationTicks : 0));
                            finalTicks = totalTicks - noteLength;
                            finalTicks = Math.max(0, Math.min(totalTicks - finalDurationTicks, finalTicks));
                        } catch (error) {
                            console.error('Error calculating reversed timing:', error);
                            finalTicks = Math.max(0, totalTicks - note.ticks - finalDurationTicks);
                        }
                    }
                    
                    // Final validation of calculated values
                    if (!isFinite(finalTicks) || finalTicks < 0 || finalTicks >= totalTicks) {
                        console.warn('Final ticks out of range, clamping:', finalTicks);
                        finalTicks = Math.max(0, Math.min(totalTicks - 1, finalTicks));
                    }
                    
                    if (!isFinite(finalDurationTicks) || finalDurationTicks <= 0) {
                        finalDurationTicks = Math.min(96, totalTicks - finalTicks);
                    }
                    
                    // Ensure note doesn't extend beyond total duration
                    finalDurationTicks = Math.min(finalDurationTicks, totalTicks - finalTicks);
                    
                    // Add note to track with final validation
                    try {
                        track.addNote({
                            midi: Math.round(transformedMidi),
                            ticks: Math.round(finalTicks),
                            durationTicks: Math.round(Math.max(1, finalDurationTicks)),
                            velocity: (typeof note.velocity === 'number' && isFinite(note.velocity)) ? 
                                Math.max(0.1, Math.min(1, note.velocity)) : 0.7
                        });
                        validNotesCount++;
                        totalEvents++;
                    } catch (error) {
                        console.error('Error adding note to track:', error, {
                            midi: transformedMidi,
                            ticks: finalTicks,
                            durationTicks: finalDurationTicks,
                            originalNote: note
                        });
                    }
                });

                // Only keep tracks that have valid notes
                if (validNotesCount > 0) {
                    validTracksCount++;
                    
                    // Add control changes with validation
                    if (originalTrack.controlChanges && typeof originalTrack.controlChanges === 'object' && 
                        totalEvents < MAX_TOTAL_EVENTS) {
                        const ccEntries = Object.entries(originalTrack.controlChanges).slice(0, 10); // Limit CC types
                        
                        ccEntries.forEach(([ccNumber, ccEvents]) => {
                            if (!Array.isArray(ccEvents) || totalEvents >= MAX_TOTAL_EVENTS) return;
                            
                            const limitedCCEvents = ccEvents.slice(0, 100); // Limit CC events per type
                            
                            limitedCCEvents.forEach(cc => {
                                if (totalEvents >= MAX_TOTAL_EVENTS) return;
                                if (!cc || typeof cc !== 'object') return;
                                if (typeof cc.ticks !== 'number' || !isFinite(cc.ticks) || cc.ticks < 0 || cc.ticks >= totalTicks) return;
                                if (typeof cc.value !== 'number' || !isFinite(cc.value)) return;
                                
                                let currentValue = Math.max(0, Math.min(127, Math.floor(cc.value * 127)));
                                let finalTicks = cc.ticks;
                                
                                if (isReversed && cc.ticks !== 0) {
                                    finalTicks = Math.max(0, Math.min(totalTicks - 1, totalTicks - cc.ticks));
                                }
                                
                                try {
                                    track.addCC({
                                        number: Math.max(0, Math.min(127, parseInt(ccNumber))),
                                        value: currentValue,
                                        ticks: Math.round(finalTicks)
                                    });
                                    totalEvents++;
                                } catch (error) {
                                    console.error('Error adding CC:', error);
                                }
                            });
                        });
                    }
                    
                    // Set instrument with validation
                    if (originalTrack.instrument && typeof originalTrack.instrument.number === 'number') {
                        const programNumber = Math.max(0, Math.min(127, 
                            Math.round(originalTrack.instrument.number)));
                        track.instrument = { number: programNumber };
                    }
                } else {
                    // Remove empty track
                    midi.tracks.pop();
                }
            });

            // Final validation and structure checks
            if (validTracksCount === 0 || !midi.tracks || midi.tracks.length === 0) {
                console.error('No valid tracks created');
                return null;
            }

            // Ensure proper MIDI structure with safe defaults
            try {
                if (!midi.header.ppq || midi.header.ppq <= 0) {
                    midi.header.ppq = 96;
                }
                
                if (!midi.header.tempos || midi.header.tempos.length === 0) {
                    midi.header.tempos = [{ bpm: 120, ticks: 0 }];
                }
                
                if (!midi.header.timeSignatures || midi.header.timeSignatures.length === 0) {
                    midi.header.timeSignatures = [{ timeSignature: [4, 4], ticks: 0 }];
                }
            } catch (error) {
                console.error('Error setting MIDI header defaults:', error);
            }

            // Final validation and size checks
            try {
                // Force garbage collection if available
                if (window.gc) {
                    window.gc();
                }
                
                // Test serialization to catch errors early
                const testArray = midi.toArray();
                if (!testArray || testArray.length === 0) {
                    console.error('Generated MIDI produces empty array');
                    return null;
                }
                
                // Check file size to prevent memory issues
                const maxSize = 5 * 1024 * 1024; // 5MB limit
                if (testArray.length > maxSize) {
                    console.error('Generated MIDI is too large:', testArray.length, 'bytes');
                    return null;
                }
                
            } catch (error) {
                console.error('Generated MIDI fails validation:', error);
                return null;
            }

            return midi;

        } catch (error) {
            console.error('Fatal error creating MIDI file:', error);
            console.error('Error stack:', error.stack);
            
            // Force cleanup on error
            if (window.gc) {
                window.gc();
            }
            
            return null;
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Transport;
}
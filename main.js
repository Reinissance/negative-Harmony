
let heavyModule = null;
let loader = null;
let midioutPort = null;
let midiOutputsSelect = null;
let midiInputs = [];
let bpm = 120;
let speed = 1.0;
let speedSlider = null;
let player = null;

let loadedChannelInstruments = {}; // Store necessary instruments for midi file playback
let availableInstrumentsForProgramChange = {}; // Store available instrument soundfonts provided by webaudiofont per program change number
let drumInstrument = null; // Create a separate instrument for drum sounds
let availableDrumSoundsForNote = {};  // Store available drum sounds per note provided by webaudiofont
let midiNotes = []; // Store the notes played by the midi player to stop them on note off
let loadedChannelControlValues = {}; // on midiFile load, store the control values for each channel
let noMidi = true; // Flag to check if no MIDI devices are available
let lastNotes = []; // Store the last notes played by the midi player to check the piece's key
let midiData; // the read midi file
let normal = false; // for pitchbend to be possibly turned upside down if not normal
let sustain = {}; // notes that are sustained
let sustainedNodes = {}; // nodes that are sustained
let userSettings = { "channels": {} }; // Store user settings for or from shared via URL
let audioContext = null; // Create an audio context
let soloChannels = []; // Store the soloed channels

window.onload = function () {
    heavy_Module().then(loadedModule => {
        heavyModule = loadedModule;
        moduleLoaded();
        speedSlider = document.getElementById("speedControl");
        setupMidiPlayer();
    });
    document.getElementById("transportButton").style.visibility = "hidden";
}

function moduleLoaded() {
    loader = new heavyModule.AudioLibLoader();
    document.getElementById("transportButton").style.visibility = "visible";
}

function start() {
    // make playbutton unrespondable
    setPlayButtonAcive(false);
    if (!loader.webAudioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        loader.init({
            // optional: set audio processing block size, default is 2048
            blockSize: 4,
            // optional: provide a callback handler for [print] messages
            printHook: onPrint,
            // optional: provide a callback handler for [s {sendName} @hv_param] messages
            // sendName "midiOutMessage" is reserved for MIDI output messages!
            sendHook: onSendMessage,
            // optional: pass an existing web audio context, otherwise a new one
            // will be constructed.
            webAudioContext: audioContext,
        }).then(() => {
            Tone.start();
            setupGMPlayer();
            var startPrompt = document.getElementById("start_prompt");
            startPrompt.hidden = true;
            document.getElementById("col_transport").style = "";
            updateSlider_perOktave(1);
            updateSlider_mode(2);
            checkForParamsInUrl();
        });
    }
    loader.start();
}

function stop() {
    loader.stop();
}

function toggleTransport(element) {
    (loader.isPlaying) ? stop() : start();
}

function onPrint(message) {
    console.log(message);
}

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure);
}

function onMIDISuccess(midiAccess) {

    noMidi = false;
    var inputs = midiAccess.inputs.values();
    midiInputs = Array.from(midiAccess.inputs.values());
    var midiInputsSelect = document.getElementById("midiInputs");

    // Add MidiPlayer as first MIDI output option
    var option = document.createElement("option");
    option.value = 0;
    option.text = "MidiPlayer";
    midiInputsSelect.add(option);

    midiInputs.forEach((input, index) => {
        var option = document.createElement("option");
        option.value = index;
        option.text = input.name;
        midiInputsSelect.add(option);
    });

    // Preselect the first MIDI input and output
    if (midiInputs.length > 0) {
        midiInputsSelect.selectedIndex = 0;
        // midiInputs[0].onmidimessage = onMIDIMessage;
    }
    midiInputsSelect.onchange = function () {
        var selectedInput = midiInputs[midiInputsSelect.value];
        midiInputs.forEach(input => input.onmidimessage = null); // Clear previous handlers
        if (selectedInput && (midiInputsSelect.selectedIndex > 0)) {
            selectedInput.onmidimessage = onMIDIMessage;
        }
    };


    midiOutputsSelect = document.getElementById("midiOutputs");
    var midiOutputs = [];
    var outputs = midiAccess.outputs.values();
    midiOutputs = Array.from(midiAccess.outputs.values());
    // Add WebAudioFont as first MIDI output option
    var option = document.createElement("option");
    option.value = -1;
    option.text = "WebAudioFont";
    midiOutputsSelect.add(option);

    midiOutputs.forEach((output, index) => {
        var option = document.createElement("option");
        option.value = index;
        option.text = output.name;
        midiOutputsSelect.add(option);
    });

    if (midiOutputs.length > 1) {
        midiOutputsSelect.selectedIndex = 0;
        // midioutPort = midiOutputs[0];
    }

    midiOutputsSelect.onchange = function () {
        if (!midioutPort) {
            // manually send allnotesoff to all channels for webaudiofont
            setTimeout(() => {
                for (const note of midiNotes) {
                    handleNoteOff(note.channel, { midi: note.pitch });
                }
            }, 500);
        }
        else {
            // manually send allnotesoff to all channels for external midi devices
            midioutPort.send([0xB0, 120, 0]);
            midioutPort.send([0xB1, 120, 0]);
            midioutPort.send([0xB2, 120, 0]);
            midioutPort.send([0xB3, 120, 0]);
            midioutPort.send([0xB4, 120, 0]);
            midioutPort.send([0xB5, 120, 0]);
            midioutPort.send([0xB6, 120, 0]);
            midioutPort.send([0xB7, 120, 0]);
            midioutPort.send([0xB8, 120, 0]);
            midioutPort.send([0xB9, 120, 0]);
            midioutPort.send([0xBA, 120, 0]);
            midioutPort.send([0xBB, 120, 0]);
        }
        midioutPort = midiOutputs[midiOutputsSelect.value];
        if (midioutPort) {
            midioutPort.onmidimessage = onMidiOutMessage;
            console.log("Selected MIDI output:", midioutPort.name);
        }
        // else {
        // console.error("No MIDI output port available.");
        // }
    };
}

function onMIDIFailure(msg) {
    document.getElementById("midiIn").innerHTML = "No extern MIDI available.";
    document.getElementById("midiOut").innerHTML = "";
    console.error(`Failed to get MIDI access - ${msg}`);
}

function onMIDIMessage(message) {
    // midi messages to be sent to heavy
    if (loader.webAudioWorklet) {
        loader.sendMidi(message.data);
        // console.log("Received MIDI message:", message.data);
    } else {
        loader.audiolib.sendMidi(message.data);
        // console.log("Received MIDI message:", message.data);
    }
}

function onMidiOutMessage(message) {
    // midi messages coming from heavy
    if (!noMidi && midiOutputsSelect.selectedIndex != 0) {
        //external midi
        try {
            midioutPort.send(message);
            // console.log("Sent MIDI message:", message);
        } catch (error) {
            console.error("Error sending MIDI message:", error);
        }
    }
    else {
        //webaudiofont
        if (noMidi || (midiOutputsSelect != null && midiOutputsSelect.selectedIndex === 0)) {
            channel = message[0] & 0x0F;
            if (message[0] >= 0x80 && message[0] < 0x90 && channel != 9) {
                // Note off
                handleNoteOff(channel, {
                    midi: message[1]
                });
            } else if (message[0] >= 0x90 && message[0] < 0xA0) {
                // Note on
                if (message[2] === 0 && channel != 9) {
                    // Note off (velocity 0)
                    handleNoteOff(channel, {
                        midi: message[1]
                    });
                } else {
                    // Note on
                    handleNoteOnForChannel({
                        midi: message[1]
                    }, message[2] / 127, channel);
                }
            } else if (message[0] >= 0xB0 && message[0] < 0xC0) {
                // Control change
                if (message[1] === 120) {
                    // All notes off
                    for (const note of midiNotes) {
                        handleNoteOff(note.channel, { midi: note.pitch });
                    }
                } else if (message[1] === 7) {
                    // Volume
                    // console.log("Volume change:", message[2], "on channel:", channel);
                    Tone.Draw.schedule(function (time) {
                        var slider = document.getElementById("volumeSlider_" + ((channel != 9) ? channel : "drum"));
                        if (slider === null || userSettings[channel] === undefined || userSettings[channel][slider.id] === undefined) {
                            return; // override by shared url settings
                        }
                        if (channel === 9) {
                            drumInstrument.gainNode.gain.value = message[2] / 127;
                            // console.log("Volume change:", message[2], "on DRUMchannel");
                        } else {
                            // console.log("Volume change:", message[2], "on channel:", channel);
                            loadedChannelInstruments[channel].gainNode.gain.value = message[2] / 127;
                        }
                        slider.value = message[2];
                        var v_label = document.getElementById("vol_label_" + channel);
                        v_label.innerHTML = "Volume: " + (message[2] / 127).toFixed(2);
                    }, Tone.now());
                } else if (message[1] === 10) {
                    // Pan
                    Tone.Draw.schedule(function (time) {
                        var slider = document.getElementById("panSlider_" + (channel != 9) ? channel : "drum");
                        if (slider === null || userSettings[channel] === undefined || userSettings[channel][slider.id] === undefined) {
                            return; // override by shared url settings
                        }
                        if (channel === 9) {
                            drumInstrument.panNode.pan.value = (message[2] - 64) / 64;
                            // console.log("Pan change:", message[2], "on DRUMchannel");
                        } else {
                            // console.log("Pan change:", message[2], "on channel:", channel);
                            loadedChannelInstruments[channel].panNode.pan.value = (message[2] - 64) / 64;
                        };
                        slider.value = (message[2] - 64) / 64;
                        var p_label = document.getElementById("pan_label_" + channel);
                        p_label.innerHTML = "Panning: " + ((message[2] - 64) / 64).toFixed(2);
                    }, Tone.now());
                } else if (message[1] === 64) {
                    // Sustain pedal
                    if (message[2] > 0) {
                        sustain[channel] = true;
                    } else {
                        for (const node of Object.values(sustainedNodes)) {
                            node.cancel();
                        }
                        sustain[channel] = false;

                    }
                    // console.log("Sustain pedal:", message[2], "on channel:", channel);
                } else if (message[1] === 91) {
                    // Reverb send
                    Tone.Draw.schedule(function (time) {
                        var slider = document.getElementById("reverbSlider_" + (channel != 9) ? channel : "drum");
                        if (slider === null || userSettings[channel] === undefined || userSettings[channel][slider.id] === undefined) {
                            return; // override by shared url settings
                        }
                        if (channel === 9) {
                            // no reverb on drum channel yet
                        } else {
                            // console.log("Pan change:", message[2], "on channel:", channel);
                            loadedChannelInstruments[channel].reverbSendGainNode.gain.value = message[2];
                        };
                        slider.value = (message[2] - 64) / 64;
                        var r_label = document.getElementById("reverb_label_" + channel);
                        r_label.innerHTML = "Reverb: " + message[2];
                    }, Tone.now());
                    // console.log("Reverb send change:", message[2], "on channel:", channel);
                };
            } else if (message[0] >= 0xC0 && message[0] < 0xD0) {
                // Program change
                // set the instrument for the channel
                Tone.Draw.schedule(function (time) {
                    if (channel === 9) {
                        // no pgrogramchange on drum channel
                    } else {
                        var select = document.getElementById("instrumentSelect_");
                        if (select === null || userSettings[channel] === undefined || userSettings[channel][select.id] === undefined) {
                            return; // override by shared url settings
                        } else {
                            // console.log("setting instrument from FILE for channel:", channel, "to:", message[1], userSettings);
                            programNumber = message[1];
                            loadedChannelInstruments[channel].preset = availableInstrumentsForProgramChange[message[1]].preset;
                        }
                    };
                }, Tone.now());

            } else if (message[0] >= 0xE0 && message[0] < 0xF0) {
                channel = message[0] & 0x0F;
                // Pitch bend
                let value = (message[1]) / 8192;
                if (!normal)
                    value *= -1;
                // apply pitchbend to channel notes
                const channelNotes = midiNotes.filter(note => note.channel === channel);
                for (const note of channelNotes) {
                    handlePitchBend(note, value);
                }
            }
        }
        else {
            console.error("No MIDI output port available.");
        }
    }
}

function onSendMessage(sendName, message) {
    // midi messages coming from heavy is sent through the sendHook()
    switch (sendName) {
        case "midiOutMessage":
            onMidiOutMessage(message);
            break;
        default:
            console.log(sendName, message);
    }
}

function sendEvent_allNotesOff() {
    if (loader.webAudioWorklet) {
        loader.sendEvent("allNotesOff");
    } else {
        loader.audiolib.sendEvent("allNotesOff");
    }
}

function setPlayButtonAcive(active) {
    var playBtn = document.getElementById('playMidi');
    if (!active) {
        playBtn.innerText = "Loading MIDI file...";
        playBtn.style.color = "gray";
        playBtn.disabled = true;
    } else {
        playBtn.disabled = false;
        playBtn.innerText = "Play MIDI";
        playBtn.style.color = "red";
    }
}

function checkForParamsInUrl() {
    // read and parse the url parameters
    const urlParams = new URLSearchParams(window.location.search);
    // console.log("URL params:", urlParams);
    // first the global settings
    const modeParam = urlParams.get('mode');
    if (modeParam) {
        updateSlider_mode(parseInt(modeParam));
        // set the mode radio button
        const modeRadios = document.getElementsByName("mode");
        for (const radio of modeRadios) {
            if (parseInt(radio.value) === parseInt(modeParam)) {
                radio.checked = true;
            } else {
                radio.checked = false;
            }
        }
    }
    const negRootParam = urlParams.get('negRoot');
    if (negRootParam) {
        updateSlider_negRoot(parseFloat(negRootParam));
        const negRootRadios = document.getElementsByName("negRoot");
        for (const radio of negRootRadios) {
            if (radio.value === negRootParam) {
                radio.checked = true;
            } else {
                radio.checked = false;
            }
        }
    }
    const perOktaveParam = urlParams.get('perOktave');
    if (perOktaveParam) {
        updateSlider_perOktave(parseFloat(perOktaveParam));
        updateUserSettings("perOktave", perOktaveParam, -1);
        oktCheck = document.getElementById("parameter_perOktave");
        oktCheck.checked = (parseFloat(perOktaveParam) == 1.0) ? true : false;
    }
    const irUrlParam = urlParams.get('irUrl');
    if (irUrlParam) {
        var index = parseInt(irUrlParam);
        // update Select
        var reverbSelect = document.getElementById("reverbSelect");
        setIR(reverbSelect.options[index].value);
        reverbSelect.selectedIndex = index;
    }
    const reverbGainParam = urlParams.get('reverbGain');
    if (reverbGainParam) {
        revSlider = document.getElementById("reverbVolume");
        revSlider.value = parseFloat(reverbGainParam);
        setReverbGain(parseFloat(reverbGainParam));

    }
    // then load the midi file
    const midiFileUrl = urlParams.get('midiFile');
    if (midiFileUrl) {
        fetch(midiFileUrl)
            .then(response => response.arrayBuffer())
            .then(data => {
                midiData = new Midi(data);
                parseMidiFile();

                // paste the midi file url into the input field
                document.getElementById("midiUrl").value = midiFileUrl;

                // make share button visible
                document.getElementById("hiddenShareButton").style.display = "block";

                // check for channel settings and speed in the url
                const channelsParam = urlParams.get('channels');
                const speedParam = urlParams.get('speed');

                if (channelsParam || speedParam) {
                    // dirty: wait a bit to make sure the midi file is loaded
                    setTimeout(() => {
                        // check for channels in the url
                        if (channelsParam) {
                            userSettings.channels = JSON.parse(decodeURIComponent(channelsParam));
                            // loop through the channels and set the values
                            for (const channel in userSettings.channels) {
                                const channelSettings = { ...userSettings.channels[channel] };
                                for (setting in channelSettings) {
                                    // First set the select elements
                                    const value = channelSettings[setting];
                                    // console.log("Setting channel:", channel, "setting:", setting, "value:", value);
                                    var element = document.getElementById(setting);
                                    if (element && element.tagName === 'SELECT') {
                                        element.selectedIndex = value;
                                        element.dispatchEvent(new Event('change'));
                                        delete channelSettings[setting];
                                    }
                                }
                                setTimeout(() => {
                                    // Now set the sliders
                                    for (setting in channelSettings) {
                                        const value = channelSettings[setting];
                                        // console.log("Setting channel:", channel, "setting:", setting, "value:", value);
                                        var element = document.getElementById(setting);
                                        if (element && element.tagName === 'INPUT' && element.type === 'range') {
                                            element.value = value;
                                            element.dispatchEvent(new Event('input'));
                                        }
                                    }
                                }, 500);
                            }
                            if (speedParam) {
                                // speed needs to be set after the channel settings for some reason
                                updateUserSettings("speed", speedParam, -1);
                                speed = parseFloat(userSettings.speed);
                                speedSlider.value = speed;
                                const label = document.querySelector('label[for="speedControl"]');
                                const speedBPM = (bpm * speed).toFixed(2);
                                // console.log("BPM from MIDI file:", bpm, "SPEED:", speed, "RESULT:", speedBPM);
                                Tone.Transport.bpm.value = speedBPM;
                                if (label) {
                                    label.textContent = "Playback Speed: " + speedBPM + "bpm";
                                }
                            }
                            setPlayButtonAcive(true);
                        }
                    }, 800);
                } else {
                    setPlayButtonAcive(true);
                }
            })
            .catch(error => {
                console.log(error);
                alert('Error loading MIDI file: ' + error);
            });
    } else {
        // if no midi file is loaded, make the play button active and load webaudiofont piano as default
        setPlayButtonAcive(true);
        // console.log("No linked MIDI file found.");
        if (midiInputs.length > 0) {
            console.log("loading piano");
            loadInstrumentsForProgramChange(0, 0, 0, "Piano");
        }
    }
}

function updateSlider_mode(value) {
    if (loader.webAudioWorklet) {
        loader.sendFloatParameterToWorklet("mode", value);
    } else {
        loader.audiolib.setFloatParameter("mode", value);
    }
    var negRoots = document.getElementById("negRoots");
    negRoots.hidden = (value == 2) ? false : true;
    var perOkt = document.getElementById("perOkt");
    perOkt.hidden = (value == 0) ? true : false;
    normal = perOkt.hidden;
    sendEvent_allNotesOff();
    updateUserSettings("mode", value, -1);
}

function updateSlider_negRoot(value) {
    if (loader.webAudioWorklet) {
        loader.sendFloatParameterToWorklet("negRoot", value);
    } else {
        loader.audiolib.setFloatParameter("negRoot", value);
    }
    sendEvent_allNotesOff();
    updateUserSettings("negRoot", value, -1);
}

function updateSlider_perOktave(value) {
    if (loader.webAudioWorklet) {
        loader.sendFloatParameterToWorklet("perOktave", value);
    } else {
        loader.audiolib.setFloatParameter("perOktave", value);
    }
    sendEvent_allNotesOff();
    updateUserSettings("perOktave", value, -1);
}

function parseMidiFile() {
    console.log(midiData);

    // reset speed and speed slider to 1
    speedSlider.value = 1.0;
    speed = 1.0;

    const label = document.querySelector('label[for="speedControl"]');
    //Get bpm from midi file if present
    if (midiData.header.tempos.length > 0) {
        bpm = midiData.header.tempos[0]["bpm"];
        const speedBPM = (bpm * speed).toFixed(2);
        // console.log("BPM from MIDI file:", bpm, "SPEED:", speed, "RESULT:", speedBPM);
        Tone.Transport.bpm.value = speedBPM;
        if (label) {
            label.textContent = "Playback Speed: " + speedBPM + "bpm";
        }
    }
    else {
        // console.log("No BPM found in MIDI file. Defaulting to 120 bpm.");
        Tone.Transport.bpm.value = 120; // Default to 120 bpm
        speedSlider.label = "Speed: 120bpm";
        if (label) {
            label.textContent = "Playback Speed: " + (bpm * speed).toFixed(2) + "bpm";
        }
    }
    if (midiData.header.name) {
        document.getElementById("midiFileName").innerHTML = midiData.header.name;
    }
    else {
        document.getElementById("midiFileName").innerHTML = "";
    }

    // Schedule the events - creates parts for each channel
    scheduleMIDIEvents(midiData);
}

function reloadPageWithUrl() {
    // dirty...
    const url = document.getElementById("midiUrl").value;
    if (url) {
        let newUrl = window.location.pathname + "?midiFile=" + encodeURIComponent(url);
        window.location.href = newUrl;
    }
}

function setupMidiPlayer() {
    // MIDI player code

    var playing = false;
    let parts = []; // Store the scheduled MIDI parts

    // Handle MIDI file upload
    document.getElementById('midiUpload').addEventListener('change', (event) => {

        // make playbutton unrespondable
        setPlayButtonAcive(false);
        // hide share button
        document.getElementById("hiddenShareButton").style.display = "none";
        const shares = document.getElementById("st-1")
        if (shares) {
            shares.style.display = "none";
        }

        cleanup();

        // console.log("Loading MIDI file...");
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const midi = new Midi(e.target.result);
                midiData = midi; // Store parsed MIDI data
                userSettings = { "channels": {} }; // Reset user settings
                parseMidiFile();
                setPlayButtonAcive(true);
            };
            reader.readAsArrayBuffer(file);
            // console.log("MIDI file loaded.");
        }
        else {
            console.error("No MIDI file selected.");
        }
    });

    // Function to parse the MIDI file and schedule events
    window.scheduleMIDIEvents = function (midi) {
        // Clear any previous scheduled parts
        parts.forEach(part => part.dispose());
        parts = [];

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
                    bpm: tempo.bpm
                });
            });
        }

        // Set timeSignature
        if (midi.header.timeSignatures.length > 0) {
            const timeSignature = midi.header.timeSignatures[0];
            console.log("Time Signature:", timeSignature.timeSignature);
            Tone.Transport.timeSignature = timeSignature.timeSignature;
        }

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
                channelParts[channel].add(note.time, {
                    type: 'note',
                    midi: note.midi,
                    duration: note.duration,
                    velocity: (channel === 9) ? Math.floor(note.velocity * 127) : Math.floor(Math.pow(note.velocity, 2) * 127),
                    channel: channel,
                    length: note.time + note.duration
                });
            });

            // Schedule control change events
            Object.values(track.controlChanges).forEach(controlChange => {
                controlChange.forEach(cc => {
                    // add the first to loadedChannelControlValues in order to have a starting value for the controls
                    if (!loadedChannelControlValues[channel]) {
                        loadedChannelControlValues[channel] = {};
                    }
                    if (!loadedChannelControlValues[channel][cc.number]) {
                        loadedChannelControlValues[channel][cc.number] = cc.value;
                    }
                    channelParts[channel].add(cc.time, {
                        type: 'controlChange',
                        number: cc.number,
                        value: cc.value,
                        channel: channel
                    });
                });
            });

            // Schedule program change events
            if (track.instrument !== undefined) {
                const programChange = Math.max(track.instrument["number"] || 0, 0);
                if (channel != 9 && channel >= 0) {
                    // preload the instruments for the program change and setup mixer channels
                    loadInstrumentsForProgramChange(channel, programChange, 0, track.name);
                }
                if (programChange >= 0) {
                    channelParts[channel].add(0, {
                        type: 'programChange',
                        number: programChange,
                        channel: channel
                    });
                }
                if (channel === 9) {
                    track.notes.forEach(note => {
                        if (!availableDrumSoundsForNote[note.midi]) {
                            // preload the drum sounds for each used note
                            loadDrumSoundForNote(note.midi);
                        }
                    });
                }
            }

            // Schedule pitch bend events
            if (track.pitchBends.length > 0) {
                track.pitchBends.forEach(bend => {
                    channelParts[channel].add(bend.time, {
                        type: 'pitchBend',
                        value: (bend.value + 1) * 8192,
                        channel: channel
                    });
                });
            }

            if (userSettings.negRoot === undefined) {
                // Store the last notes played by the midi player to check the piece's key
                if (track.notes.length > 0 && channel != 9) {
                    const lastNote = track.notes[track.notes.length - 1].midi;
                    if (!lastNotes.includes(lastNote)) {
                        lastNotes.push(lastNote);
                    }
                }
            }
            //end of looping track
        });

        // Check the piece's key
        if (lastNotes.length > 0) {
            // get the lowest note
            const lowestNote = Math.min(...lastNotes);
            // set root input to the lowest note
            const negRootRadios = document.getElementsByName("negRoot");
            for (const radio of negRootRadios) {
                if ((parseFloat(radio.value) + 3) % 12 === (lowestNote + 6) % 12) {
                    radio.checked = true;
                    updateSlider_negRoot(parseFloat(radio.value));
                    break;
                } else {
                    radio.checked = false;
                }
            }
        }

        // Start all parts
        Object.values(channelParts).forEach(part => {
            part.callback = (time, event) => {
                switch (event.type) {
                    case 'note':
                        onMIDIMessage({
                            data: [0x90 + event.channel, event.midi, event.velocity]
                        });
                        const noteOffTime = event.length / speed;
                        Tone.Transport.schedule((releaseTime) => {
                            onMIDIMessage({
                                data: [0x80 + event.channel, event.midi, 0]
                            });
                            // console.log("Note off:", event.midi, "at time:", releaseTime);
                        }, noteOffTime);
                        break;
                    case 'controlChange':
                        onMIDIMessage({
                            data: [0xB0 + event.channel, event.number, Math.floor(event.value * 127)]
                        });
                        break;
                    case 'programChange':
                        onMIDIMessage({
                            data: [0xC0 + event.channel, event.number]
                        });
                        break;
                    case 'pitchBend':
                        onMIDIMessage({
                            data: [0xE0 + event.channel, event.value & 0x7F, event.value >> 7]
                        });
                        break;
                    case 'tempo':
                        // Tone.Transport.bpm.rampTo(event.bpm * speed, 0.1);
                        Tone.Draw.schedule(function (time) {
                            const label = document.querySelector('label[for="speedControl"]');
                            if (label) {
                                label.textContent = "Playback Speed: " + (event.bpm * speed).toFixed(2) + "bpm";
                            }
                        }, "+0.01");
                        break;
                }
            };
            part.start();
            parts.push(part);
        });
    }

    const progressSlider = document.getElementById('progress-input');

    // Play the MIDI file
    document.getElementById('playMidi').addEventListener('click', () => {
        var playBtn = document.getElementById('playMidi');
        if (!playing) {
            if (midiData) {
                playBtn.innerText = "Stop Playback";
                playing = true;
                Tone.Transport.start();
                progressSlider.style.display = "block";

                // Update the progress slider during playback
                Tone.Transport.scheduleRepeat(() => {
                    if (playing) {
                        const progress = (Tone.Transport.seconds / (midiData.duration / speed)) * 100;
                        progressSlider.value = progress;

                        if (progress >= 100) {
                            // console.log("Stopping playback...");
                            playBtn.innerText = "Play MIDI";
                            playing = false;
                            Tone.Transport.stop();
                            Tone.Transport.position = 0;
                            progressSlider.value = 0;
                            progressSlider.style.display = "none";
                            sendEvent_allNotesOff();
                        }
                    }
                }, '0.1s');
            } else {
                alert("Please upload a MIDI file or paste a url to a file first.");
                console.error("No MIDI file loaded or parsed.");
            }
        } else {
            // console.log("Stopping playback...");
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            playBtn.innerText = "Play MIDI";
            progressSlider.value = 0;
            progressSlider.style.display = "none";
            playing = false;
            setTimeout(() => {
                sendEvent_allNotesOff(); // sometimes some notes are hanging after transport stop
            }, 300);
        }
    });

    progressSlider.oninput = function (event) {
        const position = (event.target.value / 100) * (midiData.duration / speed);
        Tone.Transport.seconds = position;
        setTimeout(() => {
            sendEvent_allNotesOff(); // sometimes some notes are hanging after transport stop
        }, 300);
    };

    // Control playback speed with a range input
    document.getElementById('speedControl').addEventListener('input', function (event) {
        speed = parseFloat(event.target.value);
        Tone.Transport.bpm.value = (bpm * speed).toFixed(2);
        const label = document.querySelector('label[for="speedControl"]');
        if (label) {
            label.textContent = "Playback Speed: " + (bpm * speed).toFixed(2) + "bpm";
        }
        updateUserSettings("speed", speed, -1);
    });
}

function setupGMPlayer() {
    player = new WebAudioFontPlayer();
    // Create a reverb node
    // Create a convolution reverb node for better quality reverb
    const reverb = audioContext.createConvolver();
    const reverbGain = audioContext.createGain();
    reverbGain.gain.value = 0.5; // Adjust the reverb gain as needed
    reverb.connect(reverbGain);
    reverbGain.connect(audioContext.destination);


    function createReverbSendGainNode() {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.7;
        gainNode.connect(reverb);
        return gainNode;
    }


    // Function to load the preset
    window.loadPreset = function (url) {
        return new Promise((resolve, reject) => {
            var name = '_tone_' + url.split('/').pop().replace('.js', '');
            player.loader.startLoad(audioContext, url, name);
            // player.loader.waitLoad(function () {
            // console.log('Preset loaded:', name);
            resolve(name);
            // });
        });
    }

    window.loadDrumSound = function (url) {
        return new Promise((resolve, reject) => {
            var name = '_drum_' + url;
            var domained_url = "https://surikov.github.io/webaudiofontdata/sound/128" + url + ".js"
            player.loader.startLoad(audioContext, domained_url, name);
            // player.loader.waitLoad(function () {
            // console.log('Drum sound loaded:', name);
            resolve(name);
            // });
        });
    }

    // Play note on event after preset is fully loaded
    window.handleNoteOnForChannel = function (note, velocity, channel) {
        // console.log("Velocity:", velocity, "Channel:", channel, "Note:", note.midi);
        handleNoteOff(channel, note.midi);
        if (soloChannels.length > 0 && !soloChannels.includes(channel)) return;
        if (channel === 9) {
            if (window[drumInstrument.notes[note.midi]] === undefined) {
                console.log('Drum sound is missing or still loading:', note.midi, drumInstrument);
                return;
            }
            // handleNoteOff(channel, note.midi);
            // console.log('Drum sound:', drumInstrument.notes[note.midi]);
            var envelope = player.queueWaveTable(audioContext, drumInstrument.gainNode, window[drumInstrument.notes[note.midi]],
                audioContext.currentTime, note.midi, 9999, velocity); // Long duration to ensure sustained note
            // console.log("Drum sound:", drumInstrument.notes[note.midi], "at time:", Tone.Transport.position, "velocity:", velocity);
        }
        else {
            var instrument = loadedChannelInstruments[channel];
            if (instrument.preset === "loading" || instrument.preset === undefined) {
                // console.log('Instrument is still loading:', channel, instrument);
                return;
            }
            var envelope = player.queueWaveTable(audioContext, instrument.gainNode, window[instrument.preset],
                audioContext.currentTime, note.midi, 9999, velocity); // Long duration to ensure sustained note
        }

        // Store the audio source for later stopping it on note off
        var note = {
            channel: channel,
            pitch: note.midi,
            envelope: envelope
        };
        midiNotes.push(note);
    }

    window.handleNoteOff = function (channel, note) {
        let noteRemoved = false;
        midiNotes = midiNotes.filter((midiNote) => {
            if (!noteRemoved && midiNote.pitch === note.midi && midiNote.channel === channel) {
                if (midiNote.envelope) {
                    if (!sustain[channel]) {
                        midiNote.envelope.cancel();
                    } else {
                        sustainedNodes[note.midi] = midiNote.envelope;
                    }
                }
                noteRemoved = true;
                return false;
            }
            return true;
        });
    }

    window.handlePitchBend = function (note, value) {
        // set pitch bend to the playback rate
        note.envelope.audioBufferSourceNode.playbackRate.linearRampToValueAtTime(note.envelope.audioBufferSourceNode.playbackRate.value + value, audioContext.currentTime + 0.1);
    }

    window.loadInstrumentsForProgramChange = function (channel, programNumber, sfIndex, name) {
        //preload the instruments for the program change and setup mixer channels
        if (!availableInstrumentsForProgramChange[programNumber]) {
            links = linksForProgramChange(programNumber);
            // console.log('Available instruments for program change:', availableInstrumentsForProgramChange[programNumber]);
            const instrumentUrl = "https://surikov.github.io/webaudiofontdata/sound/" + links.urls[sfIndex] + ".js"; // Load the first instrument for now
            var channelInstrument = createChannelInstrumentForChannel(channel, "loading", sfIndex);
            loadPreset(instrumentUrl)
                .then((preset) => {
                    availableInstrumentsForProgramChange[programNumber].preset = preset; // Ensure preset is set correctly
                    // availableInstrumentsForProgramChange[programNumber].usingChannels.push(channel);
                    channelInstrument.preset = preset; // Store the loaded preset
                    loadedChannelInstruments[channel] = channelInstrument;
                    loadedChannelInstruments[channel].programNumber = programNumber;
                    loadedChannelInstruments[channel].sfIndex = sfIndex;
                    // create controls for the channel
                    createControlsForChannel(channel, programNumber, sfIndex, name);
                    // console.log('Preset loaded and decoded. AVAILABLE:', availableInstrumentsForProgramChange, "channelInsts:", loadedChannelInstruments);
                })
                .catch((error) => {
                    console.error('Error loading preset:', error);
                });
        } else {
            if (availableInstrumentsForProgramChange[programNumber].preset === "loading") {
                // console.log('Instrument is already loading:', programNumber, availableInstrumentsForProgramChange[programNumber]);
                setTimeout(() => {
                    loadInstrumentsForProgramChange(channel, programNumber, sfIndex, name);
                }, 300);
                return;
            }
            else {
                // availableInstrumentsForProgramChange[programNumber].usingChannels.push(channel)
                loadedChannelInstruments[channel] = createChannelInstrumentForChannel(channel, availableInstrumentsForProgramChange[programNumber].preset, sfIndex);
                loadedChannelInstruments[channel].programNumber = programNumber;
                createControlsForChannel(channel, programNumber, sfIndex, name);
            }
        }
    }

    window.loadDrumSoundForNote = function (note) {
        if (!availableDrumSoundsForNote[note]) {
            links = linksForDrumSound(note);
            // console.log('Available drum sounds for note:', availableDrumSoundsForNote[note]);
            const drumSoundUrl = links.urls[0]; // Load the first drum sound for now
            addNoteToDrumInstrument(note, "loading");
            if (drumSoundUrl != undefined) {
                loadDrumSound(drumSoundUrl)
                    .then((preset) => {
                        availableDrumSoundsForNote[note].preset = preset;
                        addNoteToDrumInstrument(note, preset);
                        // console.log('Drum sound loaded and decoded. AVAILABLE:', availableDrumSoundsForNote);
                        createDrumInstrumentControl(note, 0);
                    })
                    .catch((error) => {
                        console.error('Error loading drum sound:', error);
                    });
            } else {
                console.warn("No drum sound URL found for note:", note);
            }
        } else {
            if (availableDrumSoundsForNote[note].preset === "loading") {
                // console.log('Drum sound is already loading:', note, availableDrumSoundsForNote[note]);
                setTimeout(() => {
                    loadDrumSoundForNote(note);
                }, 300);
                return;
            }
            else {
                addNoteToDrumInstrument(note, availableDrumSoundsForNote[note].preset);
                createDrumInstrumentControl(note, 0);
            }
        }
    }

    function addNoteToDrumInstrument(note, preset) {
        if (!drumInstrument) {
            var gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;
            var panNode = audioContext.createStereoPanner();
            panNode.pan.value = 0;
            gainNode.connect(panNode);
            panNode.connect(audioContext.destination);
            drumInstrument = { notes: {}, gainNode: gainNode, panNode: panNode };
        }
        drumInstrument.notes[note] = preset;
        // console.log('Drum instrument:', drumInstrument);
    }

    function createChannelInstrumentForChannel(channel, preset, sfIndex) {
        if (loadedChannelInstruments[channel]) {
            loadedChannelInstruments[channel].preset = preset;
            loadedChannelInstruments[channel].sfIndex = sfIndex;
            return loadedChannelInstruments[channel];
        }
        var gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        var panNode = audioContext.createStereoPanner();
        panNode.pan.value = 0;
        gainNode.connect(panNode);
        panNode.connect(audioContext.destination);

        // Create and connect reverb send gain node
        const reverbSendGainNode = createReverbSendGainNode(channel);
        panNode.connect(reverbSendGainNode);

        var channelInstrument = { preset: preset, sfIndex: 0, panNode: panNode, gainNode: gainNode, reverbSendGainNode: reverbSendGainNode };
        return channelInstrument;
    }

    function linksForProgramChange(i) {
        filter = ""
        if (i < 10) {
            filter = "00" + i;
        }
        else if (i < 100) {
            filter = "0" + i;
        } else {
            filter = i.toString();
        }
        var nn = player.loader.findInstrument(i);
        availableInstrumentsForProgramChange[i] = { name: player.loader.instrumentInfo(nn).title, urls: player.loader.instrumentKeys().filter(url => url.startsWith(filter)), preset: "loading" }; //, usingChannels: [] };
        return availableInstrumentsForProgramChange[i];
    }

    function linksForDrumSound(i) {
        filter = i.toString();
        var nn = player.loader.findDrum(i);
        info = player.loader.drumInfo(nn);
        availableDrumSoundsForNote[i] = { name: info.title, urls: player.loader.drumKeys().filter(url => url.startsWith(filter)), preset: "loading" };
        // console.log("Drum sound:", i, availableDrumSoundsForNote[i]);
        return availableDrumSoundsForNote[i];
    }

    window.setIR = function (irUrl) {
        fetch("IRs/" + irUrl + ".wav")
            .then(response => response.arrayBuffer())
            .then(data => audioContext.decodeAudioData(data))
            .then(buffer => {
                reverb.buffer = buffer;
                const reverbSelect = document.getElementById("reverbSelect");
                updateUserSettings("irUrl", reverbSelect.selectedIndex, -1);
            })
            .catch(error => console.error('Error loading impulse response:', error));
    }

    // Load an impulse response for the convolution reverb
    setIR('182806__unfa__ir-02-gunshot-in-a-chapel-mixed');

    window.setReverbGain = function (value) {
        reverbGain.gain.value = value;
        updateUserSettings("reverbGain", value, -1);
        // update the label
        var revLabel = document.querySelector('label[for="reverbVolume"]');
        revLabel.innerHTML = "Reverb Volume: " + parseFloat(value).toFixed(2);
    }
}

// Function to generate URL with query parameters
function generateShareUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => {
        if (typeof params[key] === 'object') {
            url.searchParams.append(key, encodeURIComponent(JSON.stringify(params[key])));
        } else {
            url.searchParams.append(key, params[key]);
        }
    });
    return url.toString();
}

// Function to update ShareThis URL
function updateShareUrl(shareUrl) {
    const shareButtons = document.querySelectorAll('.sharethis-inline-share-buttons');
    shareButtons.forEach(button => {
        button.setAttribute('data-url', shareUrl);
    });
}

window.share = function () {
    const url = document.getElementById("midiUrl").value;
    const baseUrl = window.location.href.split('?')[0] + "?midiFile=" + encodeURIComponent(url); // Base URL without query parameters
    const shareUrl = generateShareUrl(baseUrl, userSettings);
    updateShareUrl(shareUrl);
    navigator.clipboard.writeText(shareUrl).then(() => {
        const notification = document.createElement('div');
        notification.innerText = 'Share URL copied to clipboard!';
        notification.style.position = 'fixed';
        notification.style.bottom = '10px';
        notification.style.right = '10px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        notification.style.color = 'white';
        notification.style.padding = '10px';
        notification.style.borderRadius = '5px';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }).catch(err => {
        console.error('Failed to copy share URL: ', err);
    });
    // console.log("SHARE:",shareUrl);
    const shares = document.getElementById("st-1")
    if (shares) {
        shares.style.display = "block";
    }
}

function updateUserSettings(key, value, channel) {
    if (channel === -1) {
        // for global settings
        userSettings[key] = value;
    } else {
        // for channel settings
        userSettings.channels[channel] = userSettings.channels[channel] || {};
        userSettings.channels[channel][key] = value;
    }
    // hide share buttons to have always the actual settings in url by forcing user to click share button again
    const shares = document.getElementById("st-1")
    if (shares) {
        shares.style.display = "none";
    }
    // console.log("User settings updated:", userSettings);
}

function cleanup() {
    userSettings = { "channels": {} };
    lastNotes = [];
    var midiFileName = document.getElementById("midiFileName");
    midiFileName.innerHTML = "";
    var element = document.getElementById("file_controls");
    for (var i = element.childNodes.length - 1; i >= 0; i--) {
        element.childNodes[i].remove();
    }
    loadedChannelControlValues = {};
    for (program in availableInstrumentsForProgramChange) {
        // release the preset for the program change
        window[availableInstrumentsForProgramChange[program].preset] = null;
        delete availableInstrumentsForProgramChange[program];
    }
    for (note in availableDrumSoundsForNote) {
        // release the drum sound for the note
        window[availableDrumSoundsForNote[note].preset] = null;
        delete availableDrumSoundsForNote[note];
    }
}

function createControlsForChannel(channel, programNumber, sfIndex, name) {
    let element = document.getElementById("channel_controls_" + channel);
    if (element) return;

    let nextSibling = element ? element.nextElementSibling : null;

    let controls = document.getElementById("file_controls");
    let controlDiv = document.createElement("div");
    controlDiv.id = "channel_controls_" + channel;
    controlDiv.style = "display: flex; flex-direction: column; margin: 10px; border: 1px solid #ccc; padding: 10px;";

    let nameHeader = document.createElement("h3");
    nameHeader.innerHTML = name;
    controlDiv.appendChild(nameHeader);

    let label = document.createElement("label");
    label.style = "margin: 5px;";
    label.innerHTML = `<strong>Channel ${channel}</strong> - <em>Selected instrument:</em>`;
    controlDiv.appendChild(label);

    let instSelect = document.createElement("select");
    instSelect.id = "instrumentSelect_" + channel;
    player.loader.instrumentTitles().forEach((name, i) => {
        let option = document.createElement("option");
        option.value = i;
        option.text = i + " - " + name;
        instSelect.appendChild(option);
    });
    instSelect.selectedIndex = programNumber;
    instSelect.onchange = function (event) {
        // console.log('Instrument changed:', event.target.selectedIndex, event.target.options[event.target.selectedIndex].text);
        loadInstrumentsForProgramChange(channel, event.target.selectedIndex, 0, event.target.options[event.target.selectedIndex].text);
        // update options for the soundfont select
        let select = document.getElementById("sfIndex_" + channel);
        select.innerHTML = "";
        availableInstrumentsForProgramChange[event.target.selectedIndex].urls.forEach((name, i) => {
            let option = document.createElement("option");
            option.value = i;
            option.text = name;
            select.appendChild(option);
        });
        select.selectedIndex = 0;
        preset = availableInstrumentsForProgramChange[event.target.selectedIndex]["urls"][0];
        availableInstrumentsForProgramChange[event.target.selectedIndex].preset = "_tone_" + preset;
        loadedChannelInstruments[channel].preset = "_tone_" + preset;
        loadedChannelInstruments[channel].programNumber = event.target.selectedIndex;
        updateUserSettings(event.target.id, event.target.value, channel);
        // console.log('INSTRUMENT Preset loaded and decoded. AVAILABLE:', availableInstrumentsForProgramChange[event.target.selectedIndex], "channelInsts:", loadedChannelInstruments[channel], channel);
    };
    controlDiv.appendChild(instSelect);

    let plabel = document.createElement("label");
    plabel.innerHTML = `<em>Selected soundfont:</em>`;
    plabel.style = "margin: 5px;";
    controlDiv.appendChild(plabel);
    // Create a select element for soundfont change
    let select = document.createElement("select");
    select.id = "sfIndex_" + channel;
    availableInstrumentsForProgramChange[programNumber].urls.forEach((name, i) => {
        let option = document.createElement("option");
        option.value = i;
        option.text = name;
        select.appendChild(option);
    });
    select.selectedIndex = loadedChannelInstruments[channel].sfIndex;
    select.onchange = function (event) {
        const select = event.target;
        programNumber = loadedChannelInstruments[channel].programNumber;
        // availableInstrumentsForProgramChange[programNumber].usingChannels.pop(channel);
        availableInstrumentsForProgramChange[programNumber].preset = "loading";
        loadedChannelInstruments[channel].preset = "loading";
        let instrumentUrl = availableInstrumentsForProgramChange[programNumber].urls[select.selectedIndex];
        loadPreset("https://surikov.github.io/webaudiofontdata/sound/" + instrumentUrl + ".js")
            .then((preset) => {
                availableInstrumentsForProgramChange[programNumber].preset = preset;
                loadedChannelInstruments[channel].preset = preset;
                loadedChannelInstruments[channel].sfIndex = select.selectedIndex;
                updateUserSettings(select.id, select.value, channel);
                // console.log('POGRAM Preset loaded and decoded. AVAILABLE:', availableInstrumentsForProgramChange, "channelInsts:", loadedChannelInstruments, "Preset:", preset);
            })
            .catch((error) => console.error('Error loading preset:', error));
    };
    controlDiv.appendChild(select);

    let solodiv = document.createElement("div");
    solodiv.style = "margin-top: 10px; display: flex; flex-direction: row; justify-content: center;";
    let soloCheckbox = document.createElement("input");
    soloCheckbox.type = "checkbox";
    soloCheckbox.id = "soloCheckbox_" + channel;
    soloCheckbox.onchange = function (event) {
        if (event.target.checked) {
            soloChannels.push(channel);
        } else {
            soloChannels = soloChannels.filter(c => c !== channel);
        }
    };
    let soloLabel = document.createElement("label");
    soloLabel.htmlFor = soloCheckbox.id;
    soloLabel.innerHTML = "Solo";
    solodiv.appendChild(soloCheckbox);
    solodiv.appendChild(soloLabel);
    controlDiv.appendChild(solodiv);

    // Volume control
    let vol_label = document.createElement("label");
    vol_label.id = "vol_label_" + channel;
    let volumeSlider = document.createElement("input");
    volumeSlider.id = "volumeSlider_" + channel;
    volumeSlider.type = "range";
    volumeSlider.min = 0;
    volumeSlider.max = 127;
    volumeSlider.value = (channel in loadedChannelControlValues && 7 in loadedChannelControlValues[channel])
        ? loadedChannelControlValues[channel][7] * 127
        : loadedChannelInstruments[channel].gainNode.gain.value * 127;
    vol_label.innerHTML = `Volume: ${(volumeSlider.value / 127).toFixed(2)}`;
    volumeSlider.setAttribute('data-channel', channel);
    volumeSlider.oninput = function (event) {
        let slider = event.target;
        let channel = slider.getAttribute('data-channel');
        loadedChannelInstruments[channel].gainNode.gain.value = slider.value / 127;
        document.getElementById("vol_label_" + channel).innerHTML = `Volume: ${(slider.value / 127).toFixed(2)}`;
        updateUserSettings(slider.id, slider.value, channel);
    };
    controlDiv.appendChild(vol_label);
    controlDiv.appendChild(volumeSlider);

    // Pan control
    let pan_label = document.createElement("label");
    pan_label.id = "pan_label_" + channel;
    let panSlider = document.createElement("input");
    panSlider.id = "panSlider_" + channel;
    panSlider.type = "range";
    panSlider.min = -1;
    panSlider.max = 1;
    panSlider.step = 0.01;
    panSlider.value = (channel in loadedChannelControlValues && 10 in loadedChannelControlValues[channel])
        ? loadedChannelControlValues[channel][10] * 2 - 1
        : loadedChannelInstruments[channel].panNode.pan.value;
    pan_label.innerHTML = `Panning: ${parseFloat(panSlider.value).toFixed(2)}`;
    panSlider.setAttribute('data-channel', channel);
    panSlider.oninput = function (event) {
        let slider = event.target;
        let channel = slider.getAttribute('data-channel');
        loadedChannelInstruments[channel].panNode.pan.value = slider.value;
        document.getElementById("pan_label_" + channel).innerHTML = `Panning: ${parseFloat(slider.value).toFixed(2)}`;
        updateUserSettings(slider.id, slider.value, channel);
    };
    controlDiv.appendChild(pan_label);
    controlDiv.appendChild(panSlider);

    // Reverb send control
    let reverb_label = document.createElement("label");
    reverb_label.id = "reverb_label_" + channel;
    reverb_label.style = "margin-top: 10px;";
    let reverbSlider = document.createElement("input");
    reverbSlider.id = "reverbSlider_" + channel;
    reverbSlider.type = "range";
    reverbSlider.min = 0;
    reverbSlider.max = 1;
    reverbSlider.step = 0.01;
    reverbSlider.value = loadedChannelInstruments[channel].reverbSendGainNode.gain.value;
    reverb_label.innerHTML = `Reverb Send: ${parseFloat(reverbSlider.value).toFixed(2)}`;
    reverbSlider.setAttribute('data-channel', channel);
    reverbSlider.oninput = function (event) {
        let slider = event.target;
        let channel = slider.getAttribute('data-channel');
        loadedChannelInstruments[channel].reverbSendGainNode.gain.value = slider.value;
        document.getElementById("reverb_label_" + channel).innerHTML = `Reverb Send: ${parseFloat(slider.value).toFixed(2)}`;
        updateUserSettings(slider.id, slider.value, channel);
    };
    controlDiv.appendChild(reverb_label);
    controlDiv.appendChild(reverbSlider);

    if (nextSibling) {
        controls.insertBefore(controlDiv, nextSibling);
    } else {
        controls.appendChild(controlDiv);
    }
}

function createDrumInstrumentControl(note, sf2Index) {
    let availableSoundsForNote = availableDrumSoundsForNote[note];
    let controlDiv = document.getElementById("drum_controls");
    let noteDivs = document.getElementById("drumNoteDivs");
    if (!controlDiv) {
        let controls = document.getElementById("file_controls");
        controlDiv = document.createElement("div");
        controlDiv.id = "drum_controls";
        controlDiv.style = "display: flex; flex-direction: column; margin: 10px; width: 100%; border: 1px solid #ccc; padding: 10px;";

        let nameHeader = document.createElement("h3");
        nameHeader.innerHTML = "Drum Instrument";
        nameHeader.className = "title";
        controlDiv.appendChild(nameHeader);

        let vol_label = document.createElement("label");
        vol_label.id = "vol_label_drum";
        vol_label.style = "margin-top: 10px;";
        let volumeSlider = document.createElement("input");
        volumeSlider.id = "volumeSlider_drum";
        volumeSlider.type = "range";
        volumeSlider.min = 0;
        volumeSlider.max = 127;
        volumeSlider.value = (9 in loadedChannelControlValues && 7 in loadedChannelControlValues[9])
            ? loadedChannelControlValues[9][7] * 127
            : drumInstrument.gainNode.gain.value * 127;
        vol_label.innerHTML = `Volume: ${(volumeSlider.value / 127).toFixed(2)}`;
        volumeSlider.oninput = function (event) {
            drumInstrument.gainNode.gain.value = event.target.value / 127;
            document.getElementById("vol_label_drum").innerHTML = `Volume: ${(event.target.value / 127).toFixed(2)}`;
            updateUserSettings(event.target.id, event.target.value, 9);
        };
        controlDiv.appendChild(vol_label);
        controlDiv.appendChild(volumeSlider);

        let pan_label = document.createElement("label");
        pan_label.id = "pan_label_drum";
        let panSlider = document.createElement("input");
        panSlider.id = "panSlider_drum";
        panSlider.type = "range";
        panSlider.min = -1;
        panSlider.max = 1;
        panSlider.step = 0.01;
        panSlider.value = (9 in loadedChannelControlValues && 10 in loadedChannelControlValues[9])
            ? loadedChannelControlValues[9][10] * 2 - 1
            : drumInstrument.panNode.pan.value;
        pan_label.innerHTML = `Panning: ${parseFloat(panSlider.value).toFixed(2)}`;
        panSlider.oninput = function (event) {
            drumInstrument.panNode.pan.value = event.target.value;
            document.getElementById("pan_label_drum").innerHTML = `Panning: ${parseFloat(event.target.value).toFixed(2)}`;
            updateUserSettings(event.target.id, event.target.value, 9);
        };
        controlDiv.appendChild(pan_label);
        controlDiv.appendChild(panSlider);

        let noteHeader = document.createElement("h4");
        noteHeader.innerHTML = "Drum Notes:";
        noteHeader.className = "title";
        controlDiv.appendChild(noteHeader);

        noteDivs = document.createElement("div");
        noteDivs.id = "drumNoteDivs";
        noteDivs.style = "display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between;";
        controlDiv.appendChild(noteDivs);

        controls.appendChild(controlDiv);
    }

    let noteDiv = document.getElementById("drumNoteDiv" + availableSoundsForNote.name);
    let nextSibling = noteDiv ? noteDiv.nextElementSibling : null;
    if (noteDiv) noteDiv.remove();

    noteDiv = document.createElement("div");
    noteDiv.id = "drumNoteDiv" + availableSoundsForNote.name;

    let noteLabel = document.createElement("label");
    noteLabel.innerHTML = `${availableSoundsForNote.name}: `;
    noteDiv.appendChild(noteLabel);

    let noteSelect = document.createElement("select");
    noteSelect.id = "drumNoteSelect" + availableSoundsForNote.name;
    noteSelect.style = "margin-top: 10px;";
    availableSoundsForNote.urls.forEach((url, i) => {
        let option = document.createElement("option");
        option.value = i;
        option.text = url;
        noteSelect.appendChild(option);
    });
    noteSelect.selectedIndex = sf2Index;
    noteSelect.onchange = function (event) {
        availableDrumSoundsForNote[note].preset = "loading";
        drumInstrument.notes[note] = "loading";
        let index = event.target.selectedIndex;
        let drumSoundUrl = availableSoundsForNote.urls[index];
        loadDrumSound(drumSoundUrl)
            .then((preset) => {
                availableDrumSoundsForNote[note].preset = preset;
                drumInstrument.notes[note] = preset;
                createDrumInstrumentControl(note, index);
                event.target.selectedIndex = index;
                updateUserSettings(event.target.id, index, 9);
            })
            .catch((error) => console.error('Error loading drum sound:', error));
    };
    noteDiv.appendChild(noteSelect);

    if (nextSibling) {
        noteDivs.insertBefore(noteDiv, nextSibling);
    } else {
        noteDivs.appendChild(noteDiv);
    }
}
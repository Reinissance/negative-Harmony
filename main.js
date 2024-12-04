
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
let fileSettings = {}; // Store the settings from the loaded MIDI file
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
    document.getElementsByClassName("st-toggle")[0].style.display = "none";
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
    var transportButton = document.getElementById("transportButton");
    transportButton.style.display = "none";
    // hide the label too
    var transportLabel = document.getElementById("transportLabel");
    transportLabel.style.display = "none";
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
                    handleControlSettingFromFile(channel, "volume", message[2] / 127);
                } else if (message[1] === 10) {
                    // Pan
                    handleControlSettingFromFile(channel, "pan", (message[2] - 64) / 64);
                } else if (message[1] === 91) {
                    // Reverb send
                    handleControlSettingFromFile(channel, "reverb", message[2] / 127);
                    // console.log("Reverb send change:", message[2], "on channel:", channel);
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
                };
            } else if (message[0] >= 0xC0 && message[0] < 0xD0) {
                // Program change
                // set the instrument for the channel
                Tone.Draw.schedule(function (time) {
                    if (channel === 9) {
                        // no programchange on drum channel
                    } else {
                        var select = setResettable(channel, "instrumentSelect_" + channel, message[1], "select");
                        if (select === null || userSettings[channel] === undefined || userSettings[channel][select.id] === undefined) {
                            return; // override by shared url settings
                        } else {
                            // console.log("setting instrument from FILE for channel:", channel, "to:", message[1], userSettings);
                            loadedChannelInstruments[channel].preset = availableInstrumentsForProgramChange[message[1]].preset;
                            select.selectedIndex = message[1];
                            select.dispatchEvent(new Event('change'));
                        }
                    };
                }, Tone.now());

            } else if (message[0] >= 0xE0 && message[0] < 0xF0) {
                channel = message[0] & 0x0F;
                // Pitch bend
                let pitchBendValue = (message[2] << 7) | message[1]; // Combine the two 7-bit values into a 14-bit value
                let normalizedBend = (pitchBendValue - 8192) / 8192; // Normalize to -1 to +1

                // Assuming a pitch bend range of 2 semitones (can be adjusted per channel)
                const pitchBendRange = 2; // Default pitch bend range in semitones
                const bendInSemitones = normalizedBend * pitchBendRange;

                // console.log("Pitch bend:", message, "on channel:", channel, "normalized:", normalizedBend, "semitones:", bendInSemitones);
                // Apply pitch bend to channel notes
                const channelNotes = midiNotes.filter(note => note.channel === channel);
                for (const note of channelNotes) {
                    handlePitchBend(note, bendInSemitones);
                }
            }
        }
        else {
            console.error("No MIDI output port available.");
        }
    }
}

function setResettable (channel, setting, value, type) {
    let resetSetting = fileSettings[channel] || {};
    // console.log("resetable: ", channel, setting, value, type, ":", fileSettings[channel]);
    switch (type) {
        case "slider":
            var id = setting + "Slider_" + ((channel != 9) ? channel : "drum");
            resetSetting[id] = value;
            var slider = document.getElementById(id);
            fileSettings[channel] = resetSetting;
            return slider;
        case "select":
            var id = setting;
            resetSetting[id] = value;
            var select = document.getElementById(id);
            fileSettings[channel] = resetSetting;
            return select;
    }
}

function handleControlSettingFromFile(channel, setting, value) {

    var slider = setResettable(channel, setting, value, "slider");

    Tone.Draw.schedule(function (time) {
        
        if (slider === null || userSettings[channel] === undefined || userSettings[channel][slider.id] === undefined) {
            return; // override by shared url settings
        }
        if (channel === 9) {
            drumInstrument.gainNode.gain.value = value;
            // console.log("Volume change:", message[2], "on DRUMchannel");
        } else {
            // console.log("Volume change:", message[2], "on channel:", channel);
            loadedChannelInstruments[channel].gainNode.gain.value = value;
        }
        slider.value = message[2];
        var v_label = document.getElementById(setting.substring(0, 3) + "_label_" + channel);
        v_label.innerHTML = setting.charAt(0).toUpperCase() + setting.slice(1) + ": " + value.toFixed(2);
    }, Tone.now());
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
        const negRootSelect = document.getElementById("parameter_negRoot");
        
        // find the options value that matches the lowest note        
        for (const option of negRootSelect.options) {
            if (parseInt(option.value) % 12 === negRootParam % 12) {
                negRootSelect.selectedIndex = negRootParam % 12;
                updateSlider_negRoot(parseInt(option.value));
                break;
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
                document.getElementById("file_controls").innerHTML = "";
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
                                function setSelect(element, index, setting) {
                                    if (setting.includes("Change")) {
                                        // drum notes have to match midi notes
                                        index = parseInt(index) - 35;
                                    }
                                    element.selectedIndex = index;
                                    // console.log("Setting SELECT:", setting, "to:", index);
                                    element.dispatchEvent(new Event('change'));
                                    delete channelSettings[setting];
                                }
                                // craete a filter for the keys
                                const keys = Object.keys(channelSettings);
                                const selectKeys = keys.filter(key => key.includes("drumNoteChange") || key.includes("instrument"));
                                for (const setting of selectKeys) {
                                    // to keep things in order we first set the select elements for changed drum notes or instruments
                                    const value = channelSettings[setting];
                                    var element = document.getElementById(setting);
                                    setSelect(element, value, setting);
                                }
                                // very dirty: after setting the select elements, which loads the soundfonts, we set the sliders
                                setTimeout(() => {
                                    // Now set the sliders
                                    for (setting in channelSettings) {
                                        const value = channelSettings[setting];
                                        var element = document.getElementById(setting);
                                        if (element && element.tagName === 'SELECT') {
                                            element.selectedIndex = value;
                                            element.dispatchEvent(new Event('change'));
                                            // console.log("Setting OTHER SELECT:", setting, "to:", value);
                                            return;
                                        }
                                        if (element && element.tagName === 'INPUT' && element.type === 'range') {
                                            element.value = value;
                                            element.dispatchEvent(new Event('input'));
                                            // console.log("Setting SLIDER:", setting, "to:", value);
                                        }
                                    }
                                    // show reset button
                                    // console.log("Setting channel:", channel, "settings:", userSettings.channels[channel]);
                                    var resetBtn = document.getElementById("resetButton_" + channel);
                                    if (resetBtn) {
                                        resetBtn.style.display = "block";
                                    }
                                }, 800);
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

                            // Load an impulse response for the convolution reverb if not in user settings
                            if (userSettings.irUrl === undefined) {
                                // console.log("Loading default impulse response...");
                                setIR('182806__unfa__ir-02-gunshot-in-a-chapel-mixed');
                            }

                            // GO!
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
            console.log("loading default: piano");
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
        if (playing) {
            // console.log("Stopping playback...");
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            playing = false;
            document.getElementById('playMidi').innerText = "Play MIDI";
            progressSlider.value = 0;
            progressSlider.style.display = "none";
            sendEvent_allNotesOff();
        }
        // make playbutton unrespondable
        setPlayButtonAcive(false);
        // hide share button
        document.getElementById("hiddenShareButton").style.display = "none";
        const shares = document.getElementById("st-1")
        if (shares) {
            shares.style.display = "none";
        }

        if (midiData) {
            cleanup();
        }

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

        let lastPC = 0;

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
                const programChange = track.instrument["number"] || lastPC;
                lastPC = programChange;
                if (channel != 9 && channel >= 0) {
                    // preload the instruments for the program change and setup mixer channels
                    loadInstrumentsForProgramChange(channel, programChange, 0, track.name);
                    // if (fileSettings[channel] === undefined) {
                        var select = setResettable(channel, "instrumentSelect_" + channel, programChange, "select");
                        // console.log("setting resetter from FILE for channel:", channel, "to:", programChange, userSettings);
                    // }
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
                            loadDrumSoundForNote(note.midi, 0);
                        }
                    });
                }
            }

            // Schedule pitch bend events
            if (track.pitchBends.length > 0) {
                track.pitchBends.forEach(bend => {
                    channelParts[channel].add(bend.time, {
                        type: 'pitchBend',
                        value: (bend.value + 1) * 8192, //pd bendin takes values from 0 to 16383
                        channel: channel
                    });
                    // console.log("Pitch bend:", bend, "on channel:", channel);
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
            const negRootSelect = document.getElementById("parameter_negRoot");
            // find the options value that matches the lowest note
            for (const option of negRootSelect.options) {
                if (parseInt(option.value) % 12 === lowestNote % 12) {
                    negRootSelect.selectedIndex = lowestNote % 12;
                    updateSlider_negRoot(parseInt(option.value));
                    break;
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
                Tone.Transport.scheduleRepeat((time) => {
                    if (playing) {
                        const progress = (Tone.Transport.seconds / (midiData.duration / speed)) * 100;
                        progressSlider.value = progress;

                        if (progress >= 100) {
                            // console.log("Stopping playback...");
                            playBtn.innerText = "Play MIDI";
                            playing = false;
                            Tone.Transport.stop(time);
                            Tone.Transport.position = 0;
                            progressSlider.value = 0;
                            progressSlider.style.display = "none";
                            sendEvent_allNotesOff();
                        }
                    }
                }, "0.1");
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

    window.handlePitchBend = function (note, semitones) {
        const factor = (!normal) ? -1 : 1;
        // set pitch bend to the playback rate
        // console.log("Pitch bend:", semitones, "env:", note.envelope);
        if (note.envelope.audioBufferSourceNode.detune !== undefined) {
            note.envelope.audioBufferSourceNode.detune.value = semitones * 100 * factor;
        } else {
            note.envelope.audioBufferSourceNode.playbackRate.value = Math.pow(2, semitones / 12 * factor);
        }
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
                    cleanCashed();
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
                cleanCashed();
            }
        }
    }

    window.loadDrumSoundForNote = function (note, sfIndex, callerId, overriddenNote) {
        if (!availableDrumSoundsForNote[note]) {
            links = linksForDrumSound(note);
            // console.log('Available drum sounds for note:', availableDrumSoundsForNote[note]);
            const drumSoundUrl = links.urls[sfIndex]; // Load the first drum sound for now
            addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, "loading");
            if (drumSoundUrl != undefined) {
                loadDrumSound(drumSoundUrl)
                    .then((preset) => {
                        availableDrumSoundsForNote[note].preset = preset;
                        addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, preset);
                        // console.log('Drum sound loaded and decoded. AVAILABLE:', availableDrumSoundsForNote);
                        createDrumInstrumentControl(note, sfIndex, callerId);
                        cleanCashed();
                    })
                    .catch((error) => {
                        console.error('Error loading drum sound:', error);
                    });
            } else {
                console.warn("No drum sound URL found for note:", note);
            }
        } else {
            if (availableDrumSoundsForNote[(overriddenNote) ? overriddenNote : note].preset === "loading") {
                // console.log('Drum sound is already loading:', (overriddenNote) ? overriddenNote : note, availableDrumSoundsForNote[(overriddenNote) ? overriddenNote : note]);
                setTimeout(() => {
                    loadDrumSoundForNote(note, sfIndex, callerId, overriddenNote);
                }, 300);
                return;
            }
            else {
                addNoteToDrumInstrument((overriddenNote) ? overriddenNote : note, availableDrumSoundsForNote[note].preset);
                // console.log('Drum sound already loaded:', (overriddenNote) ? overriddenNote : note, availableDrumSoundsForNote[(overriddenNote) ? overriddenNote : note]);
                cleanCashed();
            }
        }
    }

    window.addNoteToDrumInstrument = function(note, preset) {
        if (!drumInstrument) {
            var gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;
            var panNode = audioContext.createStereoPanner();
            panNode.pan.value = 0;
            gainNode.connect(panNode);
            panNode.connect(audioContext.destination);
            drumInstrument = { notes: {}, overriddenNotes: {}, gainNode: gainNode, panNode: panNode };
            resetSetting = fileSettings[9] || {};
            resetSetting["volumeSlider_drum"] = 127.0;
            resetSetting["panSlider_drum"] = 0.0;
            fileSettings[9] = resetSetting;
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
        // create default reset settings for the channel
        resetSetting = fileSettings[channel] || {};
        resetSetting["volumeSlider_" + channel] = 127.0;
        resetSetting["reverbSlider_" + channel] = 0.7;
        resetSetting["panSlider_" + channel] = 0.0;
        fileSettings[channel] = resetSetting;

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

    window.linksForDrumSound = function (i) {
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
                // console.log("Impulse response loaded:", irUrl);
            })
            .catch(error => console.error('Error loading impulse response:', error));
    }

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
        notification.style.width = 'fit-content';
        notification.style.left = '10000px'; // hacky: remains in the right corner
        notification.style.bottom = '10px';
        notification.style.position = 'sticky';
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
        if (userSettings.channels[channel] === undefined) {
            resetBtn = document.getElementById("resetButton_" + channel);
            resetBtn.style.display = "block";
        }
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

function resetChannelSettings(channel) {
    // console.log("Resetting channel settings for channel:", channel, fileSettings[channel]);
    for (setting in fileSettings[channel]) {
        let value = fileSettings[channel][setting];
        var element = document.getElementById(setting);
        if (element && element.tagName === 'SELECT') {
            element.selectedIndex = value;
            element.dispatchEvent(new Event('change'));
        } else if (element && element.tagName === 'INPUT' && element.type === 'range') {
            value = (setting === "panning") ? value * 127 - 64 : value * 127;
            element.value = value;
            element.dispatchEvent(new Event('input'));
        }
    }
    // remove the channel from userSettings
    userSettings.channels[channel] = undefined
    // hide the reset button
    var resetBtn = document.getElementById("resetButton_" + channel);
    resetBtn.style.display = "none";
}

function cleanup() {
    userSettings = { "channels": {} };
    fileSettings = {};
    lastNotes = [];
    loadedChannelInstruments = {};
    drumInstrument.notes = {};
    drumInstrument.overriddenNotes = {};
    var midiFileName = document.getElementById("midiFileName");
    midiFileName.innerHTML = "";
    document.getElementById("midiUrl").value = "";
    var element = document.getElementById("file_controls");
    for (var i = element.childNodes.length - 1; i >= 0; i--) {
        element.childNodes[i].remove();
    }
    loadedChannelControlValues = {};
    for (program in availableInstrumentsForProgramChange) {
        // release the preset for the program change
        // console.log("Releasing preset for program change:", program, availableInstrumentsForProgramChange[program]);
        window[availableInstrumentsForProgramChange[program].preset] = null;
        delete availableInstrumentsForProgramChange[program];
    }
    for (note in availableDrumSoundsForNote) {
        // release the drum sound for the note
        // console.log("Releasing drum sound for note:", note, availableDrumSoundsForNote[note]);
        window[availableDrumSoundsForNote[note].preset] = null;
        delete availableDrumSoundsForNote[note];
    }
    // console.log("left cached instruments:", player.loader.cached);
    for (let i = player.loader.cached.length - 1; i >= 0; i--) {
        // release the cached instruments in WebAudioFontPlayer
        let cachedInstr = player.loader.cached[i];
        window[cachedInstr] = null;
        // console.log("Releasing cached instrument:", cachedInstr);
        player.loader.cached.splice(i, 1);
    }
}

function cleanCashed () {
    let inUse = [];
    for (inst in loadedChannelInstruments) {
        if (availableInstrumentsForProgramChange[loadedChannelInstruments[inst].programNumber]) {
            inUse.push(availableInstrumentsForProgramChange[loadedChannelInstruments[inst].programNumber].preset);
        }
    }
    for (note in loadDrumSoundForNote) {
        if (availableDrumSoundsForNote[note]) {
            inUse.push(availableDrumSoundsForNote[note].preset);
        }
    }
    // console.log("presets inUse:", inUse);
    for (let i = player.loader.cached.length - 1; i >= 0; i--) {
        // release the cached instruments in WebAudioFontPlayer
        let cachedInstr = player.loader.cached[i];
        if (!inUse.includes(cachedInstr)) {
            window[cachedInstr] = null;
            // console.log("Releasing cached instrument:", cachedInstr);
            player.loader.cached.splice(i, 1);
        }
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
    controlDiv.classList.add("boxed");

    let nameHeader = document.createElement("h3");
    nameHeader.innerHTML = name;
    controlDiv.appendChild(nameHeader);

    let resetButton = createResetButton(channel);
    controlDiv.appendChild(resetButton);

    let label = document.createElement("label");
    label.style = "margin: 5px;";
    label.innerHTML = `<strong>Channel ${channel}</strong><br><em>Selected instrument:</em>`;
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
    instSelect.classList.add("form-select");
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
    if (select.selectedIndex != sfIndex) {
        console.warn("Soundfont index mismatch for channel:", channel, "selected:", select.selectedIndex, "sfIndex:", sfIndex);
    }
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
    select.classList.add("form-select");
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
    soloCheckbox.classList.add("btn-check"); 
    let soloLabel = document.createElement("label");
    soloLabel.htmlFor = soloCheckbox.id;
    soloLabel.innerHTML = "Solo";
    soloLabel.classList.add("btn", "btn-outline-warning", "boxed");
    solodiv.appendChild(soloCheckbox);
    solodiv.appendChild(soloLabel);
    controlDiv.appendChild(solodiv);

    function createControl(type, channel, label, min, max, step, value, onInput) {
        let controlLabel = document.createElement("label");
        controlLabel.id = `${type}_label_${channel}`;
        controlLabel.style = "margin-top: 10px;";
        controlLabel.innerHTML = `${label}: ${parseFloat(value).toFixed(2)}`;

        let controlSlider = document.createElement("input");
        controlSlider.id = `${type}Slider_${channel}`;
        controlSlider.type = "range";
        controlSlider.min = min;
        controlSlider.max = max;
        controlSlider.step = step;
        controlSlider.value = value;
        controlSlider.setAttribute('data-channel', channel);
        controlSlider.oninput = onInput;
        controlSlider.classList.add("form-range");

        return { controlLabel, controlSlider };
    }

    let volumeControl = createControl("volume", channel, "Volume", 0, 127, 1, 
        (channel in loadedChannelControlValues && 7 in loadedChannelControlValues[channel])
            ? loadedChannelControlValues[channel][7] * 127
            : loadedChannelInstruments[channel].gainNode.gain.value * 127,
        function (event) {
            let slider = event.target;
            let channel = slider.getAttribute('data-channel');
            loadedChannelInstruments[channel].gainNode.gain.value = slider.value / 127;
            document.getElementById("volume_label_" + channel).innerHTML = `Volume: ${(slider.value / 127).toFixed(2)}`;
            updateUserSettings(slider.id, slider.value, channel);
        }
    );
    controlDiv.appendChild(volumeControl.controlLabel);
    controlDiv.appendChild(volumeControl.controlSlider);

    let panControl = createControl("pan", channel, "Panning", -1, 1, 0.01, 
        (channel in loadedChannelControlValues && 10 in loadedChannelControlValues[channel])
            ? loadedChannelControlValues[channel][10] * 2 - 1
            : loadedChannelInstruments[channel].panNode.pan.value,
        function (event) {
            let slider = event.target;
            let channel = slider.getAttribute('data-channel');
            loadedChannelInstruments[channel].panNode.pan.value = slider.value;
            document.getElementById("pan_label_" + channel).innerHTML = `Panning: ${parseFloat(slider.value).toFixed(2)}`;
            updateUserSettings(slider.id, slider.value, channel);
        }
    );
    controlDiv.appendChild(panControl.controlLabel);
    controlDiv.appendChild(panControl.controlSlider);

    let reverbControl = createControl("reverb", channel, "Reverb Send", 0, 1, 0.01, 
        loadedChannelInstruments[channel].reverbSendGainNode.gain.value,
        function (event) {
            let slider = event.target;
            let channel = slider.getAttribute('data-channel');
            loadedChannelInstruments[channel].reverbSendGainNode.gain.value = slider.value;
            document.getElementById("reverb_label_" + channel).innerHTML = `Reverb Send: ${parseFloat(slider.value).toFixed(2)}`;
            updateUserSettings(slider.id, slider.value, channel);
        }
    );
    controlDiv.appendChild(reverbControl.controlLabel);
    controlDiv.appendChild(reverbControl.controlSlider);

    if (nextSibling) {
        controls.insertBefore(controlDiv, nextSibling);
    } else {
        controls.appendChild(controlDiv);
    }
}

function createResetButton(channel) {let resetButton = document.createElement("button");
    resetButton.innerHTML = "Reset to file settings";
    resetButton.id = "resetButton_" + channel;
    resetButton.style.display = "none";
    resetButton.onclick = function () {
        resetChannelSettings(channel);
    };

    resetButton.classList.add("btn", "btn-outline-warning", "boxed");
    return resetButton;
}

function createDrumInstrumentControl(note, sf2Index, callerId) {
    let availableSoundsForNote = availableDrumSoundsForNote[note];
    let controlDiv = document.getElementById("drum_controls");
    let noteDivs = document.getElementById("drumNoteDivs");
    if (!controlDiv) {
        // create the drum instrument controls if they don't exist
        let controls = document.getElementById("file_controls");
        controlDiv = document.createElement("div");
        controlDiv.id = "drum_controls";
        controlDiv.style = "display: flex; flex-direction: column; margin: 10px; width: 100%; border: 1px solid #ccc; padding: 10px;";
        controlDiv.classList.add("boxed");

        let nameHeader = document.createElement("h3");
        nameHeader.innerHTML = "Drum Instrument";
        nameHeader.className = "title";
        controlDiv.appendChild(nameHeader);
        let resetButton = createResetButton(9);
        controlDiv.appendChild(resetButton);

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
        volumeSlider.classList.add("form-range");
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
        panSlider.classList.add("form-range");
        controlDiv.appendChild(pan_label);
        controlDiv.appendChild(panSlider);

        let noteHeader = document.createElement("h4");
        noteHeader.innerHTML = "Drum Notes:";
        noteHeader.className = "title";
        controlDiv.appendChild(noteHeader);

        noteDivs = document.createElement("div");
        noteDivs.id = "drumNoteDivs";
        // noteDivs.style = "display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between;";
        noteDivs.classList.add("horizontal");
        controlDiv.appendChild(noteDivs);

        controls.appendChild(controlDiv);
    }

    // check if the note control already exists
    let noteDiv = document.getElementById("drumNoteDiv" + availableSoundsForNote.name);
    if (!noteDiv && callerId) {
        // if not, new sound was selected, so let's populate the select with the new soundfonts
        // note: - callerId is the select element that triggered the change
        //       - handling overridden notes and loading the new sound is done in the select's onchange event
        if (!callerId) return;
        const noteSelId = callerId.replace("drumNoteChangeSelect", "drumNoteSelect")
        var sfSelect = document.getElementById(noteSelId);
        // console.log('Drum note control already exists:', note, availableSoundsForNote, noteSelId, sfSelect.options);
        sfSelect.innerHTML = "";
        availableSoundsForNote.urls.forEach((url, i) => {
            let option = document.createElement("option");
            option.value = i;
            option.text = url;
            sfSelect.appendChild(option);
        });
        sfSelect.selectedIndex = sf2Index;
        // console.log('Drum note soundfont select populated:', sfSelect.options);
        return;
    } else {
        if (noteDiv) {
            return;
        }
        else if (!callerId) {
            // if not, create a new note control
            noteDiv = document.createElement("div");
            // console.log('Creating new drum note control:', note, availableSoundsForNote);
        }
    };

    let nextSibling = noteDiv ? noteDiv.nextElementSibling : null;

    noteDiv.id = "drumNoteDiv" + availableSoundsForNote.name.replace(" ", "_");
    noteDiv.style = "display: flex; flex-direction: row; border: 1px solid #ccc; padding: 10px; margin: 5px; align-items: center; justify-content: space-between;";
    noteDiv.classList.add("boxed", "stretch");

    let noteLabel = document.createElement("label");
    noteLabel.innerHTML = `${availableSoundsForNote.name}: `;
    noteDiv.appendChild(noteLabel);

    let selectDiv = document.createElement("div");
    selectDiv.style = "display: flex; flex-direction: column; margin-left: 10px;";

    let noteSelect = document.createElement("select");
    noteSelect.id = "drumNoteChangeSelect" + availableSoundsForNote.name.replace(/ /g, "_");
    player.loader.drumTitles().forEach((name, i) => {
        let option = document.createElement("option");
        option.value = i;
        option.text = name;
        noteSelect.appendChild(option);
    });
    noteSelect.selectedIndex = note - 35;
    noteSelect.onchange = function (event) {
        // console.log('Drum note changed:', event.target.selectedIndex + 35, event.target.options[event.target.selectedIndex].text);
        if (!availableDrumSoundsForNote[event.target.selectedIndex + 35]) {
            loadDrumSoundForNote(event.target.selectedIndex + 35, 0,  event.target.id, note);
        } else {
            addNoteToDrumInstrument(note, availableDrumSoundsForNote[event.target.selectedIndex + 35].preset);
        }
        drumInstrument.overriddenNotes[note] = event.target.selectedIndex + 35;
        updateUserSettings(event.target.id, event.target.value, 9);
    }
    noteSelect.classList.add("form-select");
    selectDiv.appendChild(noteSelect);

    let noteSfSelect = document.createElement("select");
    noteSfSelect.id = "drumNoteSelect" + availableSoundsForNote.name.replace(/ /g, "_");
    noteSfSelect.style = "margin-top: 10px;";
    availableSoundsForNote.urls.forEach((url, i) => {
        let option = document.createElement("option");
        option.value = i;
        option.text = url;
        noteSfSelect.appendChild(option);
    });
    noteSfSelect.selectedIndex = sf2Index;
    noteSfSelect.onchange = function (event) {
        availableDrumSoundsForNote[note].preset = "loading";
        drumInstrument.notes[note] = "loading";
        let index = event.target.selectedIndex;
        // in case the note is overriden by another note, use the overridden note
        const selNote = (note in drumInstrument.overriddenNotes) ? drumInstrument.overriddenNotes[note] : note;
        availableSoundsForNote = availableDrumSoundsForNote[selNote];
        let drumSoundUrl = availableSoundsForNote.urls[index];
        loadDrumSound(drumSoundUrl)
            .then((preset) => {
                availableDrumSoundsForNote[note].preset = preset;
                drumInstrument.notes[note] = preset;
                createDrumInstrumentControl(note, index, event.target.id);
                event.target.selectedIndex = index;
                updateUserSettings(event.target.id, index, 9);
            })
            .catch((error) => console.error('Error loading drum sound:', error));
        updateUserSettings(event.target.id, event.target.value, 9);
    };
    noteSfSelect.classList.add("form-select");
    selectDiv.appendChild(noteSfSelect);
    noteDiv.appendChild(selectDiv);

    if (nextSibling) {
        noteDivs.insertBefore(noteDiv, nextSibling);
    } else {
        noteDivs.appendChild(noteDiv);
    }
}
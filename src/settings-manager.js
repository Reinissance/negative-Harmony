/**
 * Settings Manager Module
 * Handles user settings persistence, URL sharing, and file settings management
 */

// const Utils = require("./utils");

class SettingsManager {
    constructor(app) {
        this.app = app;
        this.debouncedUpdateUserSettings = Utils.debounce(this.updateUserSettings.bind(this), 300);
    }

    async init() {
    }

    updateUserSettings(key, value, channel) {
        const state = this.app.state;
        
        if (channel === -1) {
            // Global setting
            state.userSettings[key] = value;
        } else {
            // Channel-specific setting
            if (!state.userSettings.channels[channel]) {
                state.userSettings.channels[channel] = {};
            }
            state.userSettings.channels[channel][key] = value;
        }
    }

    setResettable(channel, setting, value, type) {
        const fileSettings = this.app.fileSettings;
        let resetSetting = fileSettings[channel] || {};
        
        switch (type) {
            case "slider":
                const sliderId = setting + "Slider_" + ((channel !== 9) ? channel : "drum");
                resetSetting[sliderId] = value;
                const slider = document.getElementById(sliderId);
                fileSettings[channel] = resetSetting;
                return slider;
                
            case "select":
                const selectId = setting;
                resetSetting[selectId] = value;
                const select = document.getElementById(selectId);
                fileSettings[channel] = resetSetting;
                return select;
        }
        
        return null;
    }

    async checkForParamsInUrl(urlParams) {
        const state = this.app.state;

        // Global settings
        const reversed = urlParams.get('reversedPlayback');
        let keepReversed = false;
        if (reversed) {
            state.reversedPlayback = (reversed === "true");
            const reverseCheckbox = document.getElementById("reverseMidi");
            reverseCheckbox.checked = this.app.state.reversedPlayback;
            this.debouncedUpdateUserSettings("reversedPlayback", state.reversedPlayback, -1);
            if (state.reversedPlayback) {
                keepReversed = true;
            }
        }
        
        const negRootParam = urlParams.get('negRoot');
        if (negRootParam) {
            const negRootSelect = document.getElementById("parameter_negRoot");
            for (const option of negRootSelect.options) {
                if (parseInt(option.value) % 12 === negRootParam % 12) {
                    state.negRoot = parseInt(option.value);
                    negRootSelect.selectedIndex = option.index;
                    this.debouncedUpdateUserSettings("negRoot", state.negRoot, -1);
                    break;
                }
            }
        }
        
        const perOktaveParam = urlParams.get('perOktave');
        if (perOktaveParam) {
            // this.app.setPerOctave(parseFloat(perOktaveParam));
            state.perOktave = parseInt(perOktaveParam);
            this.debouncedUpdateUserSettings("perOktave", state.perOktave, -1);
            const oktSelect = document.getElementById("parameter_perOktave");
            oktSelect.selectedIndex = state.perOktave;
            console.error("perOktave:", state.perOktave);
        }
        
        const modeParam = urlParams.get('mode');
        if (modeParam) {
            state.mode = parseInt(modeParam, 10);
            const modeSelect = document.getElementById("parameter_mode");
            modeSelect.selectedIndex = state.mode;
            this.app.setModeSettingsHidden();
            this.debouncedUpdateUserSettings("mode", state.mode, -1);
        }
        
        const irUrlParam = urlParams.get('irUrl');
        const audioEngine = this.app.modules.audioEngine;
        if (irUrlParam) {
            state.irUrl = parseInt(irUrlParam);
            const reverbSelect = document.getElementById("reverbSelect");
            if (reverbSelect && reverbSelect.options[state.irUrl]) {
                if (audioEngine && audioEngine.setIR) {
                    audioEngine.setIR(reverbSelect.options[state.irUrl].value);
                }
                else {
                    console.warn("Audio engine not available to set IR");
                }
                reverbSelect.selectedIndex = state.irUrl;
                this.debouncedUpdateUserSettings("irUrl", state.irUrl, -1);
            }
        } else {
            // Load default impulse response
            if (audioEngine && audioEngine.setIR) {
                audioEngine.setIR('182806__unfa__ir-02-gunshot-in-a-chapel-mixed');
            }
            else {
                console.warn("Audio engine not available to set default IR");
            }
        }
        
        const reverbGainParam = urlParams.get('reverbGain');
        if (reverbGainParam) {
            const revSlider = document.getElementById("reverbVolume");
            if (revSlider) {
                state.reverbGain = parseFloat(reverbGainParam);
                revSlider.value = state.reverbGain;
                if (audioEngine && audioEngine.setReverbGain) {
                    audioEngine.setReverbGain(state.reverbGain);
                }
                else {
                    console.warn("Audio engine not available to set reverb gain");
                }
                this.debouncedUpdateUserSettings("reverbGain", state.reverbGain, -1);
            }
        }
        
        // Handle MIDI file loading
        const midiFileUrl = urlParams.get('midiFile');
        if (midiFileUrl && (midiFileUrl.endsWith(".mid") || midiFileUrl.endsWith(".midi"))) {
            state.midiFile = midiFileUrl;
            await this.loadMidiFileFromUrl(midiFileUrl, urlParams);
            document.getElementById("hiddenShareButton").style.display = "block";
            this.debouncedUpdateUserSettings("midiFile", midiFileUrl, -1);
            const transport = this.app.modules.transport;
            if (transport.forceUpdateChannel) {
                transport.updateChannels();
                // console.error("Forcing update of channel ranges after loading MIDI file.");
                transport.forceUpdateChannel = false;
            }
        } else {
            // No MIDI file, load default piano
            Utils.setPlayButtonActive(true);
            if (this.app.modules.midiManager?.midiInputs?.length > 0) {
                // TODO: Load default piano sound and create Controls
                console.log("Loading default: piano");
                const audioEngine = app?.modules.audioEngine;
                audioEngine?.loadInstrumentsForProgramChange(0, 0, 0, "Piano");
            }
        }

        const speedParam = urlParams.get('speed');
        if (speedParam) {
            this.app.modules.transport.setSpeed(parseFloat(speedParam));
        }

        state.reversedPlayback = keepReversed;
    }

    share() {
        const baseUrl = window.location.href.split('?')[0];
    
        // Flatten the state structure for URL parameters
        const urlParams = { ...this.app.state };
        
        // Move channels from userSettings.channels to top-level channels
        if (this.app.state.userSettings && this.app.state.userSettings.channels) {
            urlParams.channels = this.app.state.userSettings.channels;
        }
        
        // Remove userSettings from URL params since we've extracted what we need
        delete urlParams.userSettings;
        
        const shareUrl = Utils.generateShareUrl(baseUrl, urlParams);
        
        Utils.updateShareUrl(shareUrl);

        const shares = document.getElementById("st-1")
        if (shares) {
            shares.style.display = "block";
        }

        return shareUrl;
    }

    shareAndCopy() {
        const shareUrl = this.share();
        navigator.clipboard.writeText(shareUrl).then(() => {
            this.showShareNotification('Share URL copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy share URL: ', err);
            Utils.copyToClipboard(shareUrl);
        });
    }

    showShareNotification(message) {
        const notification = document.createElement('div');
        notification.innerText = message;
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
    }

    async loadMidiFileFromUrl(midiFileUrl, urlParams) {
        try {
            const response = await fetch(midiFileUrl);
            const data = await response.arrayBuffer();
            
            this.app.state.localFile = false;
            const midiManager = this.app.modules.midiManager;
            if (midiManager) {
                midiManager.parseMidiFile(new Midi(data));
            } else {
                console.error("Cannot load MIDI file: modular MIDI manager not available.");
            }

            // Handle channel settings
            await this.applyChannelSettings(urlParams);

            // Update UI
            document.getElementById("midiUrl").value = midiFileUrl;
            const shareUrl = this.share();

            Utils.setPlayButtonActive(true);
        } catch (error) {
            console.error('Error loading MIDI file:', error);
            Utils.showError('Error loading MIDI file: ' + error.message);
        }
    }

    async applyChannelSettings(urlParams) {
        const channelsParam = urlParams.get('channels');
        
        if (channelsParam) {
            // Wait for MIDI file to be fully loaded
            setTimeout(() => {
                if (channelsParam) {
                    this.applyChannelParams(channelsParam);
                }
            }, 1000);
        }
    }

    applyChannelParams(channelsParam) {
        const state = this.app.state;
        
        try {
            state.userSettings.channels = JSON.parse(decodeURIComponent(channelsParam));
            for (const channel in state.userSettings.channels) {
                const channelSettings = { ...state.userSettings.channels[channel] };
                
                // Apply select elements first
                const keys = Object.keys(channelSettings);
                const selectKeys = keys.filter(key => 
                    key.includes("drumNoteChange") || key.includes("instrument")
                );
                
                for (const setting of selectKeys) {
                    const value = channelSettings[setting];
                    const element = document.getElementById(setting);
                    
                    if (element) {
                        let index = value;
                        if (setting.includes("Change")) {
                            index = parseInt(index) - 35; // Drum notes adjustment
                        }
                        element.selectedIndex = index;
                        element.dispatchEvent(new Event('change'));
                        delete channelSettings[setting];
                    }
                }
                
                // Apply other settings after a delay
                setTimeout(() => {
                    this.applyRemainingChannelSettings(channelSettings, channel);
                }, 1000);
            }
        } catch (error) {
            console.error('Error applying channel parameters:', error);
        }
    }

    applyRemainingChannelSettings(channelSettings, channel) {
        for (const setting in channelSettings) {
            const value = channelSettings[setting];
            const element = document.getElementById(setting);
            
            if (element) {
                if (element.tagName === 'SELECT') {
                    element.selectedIndex = value;
                    element.dispatchEvent(new Event('change'));
                } else if (element.tagName === 'INPUT' && element.type === 'range') {
                    element.value = value;
                    element.dispatchEvent(new Event('input'));
                }
            }
        }
        
        // Show reset button
        const resetBtn = document.getElementById("resetButton_" + channel);
        if (resetBtn) {
            resetBtn.style.display = "block";
        }
    }

    createControlsForChannel(channel, programNumber, sfIndex, name) {
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

        let resetButton = this.createResetButton(channel);
        controlDiv.appendChild(resetButton);

        let label = document.createElement("label");
        label.style = "margin: 5px;";
        label.innerHTML = `<strong>Channel ${channel}</strong><br><em>Selected instrument:</em>`;
        controlDiv.appendChild(label);

        // Get audio engine references
        const audioEngine = this.app.modules.audioEngine;
        const player = audioEngine.getPlayer();
        const loadedChannelInstruments = audioEngine.loadedChannelInstruments;
        const availableInstrumentsForProgramChange = audioEngine.availableInstrumentsForProgramChange;
        const loadedChannelControlValues = audioEngine.getLoadedChannelControlValues();

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
        instSelect.onchange = (event) => {
            audioEngine?.changeProgramForChannel(event, channel, event.target.selectedIndex);
        };
        controlDiv.appendChild(instSelect);

        let plabel = document.createElement("label");
        plabel.innerHTML = `<em>Selected soundfont:</em>`;
        plabel.style = "margin: 5px;";
        controlDiv.appendChild(plabel);
        
        // Create a select element for soundfont change
        let select = document.createElement("select");
        select.id = "sfIndex_" + channel;
        availableInstrumentsForProgramChange.get(programNumber).urls.forEach((name, i) => {
            let option = document.createElement("option");
            option.value = i;
            option.text = name;
            select.appendChild(option);
        });
        select.selectedIndex = loadedChannelInstruments.get(channel).sfIndex;
        if (select.selectedIndex != sfIndex) {
            console.warn("Soundfont index mismatch for channel:", channel, "selected:", select.selectedIndex, "sfIndex:", sfIndex);
        }
        select.onchange = (event) => {
            audioEngine?.changeProgramForChannel(event, channel, loadedChannelInstruments.get(channel).programNumber);
        };
        select.classList.add("form-select");
        controlDiv.appendChild(select);

        let solodiv = document.createElement("div");
        solodiv.style = "margin-top: 10px; display: flex; flex-direction: row; justify-content: center;";
        let soloCheckbox = document.createElement("input");
        soloCheckbox.type = "checkbox";
        soloCheckbox.id = "soloCheckbox_" + channel;
        soloCheckbox.onchange = (event) => {
            const midiManager = this.app.modules.midiManager;
            const soloChannels = midiManager.getSoloChannels();
            if (event.target.checked) {
                soloChannels.add(channel);
            } else {
                soloChannels.delete(channel);
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

        const createControl = (type, channel, label, min, max, step, value, onInput) => {
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
        };

        let volumeControl = createControl("volume", channel, "Volume", 0, 127, 1, 
            (loadedChannelControlValues.has(channel) && loadedChannelControlValues.get(channel).has(7))
                ? loadedChannelControlValues.get(channel).get(7) * 127
                : loadedChannelInstruments.get(channel).gainNode.gain.value * 127,
            (event) => {
                let slider = event.target;
                let channel = slider.getAttribute('data-channel');
                loadedChannelInstruments.get(Number(channel)).gainNode.gain.value = slider.value / 127;
                document.getElementById("volume_label_" + channel).innerHTML = `Volume: ${(slider.value / 127).toFixed(2)}`;
                this.debouncedUpdateUserSettings(slider.id, slider.value, channel);
            }
        );
        controlDiv.appendChild(volumeControl.controlLabel);
        controlDiv.appendChild(volumeControl.controlSlider);

        let panControl = createControl("pan", channel, "Panning", -1, 1, 0.01, 
            (loadedChannelControlValues.has(channel) && loadedChannelControlValues.get(channel).has(10))
                ? loadedChannelControlValues.get(channel).get(10) * 2 - 1
                : loadedChannelInstruments.get(channel).panNode.pan.value,
            (event) => {
                let slider = event.target;
                let channel = slider.getAttribute('data-channel');
                loadedChannelInstruments.get(Number(channel)).panNode.pan.value = slider.value;
                document.getElementById("pan_label_" + channel).innerHTML = `Panning: ${parseFloat(slider.value).toFixed(2)}`;
                this.debouncedUpdateUserSettings(slider.id, slider.value, channel);
            }
        );
        controlDiv.appendChild(panControl.controlLabel);
        controlDiv.appendChild(panControl.controlSlider);

        let reverbControl = createControl("reverb", channel, "Reverb Send", 0, 1, 0.01, 
            loadedChannelInstruments.get(channel).reverbSendGainNode.gain.value,
            (event) => {
                let slider = event.target;
                let channel = slider.getAttribute('data-channel');
                loadedChannelInstruments.get(Number(channel)).reverbSendGainNode.gain.value = slider.value;
                document.getElementById("reverb_label_" + channel).innerHTML = `Reverb Send: ${parseFloat(slider.value).toFixed(2)}`;
                this.debouncedUpdateUserSettings(slider.id, slider.value, channel);
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

    createDrumInstrumentControl(note, sf2Index, callerId) {
        // Get audio engine references
        const audioEngine = this.app.modules.audioEngine;
        const player = audioEngine.getPlayer();
        const drumInstrument = audioEngine.getDrumInstrument();
        const availableDrumSoundsForNote = audioEngine.getAvailableDrumSounds();
        const loadedChannelControlValues = audioEngine.getLoadedChannelControlValues();

        let availableSoundsForNote = availableDrumSoundsForNote.get(note);
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
            
            let resetButton = this.createResetButton(9);
            controlDiv.appendChild(resetButton);

            let vol_label = document.createElement("label");
            vol_label.id = "vol_label_drum";
            vol_label.style = "margin-top: 10px;";
            let volumeSlider = document.createElement("input");
            volumeSlider.id = "volumeSlider_drum";
            volumeSlider.type = "range";
            volumeSlider.min = 0;
            volumeSlider.max = 127;
            volumeSlider.value = (loadedChannelControlValues.has(9) && loadedChannelControlValues.get(9).has(7))
                ? loadedChannelControlValues.get(9).get(7) * 127
                : drumInstrument.gainNode.gain.value * 127;
            vol_label.innerHTML = `Volume: ${(volumeSlider.value / 127).toFixed(2)}`;
            volumeSlider.oninput = (event) => {
                drumInstrument.gainNode.gain.value = event.target.value / 127;
                document.getElementById("vol_label_drum").innerHTML = `Volume: ${(event.target.value / 127).toFixed(2)}`;
                this.debouncedUpdateUserSettings(event.target.id, event.target.value, 9);
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
            panSlider.value = (loadedChannelControlValues.has(9) && loadedChannelControlValues.get(9).has(10))
                ? loadedChannelControlValues.get(9).get(10) * 2 - 1
                : drumInstrument.panNode.pan.value;
            pan_label.innerHTML = `Panning: ${parseFloat(panSlider.value).toFixed(2)}`;
            panSlider.oninput = (event) => {
                drumInstrument.panNode.pan.value = event.target.value;
                document.getElementById("pan_label_drum").innerHTML = `Panning: ${parseFloat(event.target.value).toFixed(2)}`;
                this.debouncedUpdateUserSettings(event.target.id, event.target.value, 9);
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
            sfSelect.innerHTML = "";
            availableSoundsForNote.urls.forEach((url, i) => {
                let option = document.createElement("option");
                option.value = i;
                option.text = url;
                sfSelect.appendChild(option);
            });
            sfSelect.selectedIndex = sf2Index;
            return;
        } else {
            if (noteDiv) {
                return;
            }
            else if (!callerId) {
                // if not, create a new note control
                noteDiv = document.createElement("div");
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
        noteSelect.onchange = (event) => {
            if (!availableDrumSoundsForNote.has(event.target.selectedIndex + 35)) {
                audioEngine.loadDrumSoundForNote(event.target.selectedIndex + 35, 0, event.target.id, note);
            } else {
                audioEngine.addNoteToDrumInstrument(note, availableDrumSoundsForNote.get(event.target.selectedIndex + 35).preset);
            }
            drumInstrument.overriddenNotes.set(note, event.target.selectedIndex + 35);
            this.debouncedUpdateUserSettings(event.target.id, event.target.value, 9);
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
        noteSfSelect.onchange = (event) => {
            availableDrumSoundsForNote.get(note).preset = "loading";
            drumInstrument.notes.set(note, "loading");
            let index = event.target.selectedIndex;
            // in case the note is overridden by another note, use the overridden note
            const selNote = drumInstrument.overriddenNotes.has(note) ? drumInstrument.overriddenNotes.get(note) : note;
            availableSoundsForNote = availableDrumSoundsForNote.get(selNote);
            let drumSoundUrl = availableSoundsForNote.urls[index];
            
            if (audioEngine) {
                audioEngine.loadDrumSound(drumSoundUrl)
                    .then((preset) => {
                        availableDrumSoundsForNote.get(note).preset = preset;
                        drumInstrument.notes.set(note, preset);
                        this.createDrumInstrumentControl(note, index, event.target.id);
                        event.target.selectedIndex = index;
                        this.debouncedUpdateUserSettings(event.target.id, index, 9);
                    })
                    .catch((error) => console.error('Error loading drum sound:', error));
            } else {
                console.log("Audio engine not available, cannot load drum sound.");
            }
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

    createResetButton(channel) {
        let resetButton = document.createElement("button");
        resetButton.id = "resetButton_" + channel;
        resetButton.innerHTML = "Reset to file settings";
        resetButton.style.display = "none";
        resetButton.classList.add("btn", "btn-sm", "btn-outline-secondary");
        resetButton.onclick = () => {
            this.resetChannelSettings(channel);
        };
        return resetButton;
    }

    resetChannelSettings(channel) {
        const fileSettings = this.app.fileSettings;
        
        if (fileSettings[channel]) {
            for (const setting in fileSettings[channel]) {
                let value = fileSettings[channel][setting];
                const element = document.getElementById(setting);
                
                if (element) {
                    if (element.tagName === 'SELECT') {
                        element.selectedIndex = value;
                        element.dispatchEvent(new Event('change'));
                    } else if (element.tagName === 'INPUT' && element.type === 'range') {
                        // Handle the panning special case from the original
                        value = (setting === "panning") ? value * 127 - 64 : value * 127;
                        element.value = value;
                        element.dispatchEvent(new Event('input'));
                    }
                }
            }
        }
        
        // Remove channel from user settings
        if (state.userSettings.channels[channel]) {
            delete state.userSettings.channels[channel];
        }
        
        // Hide reset button
        const resetBtn = document.getElementById("resetButton_" + channel);
        if (resetBtn) {
            resetBtn.style.display = "none";
        }
    }

    resetUserSettings() {
        const state = this.app.state;
        
        // Reset user settings to default values
        state.userSettings = {
            channels: {}
        };
        
        console.log('User settings reset to defaults');
    }

    showResetButtonIfNeeded(channel) {
        const state = this.app.state;
        
        // Check if there are user settings for this channel
        if (state.userSettings.channels[channel] && Object.keys(state.userSettings.channels[channel]).length > 0) {
            const resetBtn = document.getElementById("resetButton_" + channel);
            if (resetBtn) {
                resetBtn.style.display = "block";
            }
        }
    }

    exportSettings() {
        const state = this.app.state;
        return {
            userSettings: Utils.deepClone(state.userSettings),
            fileSettings: Utils.deepClone(this.app.fileSettings),
            globalSettings: {
                bpm: this.app.bpm,
                speed: state.speed,
                reversedPlayback: state.reversedPlayback,
            }
        };
    }

    importSettings(settings) {
        const state = this.app.state;
        
        if (settings.userSettings) {
            state.userSettings = settings.userSettings;
        }
        
        if (settings.fileSettings) {
            this.app.fileSettings = settings.fileSettings;
        }
        
        if (settings.globalSettings) {
            Object.assign(state, settings.globalSettings);
        }
        
        console.log('Settings imported successfully');
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsManager;
}

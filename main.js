// Global app instance for modular system (using var to avoid redeclaration conflicts)
var app = null;

async function initializeModularSystem() {
    try {
        // Initialize the new modular app system
        if (typeof NegativeHarmonyApp !== 'undefined') {
            app = new NegativeHarmonyApp();
            
            // IMPORTANT: Initialize the app and its modules
            await app.init();
            
            console.log('Modular system initialized successfully');
            moduleLoaded();
        }
    } catch (error) {
        console.error('Failed to initialize modular system:', error);
    }
}

function moduleLoaded() {
    document.getElementById("transportButton").style.visibility = "visible";
    const toggler = document.getElementsByClassName("st-toggle")[0];
    if (toggler)
        toggler.style.display = "none";
    Utils.setPlayButtonActive(true);
}

function start() {
    // make playbutton unrespondable
    Utils.setPlayButtonActive(false);

    initializeModularSystem();
}

function toggleTransport(element) {
    start();
    var transportButton = document.getElementById("transportButton");
    transportButton.style.display = "none";
    // hide the label too
    var transportLabel = document.getElementById("transportLabel");
    transportLabel.style.display = "none";
}

function reloadWithUrl() {
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
        app.state.midiFileUrl = midiFileUrl;
        fetch(midiFileUrl)
            .then(response => response.arrayBuffer())
            .then(data => {
                app.modules.transport.preclean();
                app.modules.transport.cleanup();
                app.modules.midiManager.parseMidiFile(new Midi(data));
                app.modules.settingsManager.share();
                document.getElementById("midiUrl").value = midiFileUrl;
                document.getElementById("hiddenShareButton").style.display = "block";
                Utils.setPlayButtonActive(true);
            })
            .catch(error => {
                console.log(error);
                alert('Error fetching MIDI file: ' + error);
            });
    }
}

// lightweight proxies (keep API stable if referenced elsewhere)
function searchBitMidi(query, page = 0) {
    return window.BitMidiSearch?.search(query, page);
}
function showPreviousSearchResults() {
    return window.BitMidiSearch?.showPrevious();
}

// Add event listener for the MIDI URL input focus
document.addEventListener('DOMContentLoaded', function() {
    // init BitMidiSearch module
    window.BitMidiSearch?.init();
});
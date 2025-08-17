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
    Utils.setPlayButtonActive(false);
    const midiFileUrl = document.getElementById("midiUrl").value;
    if (midiFileUrl) {
        if (!midiFileUrl.endsWith(".mid") && !midiFileUrl.endsWith(".midi")) {
            searchBitMidi(midiFileUrl, 0); // Start with page 0
            return;
        }
        app.state.midiFileUrl = midiFileUrl;
        fetch(midiFileUrl)
            .then(response => response.arrayBuffer())
            .then(data => {
                app.modules.transport.preclean();
                app.modules.transport.cleanup();
                app.modules.midiManager.parseMidiFile(new Midi(data));
                app.modules.settingsManager.share();

                // paste the midi file url into the input field
                document.getElementById("midiUrl").value = midiFileUrl;

                // make share buttons visible
                document.getElementById("hiddenShareButton").style.display = "block";

                Utils.setPlayButtonActive(true);
            })
            .catch(error => {
                console.log(error);
                alert('Error fetching MIDI file: ' + error);
            });
    }
}

function searchBitMidi(query, page = 0) {
    const bitmidiSearch = `https://bitmidi.com/api/midi/search?q=${encodeURIComponent(query)}&page=${page}`;
    fetch(bitmidiSearch)
        .then(response => response.json())
        .then(data => {
            displayBitMidiResults(data.result, query, page);
        })
        .catch(error => {
            console.error("Error searching BitMidi:", error);
            alert("Error searching BitMidi: " + error);
        });
}

function displayBitMidiResults(resultData, query, currentPage) {
    const { results, total, pageTotal } = resultData;
    
    // Remove any existing results container
    const existingContainer = document.getElementById("bitmidi-results");
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Create results container at body level to escape accordion z-index context
    const resultsContainer = document.createElement("div");
    resultsContainer.id = "bitmidi-results";
    
    // Get the position of the MIDI URL input to position the overlay
    const midiUrlInput = document.getElementById("midiUrl");
    const inputRect = midiUrlInput.getBoundingClientRect();
    
    resultsContainer.style.cssText = `
        position: fixed;
        top: ${inputRect.bottom + window.scrollY - 200}px;
        left: ${inputRect.left + window.scrollX - 50}px;
        width: ${inputRect.width}px;
        z-index: 9999;
        margin: 0;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
        background-color: #000000ee;
        max-height: 350px;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        pointer-events: auto;
    `;
    
    // Append to body instead of within the accordion
    document.body.appendChild(resultsContainer);
    
    // Update position on scroll/resize
    const updatePosition = () => {
        const newRect = midiUrlInput.getBoundingClientRect();
        resultsContainer.style.top = `${newRect.bottom + window.scrollY - 200}px`;
        resultsContainer.style.left = `${newRect.left + window.scrollX - 50}px`;
        resultsContainer.style.width = `${newRect.width}px`;
    };
    
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    
    // Store cleanup function
    resultsContainer._cleanup = () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
    };

    if (results && results.length > 0) {
        const title = document.createElement("h4");
        title.textContent = `Found ${total} results (Page ${currentPage + 1} of ${pageTotal}):`;
        title.style.cssText = `
            margin: 0 0 10px 0;
            padding-top: 30px;
            color: #ffffff;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            font-size: 14px;
        `;
        resultsContainer.appendChild(title);
        
        // Create list of results
        const resultsList = document.createElement("ul");
        resultsList.style.cssText = "margin: 0; padding: 0; list-style: none;";
        
        results.forEach((result, index) => {
            const listItem = document.createElement("li");
            listItem.style.margin = "2px 0";
            
            const link = document.createElement("a");
            link.href = "#";
            link.textContent = result.name || `Result ${index + 1}`;
            link.style.cssText = `
                color: #ff00c8ff;
                text-decoration: none;
                cursor: pointer;
                display: block;
                padding: 5px;
                border-radius: 3px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                font-size: 12px;
            `;
            
            // Add hover effect
            link.addEventListener("mouseenter", () => {
                link.style.backgroundColor = "#4a6d8fa9";
            });
            link.addEventListener("mouseleave", () => {
                link.style.backgroundColor = "transparent";
            });
            
            // Handle click to load the MIDI file
            link.addEventListener("click", (e) => {
                e.preventDefault();
                if (result.downloadUrl) {
                    document.getElementById("midiUrl").value = "https://bitmidi.com" + result.downloadUrl;
                    // Cleanup and remove
                    resultsContainer._cleanup();
                    resultsContainer.remove();
                    reloadWithUrl(); // Load the selected MIDI file
                }
            });
            
            listItem.appendChild(link);
            resultsList.appendChild(listItem);
        });
        
        resultsContainer.appendChild(resultsList);
        
        // Add pagination controls
        if (pageTotal > 1) {
            const paginationDiv = document.createElement("div");
            paginationDiv.style.cssText = `
                margin: 10px 0 0 0;
                padding: 10px 0 0 0;
                border-top: 1px solid #555;
                text-align: center;
            `;
            
            // Previous page button
            if (currentPage > 0) {
                const prevButton = document.createElement("button");
                prevButton.textContent = "← Previous";
                prevButton.style.cssText = `
                    background: #4a6d8f;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    margin: 0 3px;
                    border-radius: 3px;
                    cursor: pointer;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    font-size: 11px;
                `;
                prevButton.addEventListener("click", () => {
                    searchBitMidi(query, currentPage - 1);
                });
                paginationDiv.appendChild(prevButton);
            }
            
            // Page info
            const pageInfo = document.createElement("span");
            pageInfo.textContent = `${currentPage + 1}/${pageTotal}`;
            pageInfo.style.cssText = `
                color: #ffffff;
                margin: 0 8px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                font-size: 11px;
            `;
            paginationDiv.appendChild(pageInfo);
            
            // Next page button
            if (currentPage < pageTotal - 1) {
                const nextButton = document.createElement("button");
                nextButton.textContent = "Next →";
                nextButton.style.cssText = `
                    background: #4a6d8f;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    margin: 0 3px;
                    border-radius: 3px;
                    cursor: pointer;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    font-size: 11px;
                `;
                nextButton.addEventListener("click", () => {
                    searchBitMidi(query, currentPage + 1);
                });
                paginationDiv.appendChild(nextButton);
            }
            
            resultsContainer.appendChild(paginationDiv);
        }
        
        // Add close button
        const closeButton = document.createElement("button");
        closeButton.textContent = "×";
        closeButton.style.cssText = `
            position: absolute;
            top: 3px;
            right: 8px;
            border: none;
            background: none;
            font-size: 16px;
            cursor: pointer;
            color: #ffffffff;
            text-shadow: 1px 1px 2px rgba(74, 128, 255, 0.9);
        `;
        closeButton.addEventListener("click", () => {
            resultsContainer._cleanup();
            resultsContainer.remove();
        });
        
        resultsContainer.appendChild(closeButton);

    } else {
        resultsContainer.innerHTML = "<p style='color: white; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);'>No results found.</p>";
        setTimeout(() => {
            resultsContainer._cleanup();
            resultsContainer.remove();
        }, 3000);
    }
    
    // Close on click outside
    setTimeout(() => {
        const closeOnClickOutside = (e) => {
            if (!resultsContainer.contains(e.target) && !midiUrlInput.contains(e.target)) {
                document.removeEventListener('click', closeOnClickOutside);
                resultsContainer._cleanup();
                resultsContainer.remove();
            }
        };
        document.addEventListener('click', closeOnClickOutside);
    }, 100);
}
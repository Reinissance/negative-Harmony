// Global app instance for modular system (using var to avoid redeclaration conflicts)
var app = null;
let lastSearchResults = null;
let lastSearchQuery = null;
let lastSearchPage = 0;

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
            searchBitMidi(midiFileUrl, 0); // Start with page 0
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
    
    // Store the search results for later use
    lastSearchResults = resultData;
    lastSearchQuery = query;
    lastSearchPage = currentPage;
    
    // Remove any existing results container
    const existingContainer = document.getElementById("bitmidi-results");
    if (existingContainer) {
        existingContainer._cleanup?.();
        existingContainer.remove();
    }
    
    // Create results container at body level to escape accordion z-index context
    const resultsContainer = document.createElement("div");
    resultsContainer.id = "bitmidi-results";
    
    // Get the position of the MIDI URL input to position the overlay
    const midiUrlInput = document.getElementById("midiUrl");
    const inputRect = midiUrlInput.getBoundingClientRect();
    
    // Detect mobile device properly
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     window.innerWidth <= 768 || 
                     ('ontouchstart' in window);
    
    let topPosition, containerHeight, containerWidth, leftPosition;
    
    if (isMobile) {
        // Full screen with 50px padding on mobile
        topPosition = 50;
        leftPosition = 50;
        containerWidth = window.innerWidth - 100; // 50px padding on each side
        containerHeight = window.innerHeight - 100; // 50px padding on top and bottom
    } else {
        // Desktop positioning (below the input)
        topPosition = inputRect.bottom + window.scrollY - 200;
        leftPosition = inputRect.left + window.scrollX - 50;
        containerWidth = inputRect.width;
        containerHeight = 300;
    }
    
    resultsContainer.style.cssText = `
        position: fixed;
        top: ${topPosition}px;
        left: ${leftPosition}px;
        width: ${containerWidth}px;
        height: ${containerHeight}px;
        z-index: 999999;
        margin: 0;
        padding: 20px;
        border: 1px solid #ccc;
        border-radius: 10px;
        background-color: #000000d7;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        pointer-events: auto;
        -webkit-overflow-scrolling: touch;
        transform: translateZ(0);
        will-change: transform;
        display: block;
        visibility: visible;
        ${isMobile ? 'backdrop-filter: blur(5px);' : ''}
    `;
    
    // Append to body instead of within the accordion
    document.body.appendChild(resultsContainer);
    
    // Update position on resize for mobile (no scroll or keyboard handling needed)
    const updatePosition = () => {
        if (isMobile) {
            // Keep full screen with 50px padding regardless of keyboard or scroll
            resultsContainer.style.top = '50px';
            resultsContainer.style.left = '50px';
            resultsContainer.style.width = `${window.innerWidth - 100}px`;
            resultsContainer.style.height = `${window.innerHeight - 100}px`;
        } else {
            // Desktop positioning
            const newRect = midiUrlInput.getBoundingClientRect();
            resultsContainer.style.top = `${newRect.bottom + window.scrollY - 200}px`;
            resultsContainer.style.left = `${newRect.left + window.scrollX - 50}px`;
            resultsContainer.style.width = `${newRect.width}px`;
        }
    };
    
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('orientationchange', updatePosition, { passive: true });
    
    // Store cleanup function
    resultsContainer._cleanup = () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('orientationchange', updatePosition);
    };

    if (results && results.length > 0) {
        const title = document.createElement("h4");
        title.textContent = `Found ${total} results (Page ${currentPage + 1} of ${pageTotal}):`;
        title.style.cssText = `
            margin: 0 0 20px 0;
            padding-top: 30px;
            color: #ffffff;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
            font-size: ${isMobile ? '16px' : '14px'};
            text-align: center;
        `;
        resultsContainer.appendChild(title);
        
        // Create list of results
        const resultsList = document.createElement("ul");
        resultsList.style.cssText = "margin: 0; padding: 0; list-style: none;";
        
        results.forEach((result, index) => {
            const listItem = document.createElement("li");
            listItem.style.margin = "4px 0";
            
            const link = document.createElement("a");
            link.href = "#";
            link.textContent = result.name || `Result ${index + 1}`;
            link.style.cssText = `
                color: #ff00c8ff;
                text-decoration: none;
                cursor: pointer;
                display: block;
                padding: ${isMobile ? '16px 12px' : '8px 5px'};
                border-radius: 5px;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
                font-size: ${isMobile ? '16px' : '12px'};
                -webkit-tap-highlight-color: rgba(0,0,0,0);
                touch-action: manipulation;
                line-height: 1.4;
                border: 1px solid rgba(255, 255, 255, 0.2);
            `;
            
            // Add touch and hover effects
            if (isMobile) {
                link.addEventListener("touchstart", () => {
                    link.style.backgroundColor = "#4a6d8fa9";
                }, { passive: true });
                link.addEventListener("touchend", () => {
                    setTimeout(() => {
                        link.style.backgroundColor = "transparent";
                    }, 150);
                }, { passive: true });
            } else {
                link.addEventListener("mouseenter", () => {
                    link.style.backgroundColor = "#4a6d8fa9";
                });
                link.addEventListener("mouseleave", () => {
                    link.style.backgroundColor = "transparent";
                });
            }
            
            // Handle click to load the MIDI file
            link.addEventListener("click", (e) => {
                e.preventDefault();
                if (result.downloadUrl) {
                    document.getElementById("midiUrl").value = "https://bitmidi.com" + result.downloadUrl;
                    // Keep search results for easy browsing
                    // Cleanup and remove the current display
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
                margin: 20px 0 0 0;
                padding: 20px 0 0 0;
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
                    padding: ${isMobile ? '12px 20px' : '8px 12px'};
                    margin: 0 5px;
                    border-radius: 5px;
                    cursor: pointer;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    font-size: ${isMobile ? '14px' : '11px'};
                    -webkit-tap-highlight-color: rgba(0,0,0,0);
                    touch-action: manipulation;
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
                margin: 0 15px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                font-size: ${isMobile ? '14px' : '11px'};
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
                    padding: ${isMobile ? '12px 20px' : '8px 12px'};
                    margin: 0 5px;
                    border-radius: 5px;
                    cursor: pointer;
                    text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
                    font-size: ${isMobile ? '14px' : '11px'};
                    -webkit-tap-highlight-color: rgba(0,0,0,0);
                    touch-action: manipulation;
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
            top: 0;
            right: 15px;
            border: none;
            background: none;
            font-size: ${isMobile ? '28px' : '20px'};
            cursor: pointer;
            color: #ffffffff;
            text-shadow: 1px 1px 2px rgba(0, 26, 255, 1);
            padding: ${isMobile ? '10px 15px' : '4px 8px'};
            -webkit-tap-highlight-color: rgba(0,0,0,0);
            touch-action: manipulation;
        `;
        closeButton.addEventListener("click", () => {
            lastSearchResults = null;
            lastSearchQuery = null;
            lastSearchPage = 0;
            resultsContainer._cleanup();
            resultsContainer.remove();
        });
        
        resultsContainer.appendChild(closeButton);

    } else {
        resultsContainer.innerHTML = `<p style='color: white; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); text-align: center; font-size: ${isMobile ? '16px' : '14px'}; padding: 20px;'>No results found.</p>`;
        setTimeout(() => {
            resultsContainer._cleanup();
            resultsContainer.remove();
        }, 3000);
    }
    
    // Close on click outside with touch support
    setTimeout(() => {
        const closeOnClickOutside = (e) => {
            if (!resultsContainer.contains(e.target) && !midiUrlInput.contains(e.target)) {
                document.removeEventListener('click', closeOnClickOutside);
                document.removeEventListener('touchend', closeOnClickOutside);
                resultsContainer._cleanup();
                resultsContainer.remove();
            }
        };
        document.addEventListener('click', closeOnClickOutside);
        document.addEventListener('touchend', closeOnClickOutside, { passive: true });
    }, 100);
}

function showPreviousSearchResults() {
    if (lastSearchResults && lastSearchQuery) {
        displayBitMidiResults(lastSearchResults, lastSearchQuery, lastSearchPage);
    }
}

// Add event listener for the MIDI URL input focus
document.addEventListener('DOMContentLoaded', function() {
    const midiUrlInput = document.getElementById("midiUrl");
    if (midiUrlInput) {
        midiUrlInput.addEventListener('focus', function() {
            // Only show previous results if there are search results and the input contains the search query or is empty
            const currentValue = midiUrlInput.value.trim();
            if (lastSearchResults && lastSearchQuery) {
                showPreviousSearchResults();
            }
        });
    }
});
/**
 * Score Manager Module
 * Handles musical score generation from MIDI files using ABC notation,
 * dynamic loading of required modules, and real-time score following during playback
 */

/**
 * Manages musical score display, ABC notation generation, and score following functionality
 * @class ScoreManager
 */
class ScoreManager {
    /**
     * Creates an instance of ScoreManager
     * @param {Object} app - Reference to the main application instance
     */
    constructor (app) {
        this.app = app;
        /** @type {string} Generated ABC notation string */
        this.abcString = '';
        /** @type {boolean} Whether the midi2abc WASM module is ready */
        this.midi2abcReady = false;
        /** @type {Object} Reference to the midi2abc WASM module */
        this.midi2abc = null;
        /** @type {Object} Reference to the ABCJS library for rendering */
        this.abcjs = null;
        /** @type {boolean} Whether required modules have been loaded */
        this.modulesLoaded = false;
        /** @type {number} Current starting bar for score following (0-based) */
        this.currentBarStart = 0;
        /** @type {boolean} Whether score following is currently active */
        this.scoreFollowerActive = false;
        /** @type {boolean} Whether the score is currently visible */
        this.scoreShown = false;
        /** @type {boolean} Whether score generation is available */
        this.scoreAvailable = true;
        /** @type {number|null} Last polled bar to avoid redundant updates */
        this.lastPolledBar = null;
        /** @type {string} Output captured from WASM module */
        this.abcOutput = "";
        /** @type {string} Current key signature for score processing */
        this.currentKeySignature = 'C';
        /** @type {number|null} Timeout ID for debounced updates */
        this.updateTimeout = null;
        /** @type {number} Total number of bars in the current score */
        this.totalBars = 0;
        /** @type {boolean} True while the ABC/score is being regenerated (e.g. after
         * toggling reversed playback, changing time/key signature, or shifting score
         * start) - used to pause score-follower polling and show a loading indicator
         * so the follower never renders against mismatched/incomplete ABC data. */
        this.scoreRegenerating = false;
        /** @type {boolean} Whether the score is currently displayed in fullscreen mode */
        this.isFullscreen = false;
        /** @type {Object|null} The abcjs tune object returned by the last renderAbc() call */
        this.visualObj = null;
        /** @type {string} The abcString that was last rendered, used to avoid redundant re-renders */
        this._renderedAbcString = null;
        /** @type {Object|null} abcjs TimingCallbacks instance driving note highlighting/auto-scroll */
        this.timingCallbacks = null;
        /** @type {Element[]} SVG elements currently highlighted as "playing" */
        this.highlightedElements = [];
        /** @type {number|null} setInterval ID polling playback position during playback */
        this.pollingInterval = null;
        /** @type {number} Current zoom factor applied to the rendered score (1 = natural size) */
        this.scoreZoom = 1;
        /** @type {number} Minimum allowed zoom factor while in fullscreen (plenty of vertical space already) */
        this.minScoreZoomFullscreen = 0.5;
        /** @type {number} Minimum allowed zoom factor outside fullscreen - lower, so the full score
         * height can still be zoomed down to fit the smaller windowed container */
        this.minScoreZoomWindowed = 0.2;
        /** @type {number} Maximum allowed zoom factor */
        this.maxScoreZoom = 4;
        /** @type {number} Multiplier applied to vertical drag/wheel motion when it's used to
         * scroll the score horizontally, so that gesture feels responsive rather than 1:1 */
        this.scoreScrollAccelerationFactor = 5.;
    }

    /**
     * Initialize the score manager and load required modules
     * @async
     */
    async init() {
        this.setupFullscreenListeners();
        // Load required modules first
        await this.loadModules();
    }

    /**
     * Sets up event listeners for fullscreen mode changes and escape key
     */
    setupFullscreenListeners() {
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isFullscreen) {
                    this.exitFullscreen();
                }
            });
        }
        if (typeof document !== 'undefined' && document.addEventListener) {
            const handleFsChange = () => {
                const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
                if (!isNativeFs && this.isFullscreen) {
                    this.exitFullscreen(false);
                }
            };
            // Opening/closing the score settings changes the space left for the score.
            const handleCollapse = (e) => {
                if (this.isFullscreen && e.target && e.target.id === 'scoreFooterCollapse') {
                    this.fitScoreHeight('score');
                }
            };
            document.addEventListener('shown.bs.collapse', handleCollapse);
            document.addEventListener('hidden.bs.collapse', handleCollapse);
            document.addEventListener('fullscreenchange', handleFsChange);
            document.addEventListener('webkitfullscreenchange', handleFsChange);
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
            // Covers orientation changes and mobile browser chrome (address bar)
            // showing/hiding, which can resize the viewport slightly after the
            // fullscreen transition itself has already finished.
            let resizeTimeout = null;
            window.addEventListener('resize', () => {
                if (!this.scoreShown) return;
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => this.rerenderScoreAfterLayoutSettles('score'), 150);
            });
        }
    }

    /**
     * Re-renders the score after yielding a couple of frames, so transitions
     * that briefly report stale window dimensions (entering/exiting
     * fullscreen, mobile address bar show/hide) have settled before the
     * available height is measured.
     * @param {string} containerId - Container element ID
     */
    rerenderScoreAfterLayoutSettles(containerId = 'score') {
        const doRender = () => {
            if (this.scoreFollowerActive) {
                this.renderScoreFollower(containerId);
            } else {
                this.renderScore(containerId);
            }
        };
        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => window.requestAnimationFrame(doRender));
        } else {
            setTimeout(doRender, 50);
        }
    }

    /**
     * Dynamically loads required modules (midi2abc WASM and ABCJS library)
     * Similar to SettingsManager's loadModule pattern - loads on demand for better performance
     * @returns {Promise<void>} Resolves when all modules are loaded
     */
    loadModules() {
        return new Promise((resolve, reject) => {
            if (this.modulesLoaded) {
                resolve();
                return;
            }

            const modules = [
                {
                    src: `./src/midi2abc/midi2abc.js?v=${Date.now()}`,
                    type: 'wasm'
                },
                {
                    src: 'https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.5.1/abcjs-basic-min.min.js',
                    integrity: 'sha512-g2wj9XoJ7DsQgUBGWlAXhRlCV2eOUB7VV5XUsrLKf0I0hvDvOBGOLIP1XBOiXdE6Gp6MUoMkr/mbdwz4C/kwDw==',
                    crossOrigin: 'anonymous',
                    referrerPolicy: 'no-referrer'
                }
            ];

            let loadedCount = 0;
            const totalModules = modules.length;

            modules.forEach(module => {
                const script = document.createElement('script');
                script.src = module.src;
                
                if (module.integrity) script.integrity = module.integrity;
                if (module.crossOrigin) script.crossOrigin = module.crossOrigin;
                if (module.referrerPolicy) script.referrerPolicy = module.referrerPolicy;
                
                script.onload = () => {
                    loadedCount++;
                    
                    // Initialize WASM module if this is the midi2abc script
                    if (module.type === 'wasm' && window.midi2abcModule) {
                        this.initializeMidi2abc().then(() => {
                            if (loadedCount === totalModules) {
                                this.modulesLoaded = true;
                                this.abcjs = window.ABCJS;
                                resolve();
                            }
                        }).catch(reject);
                    } else {
                        if (loadedCount === totalModules) {
                            this.modulesLoaded = true;
                            this.abcjs = window.ABCJS;
                            resolve();
                        }
                    }
                };
                
                script.onerror = () => {
                    console.warn(`Failed to load module: ${module.src}`);
                    loadedCount++;
                    if (loadedCount === totalModules) {
                        this.modulesLoaded = true;
                        this.abcjs = window.ABCJS;
                        resolve(); // Don't reject - continue without failed modules
                    }
                };
                
                document.head.appendChild(script);
            });
        });
    }

    /**
     * Initializes the midi2abc WASM module for MIDI to ABC conversion
     * @returns {Promise<void>} Resolves when WASM module is ready
     */
    async initializeMidi2abc() {
        if (!window.midi2abcModule) {
            throw new Error('midi2abcModule not found');
        }
        // Download once; each conversion needs fresh C globals, not another call
        // to main() on an instance that retains the previous file's meter/state.
        const response = await fetch('./src/midi2abc/midi2abc.wasm');
        if (!response.ok) {
            throw new Error(`Failed to load midi2abc WASM: HTTP ${response.status}`);
        }
        this.midi2abcBinary = new Uint8Array(await response.arrayBuffer());
        this.midi2abcReady = true;
    }

    /**
     * Generates ABC notation string from a MIDI file using the WASM converter
     * @async
     * @param {Object} midiFile - MIDI file object to convert
     * @param {Array|number|string|null} timeSignature - Optional time signature to force (e.g. [4,4] or '4/4' or 4)
     * @param {number|null} keySignature - Optional key signature to force, -6 to 6 sharps (negative = flats), passed to midi2abc via -k
     * @param {number|undefined} unitLength - Optional ABC L: denominator to preserve
     * across regenerations. This changes only the generated ABC header.
     * @returns {Promise<string>} Generated ABC notation string
     */
    async generateABCStringfromMIDI(midiFile, timeSignature = null, keySignature = null, unitLength = undefined) {
        if (!this.scoreAvailable) return '';
        if (!this.midi2abcReady || !this.midi2abcBinary) {
            console.error('midi2abc WASM module not ready');
            this.handleAbcGenerationFailure('WASM module not ready');
            return '';
        }

        if (unitLength === undefined) {
            unitLength = this.getActiveUnitLength();
        }

        try {
            const request = this.conversionRequest = (this.conversionRequest || 0) + 1;
            let output = '';
            const converter = await window.midi2abcModule({
                noInitialRun: true,
                wasmBinary: this.midi2abcBinary,
                print: text => { output += text + '\n'; },
                printErr: text => console.error('WASM error:', text)
            });
            if (request !== this.conversionRequest || !this.scoreAvailable) return '';
            this.midi2abc = converter;
            this.abcString = "";
            // Convert the Midi object to array buffer
            const midiArrayBuffer = midiFile.toArray();
            const data = new Uint8Array(midiArrayBuffer);
            
            // Reset output before each conversion
            this.abcOutput = "";
            
            // Ensure the file system is clean
            try {
                this.midi2abc.FS.unlink('/input.mid');
            } catch (e) {
                // File doesn't exist, that's fine
            }
            
            // Write MIDI data to WASM filesystem
            this.midi2abc.FS.writeFile('/input.mid', data);
            
            // Verify file was written correctly
            const writtenData = this.midi2abc.FS.readFile('/input.mid');
            
            // Call midi2abc conversion with optimized flags for score display
            // Build callMain args and include optional time signature (-m) if provided
            const args = ['input.mid', '-bpl', '4', '-ga'];
            const shortRest = this.app.state.abcShortRest;
            if ([4, 8, 16].includes(shortRest)) {
                args.push('-sr', String(shortRest));
            }
            if (timeSignature) {
                let tsString = '';
                if (Array.isArray(timeSignature) && timeSignature.length >= 2) {
                    tsString = `${timeSignature[0]}/${timeSignature[1]}`;
                } else if (typeof timeSignature === 'number') {
                    tsString = `${timeSignature}/4`;
                } else {
                    tsString = String(timeSignature);
                }
                args.push('-m', tsString);
            }
            // Force the key signature (in sharps, -6..6) if the user selected one explicitly,
            // otherwise detect the key from the transformed notes, not stale
            // key metadata copied from the source MIDI.
            if (keySignature !== null && keySignature !== undefined && keySignature !== '') {
                const ksNum = parseInt(keySignature, 10);
                if (!isNaN(ksNum)) {
                    args.push('-k', String(Math.max(-6, Math.min(6, ksNum))));
                }
            } else {
                args.push('-gk');
            }
            const result = converter.callMain(args);
            if (result !== 0) {
                throw new Error(`midi2abc exited with status ${result}`);
            }

            // Get the output (this should be captured by the print function)
            let abcOutput = output;
            
            if (!abcOutput || abcOutput.trim().length === 0) {
                console.warn('No ABC output generated');
                this.showAbcErrorNotification('No ABC output generated from MIDI');
                return '';
            }
            
            // Clean up the output - remove everything before the first X: header
            abcOutput = abcOutput.replace(/^[\s\S]*?(?=^X:)/m, '');
            if (unitLength && /^L:\s*1\s*\/\s*\d+\s*$/m.test(abcOutput)) {
                abcOutput = abcOutput.replace(
                    /^L:\s*1\s*\/\s*\d+\s*$/m,
                    `L:1/${unitLength}`
                );
            }

            // New: inject track names from the provided midiFile into V: headers as nm and snm
            try {
                if (midiFile && Array.isArray(midiFile.tracks) && midiFile.tracks.length > 0 && abcOutput.includes('\nV:')) {
                    const abcLines = abcOutput.split('\n');
                    // collect indices of lines that start with V:
                    const vLineIndices = [];
                    for (let i = 0; i < abcLines.length; i++) {
                        if (/^\s*V:/.test(abcLines[i])) vLineIndices.push(i);
                    }

                    const tracks = midiFile.tracks || [];
                    const max = Math.min(vLineIndices.length, tracks.length);

                    for (let i = 0; i < max; i++) {
                        const track = tracks[i];
                        const lineIdx = vLineIndices[i];
                        if (!track || !track.name || !track.name.toString().trim()) continue;

                        let line = abcLines[lineIdx];

                        // don't overwrite if already contains nm or snm
                        if (/\bnm=|\bsnm=/.test(line)) continue;

                        // sanitize name and build shortname
                        const fullName = track.name.toString().trim().replace(/"/g, "'");
                        // shortName: if name is <=3 chars use it as-is, otherwise use first char + last two chars
                        let shortName;
                        if (fullName.length <= 3) {
                            shortName = fullName;
                        } else {
                            shortName = fullName.charAt(0) + fullName.slice(-2);
                        }

                        abcLines[lineIdx] = `${line} nm="${fullName}" snm="${shortName}"`;
                    }

                    abcOutput = abcLines.join('\n');
                }
            } catch (e) {
                console.warn('Failed to inject voice names into ABC:', e);
            }

            // Store the result and calculate total bars
            this.abcString = abcOutput;
            this.syncScoreSettingsFromABC(abcOutput);
            this.totalBars = this.getTotalBarsFromABC();
            return abcOutput;
            
        } catch (error) {
            console.error('Error generating ABC notation:', error);
            console.error('Error stack:', error.stack);
            this.showAbcErrorNotification(`ABC generation error: ${error.message}`);
            return '';
        }
    }

    /**
     * Calculates the total number of bars in an ABC notation string
     * @param {string|null} abcString - ABC notation string (uses stored string if null)
     * @returns {number} Total number of bars detected
     */
    getTotalBarsFromABC(abcString = null) {
        const abc = abcString || this.abcString;
        if (!abc || !abc.trim()) {
            this.totalBars = 0;
            return 0;
        }

        // Split into lines and group by voices for multi-voice handling
        const lines = abc.split('\n');
        let voices = {};
        let currentVoice = 'default';
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('V:')) {
                // New voice header
                const match = trimmed.match(/^V:\s*([^\s]+)/);
                currentVoice = match ? match[1] : 'default';
                if (!voices[currentVoice]) voices[currentVoice] = [];
            } else if (!/^(X:|T:|M:|L:|K:|Q:|%|%%)/.test(trimmed) && trimmed.length > 0) {
                // Music line (not header or comment)
                if (!voices[currentVoice]) voices[currentVoice] = [];
                voices[currentVoice].push(trimmed);
            }
        }

        // Count bars for each voice, pick the max (handles multi-voice scores robustly)
        let maxBars = 0;
        for (const voiceLines of Object.values(voices)) {
            const joined = voiceLines.join(' ');
            const bars = (joined.match(/\|/g) || []).length;
            if (bars > maxBars) maxBars = bars;
        }
        return maxBars;
    }

    /**
     * Parses the time signature (M:) from the ABC string
     * @param {string|null} abcString - ABC notation string (uses stored string if null)
     * @returns {[number, number]} Time signature as [numerator, denominator]
     */
    getTimeSignatureFromABC(abcString = null) {
        const abc = (abcString || this.abcString || '').trim();
        if (!abc) return [4, 4]; // default fallback

        // Look for M: in header (meter), e.g. M:4/4 or M:6/8
        const match = abc.match(/^M:\s*([0-9]+)\s*\/\s*([0-9]+)/m);
        if (match) {
            const num = parseInt(match[1], 10) || 4;
            const den = parseInt(match[2], 10) || 4;
            return [num, den];
        }

        // Fallback to common time if not found
        return [4, 4];
    }

    /**
     * Syncs Tone.Transport.timeSignature to the ABC time signature
     * Retries a few times if the ABC string isn't immediately available
     * @param {number} retries - Number of retries (default: 5)
     * @param {number} delayMs - Delay between retries in milliseconds (default: 200)
     */
    syncToneTimeSignatureFromABC(retries = 5, delayMs = 200) {
        const attempt = (remaining) => {
            const ts = this.getTimeSignatureFromABC();
            // If abcString is still empty and we have retries, wait and retry
            if ((!this.abcString || !this.abcString.trim()) && remaining > 0) {
                setTimeout(() => attempt(remaining - 1), delayMs);
                return;
            }

            try {
                if (window.Tone && window.Tone.Transport && Array.isArray(ts) && ts.length === 2) {
                    // Apply the parsed time signature to Tone.Transport
                    window.Tone.Transport.timeSignature = ts;
                    // Also ensure transport's internal timeSignature property is in sync
                    // (some versions use .timeSignature directly as array)
                }
            } catch (e) {
                // silent fail - don't break app flow
                console.warn('Failed to sync Tone time signature from ABC:', e);
            }
        };

        attempt(retries);
    }

    /**
     * Displays an error modal when ABC generation fails
     * @param {string} errorMessage - Error message to display
     */
    /**
     * Handles a failure to generate ABC notation from MIDI by showing the
     * standard error notification to the user instead of leaving the score
     * in a broken/inconsistent state.
     * @param {string} errorMessage - Description of the failure
     */
    handleAbcGenerationFailure(errorMessage) {
        console.error('ABC generation failure:', errorMessage);
        this.showAbcErrorNotification(errorMessage);
    }

    showAbcErrorNotification(errorMessage) {
        // The user has already chosen to continue without score. Do not interrupt
        // playback again if a pending or later follower render reports another error.
        if (!this.scoreAvailable) {
            return;
        }

        // Hide score container if it's showing
        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'none';
        }

        // Fold all accordion sections for cleaner UI
        const accordions = document.querySelectorAll('.accordion-collapse.show');
        accordions.forEach(accordion => {
            accordion.classList.remove('show');
        });

        // Update accordion button states to reflect collapsed state
        const accordionButtons = document.querySelectorAll('.accordion-button:not(.collapsed)');
        accordionButtons.forEach(button => {
            button.classList.add('collapsed');
            button.setAttribute('aria-expanded', 'false');
        });

        // Remove existing notification if present
        const existingModal = document.getElementById('abcErrorModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Check if using local file to determine appropriate recovery options
        const isLocalFile = this.app.localFile === true;

        // Create modal HTML with conditional button options
        const modal = document.createElement('div');
        modal.id = 'abcErrorModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.63);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;

        // Conditional button HTML based on file type
        const buttonHtml = isLocalFile ? `
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button id="reloadPage" class="btn btn-primary" style="
                    background: #3498db;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                ">
                    🔄 Reload Page
                </button>
                <button id="continueWithoutScore" class="btn btn-secondary" style="
                    background: #7f8c8d;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                ">
                    Continue Without Score
                </button>
            </div>
        ` : `
            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <button id="reloadWithSettings" class="btn btn-primary" style="
                    background: #3498db;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                    font-weight: bold;
                ">
                    🔄 Reload with Current Settings
                </button>
                <button id="continueWithoutScore" class="btn btn-secondary" style="
                    background: #7f8c8d;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    color: white;
                    cursor: pointer;
                ">
                    Continue Without Score
                </button>
            </div>
        `;

        modal.innerHTML = `
            <div style="
                background: #2c3e50;
                border-radius: 10px;
                padding: 30px;
                max-width: 500px;
                margin: 20px;
                text-align: center;
                color: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            ">
                <h3 style="color: #e7ab3cff; margin-bottom: 20px;">
                    ⚠️ Score Generation Failed
                </h3>
                <p style="margin-bottom: 15px; line-height: 1.5;">
                    The musical score could not be generated from the current MIDI file.
                </p>
                <p style="margin-bottom: 25px; font-size: 0.9em; color: #bdc3c7;">
                    <strong>Error:</strong> ${errorMessage}
                </p>
                <p style="margin-bottom: 25px; line-height: 1.4;">
                    You can continue using the app without the score feature${isLocalFile ? ', or reload the page to try again.' : ', or reload the page to try again with your current settings.'}
                </p>
                ${buttonHtml}
            </div>
        `;

        // Add click handlers based on file type
        if (isLocalFile) {
            modal.querySelector('#reloadPage').addEventListener('click', () => {
                window.location.reload();
            });
        } else {
            modal.querySelector('#reloadWithSettings').addEventListener('click', () => {
                this.reloadPageWithSettings();
            });
        }

        modal.querySelector('#continueWithoutScore').addEventListener('click', () => {
            this.dismissAbcErrorNotification();
        });

        // Add to page
        document.body.appendChild(modal);

        // Auto-dismiss on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.dismissAbcErrorNotification();
            }
        });
    }

    /**
     * Reloads the page while preserving current settings via URL parameters
     */
    async reloadPageWithSettings() {
        try {
            const sm = this.app && this.app.modules && this.app.modules.settingsManager;
            if (sm && typeof sm.share === 'function') {
                // Await async share() which may return a URL or null/undefined
                const shareUrl = await sm.share();
                if (shareUrl) {
                    // Use href assignment to navigate
                    window.location.href = shareUrl;
                    return;
                }
            } else {
                console.warn('Settings manager not available, performing simple reload');
            }
            // Fallback to simple reload if no share URL
            window.location.reload();
        } catch (error) {
            console.error('Error reloading with settings:', error);
            // Fallback to simple reload
            window.location.reload();
        }
    }

    /**
     * Dismisses the error notification and disables score functionality
     */
    dismissAbcErrorNotification() {
        // Stop the four-bar follower before disabling score so no scheduled polling
        // or pending render can retrigger score generation errors.
        this.stopScoreFollowing();
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        // Hide show score button since score won't be available
        const showScoreBtn = document.getElementById("showScore");
        if (showScoreBtn) {
            showScoreBtn.style.display = 'none';
        }
        this.scoreShown = false;
        this.scoreAvailable = false;
        const modal = document.getElementById('abcErrorModal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Renders the full ABC notation as a single continuous, non-wrapping line of
     * music inside a horizontally-scrollable container. The whole score is
     * pre-rendered once so the user (or the auto-follow logic during playback)
     * can scroll smoothly through it without ever needing to re-render bars.
     * @param {string} containerId - ID of the container element to render into
     */
    renderScore(containerId = 'score') {
        if (!this.abcjs || !this.abcString.trim()) {
             console.warn('No ABC data or abcjs library to render');
             return;
         }

         try {
             const scoreElement = document.getElementById(containerId);
             if (!scoreElement) return;

             scoreElement.innerHTML = ''; // Clear previous score content

             // Set maximum height constraint; horizontal scrolling reveals the rest.
             // overflow-y is 'auto' (not 'hidden') so zoomed-in content can also be
             // panned vertically, not just horizontally.
             const maxHeight = this.getScoreMaxHeight(containerId);
             scoreElement.style.maxHeight = `${maxHeight}px`;
             scoreElement.style.overflowY = 'auto';
             scoreElement.style.overflowX = 'auto';
             scoreElement.style.scrollBehavior = 'smooth';

             // 'wrap' forces every bar onto a single unbroken horizontal line
             // (enabling smooth pre-rendered scrolling) while minSpacing/maxSpacing
             // keep note spacing natural. Both preferredMeasuresPerLine and
             // staffwidth must scale with the actual bar count: a fixed
             // preferredMeasuresPerLine bigger than the piece reserves blank
             // trailing space for the non-existent extra measures (short pieces),
             // while a fixed staffwidth too small for the piece forces an
             // unwanted second line (long pieces) - and re-running the wrap
             // algorithm's line-fitting search over a mismatched budget is also
             // what made rendering sluggish/prone to freezing on longer pieces.
             const totalBars = Math.max(1, this.getTotalBarsFromABC(this.abcString) || 0);
             const wrap = {
                preferredMeasuresPerLine: totalBars,
                minSpacing: 1.8,
                maxSpacing: 2.7
             };
             // Generous per-bar estimate so the single line almost never falls
             // short even for dense music - actual rendered width still only
             // reflects real content width (maxSpacing bounds it), it's not
             // stretched to fill this budget.
             const staffwidth = Math.max(2000, totalBars * 500);

             const renderOptions = {
                staffwidth,
                wrap,
                scale: 1.0,
                foregroundColor: '#000000',
                backgroundColor: 'transparent',
                percussion: true,
                drumBars: 1
             };

             const visualOptions = {
                add_classes: true,
                staffwidth,
                wrap,
                displayPercussion: true
             };

             // Tone represents 6/8 as three quarter-note beats, not as notation.
             // Render the converter's meter without rewriting it from playback.
             const rendered = this.abcjs.renderAbc(containerId, this.abcString, renderOptions, visualOptions);
             this.visualObj = (rendered && rendered[0]) || null;
             this._renderedAbcString = this.abcString;

             // Re-apply the current zoom level (persists across re-renders, e.g.
             // when toggling fullscreen or regenerating the ABC) before measuring.
             this.applyScoreZoom(containerId);

             // (Re)bind timing callbacks to the freshly rendered tune so note
             // highlighting and auto-scroll-follow stay in sync with the new layout.
             this.setupTimingCallbacks();
             this.setupScoreScrollInteractions(containerId);
             this.setupScorePinchZoom(containerId);

             setTimeout(() => {
                const scoreElement = document.getElementById(containerId);
                if (scoreElement) {
                    const svgElement = scoreElement.querySelector('svg');
                    if (svgElement) {
                        this.fitScoreHeight(containerId);
                    }

                    // Enhanced CSS for drum notation, plus the red "currently playing" highlight
                    let style = document.getElementById(`${containerId}-dynamic-style`);
                    if (!style) {
                        style = document.createElement('style');
                        style.id = `${containerId}-dynamic-style`;
                        document.head.appendChild(style);
                    }
                    style.textContent = `
                        #${containerId} {
                            overflow-y: auto;
                            overflow-x: auto;
                        }
                        #${containerId} .abcjs-note,
                        #${containerId} .abcjs-note_selected,
                        #${containerId} .abcjs-staff,
                        #${containerId} .abcjs-clef,
                        #${containerId} .abcjs-key-signature,
                        #${containerId} .abcjs-time-signature,
                        #${containerId} .abcjs-bar,
                        #${containerId} .abcjs-stem,
                        #${containerId} .abcjs-ledger,
                        #${containerId} .abcjs-slur,
                        #${containerId} .abcjs-tie {
                            fill: #000000 !important;
                            stroke: #000000 !important;
                            color: #000000 !important;
                        }
                        #${containerId} text {
                            fill: #000000 !important;
                            color: #000000 !important;
                        }
                        #${containerId} .note-playing,
                        #${containerId} .note-playing * {
                            fill: #d00000 !important;
                            stroke: #d00000 !important;
                        }
                    `;
                }
            }, 100);

            // console.log('ABC score rendered successfully');
        } catch (error) {
            console.error('Error rendering ABC score:', error);
        }
    }

    /**
     * Maximum height for the score element. In fullscreen it is derived from the
     * space left in the container below the score (so the open/closed score
     * settings are accounted for), otherwise from the window height.
     * @param {string} containerId - Container element ID
     * @returns {number} Height in px
     */
    getScoreMaxHeight(containerId = 'score') {
        const el = document.getElementById(containerId);
        const container = document.getElementById('scoreContainer');
        if (!this.isFullscreen || !el || !container || !el.parentElement) {
            return window.innerHeight - 150;
        }
        const wrapper = el.parentElement;
        const contentBottom = container.getBoundingClientRect().bottom
            - parseFloat(getComputedStyle(container).paddingBottom);
        let below = 0;
        for (let sib = wrapper.nextElementSibling; sib; sib = sib.nextElementSibling) {
            if (sib.getClientRects().length) {
                below = sib.getBoundingClientRect().bottom - wrapper.getBoundingClientRect().bottom;
            }
        }
        return Math.max(200, Math.floor(contentBottom - el.getBoundingClientRect().top - below));
    }

    /**
     * Sizes the score element to its rendered content, capped by the available
     * height. Does not re-render.
     * @param {string} containerId - Container element ID
     */
    fitScoreHeight(containerId = 'score') {
        const el = document.getElementById(containerId);
        const svg = el && el.querySelector('svg');
        if (!svg) return;
        const cs = getComputedStyle(el);
        const extra = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
            + (el.offsetHeight - el.clientHeight);
        const maxHeight = this.getScoreMaxHeight(containerId);
        // getBoundingClientRect() already reflects the applied zoom transform.
        const desired = svg.getBoundingClientRect().height + extra;
        el.style.maxHeight = `${maxHeight}px`;
        el.style.height = `${Math.min(desired, maxHeight)}px`;
    }

    /**
     * (Re)creates the abcjs TimingCallbacks bound to the currently rendered tune.
     * Used purely to look up (via its noteTimings table, see
     * findScoreEventAtTime()), for any given playback position, which note
     * elements are currently sounding and where they sit horizontally - no
     * cursor line or vanishing-note animation from abcjs is used, and its own
     * eventCallback/setProgress mechanism is intentionally not used (see
     * syncTimingToPlayback()).
     */
    setupTimingCallbacks() {
        this.clearNoteHighlights();
        this._scoreEvents = [];
        if (!this.abcjs || !this.visualObj || !this.abcjs.TimingCallbacks) {
            this.timingCallbacks = null;
            return;
        }
        this.timingCallbacks = new this.abcjs.TimingCallbacks(this.visualObj, {});
        // Cache just the actual note/chord/rest entries (sorted by time, and - since
        // the whole tune is rendered as one unbroken line - also sorted by x position)
        // so findScoreEventAtTime()/findScoreEventAtPixel() can binary-search them directly.
        this._scoreEvents = (this.timingCallbacks.noteTimings || []).filter((t) => t.type === 'event');
    }


    /**
     * Called by TimingCallbacks for every currently-sounding note/chord event.
     * Highlights the relevant note elements in red and centers the score view
     * on the event's horizontal position (clamped at the start/end of the piece).
     * @param {Object|null} ev - abcjs timing event, or null at the end of the tune
     */
    onScoreTimingEvent(ev) {
        this.clearNoteHighlights();
        if (!ev) return;

        const elements = Array.isArray(ev.elements) ? ev.elements.flat(Infinity) : [];
        elements.forEach((el) => el && el.classList && el.classList.add('note-playing'));
        this.highlightedElements = elements;

        if (typeof ev.left === 'number') {
            this.centerScoreOnPosition(ev.left, ev.width || 0);
        }
    }

    /**
     * Removes the "currently playing" highlight from any previously-highlighted
     * note elements.
     */
    clearNoteHighlights() {
        if (this.highlightedElements && this.highlightedElements.length) {
            this.highlightedElements.forEach((el) => el && el.classList && el.classList.remove('note-playing'));
        }
        this.highlightedElements = [];
    }

    /**
     * Scrolls the score container so the given horizontal SVG position is
     * centered in the visible viewport, clamped so it never scrolls past the
     * beginning or end of the rendered score.
     * @param {string} containerId - Container element ID
     * @param {number} left - Horizontal position (px) of the event in the SVG
     * @param {number} width - Width (px) of the event
     */
    centerScoreOnPosition(left, width = 0, containerId = 'score') {
        const scoreElement = document.getElementById(containerId);
        if (!scoreElement) return;
        // Don't fight the user's own scrolling/scrubbing.
        if (Date.now() < (this._manualScrollUntil || 0)) return;
        const zoom = this.scoreZoom || 1;
        const targetCenter = (left + width / 2) * zoom;
        const maxScroll = Math.max(0, scoreElement.scrollWidth - scoreElement.clientWidth);
        const desiredScrollLeft = Math.max(0, Math.min(maxScroll, targetCenter - scoreElement.clientWidth / 2));
        // Skip redundant writes - avoids fighting the in-flight smooth-scroll
        // animation and extra layout work on every single note event.
        if (Math.abs(scoreElement.scrollLeft - desiredScrollLeft) < 2) return;
        scoreElement.scrollLeft = desiredScrollLeft;
    }

    /**
     * Allows scrolling the (horizontally-scrollable) score with a regular
     * vertical mouse wheel, in addition to native trackpad/touch horizontal
     * scrolling. Bound once per container element.
     * @param {string} containerId - Container element ID
     */
    setupScoreScrollInteractions(containerId = 'score') {
        const el = document.getElementById(containerId);
        if (!el || el._wheelScrollBound) return;
        el._wheelScrollBound = true;
        el.addEventListener('wheel', (e) => {
            // Browsers report trackpad pinch gestures as wheel events with
            // ctrlKey set, so treat those as zoom rather than scroll.
            if (e.ctrlKey) {
                e.preventDefault();
                const rect = el.getBoundingClientRect();
                const anchor = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    contentX: (el.scrollLeft + e.clientX - rect.left) / (this.scoreZoom || 1),
                    contentY: (el.scrollTop + e.clientY - rect.top) / (this.scoreZoom || 1)
                };
                const zoomDelta = -e.deltaY * 0.01;
                this.setScoreZoom((this.scoreZoom || 1) * (1 + zoomDelta), containerId, anchor);
                return;
            }
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
                const next = Math.max(0, Math.min(maxScroll, el.scrollLeft + e.deltaY * this.scoreScrollAccelerationFactor));
                // Instant (not smooth) so successive wheel ticks accumulate from the real
                // position instead of an in-flight animation, and so the seek below
                // reads the final position.
                el.scrollTo({ left: next, behavior: 'instant' });
                // In fullscreen, where the position slider stays visible as a
                // scrubber, keep it (and the actual playback position) in sync
                // with this manual vertical-gesture scroll.
                if (this.isFullscreen) {
                    this._manualScrollUntil = Date.now() + 250;
                    this.seekPlaybackToScrollPosition(containerId);
                }
            }
        }, { passive: false });

        // Native touch dragging scrolls the container directly; scrub playback with it too.
        let touchScrubbing = false;
        el.addEventListener('touchstart', (e) => { touchScrubbing = e.touches.length === 1; }, { passive: true });
        el.addEventListener('touchend', () => { touchScrubbing = false; });
        el.addEventListener('touchcancel', () => { touchScrubbing = false; });
        el.addEventListener('scroll', () => {
            if (!touchScrubbing || !this.isFullscreen) return;
            this._manualScrollUntil = Date.now() + 250;
            this.seekPlaybackToScrollPosition(containerId);
        }, { passive: true });
    }

    /**
     * Enables pinch-to-zoom on the score container via two-finger touch
     * gestures. Zooming is implemented as a CSS transform on the rendered
     * score content (not a full re-render), so it's cheap and keeps the
     * score-follower's auto-scroll/centering logic (centerScoreOnPosition)
     * working unchanged - it simply scales the position it scrolls to by the
     * current zoom factor. Bound once per container element.
     * @param {string} containerId - Container element ID
     */
    setupScorePinchZoom(containerId = 'score') {
        const el = document.getElementById(containerId);
        if (!el || el._pinchZoomBound) return;
        el._pinchZoomBound = true;

        let pinchStartDistance = null;
        let pinchStartZoom = 1;
        let pinchAnchor = null;

        const touchDistance = (touches) => {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        };

        el.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                pinchStartDistance = touchDistance(e.touches);
                pinchStartZoom = this.scoreZoom || 1;
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = el.getBoundingClientRect();
                pinchAnchor = {
                    clientX: midX,
                    clientY: midY,
                    contentX: (el.scrollLeft + midX - rect.left) / pinchStartZoom,
                    contentY: (el.scrollTop + midY - rect.top) / pinchStartZoom
                };
            }
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && pinchStartDistance) {
                e.preventDefault();
                const newDistance = touchDistance(e.touches);
                const newZoom = pinchStartZoom * (newDistance / pinchStartDistance);
                this.setScoreZoom(newZoom, containerId, pinchAnchor);
            }
        }, { passive: false });

        const endPinch = (e) => {
            if (e.touches.length < 2) {
                pinchStartDistance = null;
                pinchAnchor = null;
            }
        };
        el.addEventListener('touchend', endPinch);
        el.addEventListener('touchcancel', endPinch);
    }

    /**
     * Sets the score zoom factor (clamped to [minScoreZoomFullscreen/minScoreZoomWindowed, maxScoreZoom]),
     * applies it as a CSS transform, and - if an anchor point is given - keeps
     * that point stationary under the fingers/cursor by adjusting scroll
     * position accordingly.
     * @param {number} zoom - Desired zoom factor
     * @param {string} containerId - Container element ID
     * @param {{clientX: number, clientY: number, contentX: number, contentY: number}|null} anchor
     *   Point to keep stationary, in viewport and unscaled-content coordinates
     */
    setScoreZoom(zoom, containerId = 'score', anchor = null) {
        const minZoom = this.isFullscreen ? this.minScoreZoomFullscreen : this.minScoreZoomWindowed;
        const clamped = Math.max(minZoom, Math.min(this.maxScoreZoom, zoom));
        this.scoreZoom = clamped;
        this.applyScoreZoom(containerId);

        const el = document.getElementById(containerId);
        if (el && anchor) {
            const rect = el.getBoundingClientRect();
            const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
            const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
            const desiredLeft = anchor.contentX * clamped - (anchor.clientX - rect.left);
            const desiredTop = anchor.contentY * clamped - (anchor.clientY - rect.top);
            el.scrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredLeft));
            el.scrollTop = Math.max(0, Math.min(maxScrollTop, desiredTop));
        }
    }

    /**
     * Applies the current this.scoreZoom as a CSS transform on the rendered
     * score's root element, scaling it in place without re-rendering.
     * @param {string} containerId - Container element ID
     */
    applyScoreZoom(containerId = 'score') {
        const el = document.getElementById(containerId);
        if (!el) return;
        const content = el.firstElementChild;
        if (!content) return;
        content.style.transformOrigin = '0 0';
        content.style.transform = `scale(${this.scoreZoom || 1})`;
    }


    /**
     * Clears the "Updating score..." placeholder state and resumes score-follower
     * polling updates. Does not touch the DOM directly - the caller is expected to
     * immediately re-render (e.g. via updateScoreFollower/renderScoreFollower),
     * which will replace the placeholder content.
     */
    hideScoreLoadingIndicator() {
        this.scoreRegenerating = false;
    }

    /**
     * Re-renders the full score (the whole tune is always rendered as one
     * continuous scrollable line - see renderScore()). Kept as a distinct
     * entry point for callers that used to request a specific bar window;
     * the startBar parameter is no longer needed but is accepted for
     * backwards compatibility.
     * @param {string} containerId - Container element ID (default: 'score')
     */
    renderScoreFollower(containerId = 'score') {
        if (!this.scoreAvailable) {
            return;
        }
        this.renderScore(containerId);
        const transport = this.app.modules.transport;
        if (this.scoreFollowerActive && transport && transport.playing) {
            this.syncTimingToPlayback();
        }
    }

    /**
     * Shows a lightweight "Updating score..." placeholder in the score container and
     * pauses score-follower polling updates (via scoreRegenerating) so the follower
     * never renders against mismatched/incomplete ABC data while it's being
     * regenerated - e.g. after toggling reversed playback, changing the time/key
     * signature, or shifting the score start.
     * @async
     * @param {string} containerId - Container element ID (default: 'score')
     * @returns {Promise<void>} Resolves after yielding a couple of frames so the
     * browser has a chance to actually paint the indicator before any subsequent
     * synchronous/blocking WASM work runs on the main thread.
     */
    async showScoreLoadingIndicator(containerId = 'score') {
        this.scoreRegenerating = true;
        const scoreElement = document.getElementById(containerId);
        if (scoreElement) {
            scoreElement.innerHTML = '<p style="padding: 20px; text-align: center;">🔄 Updating score…</p>';
        }
        // Yield to the browser (double rAF) so the placeholder is actually painted
        // before we proceed with the (potentially blocking) ABC regeneration.
        await new Promise((resolve) => {
            if (typeof window !== 'undefined' && window.requestAnimationFrame) {
                window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * Reloads the score and updates the display
     * @param {string} containerId - Container element ID (default: 'score')
     */
    async reloadScore(containerId = 'score') {
        // console.log('Reloading score...');
        const scoreElement = document.getElementById(containerId);
        if (!scoreElement) return;

        // Show a loading indicator and pause score-follower polling while the ABC
        // is regenerated, so a concurrently-running poll tick can't race against
        // this reload and render mismatched/incomplete data.
        await this.showScoreLoadingIndicator(containerId);

        try {
            // Regenerate ABC from current MIDI
            const transport = this.app.modules.transport;
            let abcNotation = '';
            if (transport && transport.createCurrentMidi) {
                const currentMidi = transport.createCurrentMidi();
                if (currentMidi) {
                    // prefer UI selects, then Tone.Transport, then MIDI header
                    const ts = this.getActiveTimeSignature();
                    const ks = this.getActiveKeySignature();
                    abcNotation = await this.generateABCStringfromMIDI(currentMidi, ts, ks);
                }
            }

            if (!abcNotation) {
                scoreElement.innerHTML = '<p>Failed to reload score data</p>';
                return;
            }

            // Update the stored abcString with the regenerated notation
            this.abcString = abcNotation;

            // If score follower is active, update follower window; otherwise, full render
            if (this.scoreFollowerActive) {
                this.renderScoreFollower(containerId, this.currentBarStart);
            } else {
                this.renderScore(containerId);
            }
        } finally {
            this.hideScoreLoadingIndicator();
        }
    }

    /**
     * Inject or replace M: time signature line in an ABC string
     * @param {string} abc - ABC notation
     * @param {Array|number|string} ts - time signature (e.g. [4,4] or '4/4' or 4)
     * @returns {string} updated ABC string
     */
    injectTimeSignatureIntoABC(abc, ts) {
        if (!abc || !abc.trim() || !ts) return abc;
        let num, den;
        if (Array.isArray(ts) && ts.length >= 2) {
            [num, den] = ts;
        } else if (typeof ts === 'number') {
            num = ts; den = 4;
        } else if (typeof ts === 'string') {
            const parts = ts.split('/');
            num = parseInt(parts[0], 10) || 4;
            den = parseInt(parts[1], 10) || 4;
        } else {
            return abc;
        }
        const ms = `M:${num}/${den}`;
        // Replace existing M: line if present in header, otherwise insert after X: or at top of header
        const lines = abc.split('\n');
        let replaced = false;
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            if (/^\s*M:/.test(lines[i])) {
                lines[i] = ms;
                replaced = true;
                break;
            }
            // Insert after the X: line if header has no M: and we reach an early header end
            if (/^\s*K:/.test(lines[i]) && !replaced) {
                // insert M: before the K: line to keep header order
                lines.splice(i, 0, ms);
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            // If no header context found, prepend M: at top
            lines.unshift(ms);
        }
        return lines.join('\n');
    }

    /**
     * Extracts the current MIDI from the transport module,
     * regenerates the ABC string, and returns the updated ABC notation.
     * @returns {Promise<string>} - The updated ABC notation.
     */
    async updateMidiAndGetABC() {
        const transport = this.app.modules.transport;
        if (!transport || !transport.createCurrentMidi) {
            console.error('Transport module or createCurrentMidi function not available');
            return '';
        }

        try {
            // Extract the current MIDI file
            const midiFile = transport.createCurrentMidi();
            if (!midiFile) {
                console.error('Failed to create current MIDI from transport');
                return '';
            }

            // prefer UI selects, then Tone.Transport, then MIDI header
            const ts = this.getActiveTimeSignature();
            const ks = this.getActiveKeySignature();
            const abcString = await this.generateABCStringfromMIDI(midiFile, ts, ks);
            return abcString;
        } catch (error) {
            console.error('Error updating MIDI and generating ABC:', error);
            return '';
        }
    }

    /**
     * Resets the score follower to the beginning of the piece
     * @param {string} containerId - Container element ID (default: 'score')
     */
    async resetScoreFollower(containerId = 'score') {
        this.currentBarStart = 0;
        this.lastPolledBar = null; // Reset polling state

        // Check if we have ABC data before trying to render
        if (!this.abcString || !this.abcString.trim()) {
            console.warn('No ABC data available for reset, regenerating...');
            // Try to regenerate the score
            const transport = this.app.modules.transport;
            if (transport && transport.createCurrentMidi) {
                const currentMidi = transport.createCurrentMidi();
                if (currentMidi) {
                    // prefer UI selects, then Tone.Transport, then MIDI header
                    const ts = this.getActiveTimeSignature();
                    const ks = this.getActiveKeySignature();
                    const abcNotation = await this.generateABCStringfromMIDI(currentMidi, ts, ks);
                    if (!abcNotation) {
                         const scoreElement = document.getElementById(containerId);
                         if (scoreElement) {
                             scoreElement.innerHTML = '<p>Could not generate score data</p>';
                         }
                         return;
                     }
                     // Update the stored abcString with the regenerated notation
                     this.abcString = abcNotation;
                 }
                 else {
                     console.warn('No current MIDI available for regeneration');
                 }
             }
         }

        this.renderScore(containerId);
        const scoreElement = document.getElementById(containerId);
        if (scoreElement) {
            scoreElement.scrollLeft = 0;
        }
    }


    /**
     * Displays the MIDI score with optional score following
     * @param {boolean} useScoreFollowing - Whether to enable real-time score following
     */
    async showMidiScore(useScoreFollowing = false) {
         const scoreDiv = document.getElementById('score');
         
         if (!scoreDiv || !this.app.modules.transport.originalMidi) {
             console.error('no file loaded or score elements not found');
             return;
         }

         // Show feedback immediately and make sure abcjs/midi2abc have actually
         // finished loading before generating/rendering - otherwise a render
         // attempted before the dynamically-loaded abcjs script arrives
         // silently no-ops and this placeholder is never replaced.
         scoreDiv.innerHTML = '<p style="padding: 20px; text-align: center;">🔄 Generating score…</p>';
         try {
             await this.loadModules();
         } catch (err) {
             console.error('Failed to load score modules:', err);
         }
         if (!this.abcjs) {
             scoreDiv.innerHTML = '<p>Could not load the score renderer. Please try again.</p>';
             return;
         }

         // Check if we have a valid ABC string already
         if (!this.abcString || this.abcString.trim().length === 0) {
             // Try to regenerate ABC
             try {
                 const transport = this.app.modules.transport;
                 if (!transport) {
                     console.error('Transport module not available');
                     return;
                 }

                 const currentMidi = transport.createCurrentMidi();
                 if (!currentMidi) {
                     console.error('Failed to create current MIDI');
                     return;
                 }

                 // prefer UI selects, then Tone.Transport, then MIDI header
                 const ts = this.getActiveTimeSignature();
                 const ks = this.getActiveKeySignature();
                 const abcNotation = await this.generateABCStringfromMIDI(currentMidi, ts, ks);
                 if (!abcNotation) {
                     // generateABCStringfromMIDI will handle the error notification
                     return;
                 }
                 
             } catch (error) {
                 console.error('Error regenerating score:', error);
                 this.handleAbcGenerationFailure(`Score regeneration failed: ${error.message}`);
                 return;
             }
         }
         
         // Show the container
         document.getElementById("showScore").style.display = 'none';
         
         // Use score following or regular rendering
         if (useScoreFollowing) {
            this.startScoreFollowing('score');

            // If playback is already running, start polling immediately
            const transport = this.app.modules.transport;
            if (transport && transport.playing) {
                this.startPollingForPlayback('score');
            }

        } else {
            this.renderScore('score');
        }
    }

    /**
     * Read the explicit meter override, or null for midi2abc's automatic meter.
     */
    getActiveTimeSignature() {
        // Displaying a detected meter in the controls is not a manual override.
        // With no override, let midi2abc read the MIDI's meter events.
        return this.app.state.timeSignature || null;
    }

    /**
     * Read the explicit key signature override (not the detected UI value).
     * Returns an integer from -6 to 6 (sharps positive, flats negative) or null
     * if automatic detection should be used.
     */
    getActiveKeySignature() {
        return this.app.state.keySignature ?? null;
    }

    /**
     * Returns the currently active ABC unit note-length override (a denominator
     * such as 8 for eighth notes or 16 for sixteenth notes), set via the Half
     * Time/Double Time buttons, or null to let midi2abc auto-select it from the
     * time signature (its default behaviour).
     * @returns {number|null}
     */
    getActiveUnitLength() {
        const val = this.app.state.abcUnitLength;
        return (typeof val === 'number' && val > 0) ? val : null;
    }

    /**
     * Computes the unit note-length denominator midi2abc would auto-select for
     * a given time signature, replicating its own default-selection rule
     * (meters with a "compound" feel default to eighth notes, others to
     * sixteenths) so Half Time/Double Time have a sensible starting point
     * before the user has ever overridden the unit length.
     * @param {Array} timeSignature - [numerator, denominator]
     * @returns {number}
     */
    getDefaultUnitLengthForTimeSignature(timeSignature) {
        const [num, den] = (Array.isArray(timeSignature) && timeSignature.length >= 2) ? timeSignature : [4, 4];
        return ((num * 4) / (den || 4) >= 3) ? 8 : 16;
    }

    async setShortRestQuantization(value) {
        const parsed = parseInt(value, 10);
        const next = [4, 8, 16].includes(parsed) ? parsed : null;
        this.app.state.abcShortRest = next;
        this.app.modules.settingsManager?.updateUserSettings('abcShortRest', next, -1);
        if (this.scoreShown) await this.reloadScore('score');
    }

    updateABCUnitLength(multiplier) {
        const match = this.abcString.match(/^L:\s*1\s*\/\s*(\d+)\s*$/m);
        if (!match) return false;
        const current = Number(match[1]);
        const next = Math.max(1, Math.min(1024, current * multiplier));
        this.abcString = this.abcString.replace(/^L:\s*1\s*\/\s*\d+\s*$/m, `L:1/${next}`);
        this.app.state.abcUnitLength = next;
        this.app.modules.settingsManager?.updateUserSettings('abcUnitLength', next, -1);
        if (this.scoreFollowerActive) {
            this.renderScoreFollower('score', this.currentBarStart);
        } else {
            this.renderScore('score');
        }
        return true;
    }

    async halveNoteLength() {
        try {
            this.updateABCUnitLength(0.5);
        } catch (err) {
            console.error('Error halving note length:', err);
        }
    }

    /**
     * Doubles the printed rhythmic resolution (e.g. eighth notes become
     * sixteenth notes) - useful when midi2abc's automatically-chosen note
     * values look coarser/larger than the music actually calls for. Persists
     * the choice and regenerates the score.
     */
    async doubleNoteLength() {
        try {
            this.updateABCUnitLength(2);
        } catch (err) {
            console.error('Error doubling note length:', err);
        }
    }

    /**
     * Read UI selects and apply the selected time signature to Tone and ABC generation,
     * then regenerate and reload the displayed score.
     */
    async onTimeSignatureSelectChange() {
        try {
            const num = parseInt(document.getElementById('timeSigNum').value, 10);
            const den = parseInt(document.getElementById('timeSigDen').value, 10);
            this.app.state.timeSignature = [num, den];

            // Persist the user's choice so it is included in the shareable URL
            const settingsManager = this.app.modules.settingsManager;
            if (settingsManager) {
                settingsManager.updateUserSettings('timeSignature', [num, den], -1);
            }

            // Try to set Tone.Transport.timeSignature as [num,den], fallback to number
            try {
                if (window.Tone && window.Tone.Transport) {
                    try {
                        window.Tone.Transport.timeSignature = [num, den];
                    } catch (e) {
                        // some Tone builds expect a number -> set beats per bar
                        window.Tone.Transport.timeSignature = num * 4 / den;
                    }
                }
            } catch (e) {
                console.warn('Failed to apply time signature to Tone.Transport:', e);
            }

            await this.reloadScore('score');
        } catch (err) {
            console.error('Error handling time signature change:', err);
        }
    }

    /**
     * Read the key signature UI select and apply it to ABC generation,
     * then regenerate and reload the displayed score.
     */
    async onKeySignatureSelectChange() {
        try {
            const value = document.getElementById('keySignature').value;
            this.app.state.keySignature = value === 'auto' ? null : parseInt(value, 10);
            // Persist the user's choice so it is included in the shareable URL
            const settingsManager = this.app.modules.settingsManager;
            if (settingsManager) {
                settingsManager.updateUserSettings('keySignature', this.getActiveKeySignature(), -1);
            }
            await this.reloadScore('score');
        } catch (err) {
            console.error('Error handling key signature change:', err);
        }
    }

    /**
     * Sets the first musical bar information for score synchronization
     * @param {Object} downbeat - Downbeat information from transport
     */
    setFirstMusicalBar(downbeat) {
        this.firstDownbeat = downbeat;
        
        // If you need to show the detected downbeat in UI:
        // console.log(`First downbeat detected at: ${downbeat.time.toFixed(2)}s (${downbeat.method})`);
    }

    /**
     * Clamps a bar index into the valid [0, totalBars-1] range of the currently
     * displayed ABC notation. Both forward and reversed playback already schedule
     * audio and regenerate the displayed ABC from the same tick timeline (reversed
     * playback re-maps note ticks via Transport.createCurrentMidi() before the ABC
     * is (re)generated), so Tone.Transport's raw forward bar count already indexes
     * directly into whichever ABC is currently shown - no extra "flip" is needed.
     * This clamp only guards against boundary mismatches between the audio's real
     * duration and midi2abc's own bar-splitting so the follower never crashes.
     * @param {number} bar - 0-based bar index
     * @returns {number} 0-based bar index, clamped to a valid range
     */
    clampBarIndex(bar) {
        const totalBars = (typeof this.totalBars === 'number' && this.totalBars > 0) ? this.totalBars : 0;
        if (totalBars <= 0) {
            return Math.max(0, bar);
        }
        return Math.max(0, Math.min(totalBars - 1, bar));
    }

    /**
     * Gets the current playback bar position from transport timing
     * @returns {number} Current bar number (0-based)
     */
    getCurrentPlaybackBar() {
        const transport = this.app.modules.transport;
        if (!transport || !transport.playing) {
            return 0;
        }
        
        try {
            if (window.Tone && window.Tone.Transport) {
                // Use Tone.js position directly for more accurate timing
                const position = window.Tone.Transport.position;
                
                // Parse the position string (format: "bars:beats:sixteenths")
                const positionParts = position.split(':').map(p => parseInt(p, 10) || 0);
                const [parsedBars = 0, parsedBeats = 0, parsedSixteenths = 0] = positionParts;
                
                // Detect whether Tone.Transport.position uses 1-based bar numbering.
                if (this._tonePositionOneBased === undefined) {
                    const seconds = (window.Tone.Transport.seconds || 0);
                    this._tonePositionOneBased = (seconds < 0.05 && parsedBars > 0);
                }
                
                // Determine beats per bar (robust for number or array)
                let beatsPerBar = 4;
                const ts = window.Tone.Transport.timeSignature;
                if (typeof ts === 'number') {
                    beatsPerBar = ts;
                } else if (Array.isArray(ts)) {
                    beatsPerBar = ts[0] || 4;
                }

                // fractional bar index (0-based after correction)
                let barFloat = parsedBars + (parsedBeats / Math.max(1, beatsPerBar)) + (parsedSixteenths / (Math.max(1, beatsPerBar) * 4));
                if (this._tonePositionOneBased) barFloat = Math.max(0, barFloat - 1);
                let currentBar = Math.max(0, Math.floor(barFloat));
                
                // Tone.Transport's bar count already indexes directly into whichever
                // ABC is currently displayed (forward or reversed) - see clampBarIndex().
                return this.clampBarIndex(currentBar);
            }
        } catch (error) {
            console.warn('Could not get current playback bar:', error);
        }
        
        return 0;
    }



    /**
     * Resyncs the score follower's note-highlighting/auto-scroll to the
     * current playback position. Called after the ABC has been regenerated
     * (e.g. reversed playback toggled, MIDI edited) so the follower never
     * operates on stale data. barNumber/immediately are accepted for
     * backwards compatibility but no longer change what is rendered, since
     * the whole score is always rendered as a single continuous line.
     * @param {string} containerId - Container element ID
     */
    updateScoreFollower(containerId = 'score') {
        this.renderScore(containerId);
        const transport = this.app.modules.transport;
        if (transport && transport.playing) {
            this.syncTimingToPlayback();
        }
    }

    /**
     * Starts score following mode: renders the full score (if not already
     * rendered) and begins polling playback position to drive note
     * highlighting and auto-scroll-centering.
     * @param {string} containerId - Container element ID (default: 'score')
     */
    startScoreFollowing(containerId = 'score') {
        if (!this.scoreAvailable) {
            return;
        }

        this.scoreFollowerActive = true;
        this.currentBarStart = 0;
        this.lastPolledBar = null;

        if (!this.visualObj || this._renderedAbcString !== this.abcString) {
            this.renderScore(containerId);
        } else {
            this.setupTimingCallbacks();
        }

        const scoreElement = document.getElementById(containerId);
        if (scoreElement && !this.isFullscreen) {
            scoreElement.scrollLeft = 0;
        }

        this.startPollingForPlayback(containerId);
    }

    /**
     * Starts polling the transport for playback position updates, syncing
     * note highlighting and auto-scroll-centering to the current position.
     * @param {string} containerId - Container element ID for updates
     */
    startPollingForPlayback(containerId) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        if (!this.scoreFollowerActive) {
            return;
        }

        this.pollingInterval = setInterval(() => {
            const transport = this.app.modules.transport;

            // Only poll if transport is actually playing
            if (!transport || !transport.playing) {
                this.stopPollingForPlayback();
                return;
            }

            // Skip updates while the ABC/score is being regenerated (e.g. after
            // toggling reversed playback) so we never sync against stale or
            // mismatched data. The code that triggers regeneration is
            // responsible for calling updateScoreFollower() itself once ready.
            if (this.scoreRegenerating) {
                return;
            }

            this.syncTimingToPlayback();
        }, 50);
    }

    /**
     * Feeds the current Tone.Transport playback position into the score
     * follower (converted to "musical" seconds, i.e. unaffected by the
     * playback speed multiplier and direction) and highlights/centers the
     * note actually sounding at that position.
     */
    syncTimingToPlayback() {
        if (!this.timingCallbacks || typeof window === 'undefined' || !window.Tone) {
            return;
        }
        try {
            const state = this.app.state;
            const speed = state.speed || 1;
            const wallDuration = (this.app.track_duration || 0) / speed;
            const wallPos = window.Tone.Transport.seconds || 0;
            const effectiveWall = state.reversedPlayback ? (wallDuration - wallPos) : wallPos;
            const musicalSeconds = Math.max(0, effectiveWall * speed);
            // abcjs's own setProgress()/eventCallback highlights the *next
            // upcoming* event (the first one at/after the given time) rather
            // than the one currently sounding, which made the highlight look
            // like it was running ahead of the audio and skipped the very
            // first note - so find and highlight the current event ourselves.
            const event = this.findScoreEventAtTime(musicalSeconds * 1000);
            this.onScoreTimingEvent(event);
        } catch (err) {
            console.warn('Could not sync score timing to playback:', err);
        }
    }

    /**
     * Finds the note/chord event that is actually sounding at a given time.
     * @param {number} currentMs - Position in milliseconds from the start of the tune
     * @returns {Object|null} The abcjs timing event, or null if none has started yet
     */
    findScoreEventAtTime(currentMs) {
        const events = this._scoreEvents;
        if (!events || !events.length) return null;

        let lo = 0, hi = events.length - 1, idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (events[mid].milliseconds <= currentMs) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return idx >= 0 ? events[idx] : null;
    }

    /**
     * Finds the note/chord event whose horizontal position is closest to (at
     * or before) the given content-space X coordinate - the inverse of
     * centerScoreOnPosition() - used to seek playback to wherever the user
     * has manually scrolled the score to.
     * @param {number} contentX - X position in unscaled score/SVG coordinates
     * @returns {Object|null} The nearest abcjs timing event, or null if none found
     */
    findScoreEventAtPixel(contentX) {
        const events = this._scoreEvents;
        if (!events || !events.length) return null;

        let lo = 0, hi = events.length - 1, idx = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (typeof events[mid].left === 'number' && events[mid].left <= contentX) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return events[idx];
    }

    /**
     * Seeks playback to the musical position the score is currently scrolled
     * to (its visible center), and updates the progress slider to match.
     * @param {string} containerId - Container element ID
     */
    seekPlaybackToScrollPosition(containerId = 'score') {
        const transport = this.app.modules.transport;
        if (!transport || typeof transport.seekToPiecePosition !== 'function') return;

        const scoreElement = document.getElementById(containerId);
        if (!scoreElement) return;

        const zoom = this.scoreZoom || 1;
        const contentX = (scoreElement.scrollLeft + scoreElement.clientWidth / 2) / zoom;
        const event = this.findScoreEventAtPixel(contentX);
        if (!event || typeof event.milliseconds !== 'number') return;

        const state = this.app.state;
        const speed = state.speed || 1;
        const piecePosition = (event.milliseconds / 1000) / speed;
        transport.seekToPiecePosition(piecePosition, { syncScore: false });
    }

    /**
     * Stops polling for playback position when playback ends
     */
    stopPollingForPlayback() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Stops all score following activity and cleans up resources
     */
    stopScoreFollowing() {
        this.scoreFollowerActive = false;
        this.lastPolledBar = null;

        // Clear any pending updates
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        this.stopPollingForPlayback();
        this.clearNoteHighlights();
        this.timingCallbacks = null;
    }

    /**
     * Moves an element into a target slot while leaving a placeholder to restore it later.
     * @param {HTMLElement} element - Element to move
     * @param {HTMLElement} targetSlot - Slot element to append to
     * @param {string} placeholderKey - Unique key for placeholder
     */
    moveElementWithPlaceholder(element, targetSlot, placeholderKey = null) {
        if (!element || !targetSlot || !element.parentNode) return;
        const key = placeholderKey || element.id || (element.getAttribute && element.getAttribute('for')) || 'elem';
        const placeholderId = `${key}-fs-placeholder`;
        let placeholder = document.getElementById(placeholderId);
        if (!placeholder) {
            placeholder = document.createElement('span');
            placeholder.id = placeholderId;
            placeholder.style.display = 'none';
            element.parentNode.insertBefore(placeholder, element);
        }
        targetSlot.appendChild(element);
    }

    /**
     * Restores an element to its original position using its placeholder.
     * @param {HTMLElement} element - Element to restore
     * @param {string} placeholderKey - Unique key for placeholder
     */
    restoreElementFromPlaceholder(element, placeholderKey = null) {
        if (!element) return;
        const key = placeholderKey || element.id || (element.getAttribute && element.getAttribute('for')) || 'elem';
        const placeholderId = `${key}-fs-placeholder`;
        const placeholder = document.getElementById(placeholderId);
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(element, placeholder);
            placeholder.remove();
        }
    }

    /**
     * Moves playback controls to the fullscreen overlay bar
     */
    moveControlsToFullscreen() {
        const playBtn = document.getElementById('playMidi');
        const playSlot = document.getElementById('fsPlaySlot');
        if (playBtn && playSlot) {
            this.moveElementWithPlaceholder(playBtn, playSlot, 'playMidi');
        }

        const revInput = document.getElementById('reverseMidi');
        const revLabel = document.querySelector('label[for="reverseMidi"]');
        const revSlot = document.getElementById('fsReverseSlot');
        if (revInput && revSlot) {
            this.moveElementWithPlaceholder(revInput, revSlot, 'reverseMidi');
        }
        if (revLabel && revSlot) {
            this.moveElementWithPlaceholder(revLabel, revSlot, 'reverseMidiLabel');
        }

        const speedLabel = document.querySelector('label[for="speedControl"]');
        const speedInput = document.getElementById('speedControl');
        const speedSlot = document.getElementById('fsSpeedSlot');
        if (speedLabel && speedSlot) {
            this.moveElementWithPlaceholder(speedLabel, speedSlot, 'speedControlLabel');
        }
        if (speedInput && speedSlot) {
            this.moveElementWithPlaceholder(speedInput, speedSlot, 'speedControl');
        }

        const progressInput = document.getElementById('progress-input');
        const progressSlot = document.getElementById('fsProgressSlot');
        if (progressInput && progressSlot) {
            this.moveElementWithPlaceholder(progressInput, progressSlot, 'progress-input');
            progressInput.style.display = 'block';
        }
    }

    /**
     * Restores playback controls from fullscreen overlay back to their original places
     */
    restoreControlsFromFullscreen() {
        const playBtn = document.getElementById('playMidi');
        if (playBtn) this.restoreElementFromPlaceholder(playBtn, 'playMidi');

        const revInput = document.getElementById('reverseMidi');
        if (revInput) this.restoreElementFromPlaceholder(revInput, 'reverseMidi');

        const revLabel = document.querySelector('label[for="reverseMidi"]');
        if (revLabel) this.restoreElementFromPlaceholder(revLabel, 'reverseMidiLabel');

        const speedLabel = document.querySelector('label[for="speedControl"]');
        if (speedLabel) this.restoreElementFromPlaceholder(speedLabel, 'speedControlLabel');

        const speedInput = document.getElementById('speedControl');
        if (speedInput) this.restoreElementFromPlaceholder(speedInput, 'speedControl');

        const progressInput = document.getElementById('progress-input');
        if (progressInput) {
            this.restoreElementFromPlaceholder(progressInput, 'progress-input');
            const isPlaying = this.app.modules.transport && this.app.modules.transport.playing;
            progressInput.style.display = isPlaying ? 'block' : 'none';
        }
    }

    /**
     * Toggles between fullscreen and normal score mode
     */
    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    /**
     * Enters fullscreen score mode
     */
    enterFullscreen() {
        if (this.isFullscreen) return;
        if (!this.scoreShown) {
            this.showScore();
        }
        this.isFullscreen = true;

        const scoreContainer = document.getElementById('scoreContainer');
        const overlay = document.getElementById('scoreFullscreenOverlay');
        const fsBtn = document.getElementById('fullscreenScoreBtn');
        if (fsBtn) {
            fsBtn.textContent = '⛶ Exit Fullscreen';
            fsBtn.classList.remove('btn-outline-info');
            fsBtn.classList.add('btn-outline-warning');
        }

        this.moveControlsToFullscreen();

        if (scoreContainer) {
            scoreContainer.classList.add('score-fullscreen');
        }
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.add('score-fullscreen-active');
        }
        if (overlay) {
            overlay.style.display = 'flex';
        }

        let nativeTransition = null;
        if (scoreContainer && scoreContainer.requestFullscreen) {
            nativeTransition = scoreContainer.requestFullscreen().catch(() => {});
        } else if (typeof document !== 'undefined' && document.documentElement && document.documentElement.requestFullscreen) {
            nativeTransition = document.documentElement.requestFullscreen().catch(() => {});
        }

        // Wait for the native fullscreen transition (if any) to actually finish
        // before measuring the window, so the re-render uses the real fullscreen size.
        Promise.resolve(nativeTransition).then(() => this.rerenderScoreAfterLayoutSettles('score'));
    }

    /**
     * Exits fullscreen score mode and restores all elements
     * @param {boolean} requestExitNative - Whether to call document.exitFullscreen
     */
    exitFullscreen(requestExitNative = true) {
        if (!this.isFullscreen) return;
        this.isFullscreen = false;

        const scoreContainer = document.getElementById('scoreContainer');
        const overlay = document.getElementById('scoreFullscreenOverlay');
        const fsBtn = document.getElementById('fullscreenScoreBtn');
        if (fsBtn) {
            fsBtn.textContent = '⛶ Fullscreen';
            fsBtn.classList.remove('btn-outline-warning');
            fsBtn.classList.add('btn-outline-info');
        }

        let nativeTransition = null;
        if (requestExitNative && typeof document !== 'undefined') {
            if (document.fullscreenElement) {
                nativeTransition = document.exitFullscreen().catch(() => {});
            } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
                nativeTransition = document.webkitExitFullscreen();
            }
        }

        this.restoreControlsFromFullscreen();

        if (scoreContainer) {
            scoreContainer.classList.remove('score-fullscreen');
        }
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.remove('score-fullscreen-active');
        }
        if (overlay) {
            overlay.style.display = 'none';
        }

        // Wait for the native fullscreen exit (if any) to actually finish before
        // re-measuring - on small/mobile screens the browser's address bar can
        // reappear just after this, briefly reporting stale window dimensions.
        Promise.resolve(nativeTransition).then(() => this.rerenderScoreAfterLayoutSettles('score'));
    }

    /**
     * Hides the score display and cleans up score following resources
     */
    hideScore() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        }

        // console.log('Hiding score and cleaning up score follower');
        this.stopScoreFollowing();
        this.scoreShown = false;
        this.abcString = "";

        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'none';
            document.getElementById("showScore").style.display =
                this.scoreAvailable ? 'block' : 'none';
        }
    }

    /**
     * Shows the score with automatic score following enabled
     */
    showScore() {
        if (!this.scoreAvailable) {
            const showScoreButton = document.getElementById("showScore");
            if (showScoreButton) {
                showScoreButton.style.display = 'none';
            }
            return;
        }

        this.scoreShown = true;
        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'block';
            document.getElementById("showScore").style.display = 'none';
        }
        
        // Always use score following when showing the score
        const transport = this.app.modules.transport;
        const useScoreFollowing = true; // Always enable score following
        
        this.showMidiScore(useScoreFollowing);
        
        // Only sync Tone.js time signature from ABC if Tone doesn't already have one
        try {
            const ts = window.Tone && window.Tone.Transport && window.Tone.Transport.timeSignature;
            if (!ts) {
                this.syncToneTimeSignatureFromABC();
            }
        } catch (e) {
            this.syncToneTimeSignatureFromABC();
        }
    }

    /**
     * Debug method to check synchronization between score and playback
     */
    debugCurrentPosition() {
        const transport = this.app.modules.transport;
        if (transport && transport.playing) {
            const tonePosition = window.Tone.Transport.position;
            const calculatedBar = this.getCurrentPlaybackBar();
            const currentWindow = Math.floor(calculatedBar / 4) * 4;
            
            console.log('=== SCORE SYNC DEBUG ===');
            console.log('Tone.Transport.position:', tonePosition);
            console.log('Calculated bar:', calculatedBar);
            console.log('Current 4-bar window:', `${currentWindow}-${currentWindow + 3}`);
            console.log('Score showing window:', `${this.currentBarStart}-${this.currentBarStart + 3}`);
            console.log('========================');
        }
    }

    /**
     * Download current ABC notation as a file named "adcScore.abc".
     * Regenerates ABC from current MIDI if needed.
     */
    downloadABC() {
        const filename = 'adcScore.abc';
        const doDownload = async () => {
            try {
                let abc = (this.abcString && this.abcString.trim()) ? this.abcString : '';

                // Try to regenerate if empty
                if (!abc) {
                    const transport = this.app?.modules?.transport;
                    if (transport && typeof transport.createCurrentMidi === 'function') {
                        const midi = transport.createCurrentMidi();
                        if (midi) {
                            abc = await this.generateABCStringfromMIDI(midi, this.getActiveTimeSignature(), this.getActiveKeySignature());
                        }
                    }
                }

                if (!abc || !abc.trim()) {
                    // Minimal user feedback if no ABC data is available
                    alert('No ABC data available to download.');
                    return;
                }

                const blob = new Blob([abc], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                               const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } catch (err) {

                console.error('Failed to download ABC file:', err);
                alert('Failed to download ABC file.');
            }
        };

        doDownload();
    }

    /**
     * Set UI selects to reflect a given time signature (array [num,den] or number)
     * @param {Array|number|null} ts
     */
    setTimeSignatureUI(ts) {
        const numEl = document.getElementById('timeSigNum');
        const denEl = document.getElementById('timeSigDen');
        if (!numEl || !denEl) return;

        let num = 4, den = 4;
        if (Array.isArray(ts) && ts.length >= 2) {
            num = ts[0];
            den = ts[1];
        } else if (typeof ts === 'number') {
            num = ts;
            den = 4;
        } else if (typeof ts === 'string') {
            const parts = ts.split('/');
            if (parts.length === 2) {
                num = parseInt(parts[0], 10) || 4;
                den = parseInt(parts[1], 10) || 4;
            }
        }

        // Preserve uncommon meters detected by midi2abc instead of leaving a
        // select empty when its initial options do not include the result.
        for (const [element, value] of [[numEl, num], [denEl, den]]) {
            if (!Array.from(element.options).some(option => option.value === String(value))) {
                const option = document.createElement('option');
                option.value = String(value);
                option.textContent = String(value);
                element.appendChild(option);
            }
        }
        numEl.value = String(num);
        denEl.value = String(den);
    }

    /**
     * Reflect the converter's actual settings without turning detection into an
     * override. Only user changes (or shared URL settings) write those overrides.
     */
    syncScoreSettingsFromABC(abc) {
        const meter = abc.match(/^M:\s*(\d+)\s*\/\s*(\d+)/m);
        if (meter) {
            const ts = [Number(meter[1]), Number(meter[2])];
            this.setTimeSignatureUI(ts);
            if (window.Tone?.Transport) {
                window.Tone.Transport.timeSignature = ts;
            }
        }

        const key = abc.match(/^K:\s*([A-G])([#b]?)([a-z]*)/m);
        if (key) {
            const major = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 };
            const mode = key[3].toLowerCase();
            const offset = (mode === 'm' || mode.startsWith('min') || mode.startsWith('aeo')) ? -3
                : mode.startsWith('dor') ? -2 : mode.startsWith('phr') ? -4
                : mode.startsWith('lyd') ? 1 : mode.startsWith('mix') ? -1
                : mode.startsWith('loc') ? -5 : 0;
            const sharps = major[key[1]] + (key[2] === '#' ? 7 : key[2] === 'b' ? -7 : 0) + offset;
            this.setKeySignatureUI(sharps);
        }
    }

    /**
     * Set the key signature UI select to reflect a given key signature value.
     * @param {number|null} ks - Integer -6..6 (flats/sharps), or null/undefined for "Auto (from MIDI)"
     */
    setKeySignatureUI(ks) {
        const keyEl = document.getElementById('keySignature');
        if (!keyEl) return;

        if (ks === null || ks === undefined || isNaN(ks)) {
            keyEl.value = 'auto';
        } else {
            const clamped = String(Math.max(-6, Math.min(6, parseInt(ks, 10))));
            // Only set if a matching option exists, else fall back to auto
            const hasOption = Array.from(keyEl.options).some(opt => opt.value === clamped);
            keyEl.value = hasOption ? clamped : 'auto';
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreManager;
}
class ScoreManager {
    constructor (app) {
        this.app = app;
        this.abcString = '';
        this.midi2abcReady = false;
        this.midi2abc = null;
        this.abcjs = null;
        this.modulesLoaded = false;
        this.currentBarStart = 0; // Track current bar position for score following
        this.scoreFollowerActive = false;
    }

    async init() {
        // Load required modules first
        await this.loadModules();
    }

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
                    console.log(`Loaded: ${module.src}`);
                    
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
                        resolve();
                    }
                };
                
                document.head.appendChild(script);
            });
        });
    }

    initializeMidi2abc() {
        return new Promise((resolve, reject) => {
            if (!window.midi2abcModule) {
                reject(new Error('midi2abcModule not found'));
                return;
            }

            // Initialize output variable at class level
            this.abcOutput = "";

            // Instantiate midi2abc WASM module
            window.midi2abcModule({
                print: (text) => {
                    this.abcOutput += text + "\n";
                    console.log('WASM output:', text);
                },
                printErr: (text) => {
                    console.error('WASM error:', text);
                },
                onRuntimeInitialized: () => {
                    this.midi2abcReady = true;
                    console.log('midi2abc WASM module initialized');
                    resolve();
                }
            }).then((Module) => {
                this.midi2abc = Module;
                console.log('WASM Module loaded:', Module);
            }).catch((error) => {
                console.error('Failed to initialize WASM module:', error);
                reject(error);
            });
        });
    }

    generateABCStringfromMIDI(midiFile) {
        if (!this.midi2abcReady || !this.midi2abc || !this.midi2abc.FS) {
            console.error('midi2abc WASM module not ready');
            return '';
        }

        try {
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
            console.log('Written file size:', writtenData.length);
            
            // Call midi2abc conversion with -b flag to limit to 4 bars
            const result = this.midi2abc.callMain(['input.mid', '-sr', '4', '-bpl', '4']);

            // Get the output (this should be captured by the print function)
            let abcOutput = this.abcOutput;
            
            if (!abcOutput || abcOutput.trim().length === 0) {
                console.warn('No ABC output generated');
                return '';
            }
            
            // Clean up the output - remove everything before the first X:
            abcOutput = abcOutput.replace(/^[\s\S]*?(?=^X:)/m, '');
            // console.log('ABC output:', abcOutput);

            // Store the result
            this.abcString = abcOutput;
            return abcOutput;
            
        } catch (error) {
            console.error('Error generating ABC notation:', error);
            console.error('Error stack:', error.stack);
            return '';
        }
    }
    
    renderScore(containerId = 'score') {
        if (!this.abcjs || !this.abcString.trim()) {
            console.warn('No ABC data or abcjs library to render');
            return;
        }

        try {
            // Clear only the score content area, not the entire container
            const scoreElement = document.getElementById(containerId);
            if (!scoreElement) return;
            
            scoreElement.innerHTML = ''; // Clear previous score content
            
            // Set maximum height constraint
            const maxHeight = window.innerHeight - 150;
            scoreElement.style.maxHeight = `${maxHeight}px`;
            scoreElement.style.overflowY = 'auto';
            scoreElement.style.overflowX = 'hidden';
            
            // Render with options to ensure proper styling
            const renderOptions = {
                responsive: 'resize',
                staffwidth: 740,
                scale: 1.0,
                foregroundColor: '#000000', // Ensure black notes
                backgroundColor: 'transparent'
            };
            
            const visualOptions = {
                add_classes: true,
                staffwidth: 740,
                responsive: 'resize'
            };
            
            this.abcjs.renderAbc(containerId, this.abcString, renderOptions, visualOptions);
            
            // Scale the rendered content to fit height constraint
            setTimeout(() => {
                const scoreElement = document.getElementById(containerId);
                if (scoreElement) {
                    // Get the rendered SVG element
                    const svgElement = scoreElement.querySelector('svg');
                    if (svgElement) {
                        const naturalHeight = svgElement.getBoundingClientRect().height;

                        // Calculate scale factor if content exceeds max height
                        if (naturalHeight > maxHeight) {
                            const scaleFactor = maxHeight / naturalHeight;
                            
                            // Apply transform to scale down while preserving proportions
                            svgElement.style.transform = `scale(${scaleFactor})`;
                            svgElement.style.transformOrigin = 'top center';
                            
                            // Calculate the actual scaled height and adjust container
                            const scaledHeight = naturalHeight * scaleFactor;
                            scoreElement.style.height = `${scaledHeight}px`;
                            scoreElement.style.overflow = 'hidden';
                            scoreElement.style.paddingBottom = '10px';

                            console.log(`Scaled score by ${scaleFactor.toFixed(2)} to fit ${maxHeight}px height (actual: ${scaledHeight}px)`);

                        } else {
                            // If no scaling needed, set container height to natural height
                            scoreElement.style.height = `${naturalHeight}px`;
                            scoreElement.style.overflow = 'hidden';
                        }
                    }
                    
                    // Apply CSS to ensure notes are black
                    const style = document.createElement('style');
                    style.textContent = `
                        #${containerId} {
                            max-height: ${maxHeight}px;
                            overflow-y: hidden;
                            overflow-x: hidden;
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
                    `;
                    document.head.appendChild(style);
                }
            }, 100);
            
            console.log('ABC score rendered successfully');
        } catch (error) {
            console.error('Error rendering ABC score:', error);
        }
    }

        // Enhanced extractBarsFromVoice with proper directive handling
    extractBarsFromVoice(voiceLines, startBar, numBars) {
        let voiceHeader = '';
    let currentBar = 0;
    let collectedBars = [];
    let remainingBarsNeeded = numBars;

    console.log(`Extracting exactly ${numBars} bars starting from bar ${startBar}`);
    console.log(`Voice has ${voiceLines.length} lines`);

    // Check if voice contains bass clef notes (uppercase letters with commas)
    const hasBassNotes = voiceLines.some(line => {
        const trimmed = line.trim();
        return /[A-G],,+/.test(trimmed); // Match uppercase letters followed by two or more commas
    });

    for (let lineIndex = 0; lineIndex < voiceLines.length; lineIndex++) {
        const line = voiceLines[lineIndex];
        const trimmedLine = line.trim();
        
        console.log(`Processing line ${lineIndex}: "${trimmedLine}"`);
        
        if (trimmedLine.startsWith('V:')) {
            voiceHeader = line;
            
            // Add clef=bass if voice contains bass notes and doesn't already have a clef specified
            if (hasBassNotes && !voiceHeader.includes('clef=')) {
                voiceHeader = voiceHeader.trim() + ' clef=bass';
            }
            
            console.log(`Found voice header: ${voiceHeader}`);
            continue;
        }

            if (trimmedLine.length === 0) continue;

            // Skip ABC directives (they don't count as bars)
            if (trimmedLine.startsWith('%%') || trimmedLine.startsWith('%')) {
                console.log(`Skipping directive: ${trimmedLine}`);
                // Always include directives in the output if we're extracting from bar 0
                if (startBar === 0 && remainingBarsNeeded === numBars) {
                    collectedBars.push(line);
                }
                continue;
            }

            // Split line into individual bars by pipe symbols
            const barSections = trimmedLine.split('|').filter(section => section.trim().length > 0);
            const lineHasBars = barSections.length > 0;
            
            console.log(`Line has ${barSections.length} bar sections:`, barSections);
            
            if (!lineHasBars) {
                // No bars in this line, treat as one unit
                console.log(`No bars detected, treating as single unit at bar ${currentBar}`);
                if (currentBar >= startBar && currentBar < startBar + numBars && remainingBarsNeeded > 0) {
                    collectedBars.push(line);
                    remainingBarsNeeded--;
                    console.log(`Collected non-bar line, remaining needed: ${remainingBarsNeeded}`);
                }
                currentBar++;
                continue;
            }

            // Process each bar in this line
            let lineResult = [];
            let barsAddedFromThisLine = 0;
            
            for (let i = 0; i < barSections.length && remainingBarsNeeded > 0; i++) {
                const barSection = barSections[i];
                
                console.log(`Checking bar ${currentBar} (section ${i}): "${barSection}"`);
                console.log(`Target range: ${startBar} to ${startBar + numBars - 1}`);
                
                // Check if this bar is in our target range
                if (currentBar >= startBar && currentBar < startBar + numBars) {
                    lineResult.push(barSection);
                    barsAddedFromThisLine++;
                    remainingBarsNeeded--;
                    console.log(`✓ Added bar ${currentBar}, remaining needed: ${remainingBarsNeeded}`);
                } else {
                    console.log(`✗ Skipped bar ${currentBar} (outside range)`);
                }
                currentBar++;
            }
            
            // If we collected any bars from this line, add them
            if (lineResult.length > 0) {
                // Reconstruct the line with only the bars we need
                const reconstructedLine = lineResult.join('|');
                collectedBars.push(reconstructedLine + '|');
                console.log(`Collected ${barsAddedFromThisLine} bars from line, remaining needed: ${remainingBarsNeeded}`);
            }
            
            // Stop if we have enough bars
            if (remainingBarsNeeded <= 0) {
                console.log(`Got all needed bars, stopping extraction`);
                break;
            }
        }

        console.log(`Collected ${collectedBars.length} lines for exactly ${numBars} bars ${startBar}-${startBar + numBars - 1}`);
        console.log(`Collected bars:`, collectedBars);

        // Combine all collected bars into a single line to avoid staff breaks
        let combinedBars = '';
        if (collectedBars.length > 0) {
            // Separate directives from musical content
            const directives = collectedBars.filter(bar => bar.trim().startsWith('%%') || bar.trim().startsWith('%'));
            const musicalBars = collectedBars.filter(bar => !bar.trim().startsWith('%%') && !bar.trim().startsWith('%'));
            
            // Join musical bars into one continuous line
            const combinedMusical = musicalBars.join(' ').replace(/\|\s*\|/g, '|');
            
            // If we have musical content, use it; otherwise use directives
            if (combinedMusical.trim()) {
                combinedBars = combinedMusical;
                // Ensure it ends with a single pipe
                if (!combinedBars.endsWith('|')) {
                    combinedBars += '|';
                }
            } else if (directives.length > 0) {
                combinedBars = directives.join('\n');
            }
        }

        console.log(`Final combined bars: "${combinedBars}"`);

        return {
            voiceHeader,
            bars: combinedBars ? [combinedBars] : [] // Return as single line array
        };
    }

    extractBarsFromABC(abcString, startBar = 0, numBars = 4) {
    if (!abcString || !abcString.trim()) {
        console.warn('Empty ABC string provided to extractBarsFromABC');
        return '';
    }

    console.log(`Extracting exactly ${numBars} bars ${startBar} to ${startBar + numBars - 1}`);
    
    const lines = abcString.split('\n');
    const result = [];
    let inMusicSection = false;
    let voiceLines = {};
    let headerLines = [];

    // First pass: collect headers and identify voices
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (trimmedLine.length === 0) continue;
        
        // Header lines (before music starts)
        if (trimmedLine.startsWith('X:') || trimmedLine.startsWith('T:') || 
            trimmedLine.startsWith('M:') || trimmedLine.startsWith('L:') || 
            trimmedLine.startsWith('K:')) {
            headerLines.push(line);
            continue;
        }

        // Skip Q: (tempo) lines completely
        if (trimmedLine.startsWith('Q:')) {
            continue;
        }

        // Voice definition or music line
        if (trimmedLine.startsWith('V:') || (inMusicSection && trimmedLine.length > 0)) {
            inMusicSection = true;
            
            // Handle voice lines
            if (trimmedLine.startsWith('V:')) {
                const voiceMatch = trimmedLine.match(/V:\s*([^\s]+)/);
                const voiceId = voiceMatch ? voiceMatch[1] : 'default';
                if (!voiceLines[voiceId]) {
                    voiceLines[voiceId] = [];
                }
                voiceLines[voiceId].push(line);
            } else if (trimmedLine.length > 0) {
                // Find the current voice (last voice declared)
                const voiceIds = Object.keys(voiceLines);
                const currentVoice = voiceIds[voiceIds.length - 1] || 'default';
                if (!voiceLines[currentVoice]) {
                    voiceLines[currentVoice] = [];
                }
                voiceLines[currentVoice].push(line);
            }
        }
    }

    // If no voices found, treat everything as one voice
    if (Object.keys(voiceLines).length === 0) {
        console.log('No voices found, treating as single voice');
        voiceLines['default'] = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length > 0 && 
                !trimmedLine.startsWith('X:') && !trimmedLine.startsWith('T:') && 
                !trimmedLine.startsWith('M:') && !trimmedLine.startsWith('L:') && 
                !trimmedLine.startsWith('K:') && !trimmedLine.startsWith('Q:')) {
                voiceLines['default'].push(line);
            }
        }
    }

    console.log('Found voices:', Object.keys(voiceLines));

    // Helper function to check if a voice has actual musical content
    const hasMusicalContent = (voiceContent) => {
        console.log(`Checking voice with ${voiceContent.length} lines:`, voiceContent);
        
        // Check each line directly without joining/splitting
        for (const line of voiceContent) {
            const trimmed = line.trim();
            
            // Skip voice headers and directives
            if (trimmed.startsWith('V:') || trimmed.startsWith('%%') || trimmed.startsWith('%') || trimmed.length === 0) {
                continue;
            }
            
            console.log(`Checking line: "${trimmed}"`);
            
            // Check if line contains actual notes (A-G)
            const hasNotes = /[A-Ga-g]/.test(trimmed);
            console.log(`Line "${trimmed}" - Has notes: ${hasNotes}`);
            
            // If we find any line with actual notes, this voice has musical content
            if (hasNotes) {
                console.log(`Found musical content in line: "${trimmed}"`);
                return true;
            }
        }
        
        console.log('No musical content found in voice - only rests or empty lines');
        return false;
    };

    // Second pass: extract exactly numBars for each voice that has musical content
    const extractedVoices = {};
    
    for (const [voiceId, voiceContent] of Object.entries(voiceLines)) {
        // Check if voice has actual musical content
        if (!hasMusicalContent(voiceContent)) {
            console.log(`Skipping voice ${voiceId} - no musical content or only rests`);
            continue;
        }
        
        console.log(`Processing voice ${voiceId} - has musical content`);
        extractedVoices[voiceId] = this.extractBarsFromVoice(voiceContent, startBar, numBars);
        
        // Double-check that the extracted content actually has notes
        const extractedContent = extractedVoices[voiceId];
        if (extractedContent.bars.length === 0 || 
            extractedContent.bars.every(bar => /^[zZ0-9\s|]*$/.test(bar))) {
            console.log(`Removing voice ${voiceId} - extracted content has no notes: "${extractedContent.bars.join(' ')}"`);
            delete extractedVoices[voiceId];
        }
    }

    // Only proceed if we have voices with content
    if (Object.keys(extractedVoices).length === 0) {
        console.warn('No voices with musical content found for the requested bars');
        return '';
    }

    // Reconstruct ABC with headers and extracted bars from active voices only
    result.push(...headerLines);
    
    for (const [voiceId, extractedContent] of Object.entries(extractedVoices)) {
        if (extractedContent.voiceHeader) {
            result.push(extractedContent.voiceHeader);
        }
        result.push(...extractedContent.bars);
    }

    const finalResult = result.join('\n');
    console.log(`Final extracted ABC for ${numBars} bars with ${Object.keys(extractedVoices).length} active voices, length:`, finalResult.length);
    
    if (!finalResult || !finalResult.trim()) {
        console.warn(`Failed to extract bars ${startBar}-${startBar + numBars - 1}, returning empty`);
        return '';
    }
    
    return finalResult;
}

    // Add debugging to generateScoreFollower
    generateScoreFollower(startBar = 0) {
        if (!this.abcString || !this.abcString.trim()) {
            console.warn('No ABC data available for score following');
            return '';
        }

        console.log(`=== generateScoreFollower called with startBar=${startBar} ===`);
        console.log('Full ABC string length:', this.abcString.length);
        console.log('First 200 chars of ABC:', this.abcString.substring(0, 200));
        
        // Always try to extract exactly 4 bars, no fallback to full score
        const followingABC = this.extractBarsFromABC(this.abcString, startBar, 4);
        
        console.log('Extraction result length:', followingABC.length);
        console.log('Extraction result:', followingABC);
        
        if (!followingABC || !followingABC.trim()) {
            console.warn(`Bar extraction returned empty result for bars ${startBar}-${startBar + 3}`);
            return '';
        }
        
        console.log('Extracted ABC length:', followingABC.length);
        return followingABC;
    }

    // Fix initial rendering issue
    renderScoreFollower(containerId = 'score', startBar = 0) {
        console.log(`Rendering score follower: bars ${startBar}-${startBar + 3}`);
        
        const followingABC = this.generateScoreFollower(startBar);
        
        if (!followingABC || !followingABC.trim()) {
            console.warn(`No ABC data to render for bars ${startBar}-${startBar + 3}`);
            const scoreElement = document.getElementById(containerId);
            if (scoreElement) {
                scoreElement.innerHTML = `<p>No score data available for bars ${startBar}-${startBar + 3}</p>`;
            }
            return;
        }

        // Temporarily store original ABC and use following ABC
        const originalABC = this.abcString;
        this.abcString = followingABC;
        
        // Render the score follower
        this.renderScore(containerId);
        
        // Restore original ABC
        this.abcString = originalABC;
        
        console.log('Score follower rendered successfully');
    }

    // Enhanced reset method with better fallback
    resetScoreFollower(containerId = 'score') {
        console.log('Resetting score follower to beginning');
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
                    const abcNotation = this.generateABCStringfromMIDI(currentMidi);
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
            }
        }
        
        this.renderScoreFollower(containerId, this.currentBarStart);
        
        // Update display
        const display = document.getElementById('currentBarDisplay');
        if (display) {
            display.textContent = this.currentBarStart;
        }
    }

    // Modified showMidiScore to support score following mode
    showMidiScore(useScoreFollowing = false) {
        const scoreContainer = document.getElementById('scoreContainer');
        const scoreDiv = document.getElementById('score');
        
        if (!scoreContainer || !scoreDiv || !this.app.modules.transport.originalMidi) {
            console.error('no file loaded or core container elements not found');
            return;
        }
        
        // Clear only the score content area, not the header
        scoreDiv.innerHTML = '<p>Generating score...</p>';
        
        // Show the container
        scoreContainer.style.display = 'block';
        document.getElementById("showScore").style.display = 'none';
        
        // Generate ABC notation first
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

            const abcNotation = this.generateABCStringfromMIDI(currentMidi);
            if (!abcNotation) {
                scoreDiv.innerHTML = '<p><em>Could not generate score from current MIDI file.</em></p>';
                return;
            }

            // Use score following or regular rendering
            if (useScoreFollowing) {
                console.log('Starting score follower mode');
                this.startScoreFollowing('score');
                
                // Also add a manual control for testing
                this.addScoreFollowerControls(scoreContainer);
            } else {
                this.renderScore('score');
            }
            
        } catch (error) {
            console.error('Error generating score:', error);
            scoreDiv.innerHTML = '<p><em>Error generating score. Please check console for details.</em></p>';
        }
    }

    // Add manual controls for score follower (for testing/debugging)
    addScoreFollowerControls(container) {
        // Check if controls already exist
        if (container.querySelector('.score-follower-controls')) {
            return;
        }
        
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'score-follower-controls';
        controlsDiv.style.cssText = 'margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px;';
        
        controlsDiv.innerHTML = `
            <small style="color: #ccc;">Score Follower Controls:</small><br>
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.resetScoreFollower('score')">Reset</button>
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.advanceScoreFollower('score', 4)">Next 4 Bars</button>
            <button class="btn btn-sm btn-outline-light" onclick="app.modules.scoreManager.advanceScoreFollower('score', -4)">Prev 4 Bars</button>
            <span style="margin-left: 10px; color: #ccc;">Current Bar: <span id="currentBarDisplay">${this.currentBarStart}</span></span>
        `;
        // controlsDiv.style.maxWidth = '870px';

        // Insert after the header
        const header = container.querySelector('.score-header');
        if (header && header.nextSibling) {
            container.insertBefore(controlsDiv, header.nextSibling);
        } else {
            container.appendChild(controlsDiv);
        }
    }

    // Enhanced score following with playback integration
    startScoreFollowing(containerId = 'score') {
        console.log('Starting score following...');
        this.scoreFollowerActive = true;
        this.currentBarStart = 0;
        
        // Initial render
        this.renderScoreFollower(containerId, this.currentBarStart);
        
        // Don't start polling immediately - wait for playback to start
        console.log('Score follower ready - will start polling when playback begins');
    }



    // Centralized update logic
    updateScoreFollower(containerId, barNumber) {
        // Update current bar display
        const display = document.getElementById('currentBarDisplay');
        if (display) {
            display.textContent = `${this.currentBarStart} (playing: ${barNumber})`;
        }
        
        // Update every 4 bars or if we're past the current window
        if (barNumber >= this.currentBarStart + 4) {
            this.currentBarStart = Math.floor(barNumber / 4) * 4; // Align to 4-bar boundaries
            console.log('Updating score follower to bar:', this.currentBarStart);
            this.renderScoreFollower(containerId, this.currentBarStart);
        }
    }

    // Method to start polling when playback starts
    startPollingForPlayback(containerId) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        if (!this.scoreFollowerActive) {
            return;
        }
        
        console.log('Starting score following polling for playback...');
        
        this.pollingInterval = setInterval(() => {
            const transport = this.app.modules.transport;
            
            // Only poll if transport is actually playing
            if (!transport || !transport.playing) {
                return;
            }
            
            let currentBar = null;
            
            // Try different methods to get current bar position
            if (transport.getCurrentBar) {
                currentBar = transport.getCurrentBar();
            } else if (window.Tone && window.Tone.Transport) {
                // Direct Tone.js integration
                const position = window.Tone.Transport.position;
                const bars = window.Tone.Time(position).toBarsBeatsSixteenths().split(':')[0];
                currentBar = parseInt(bars);
            }
            
            if (currentBar !== null && currentBar !== this.lastPolledBar) {
                console.log('Polling detected bar change during playback:', currentBar);
                this.lastPolledBar = currentBar;
                this.updateScoreFollower(containerId, currentBar);
            }
        }, 250); // Check every 250ms during playback
    }

    // Method to stop polling when playback stops
    stopPollingForPlayback() {
        if (this.pollingInterval) {
            console.log('Stopping score following polling (playback stopped)');
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // Enhanced stop method
    stopScoreFollowing() {
        console.log('Stopping score following...');
        this.scoreFollowerActive = false;
        this.lastPolledBar = null;
        
        // Stop polling
        this.stopPollingForPlayback();
        
        // Remove controls
        const controls = document.querySelector('.score-follower-controls');
        if (controls) {
            controls.remove();
        }
    }

    // Enhanced advance method with better display updates
    advanceScoreFollower(containerId = 'score', bars = 4) {
        const newStart = Math.max(0, this.currentBarStart + bars);
        
        // Basic bounds checking - don't go beyond reasonable limits
        if (newStart >= 0) {
            this.currentBarStart = newStart;
            console.log(`Manually advancing to bar ${this.currentBarStart}`);
            this.renderScoreFollower(containerId, this.currentBarStart);
            
            // Update display
            const display = document.getElementById('currentBarDisplay');
            if (display) {
                display.textContent = this.currentBarStart;
            }
        }
    }

    // Enhanced hide method to clean up score following
    hideScore() {
        this.stopScoreFollowing();
        
        const scoreContainer = document.getElementById('scoreContainer');
        if (scoreContainer) {
            scoreContainer.style.display = 'none';
            document.getElementById("showScore").style.display = 'block';
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NegativeHarmonyApp;
}
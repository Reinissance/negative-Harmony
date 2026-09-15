// Run with: node --test tests/score-fullscreen.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ScoreManager = require('../src/score-manager.js');

class MockElement {
    constructor(id, tagName = 'div') {
        this.id = id;
        this.tagName = tagName;
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.classList = {
            _classes: new Set(),
            add(c) { this._classes.add(c); },
            remove(c) { this._classes.delete(c); },
            contains(c) { return this._classes.has(c); }
        };
        this.textContent = '';
        this.value = '';
    }

    querySelector(sel) {
        return null;
    }

    querySelectorAll(sel) {
        return [];
    }

    appendChild(child) {
        if (child.parentNode) {
            child.parentNode.removeChild(child);
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    insertBefore(newNode, referenceNode) {
        if (newNode.parentNode) {
            newNode.parentNode.removeChild(newNode);
        }
        newNode.parentNode = this;
        const index = referenceNode ? this.children.indexOf(referenceNode) : -1;
        if (index === -1) {
            this.children.push(newNode);
        } else {
            this.children.splice(index, 0, newNode);
        }
        return newNode;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parentNode = null;
        }
        return child;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }
}

function setupMockDOM() {
    const elements = {};

    function register(id, tag = 'div') {
        const el = new MockElement(id, tag);
        elements[id] = el;
        return el;
    }

    const body = new MockElement('body', 'body');
    const mainWidget = register('mainWidget');
    const playMidi = register('playMidi', 'button');
    const progressInput = register('progress-input', 'input');
    elements.progressInput = progressInput;
    const showScore = register('showScore', 'button');
    mainWidget.appendChild(playMidi);
    mainWidget.appendChild(showScore);
    mainWidget.appendChild(progressInput);

    const accordion = register('accordion');
    const speedLabel = register('speedControlLabel', 'label');
    elements.speedControlLabel = speedLabel;
    const speedControl = register('speedControl', 'input');
    const reverseMidi = register('reverseMidi', 'input');
    const reverseLabel = register('reverseMidiLabel', 'label');
    elements.reverseMidiLabel = reverseLabel;
    accordion.appendChild(speedLabel);
    accordion.appendChild(speedControl);
    accordion.appendChild(reverseMidi);
    accordion.appendChild(reverseLabel);

    const scoreContainer = register('scoreContainer');
    const scoreFullscreenOverlay = register('scoreFullscreenOverlay');
    const fsPlaySlot = register('fsPlaySlot');
    const fsReverseSlot = register('fsReverseSlot');
    const fsSpeedSlot = register('fsSpeedSlot');
    const fsProgressSlot = register('fsProgressSlot');
    const fullscreenScoreBtn = register('fullscreenScoreBtn', 'button');
    const exitFullscreenBtn = register('exitFullscreenBtn', 'button');
    const score = register('score');

    scoreFullscreenOverlay.appendChild(fsPlaySlot);
    scoreFullscreenOverlay.appendChild(fsReverseSlot);
    scoreFullscreenOverlay.appendChild(fsSpeedSlot);
    scoreFullscreenOverlay.appendChild(fsProgressSlot);
    scoreFullscreenOverlay.appendChild(exitFullscreenBtn);

    scoreContainer.appendChild(scoreFullscreenOverlay);
    scoreContainer.appendChild(fullscreenScoreBtn);
    scoreContainer.appendChild(score);

    body.appendChild(mainWidget);
    body.appendChild(accordion);
    body.appendChild(scoreContainer);

    global.document = {
        body,
        head: { appendChild: () => {} },
        getElementById: (id) => elements[id] || null,
        querySelector: (selector) => {
            if (selector === 'label[for="reverseMidi"]') return elements.reverseMidiLabel;
            if (selector === 'label[for="speedControl"]') return elements.speedControlLabel;
            return null;
        },
        querySelectorAll: () => [],
        createElement: (tag) => {
            const el = new MockElement('', tag);
            let _id = '';
            Object.defineProperty(el, 'id', {
                get() { return _id; },
                set(v) {
                    _id = v;
                    if (v) elements[v] = el;
                }
            });
            return el;
        },
        fullscreenElement: null,
        exitFullscreen: async () => { global.document.fullscreenElement = null; },
        addEventListener: () => {}
    };

    global.window = {
        addEventListener: () => {},
        innerHeight: 800,
        innerWidth: 1200
    };

    return elements;
}

test('ScoreManager fullscreen enter, exit, and restore behavior', async () => {
    const elements = setupMockDOM();
    const app = {
        state: {},
        modules: {
            transport: {
                playing: false,
                originalMidi: {}
            }
        }
    };

    const scoreManager = new ScoreManager(app);
    app.modules.scoreManager = scoreManager;
    scoreManager.abcjs = { renderAbc: () => {} };
    scoreManager.abcString = 'X:1\nM:4/4\nK:C\nCDEF|';
    scoreManager.scoreShown = true;

    // Verify initial positions
    assert.equal(elements.playMidi.parentNode, elements.mainWidget);
    assert.equal(elements.progressInput.parentNode, elements.mainWidget);
    assert.equal(elements.speedControl.parentNode, elements.accordion);
    assert.equal(elements.reverseMidi.parentNode, elements.accordion);
    assert.equal(scoreManager.isFullscreen, false);

    // Enter fullscreen
    scoreManager.enterFullscreen();

    assert.equal(scoreManager.isFullscreen, true);
    assert.equal(elements.scoreContainer.classList.contains('score-fullscreen'), true);
    assert.equal(elements.scoreFullscreenOverlay.style.display, 'flex');
    assert.equal(elements.playMidi.parentNode, elements.fsPlaySlot);
    assert.equal(elements.reverseMidi.parentNode, elements.fsReverseSlot);
    assert.equal(elements.reverseMidiLabel.parentNode, elements.fsReverseSlot);
    assert.equal(elements.speedControl.parentNode, elements.fsSpeedSlot);
    assert.equal(elements.speedControlLabel.parentNode, elements.fsSpeedSlot);
    assert.equal(elements.progressInput.parentNode, elements.fsProgressSlot);
    assert.equal(elements.progressInput.style.display, 'block');

    // Exit fullscreen
    scoreManager.exitFullscreen();

    assert.equal(scoreManager.isFullscreen, false);
    assert.equal(elements.scoreContainer.classList.contains('score-fullscreen'), false);
    assert.equal(elements.scoreFullscreenOverlay.style.display, 'none');

    // Verify all controls restored to their original parent nodes
    assert.equal(elements.playMidi.parentNode, elements.mainWidget);
    assert.equal(elements.progressInput.parentNode, elements.mainWidget);
    assert.equal(elements.speedControl.parentNode, elements.accordion);
    assert.equal(elements.speedControlLabel.parentNode, elements.accordion);
    assert.equal(elements.reverseMidi.parentNode, elements.accordion);
    assert.equal(elements.reverseMidiLabel.parentNode, elements.accordion);
});

test('ScoreManager toggleFullscreen toggles state and button label', async () => {
    const elements = setupMockDOM();
    const app = {
        state: {},
        modules: {
            transport: {
                playing: false,
                originalMidi: {}
            }
        }
    };

    const scoreManager = new ScoreManager(app);
    app.modules.scoreManager = scoreManager;
    scoreManager.abcjs = { renderAbc: () => {} };
    scoreManager.abcString = 'X:1\nM:4/4\nK:C\nCDEF|';
    scoreManager.scoreShown = true;

    assert.equal(scoreManager.isFullscreen, false);
    scoreManager.toggleFullscreen();
    assert.equal(scoreManager.isFullscreen, true);
    assert.equal(elements.fullscreenScoreBtn.textContent, '⛶ Exit Fullscreen');

    scoreManager.toggleFullscreen();
    assert.equal(scoreManager.isFullscreen, false);
    assert.equal(elements.fullscreenScoreBtn.textContent, '⛶ Fullscreen');
});

test('ScoreManager escape key exits fullscreen mode', async () => {
    let keyHandler = null;
    const elements = setupMockDOM();
    global.window.addEventListener = (evt, handler) => {
        if (evt === 'keydown') keyHandler = handler;
    };

    const app = {
        state: {},
        modules: {
            transport: {
                playing: false,
                originalMidi: {}
            }
        }
    };

    const scoreManager = new ScoreManager(app);
    app.modules.scoreManager = scoreManager;
    scoreManager.setupFullscreenListeners();
    scoreManager.abcjs = { renderAbc: () => {} };
    scoreManager.abcString = 'X:1\nM:4/4\nK:C\nCDEF|';
    scoreManager.scoreShown = true;

    scoreManager.enterFullscreen();
    assert.equal(scoreManager.isFullscreen, true);

    assert.ok(typeof keyHandler === 'function');
    keyHandler({ key: 'Escape' });
    assert.equal(scoreManager.isFullscreen, false);
});


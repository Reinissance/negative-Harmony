// Run with: node --test tests/score-settings.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ScoreManager = require('../src/score-manager.js');
const factory = require('../src/midi2abc/midi2abc.js');

function variableLength(value) {
    const bytes = [value & 127];
    while ((value >>= 7)) bytes.unshift((value & 127) | 128);
    return bytes;
}

function midiFixture(meter, key, startOffset = 0, duration = 480) {
    const events = [];
    if (meter) events.push(0, 0xff, 0x58, 4, meter[0], Math.log2(meter[1]), 24, 8);
    if (key !== null) events.push(0, 0xff, 0x59, 2, key & 255, 0);
    let first = true;
    for (const pitch of [60, 62, 64, 65, 67, 69, 71, 72]) {
        events.push(...variableLength(first ? startOffset : 480 - duration),
            0x90, pitch, 80, ...variableLength(duration), 0x80, pitch, 0);
        first = false;
    }
    events.push(0, 0xff, 0x2f, 0);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(events.length);
    const bytes = Buffer.concat([
        Buffer.from('MThd'), Buffer.from([0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0]),
        Buffer.from('MTrk'), length, Buffer.from(events)
    ]);
    return { toArray: () => bytes, tracks: [] };
}

function select(values) {
    return {
        value: '', options: values.map(value => ({ value: String(value) })),
        appendChild(option) { this.options.push(option); }
    };
}

test('score conversion respects overrides, resets WASM state, and synchronizes controls', async () => {
    const elements = {
        timeSigNum: select(Array.from({ length: 16 }, (_, i) => i + 1)),
        timeSigDen: select([2, 4, 8, 16]),
        keySignature: select(['auto', -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]),
        showScore: { style: {} },
        quantizeMidi: select(['off', 4, 8, 16]),
        score: { style: {}, innerHTML: '', querySelector: () => null }
    };
    global.document = {
        getElementById: id => elements[id],
        createElement: () => ({}),
        head: { appendChild() {} }
    };
    let beats = 4;
    const transport = {};
    Object.defineProperty(transport, 'timeSignature', {
        get: () => beats,
        set: ts => { beats = Array.isArray(ts) ? ts[0] * 4 / ts[1] : ts; }
    });
    global.window = { midi2abcModule: factory, Tone: { Transport: transport }, innerHeight: 800 };
    const app = { state: {}, modules: {} };
    const score = new ScoreManager(app);
    app.modules.scoreManager = score;
    score.midi2abcReady = true;
    score.midi2abcBinary = fs.readFileSync(path.join(__dirname, '../src/midi2abc/midi2abc.wasm'));
    score.showAbcErrorNotification = message => assert.fail(message);

    for (const [meter, sharps, keyName] of [
        [[6, 8], 1, 'G'], [[3, 4], -1, 'F'], [[12, 8], 0, 'C'], [[4, 4], 2, 'D']
    ]) {
        const abc = await score.generateABCStringfromMIDI(midiFixture([2, 4], -3), meter, sharps);
        assert.match(abc, new RegExp(`^M:\\s*${meter.join('/')}$`, 'm'));
        assert.match(abc, new RegExp(`^K:\\s*${keyName}\\s`, 'm'));
        assert.equal(elements.timeSigNum.value, String(meter[0]));
        assert.equal(elements.timeSigDen.value, String(meter[1]));
        assert.equal(elements.keySignature.value, String(sharps));
    }

    // Automatic conversion must not inherit the last explicit meter or key.
    let abc = await score.generateABCStringfromMIDI(midiFixture([6, 8], -1));
    assert.match(abc, /^M:\s*6\/8$/m);
    // The notes are C major, even though the input MIDI claims F major.
    assert.match(abc, /^K:C\s/m);
    assert.equal(score.getActiveTimeSignature(), null);
    assert.equal(score.getActiveKeySignature(), null);
    assert.equal(elements.keySignature.value, '0');
    assert.equal(beats, 3); // Tone loses the denominator; the notation must not.

    let rendered;
    score.abcjs = { renderAbc: (_id, value) => { rendered = value; } };
    score.renderScore();
    assert.match(rendered, /^M:\s*6\/8$/m);
    score.renderScoreFollower('score', 0);
    assert.match(rendered, /^M:\s*6\/8$/m);

    abc = await score.generateABCStringfromMIDI(midiFixture(null, null));
    assert.match(abc, /^M:\s*4\/4$/m);
    assert.match(abc, /^K:C\s/m);

    score.abcString = '';
    app.modules.transport = {
        originalMidi: midiFixture([6, 8], 0),
        createCurrentMidi: () => midiFixture([6, 8], 0)
    };
    await score.showMidiScore(false);
    assert.equal(elements.timeSigNum.value, '6');
    assert.equal(elements.timeSigDen.value, '8');
    assert.match(rendered, /^M:\s*6\/8$/m);

    // Short gaps must not be swallowed independently of the quantize switch.
    const humanized = await score.generateABCStringfromMIDI(midiFixture([4, 4], 0, 50, 380));
    const snapped = await score.generateABCStringfromMIDI(midiFixture([4, 4], 0));
    assert.notEqual(humanized, snapped);
    assert.match(humanized, /z/);

    elements.quantizeMidi.value = '8';
    await score.setShortRestQuantization('8');
    assert.equal(app.state.abcShortRest, 8);
    const quantizedWithShortRest = await score.generateABCStringfromMIDI(midiFixture([4, 4], 0, 50, 380));
    assert.notEqual(quantizedWithShortRest, humanized);

    elements.quantizeMidi.value = 'off';
    await score.setShortRestQuantization('off');
    assert.equal(app.state.abcShortRest, null);

    score.abcString = 'X:1\nM:4/4\nL:1/4\nK:C\nCDEF|';
    score.scoreFollowerActive = true;
    let followerRenders = 0;
    score.renderScoreFollower = (_container, startBar) => {
        followerRenders++;
        assert.equal(startBar, score.currentBarStart);
    };
    score.doubleNoteLength();
    assert.match(score.abcString, /^L:1\/8$/m);
    assert.equal(app.state.abcUnitLength, 8);
    const regeneratedAfterDoubleTime = await score.generateABCStringfromMIDI(midiFixture([4, 4], 0));
    assert.match(regeneratedAfterDoubleTime, /^L:1\/8$/m);
    score.halveNoteLength();
    assert.match(score.abcString, /^L:1\/4$/m);
    assert.equal(app.state.abcUnitLength, 4);
    assert.match(score.abcString, /^M:\s*4\/4$/m);
    assert.match(score.abcString, /^K:C\b/m);
    assert.equal(followerRenders, 2);

    // UI actions write explicit overrides; reflecting detected values does not.
    let reloads = 0;
    score.reloadScore = async () => { reloads++; };
    elements.timeSigNum.value = '6';
    elements.timeSigDen.value = '8';
    await score.onTimeSignatureSelectChange();
    assert.deepEqual(score.getActiveTimeSignature(), [6, 8]);
    assert.deepEqual(app.state.timeSignature, [6, 8]);
    assert.equal(reloads, 1);
    elements.keySignature.value = '0';
    await score.onKeySignatureSelectChange();
    assert.equal(score.getActiveKeySignature(), 0);
    elements.keySignature.value = 'auto';
    await score.onKeySignatureSelectChange();
    assert.equal(score.getActiveKeySignature(), null);
});

test('shared URL restores time signature and ABC unit length together', async () => {
    global.Utils = { debounce: fn => fn };
    const SettingsManager = require('../src/settings-manager.js');
    const state = { userSettings: { channels: {} } };
    let generatedWith;
    const scoreManager = {
        scoreFollowerActive: true,
        currentBarStart: 4,
        setTimeSignatureUI() {},
        getActiveTimeSignature: () => state.timeSignature,
        getActiveKeySignature: () => null,
        generateABCStringfromMIDI: async (_midi, timeSignature) => {
            generatedWith = { timeSignature, unitLength: state.abcUnitLength };
            return `X:1\nM:${timeSignature[0]}/${timeSignature[1]}\nL:1/${state.abcUnitLength}\nK:C\nC|`;
        },
        renderScoreFollower() {}
    };
    const app = {
        state,
        modules: {
            scoreManager,
            transport: { createCurrentMidi: () => ({}) }
        }
    };
    const manager = new SettingsManager(app);
    app.modules.settingsManager = manager;

    await manager.applyScoreSettings(new URLSearchParams({
        timeSignature: JSON.stringify([6, 8]),
        abcUnitLength: '16'
    }));

    assert.deepEqual(state.timeSignature, [6, 8]);
    assert.equal(state.abcUnitLength, 16);
    assert.deepEqual(generatedWith, { timeSignature: [6, 8], unitLength: 16 });
    assert.match(scoreManager.abcString, /^M:6\/8$/m);
    assert.match(scoreManager.abcString, /^L:1\/16$/m);
});
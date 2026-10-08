const {test} = require('node:test');
const assert = require('node:assert/strict');
const Transport = require('../src/transport.js');
const ScoreManager = require('../src/score-manager.js');
test('manual shifts retain initial header state and rebuild the tempo-time cache', () => {
    let updates = 0;
    const midi = {
        tracks: [{notes:[{ticks:480,durationTicks:480}]}],
        header:{
            tempos:[{ticks:0,bpm:90},{ticks:1920,bpm:120}],
            timeSignatures:[{ticks:0},{ticks:1920}],
            keySignatures:[{ticks:0},{ticks:1920}],
            update(){ updates++; }
        }
    };
    Transport.prototype.applyManualShiftToMidi.call({}, midi, 240);
    assert.equal(midi.tracks[0].notes[0].ticks, 720);
    for (const fields of ['tempos','timeSignatures','keySignatures']) {
        assert.equal(midi.header[fields][0].ticks, 0);
        assert.equal(midi.header[fields][1].ticks, 2160);
    }
    Transport.prototype.applyManualShiftToMidi.call({}, midi, -240);
    assert.equal(midi.tracks[0].notes[0].ticks, 480);
    assert.equal(midi.header.tempos[1].ticks, 1920);
    assert.equal(updates, 2);
});
test('General MIDI fallback covers all 128 zero-based programs', () => {
    assert.equal(ScoreManager.gmNames.length, 128);
    assert.equal(ScoreManager.gmNames[0], 'Acoustic Grand Piano');
    assert.equal(ScoreManager.gmNames[40], 'Violin');
    assert.equal(ScoreManager.gmNames[73], 'Flute');
    assert.equal(ScoreManager.gmNames[127], 'Gunshot');
});

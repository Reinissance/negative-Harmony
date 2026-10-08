const { test } = require('node:test');
const assert = require('node:assert/strict');
const ScoreManager = require('../src/score-manager.js');
const Transport = require('../src/transport.js');

function setup(speed, reversedPlayback, playing) {
    global.Tone = { Transport: { seconds: 0 } };
    global.window = { Tone };
    const app = { state: { speed, reversedPlayback }, track_duration: 100, modules: {} };
    const transport = app.modules.transport = new Transport(app);
    transport.playing = playing;
    transport.progressSlider = { value: 0 };
    const score = app.modules.scoreManager = new ScoreManager(app);
    score.scoreShown = true;
    score.virtualScore = { follow(ms) { this.ms = ms; }, timeAtPixel: () => 25000 };
    global.document = { getElementById: () => ({scrollLeft:0,clientWidth:400}) };
    return { score, transport };
}

test('slider seeks map to forward score time in normal and reverse mode, paused or playing', () => {
    for (const speed of [.5, 1, 2]) for (const reversed of [false, true]) for (const playing of [false, true]) {
        const { score, transport } = setup(speed, reversed, playing);
        for (const percent of [0, 25, 75, 100]) {
            score._manualScrollUntil = Date.now() + 10000;
            transport.seekToPiecePosition(100 / speed * percent / 100);
            const elapsed = reversed ? 100 - percent : percent;
            assert.equal(score.virtualScore.ms, elapsed * 1000);
            assert.equal(Tone.Transport.seconds, elapsed / speed);
            assert.equal(Number(transport.progressSlider.value), percent);
        }
    }
});

test('already-reversed score highlights advance as elapsed playback increases', () => {
    const {score, transport} = setup(1, true, true);
    const times = [];
    score.virtualScore.follow = ms => times.push(ms);
    for (const seconds of [0, 10, 40, 90]) {
        Tone.Transport.seconds = seconds;
        score.syncTimingToPlayback();
    }
    assert.deepEqual(times, [0, 10000, 40000, 90000]);
    // Scroll seeking must invert once into slider coordinates, then round-trip.
    score.seekPlaybackToScrollPosition();
    assert.equal(Tone.Transport.seconds, 25);
    assert.equal(transport.progressSlider.value, 75);
    score.syncTimingToPlayback();
    assert.equal(times.at(-1), 25000);
});

test('score scroll seeking round-trips through the slider at different speeds', () => {
    for (const speed of [.5, 1, 2]) for (const reversed of [false, true]) {
        const {score, transport} = setup(speed, reversed, false);
        score.seekPlaybackToScrollPosition();
        assert.equal(Tone.Transport.seconds, 25 / speed);
        assert.equal(transport.progressSlider.value, reversed ? 75 : 25);
        score.syncTimingToPlayback();
        assert.equal(score.virtualScore.ms, 25000);
    }
});

test('playback resumes fullscreen in seconds, not ticks, in either direction', () => {
    for (const reversed of [false, true]) {
        const {score, transport} = setup(1, reversed, false);
        score.isFullscreen = true;
        score.startScoreFollowing = () => {};
        let startOffset;
        Tone.Transport.seconds = 25;
        Tone.Transport.ticks = 9600;
        Tone.Transport.start = (_time, offset) => { startOffset = offset; };
        Tone.Transport.scheduleRepeat = () => 1;
        transport.progressSlider.style = {};
        transport.startPlayback({ innerText:'' });
        assert.equal(startOffset, 25);
        assert.equal(Number(transport.progressSlider.value), reversed ? 75 : 25);
    }
});

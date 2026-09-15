// Run with: node --test tests/quantization.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Transport = require('../src/transport.js');

function transport() {
    return new Transport({ state: {}, modules: {} });
}

function midiFromBoundaries(boundaries, ppq = 480) {
    const notes = boundaries.map(([start, end], index) => ({
        midi: 60 + (index % 3),
        ticks: start,
        durationTicks: end - start,
        velocity: 0.8
    }));
    const midi = {
        header: { ppq },
        tracks: [{
            channel: 0,
            notes,
            controlChanges: {},
            pitchBends: [],
            programChanges: []
        }]
    };
    Object.defineProperty(midi, 'durationTicks', {
        get: () => Math.max(0, ...notes.map(note => note.ticks + note.durationTicks))
    });
    return { midi, notes };
}

test('exact eighth-note triplets remain undistorted', () => {
    const boundaries = Array.from({ length: 12 }, (_, i) => [i * 160, (i + 1) * 160]);
    const { midi, notes } = midiFromBoundaries(boundaries);
    const subject = transport();

    const grid = subject.quantizeMidiInPlace(midi);

    assert.deepEqual(grid, { denominator: 8, triplet: true, unitTicks: 160 });
    assert.deepEqual(
        notes.map(note => [note.ticks, note.durationTicks]),
        boundaries.map(([start, end]) => [start, end - start])
    );
});

test('jittered eighth-note triplets snap to the triplet grid', () => {
    const startJitter = [7, -6, 5, -8, 4, -3, 6, -5, 3, -7, 8, -4];
    const endJitter = [-5, 6, -7, 4, -3, 8, -6, 5, -4, 7, -8, 3];
    const boundaries = startJitter.map((jitter, i) => [
        Math.max(0, i * 160 + jitter),
        (i + 1) * 160 + endJitter[i]
    ]);
    const { midi, notes } = midiFromBoundaries(boundaries);
    const subject = transport();

    const grid = subject.quantizeMidiInPlace(midi);

    assert.equal(grid.denominator, 8);
    assert.equal(grid.triplet, true);
    assert.deepEqual(
        notes.map(note => [note.ticks, note.durationTicks]),
        Array.from({ length: 12 }, (_, i) => [i * 160, 160])
    );
});

test('mixed straight eighths and eighth triplets use their common grid', () => {
    const straightEighths = Array.from({ length: 8 }, (_, i) => [i * 240, (i + 1) * 240]);
    const eighthTriplets = Array.from({ length: 12 }, (_, i) => [i * 160, (i + 1) * 160]);
    const boundaries = [...straightEighths, ...eighthTriplets];
    const { midi, notes } = midiFromBoundaries(boundaries);

    const grid = transport().quantizeMidiInPlace(midi);

    assert.deepEqual(grid, { denominator: 16, triplet: true, unitTicks: 80 });
    assert.deepEqual(
        notes.map(note => [note.ticks, note.durationTicks]),
        boundaries.map(([start, end]) => [start, end - start])
    );
});

test('jittered mixed straight and triplet timing snaps to the common grid', () => {
    const nominal = [
        ...Array.from({ length: 8 }, (_, i) => [i * 240, (i + 1) * 240]),
        ...Array.from({ length: 12 }, (_, i) => [i * 160, (i + 1) * 160])
    ];
    const jittered = nominal.map(([start, end], i) => [
        Math.max(0, start + (i % 2 ? -6 : 7)),
        end + (i % 3 === 0 ? -5 : 6)
    ]);
    const { midi, notes } = midiFromBoundaries(jittered);

    const grid = transport().quantizeMidiInPlace(midi);

    assert.deepEqual(grid, { denominator: 16, triplet: true, unitTicks: 80 });
    assert.deepEqual(
        notes.map(note => [note.ticks, note.durationTicks]),
        nominal.map(([start, end]) => [start, end - start])
    );
});

test('straight grid wins when boundaries also fit triplet candidates', () => {
    const quarterBoundaries = Array.from({ length: 8 }, (_, i) => [i * 480, (i + 1) * 480]);
    const eighthBoundaries = Array.from({ length: 8 }, (_, i) => [i * 240, (i + 1) * 240]);

    const quarterGrid = transport().analyzeAndChooseQuantizeGrid(midiFromBoundaries(quarterBoundaries).midi);
    const eighthGrid = transport().analyzeAndChooseQuantizeGrid(midiFromBoundaries(eighthBoundaries).midi);

    assert.deepEqual(quarterGrid, { denominator: 4, triplet: false, unitTicks: 480 });
    assert.deepEqual(eighthGrid, { denominator: 8, triplet: false, unitTicks: 240 });
});

test('straight humanized timing still quantizes and restores exactly', () => {
    const boundaries = Array.from({ length: 8 }, (_, i) => [i * 480 + 24, (i + 1) * 480 - 24]);
    const { midi, notes } = midiFromBoundaries(boundaries);
    const original = notes.map(note => [note.ticks, note.durationTicks]);
    const subject = transport();

    const grid = subject.quantizeMidiInPlace(midi);
    assert.deepEqual(grid, { denominator: 4, triplet: false, unitTicks: 480 });
    assert.deepEqual(
        notes.map(note => [note.ticks, note.durationTicks]),
        Array.from({ length: 8 }, (_, i) => [i * 480, 480])
    );

    subject.revertQuantizeInPlace();
    assert.deepEqual(notes.map(note => [note.ticks, note.durationTicks]), original);
});
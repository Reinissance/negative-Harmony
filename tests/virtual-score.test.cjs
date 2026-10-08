const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ScoreSectionIndex, VirtualScore } = require('../src/virtual-score.js');
const fixture = (bars = 2000, voices = 24) => 'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n' +
    Array.from({ length: voices }, (_, i) => `V:${i + 1}\n` + 'C2 D2 E2 F2|'.repeat(bars)).join('\n');

test('large orchestration index retains every voice but extracts only a bounded section', () => {
    const index = new ScoreSectionIndex(fixture());
    assert.equal(index.barCount, 2000);
    assert.equal(index.count, 500);
    assert.equal(index.duration, 4000000);
    assert.equal(index.atTime(3999999), 499);
    assert.equal((index.abc(499).match(/^V:/gm) || []).length, 24);
    assert.equal((index.abc(499).match(/C2/g) || []).length, 96);
});

test('pickup, triplets, chords, broken rhythms and state changes survive indexing', () => {
    const index = new ScoreSectionIndex('X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\nV:1\nC2|[K:G](3DEF [CEG]2 G>A B2|C8|C8|C8|');
    assert.equal(index.times[1], 500);
    assert.equal(index.times[2], 2500);
    assert.match(index.abc(1), /\[K:G\]/);
    assert.equal(ScoreSectionIndex.splitBars('"A|B" [CEG]8|| C8|]').length, 2);
    const commented = new ScoreSectionIndex('X:1\nM:4/4\nL:1/8\nK:C % 0 sharps\nV:1\n%%MIDI channel 10\nC8|');
    assert.match(commented.abc(0), /\[K:C\]/);
    assert.match(commented.abc(0), /%%MIDI channel 10/);
});

test('first section retains full names; later sections use at most five characters', () => {
    const index = new ScoreSectionIndex('X:1\nM:4/4\nL:1/8\nK:C\nV:1 nm="French Horn" snm="Horn section"\n' + 'C8|'.repeat(8));
    assert.match(index.abc(0), /nm="French Horn"/);
    assert.match(index.abc(1), /nm="Horn "/);
    assert.doesNotMatch(index.abc(1), /French Horn|Horn section/);
});

test('note following and scroll seeking use engraving coordinates rather than time fractions', () => {
    let centered;
    const view = Object.create(VirtualScore.prototype);
    view.index = new ScoreSectionIndex(fixture(8, 1));
    view.width = 1800;
    view.container = { id: 'score' };
    view.request = () => {};
    view.manager = { clearNoteHighlights() {}, centerScoreOnPosition(x) { centered = x; } };
    view.mounted = new Map([[1, { scale: .8, events: [
        { milliseconds: 0, left: 300, width: 10 },
        { milliseconds: 2000, left: 900, width: 10 }
    ] }]]);
    view.follow(10000);
    assert.equal(centered, 1800 + 900 * .8);
    assert.equal(view.timeAtPixel(centered), 10000);
});

class Element {
    constructor() {
        this.style = {}; this.children = []; this.listeners = new Map();
        this.clientWidth = 1000; this.scrollLeft = 0; this.offsetHeight = 300; this.id = 'score';
    }
    appendChild(el) { el.parentNode = this; this.children.push(el); }
    replaceChildren(el) { this.children = []; this.appendChild(el); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(e => e !== this); this.parentNode = null; }
    addEventListener(k, fn) { this.listeners.set(k, fn); }
    removeEventListener(k) { this.listeners.delete(k); }
    setAttribute() {}
    querySelector() { return null; }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 40));
test('rapid seeks cancel stale rendering; scroll evicts distant DOM and disposal releases it', async () => {
    global.document = { createElement: () => new Element() };
    let calls = 0;
    const manager = {
        scoreZoom: 1, clearNoteHighlights() {}, fitScoreHeight() {}, centerScoreOnPosition() {},
        abcjs: { renderAbc(_el, abc) { calls++; assert.ok(abc.length < 6000); return [{}]; } }
    };
    const container = new Element();
    const view = new VirtualScore(manager, container, fixture());
    for (let i = 0; i < 500; i++) view.follow(i * 8000);
    await settle();
    assert.ok(calls <= 3);
    assert.ok(view.mounted.has(499));
    container.scrollLeft = 100 * view.width;
    container.listeners.get('scroll')();
    await settle();
    assert.ok(view.mounted.has(100));
    assert.ok(!view.mounted.has(499));
    assert.ok(view.mounted.size <= 3);
    manager.scoreZoom = 0.2;
    view.zoom();
    await settle();
    assert.ok(view.mounted.size <= 7);
    view.dispose();
    await settle();
    assert.equal(view.mounted.size, 0);
    assert.equal(container.children.length, 0);
    assert.equal(container.listeners.size, 0);
});

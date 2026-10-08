const { test } = require('node:test');
const assert = require('node:assert/strict');
const ScoreManager = require('../src/score-manager.js');
const midi = require('./midi-fixture.js');
const ready = () => new Promise(resolve => setImmediate(resolve));
class FakeWorker {
    static instances = [];
    constructor(url) { this.url = url; FakeWorker.instances.push(this); }
    postMessage(data, transfer) { this.data = data; this.transfer = transfer; }
    terminate() { this.terminated = true; }
    reply(abc) { this.onmessage({ data: { abc } }); }
}
function setup() {
    global.Worker = FakeWorker;
    global.document = { baseURI: 'https://example.org/player/index.html', getElementById: () => null };
    FakeWorker.instances = [];
    const manager = new ScoreManager({ state: {}, modules: {} });
    manager.midi2abcBinary = new Uint8Array([1,2,3]);
    manager.syncScoreSettingsFromABC = () => {};
    manager.errors = [];
    manager.showAbcErrorNotification = message => manager.errors.push(message);
    return manager;
}
const abc = meter => `X:1\nM:${meter}\nL:1/8\nK:C\nC8|`;

test('new conversions terminate old workers and ignore late replies', async () => {
    const manager = setup();
    const source = midi(1, 8);
    const first = manager.generateABCStringfromMIDI(source, [3,4]);
    await ready();
    const old = FakeWorker.instances[0];
    const lateReply = old.onmessage;
    const second = manager.generateABCStringfromMIDI(source, [6,8]);
    await ready();
    assert.equal(await first, '');
    assert.ok(old.terminated);
    assert.ok(manager.activeConversionRequest);
    assert.equal(FakeWorker.instances.length, 2);
    const current = FakeWorker.instances[1];
    assert.equal(current.url.href, 'https://example.org/player/src/midi2abc/convert-worker.js');
    assert.notEqual(current.data.midi.buffer, source.toArray().buffer);
    assert.equal(current.data.binary, manager.midi2abcBinary);
    lateReply({ data: { abc: abc('3/4') } });
    current.reply(abc('6/8'));
    assert.match(await second, /M:6\/8/);
    assert.match(manager.abcString, /M:6\/8/);
    assert.ok(current.terminated);
    assert.equal(manager.pendingConversion, null);
    assert.equal(manager.activeConversionRequest, null);
    assert.deepEqual(manager.errors, []);
});

test('continue without score cancels work, suppresses late results, and clears busy state', async () => {
    const manager = setup();
    manager.stopScoreFollowing = () => {};
    manager.scoreRegenerating = true;
    const pending = manager.generateABCStringfromMIDI(midi(1,8));
    await ready();
    manager.dismissAbcErrorNotification();
    assert.equal(await pending, '');
    assert.equal(manager.scoreAvailable, false);
    assert.equal(manager.scoreRegenerating, false);
    assert.ok(FakeWorker.instances[0].terminated);
    assert.equal(await manager.generateABCStringfromMIDI(midi(1,8)), '');
    assert.equal(FakeWorker.instances.length, 1);
});

test('worker errors and missing support fail explicitly without a blocking fallback', async t => {
    t.mock.method(console, 'error', () => {});
    const manager = setup();
    const pending = manager.generateABCStringfromMIDI(midi(1,8));
    await ready();
    FakeWorker.instances[0].onerror({ message: 'Worker load failed' });
    assert.equal(await pending, '');
    assert.match(manager.errors[0], /Worker load failed/);
    assert.ok(FakeWorker.instances[0].terminated);
    global.Worker = undefined;
    assert.equal(await manager.generateABCStringfromMIDI(midi(1,8)), '');
    assert.match(manager.errors[1], /not supported/);
});

test('worker timeout terminates conversion and allows a later retry', async t => {
    t.mock.method(console, 'error', () => {});
    let timeout;
    t.mock.method(global, 'setTimeout', callback => { timeout = callback; return 1; });
    const manager = setup();
    const pending = manager.generateABCStringfromMIDI(midi(1,8));
    await ready();
    timeout();
    assert.equal(await pending, '');
    assert.match(manager.errors[0], /timed out/);
    assert.ok(FakeWorker.instances[0].terminated);
    assert.equal(manager.pendingConversion, null);
    const retry = manager.generateABCStringfromMIDI(midi(1,8));
    await ready();
    FakeWorker.instances[1].reply(abc('4/4'));
    assert.match(await retry, /M:4\/4/);
});

test('cancellation during the shared binary download never starts stale work', async () => {
    const manager = setup();
    manager.midi2abcBinary = null;
    let finishFetch;
    let downloads = 0;
    global.fetch = () => {
        downloads++;
        return new Promise(resolve => { finishFetch = resolve; });
    };
    const first = manager.generateABCStringfromMIDI(midi(1,8));
    const second = manager.generateABCStringfromMIDI(midi(1,8), [6,8]);
    finishFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    await ready();
    assert.equal(await first, '');
    assert.equal(downloads, 1);
    assert.equal(FakeWorker.instances.length, 1);
    FakeWorker.instances[0].reply(abc('6/8'));
    await second;
});

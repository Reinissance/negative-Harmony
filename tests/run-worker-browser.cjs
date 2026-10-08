// Run with: node tests/run-worker-browser.cjs http://127.0.0.1:5000/tests/score-worker-browser.html
// Uses an installed Chromium and Node's built-in WebSocket; no npm dependencies.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'score-worker-browser-'));
const chrome = spawn(process.env.CHROMIUM || 'chromium', [
    '--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`, process.argv[2]
]);
let socket;
const timeout = setTimeout(() => { console.error('Browser test timed out'); chrome.kill(); process.exitCode = 1; }, 90000);
(async () => {
    const endpoint = await new Promise((resolve, reject) => {
        let log = '';
        chrome.on('error', reject);
        chrome.stderr.on('data', data => {
            log += data;
            const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) resolve(new URL(match[1]));
        });
    });
    let page;
    for (let i = 0; i < 100 && !page; i++) {
        page = (await (await fetch(`http://${endpoint.host}/json/list`)).json()).find(p => p.type === 'page');
        if (!page) await new Promise(r => setTimeout(r, 100));
    }
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let result;
    for (let id = 1; id <= 20; id++) {
    const response = new Promise(resolve => {
        const listener = event => {
            const message = JSON.parse(event.data);
            if (message.id === id) {
                socket.removeEventListener('message', listener);
                resolve(message);
            }
        };
        socket.addEventListener('message', listener);
    });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
        expression: `new Promise(resolve => {
            const poll = () => window.done ? Promise.resolve(window.done).then(resolve) : setTimeout(poll, 100);
            poll();
        })`,
        awaitPromise: true, returnByValue: true
    } }));
    result = await response;
    if (result.error?.code !== -32000) break;
    await new Promise(r => setTimeout(r, 100));
    }
    const text = result.result?.result?.value;
    console.log(text || JSON.stringify(result));
    if (!text?.startsWith('PASS:')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    clearTimeout(timeout);
    socket?.close();
    chrome.kill();
    chrome.on('exit', () => fs.rmSync(profile, { recursive: true, force: true }));
});

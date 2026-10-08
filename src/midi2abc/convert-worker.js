// Classic worker: relative URLs also work when hosted below a GitHub Pages path.
importScripts('./midi2abc.js');

self.onmessage = async ({ data: { midi, binary, args } }) => {
    try {
        const output = [];
        const diagnostics = [];
        // Never reuse C globals between files or settings changes.
        const converter = await midi2abcModule({
            noInitialRun: true,
            wasmBinary: binary,
            print: text => output.push(text),
            printErr: text => {
                if (diagnostics.length < 20) diagnostics.push(text);
            }
        });
        converter.FS.writeFile('/input.mid', midi);
        const status = converter.callMain(args);
        if (status !== 0) throw new Error(`midi2abc exited with status ${status}: ${diagnostics.join('\n')}`);
        const abc = output.join('\n') + '\n';
        if (!/^X:/m.test(abc)) throw new Error('No ABC output generated from MIDI');
        self.postMessage({ abc });
    } catch (error) {
        self.postMessage({ error: error.message || String(error) });
    }
};

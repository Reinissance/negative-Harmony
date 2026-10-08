function orchestralMidi(voices = 24, notes = 8000) {
    const parts = [new Uint8Array([77,84,104,100,0,0,0,6,0,1,voices >> 8,voices & 255,1,224])];
    for (let voice = 0; voice < voices; voice++) {
        const events = [0,255,88,4,4,2,24,8];
        for (let note = 0; note < notes; note++) {
            const pitch = 48 + voice % 12 + note % 8;
            events.push(0,144,pitch,80,131,96,128,pitch,0);
        }
        events.push(0,255,47,0);
        const n = events.length;
        parts.push(new Uint8Array([77,84,114,107,n >>> 24,(n >>> 16) & 255,(n >>> 8) & 255,n & 255]));
        parts.push(new Uint8Array(events));
    }
    const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return { toArray: () => bytes, tracks: [] };
}
if (typeof module !== 'undefined') module.exports = orchestralMidi;

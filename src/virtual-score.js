/**
 * Indexed ABC sections and a bounded horizontal viewport.
 * Only plain ABC/text timing data grows with the piece, never SVG/tune objects.
 */
class ScoreSectionIndex {
    constructor(abc, barsPerSection = 4) {
        this.barsPerSection = barsPerSection;
        this.headers = [];
        this.voices = [];
        let voice = null;
        for (const raw of abc.split('\n')) {
            const line = raw.trim();
            if (/^V:/.test(line)) {
                const id = line.match(/^V:\s*(\S+)/)?.[1];
                voice = this.voices.find(v => v.id === id);
                if (!voice) {
                    voice = { id, header: line, music: [], directives: [] };
                    this.voices.push(voice);
                }
            } else if (!voice && /^(?:[A-Za-z]:|%)/.test(line)) {
                this.headers.push(line);
            } else if (voice && line.startsWith('%%')) {
                voice.directives.push(line);
            } else if (line && !line.startsWith('%')) {
                if (!voice) {
                    voice = { id: '1', header: 'V:1', music: [], directives: [] };
                    this.voices.push(voice);
                }
                voice.music.push(/^[KMLQ]:/.test(line) ? `[${line}]` : line);
            }
        }
        const header = this.headers.join('\n');
        const initial = {
            L: header.match(/^L:\s*([^\n]+)/m)?.[1] || '1/8',
            M: header.match(/^M:\s*([^\n]+)/m)?.[1] || '4/4',
            K: header.match(/^K:\s*([^\n]+)/m)?.[1] || 'C',
            Q: header.match(/^Q:\s*([^\n]+)/m)?.[1] || '1/4=120'
        };
        // midi2abc appends comments such as "K:C % 0 sharps". Never carry
        // those into an inline field, where % would comment out the music.
        for (const key of Object.keys(initial)) initial[key] = initial[key].split('%')[0].trim();
        for (const v of this.voices) {
            v.bars = ScoreSectionIndex.splitBars(v.music.join(' '));
            v.context = [];
            let context = { ...initial };
            for (const bar of v.bars) {
                v.context.push(context);
                const changes = [...bar.matchAll(/\[([KMLQ]):([^\]]+)\]/g)];
                // Reuse immutable context across unchanged bars, especially
                // important for scores with thousands of bars in many voices.
                if (changes.length) context = { ...context };
                for (const field of changes) {
                    context[field[1]] = field[2];
                }
            }
            delete v.music;
        }
        const reference = this.voices.reduce((a, b) => b.bars.length > a.bars.length ? b : a,
            { bars: [], context: [] });
        this.barCount = reference.bars.length;
        this.count = Math.ceil(this.barCount / barsPerSection);
        this.times = [0];
        reference.bars.forEach((bar, i) => {
            this.times.push(this.times.at(-1) + ScoreSectionIndex.duration(bar, reference.context[i]));
        });
        this.duration = this.times.at(-1);
    }

    static splitBars(text) {
        const bars = [];
        let start = 0, bracket = false, quote = false, decoration = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"' && !decoration) quote = !quote;
            if (c === '!' && !quote) decoration = !decoration;
            if (quote || decoration) continue;
            if (c === '[' && text[i + 1] !== '|') bracket = true;
            if (c === ']') bracket = false;
            if (c === '|' && !bracket) {
                let end = i + 1;
                while (end < text.length && /[|:\]]/.test(text[end])) end++;
                const bar = text.slice(start, end).trim();
                if (/[A-Ga-gzZxy]/.test(bar.replace(/\[[A-Za-z]:[^\]]*\]/g, ''))) bars.push(bar);
                start = end;
                i = end - 1;
            }
        }
        const tail = text.slice(start).trim();
        if (tail && /[A-Ga-gzZxy]/.test(tail)) bars.push(tail + '|');
        return bars;
    }

    static fraction(text) {
        const [n, d = 1] = text.trim().split('/').map(Number);
        return n / d;
    }

    static duration(bar, context) {
        let unit = ScoreSectionIndex.fraction(context.L);
        let meter = context.M === 'C' ? 1 : context.M === 'C|' ? 1
            : ScoreSectionIndex.fraction(context.M);
        const tempo = q => {
            const m = q.match(/(?:(\d+\/\d+)\s*=\s*)?(\d+(?:\.\d+)?)/);
            return m ? 60000 / (Number(m[2]) * ScoreSectionIndex.fraction(m[1] || '1/4')) : 2000;
        };
        let wholeMs = tempo(context.Q), ms = 0, tupleLeft = 0, tupleScale = 1, carry = 1;
        const clean = bar.replace(/"[^"]*"|![^!]*!|\{[^}]*\}/g, '');
        const tokens = clean.match(/\[[KMLQ]:[^\]]*\]|\(\d+(?::\d*){0,2}|\[[^\]]+\](?:\d+)?(?:\/+\d*)?|[=^_]*[A-Ga-gzZxy][,']*(?:\d+)?(?:\/+\d*)?|[<>]+/g) || [];
        let previous = 0;
        for (const token of tokens) {
            const field = token.match(/^\[([KMLQ]):([^\]]+)\]/);
            if (field) {
                if (field[1] === 'L') unit = ScoreSectionIndex.fraction(field[2]);
                if (field[1] === 'M') meter = ScoreSectionIndex.fraction(field[2]);
                if (field[1] === 'Q') wholeMs = tempo(field[2]);
                continue;
            }
            if (token[0] === '(') {
                const [p, q, r] = token.slice(1).split(':').map(Number);
                tupleLeft = r || p;
                tupleScale = (q || (p === 3 ? 2 : p === 2 || p === 4 ? 3 : 2)) / p;
                continue;
            }
            if (/^[<>]/.test(token)) {
                const short = 1 / 2 ** token.length, long = 2 - short;
                const factor = token[0] === '>' ? long : short;
                ms += previous * (factor - 1);
                carry = token[0] === '>' ? short : long;
                continue;
            }
            const length = token.replace(/^\[[^\]]+\]|^[=^_]*[A-Ga-gzZxy][,']*/, '');
            const [num, den] = length.split('/');
            const divisor = length.includes('/') ? (Number(den) || 2 ** (length.match(/\//g) || []).length) : 1;
            previous = (token[0] === 'Z' ? meter : unit) * (Number(num) || 1) / divisor
                * wholeMs * carry * (tupleLeft > 0 ? tupleScale : 1);
            ms += previous;
            carry = 1;
            if (tupleLeft > 0) tupleLeft--;
        }
        return Number.isFinite(ms) && ms > 0 ? ms : meter * wholeMs;
    }

    start(section) { return this.times[section * this.barsPerSection] || 0; }
    end(section) { return this.times[Math.min(this.barCount, (section + 1) * this.barsPerSection)] || 0; }
    atTime(ms) {
        let lo = 0, hi = this.count - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.end(mid) <= ms) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
    abc(section) {
        const start = section * this.barsPerSection;
        const reference = this.voices.find(v => v.context[start]);
        const tempo = reference?.context[start].Q;
        const headers = this.headers.filter(line => !line.startsWith('Q:'));
        if (tempo) headers.push(`Q:${tempo}`);
        return headers.join('\n') + '\n' + this.voices.map(v => {
            const ctx = v.context[start] || v.context.at(-1);
            if (!ctx) return '';
            const fields = Object.entries(ctx).filter(([k]) => k !== 'Q')
                .map(([k, value]) => `[${k}:${value}]`).join('');
            let voiceHeader = v.header;
            if (section > 0) {
                const name = voiceHeader.match(/\b(?:snm|subname)="([^"]*)"/)?.[1]
                    || voiceHeader.match(/\b(?:nm|name)="([^"]*)"/)?.[1] || '';
                voiceHeader = voiceHeader.replace(/\b(?:nm|name|snm|subname)="[^"]*"/g, '').trim();
                if (name) voiceHeader += ` nm="${Array.from(name).slice(0, 5).join('')}"`;
            }
            return [voiceHeader, ...v.directives, fields + v.bars.slice(start, start + this.barsPerSection).join(' ')].join('\n');
        }).join('\n');
    }
}

class VirtualScore {
    constructor(manager, container, abc) {
        this.manager = manager;
        this.container = container;
        this.index = new ScoreSectionIndex(abc);
        this.width = 1800;
        this.widths = new Float64Array(this.index.count).fill(this.width);
        this.offsets = new Float64Array(this.index.count + 1);
        this.rebuildOffsets();
        this.mounted = new Map();
        this.generation = 0;
        this.pending = null;
        this.root = document.createElement('div');
        this.root.style.cssText = 'position:relative; min-height:240px;';
        container.replaceChildren(this.root);
        this.scrollListener = () => this.request(this.visibleSection());
        container.addEventListener('scroll', this.scrollListener, { passive: true });
        this.zoom();
        this.request(0);
    }
    visibleSection() {
        return this.sectionAtPixel((this.container.scrollLeft + this.container.clientWidth / 2)
            / (this.manager.scoreZoom || 1));
    }
    rebuildOffsets() {
        for (let i = 0; i < this.index.count; i++) this.offsets[i + 1] = this.offsets[i] + this.widths[i];
    }
    offset(id) { return this.offsets?.[id] ?? id * this.width; }
    sectionWidth(id) { return this.widths?.[id] || this.width; }
    sectionAtPixel(x) {
        let lo = 0, hi = Math.max(0, this.index.count - 1);
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.offset(mid + 1) <= x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
    zoom() {
        const zoom = this.manager.scoreZoom || 1;
        this.root.style.width = `${this.offset(this.index.count) * zoom}px`;
        this.root.style.height = `${(this.height || 240) * zoom}px`;
        for (const [id, item] of this.mounted) {
            item.node.style.left = `${this.offset(id) * zoom}px`;
            item.node.style.transform = `scale(${zoom})`;
        }
        this.center = null;
        this.request(this.visibleSection());
    }
    request(center) {
        if (this.disposed || !this.index.count) return;
        center = Math.max(0, Math.min(this.index.count - 1, center));
        if (center === this.center && (this.pending !== null || this.mounted.has(center))) return;
        this.center = center;
        const generation = ++this.generation;
        clearTimeout(this.pending);
        this.pending = null;
        // Keep only the viewport and a bounded overscan range, including zoomed-out views.
        const radius = Math.min(3, Math.max(1, Math.ceil(this.container.clientWidth /
            (this.sectionWidth(center) * (this.manager.scoreZoom || 1)) / 2)));
        const wanted = [center];
        for (let i = 1; i <= radius; i++) {
            if (center + i < this.index.count) wanted.push(center + i);
            if (center - i >= 0) wanted.push(center - i);
        }
        for (const [id, item] of this.mounted) {
            if (!wanted.includes(id)) {
                item.timing?.stop?.();
                item.node.remove();
                this.mounted.delete(id);
            }
        }
        this.manager.clearNoteHighlights();
        const next = () => {
            this.pending = null;
            if (this.disposed || generation !== this.generation) return;
            const id = wanted.find(i => !this.mounted.has(i));
            if (id === undefined) return;
            this.render(id);
            this.pending = setTimeout(next, 0);
        };
        this.pending = setTimeout(next, 0);
    }
    render(id) {
        const node = document.createElement('div');
        node.style.cssText = `position:absolute;top:0;left:${this.offset(id) * (this.manager.scoreZoom || 1)}px;transform-origin:0 0;transform:scale(${this.manager.scoreZoom || 1});`;
        node.setAttribute('aria-label', `Score bars ${id * this.index.barsPerSection + 1}–${Math.min(this.index.barCount, (id + 1) * this.index.barsPerSection)}`);
        this.root.appendChild(node);
        try {
            const tune = this.manager.abcjs.renderAbc(node, this.index.abc(id), {
                staffwidth: this.width, format: { stretchlast: '1' }, add_classes: true,
                scale: 1, paddingtop: 0, paddingbottom: 0, paddingleft: 0, paddingright: 0,
                foregroundColor: '#000000'
            })[0];
            const timing = this.manager.abcjs.TimingCallbacks
                ? new this.manager.abcjs.TimingCallbacks(tune, {}) : null;
            const events = (timing?.noteTimings || []).filter(e => e.type === 'event');
            const svg = node.querySelector('svg');
            // ABCJS caps note spacing even with stretchlast, leaving empty SVG
            // canvas to the right. Trim that canvas, not the musical content.
            const bounds = svg?.getBBox?.();
            const actualWidth = bounds ? Math.ceil(bounds.x + bounds.width + 8) : this.width;
            const scale = Math.min(1, this.width / actualWidth);
            const sectionWidth = Math.min(this.width, actualWidth);
            if (svg && bounds) {
                const height = Number(svg.getAttribute('height')) || node.offsetHeight;
                svg.setAttribute('viewBox', `0 0 ${actualWidth} ${height}`);
                svg.setAttribute('width', sectionWidth);
                svg.setAttribute('height', height * scale);
            }
            this.mounted.set(id, { node, timing, events, scale });
            const zoom = this.manager.scoreZoom || 1;
            const center = (this.container.scrollLeft + this.container.clientWidth / 2) / zoom;
            const anchor = this.sectionAtPixel(center);
            const fraction = (center - this.offset(anchor)) / this.sectionWidth(anchor);
            this.widths[id] = sectionWidth;
            this.rebuildOffsets();
            this.root.style.width = `${this.offset(this.index.count) * zoom}px`;
            for (const [section, item] of this.mounted) item.node.style.left = `${this.offset(section) * zoom}px`;
            this.container.scrollLeft = Math.max(0,
                (this.offset(anchor) + fraction * this.sectionWidth(anchor)) * zoom - this.container.clientWidth / 2);
            this.height = Math.max(this.height || 240, node.offsetHeight);
            this.root.style.height = `${this.height * (this.manager.scoreZoom || 1)}px`;
            this.manager.fitScoreHeight(this.container.id);
            if (this.lastTime !== undefined && id === this.index.atTime(this.lastTime)) this.follow(this.lastTime);
        } catch (error) {
            node.textContent = 'This score section could not be rendered.';
            this.mounted.set(id, { node, events: [], scale: 1 });
            console.error('Score section rendering failed:', error);
        }
    }
    follow(ms, navigate = true) {
        this.lastTime = ms;
        const id = this.index.atTime(ms);
        if (navigate) {
            this.request(id);
            const fraction = Math.max(0, Math.min(1, (ms - this.index.start(id)) /
                Math.max(1, this.index.end(id) - this.index.start(id))));
            if (!this.mounted.has(id)) this.manager.centerScoreOnPosition(this.offset(id) + fraction * this.sectionWidth(id), 0, this.container.id);
        }
        const item = this.mounted.get(id);
        if (!item) return;
        const localMs = ms - this.index.start(id);
        let event = null;
        for (const candidate of item.events) {
            if (candidate.milliseconds > localMs) break;
            event = candidate;
        }
        // Time is not proportional to engraving width: rests, names, and dense
        // chords all change spacing. Follow the actual rendered note instead.
        if (navigate && event && Number.isFinite(event.left)) {
            this.manager.centerScoreOnPosition(this.offset(id) + event.left * item.scale,
                (event.width || 0) * item.scale, this.container.id);
        }
        this.manager.clearNoteHighlights();
        const elements = event?.elements?.flat(Infinity) || [];
        for (const el of elements) el?.classList?.add('note-playing');
        this.manager.highlightedElements = elements;
    }
    timeAtPixel(x) {
        const id = this.sectionAtPixel(x);
        const item = this.mounted.get(id);
        if (item?.events.length) {
            const localX = (x - this.offset(id)) / item.scale;
            let event = item.events[0];
            for (const candidate of item.events) {
                if (candidate.left > localX) break;
                event = candidate;
            }
            return this.index.start(id) + event.milliseconds;
        }
        const fraction = Math.max(0, Math.min(1, (x - this.offset(id)) / this.sectionWidth(id)));
        return this.index.start(id) + fraction * (this.index.end(id) - this.index.start(id));
    }
    dispose() {
        this.disposed = true;
        ++this.generation;
        clearTimeout(this.pending);
        this.container.removeEventListener('scroll', this.scrollListener);
        this.manager.clearNoteHighlights();
        for (const item of this.mounted.values()) item.timing?.stop?.();
        this.mounted.clear();
        this.root.remove();
    }
}

if (typeof module !== 'undefined') module.exports = { ScoreSectionIndex, VirtualScore };

/**
 * Utilities Module
 * Common utility functions and helpers
 */

class Utils {
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const shares = document.getElementById("st-1")
            if (shares) {
                shares.style.display = "none";
            }
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static generateShareUrl(baseUrl, params) {
        const url = new URL(baseUrl);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                if (typeof params[key] === 'object') {
                    url.searchParams.set(key, encodeURIComponent(JSON.stringify(params[key])));
                } else {
                    url.searchParams.set(key, params[key]);
                }
            }
        });
        return url.toString();
    }

    static updateShareUrl(shareUrl) {
        const shareButtons = document.querySelectorAll('.sharethis-inline-share-buttons');
        shareButtons.forEach(button => {
            button.setAttribute('data-url', shareUrl);
        });
    }

    static setPlayButtonActive(active) {
        const playBtn = document.getElementById('playMidi');
        if (!active) {
            playBtn.innerText = "Loading MIDI file...";
            playBtn.style.color = "gray";
            playBtn.disabled = true;
        } else {
            playBtn.disabled = false;
            playBtn.innerText = "Play MIDI";
            playBtn.style.color = "red";
        }
    }

    static createElementWithAttributes(tagName, attributes = {}, textContent = '') {
        const element = document.createElement(tagName);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'classList') {
                attributes[key].forEach(className => element.classList.add(className));
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        if (textContent) {
            element.textContent = textContent;
        }
        
        return element;
    }

    static removeAllChildren(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    static formatValue(value, decimals = 2) {
        return parseFloat(value).toFixed(decimals);
    }

    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    static noteNumberToName(noteNumber) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNumber / 12) - 1;
        const noteName = noteNames[noteNumber % 12];
        return `${noteName}${octave}`;
    }

    static midiChannelToHex(channel) {
        return '0x' + channel.toString(16).toUpperCase().padStart(2, '0');
    }

    static validateMidiFile(fileUrl) {
        return fileUrl && (fileUrl.endsWith('.mid') || fileUrl.endsWith('.midi'));
    }

    static async loadArrayBuffer(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.arrayBuffer();
        } catch (error) {
            console.error('Error loading array buffer:', error);
            throw error;
        }
    }

    static showError(message, title = 'Error') {
        // Simple error display - could be enhanced with a modal
        alert(`${title}: ${message}`);
    }

    static showSuccess(message, title = 'Success') {
        // Simple success display - could be enhanced with a notification system
        console.log(`${title}: ${message}`);
    }

    static copyToClipboard(text) {
        return navigator.clipboard.writeText(text)
            .then(() => Utils.showSuccess('Copied to clipboard!'))
            .catch(err => Utils.showError('Failed to copy to clipboard: ' + err.message));
    }

    static isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    static getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
    }

    static sanitizeFilename(filename) {
        return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }

    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    static deepClone(obj) {
        if (obj === null || typeof obj !== "object") return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === "object") {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = Utils.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    static formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    static normalizeValue(value, min, max) {
        return (value - min) / (max - min);
    }

    static denormalizeValue(normalizedValue, min, max) {
        return min + normalizedValue * (max - min);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

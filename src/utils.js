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
        const downloadButton = document.getElementById('downloadMidi');
        if (downloadButton) {
            downloadButton.style.display = active ? "inline-block" : "none";
        }
        
        const showScore = document.getElementById('showScore');
        if (showScore) {
            if (active) {
                const scoreManager = window.app?.modules?.scoreManager;
                if (scoreManager?.scoreAvailable) {
                    showScore.style.display = "inline-block";
                } else {
                    showScore.style.display = "none";
                }
            } else {
                showScore.style.display = "none";
            }
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

(function (global) {
  let lastSearchResults = null;
  let lastSearchQuery = null;
  let lastSearchPage = 0;

  function search(query, page = 0) {
    const bitmidiSearch = `https://bitmidi.com/api/midi/search?q=${encodeURIComponent(query)}&page=${page}`;
    return fetch(bitmidiSearch)
      .then(r => r.json())
      .then(data => {
        displayResults(data.result, query, page);
      })
      .catch(err => {
        console.error("Error searching BitMidi:", err);
        alert("Error searching BitMidi: " + err);
      });
  }

  function showPrevious() {
    if (lastSearchResults && lastSearchQuery) {
      displayResults(lastSearchResults, lastSearchQuery, lastSearchPage);
    }
  }

  function init() {
    const midiUrlInput = document.getElementById("midiUrl");
    if (!midiUrlInput) return;
    midiUrlInput.addEventListener("focus", () => {
      if (lastSearchResults && lastSearchQuery) showPrevious();
    });
  }

  function displayResults(resultData, query, currentPage) {
    const { results, total, pageTotal } = resultData;

    lastSearchResults = resultData;
    lastSearchQuery = query;
    lastSearchPage = currentPage;

    const existingContainer = document.getElementById("bitmidi-results");
    if (existingContainer) {
      existingContainer._cleanup?.();
      existingContainer.remove();
    }

    const resultsContainer = document.createElement("div");
    resultsContainer.id = "bitmidi-results";

    const midiUrlInput = document.getElementById("midiUrl");
    const inputRect = midiUrlInput.getBoundingClientRect();

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768 || "ontouchstart" in window;

    let topPosition, containerHeight, containerWidth, leftPosition;
    if (isMobile) {
      topPosition = 50;
      leftPosition = 50;
      containerWidth = window.innerWidth - 100;
      containerHeight = window.innerHeight - 100;
    } else {
      topPosition = inputRect.bottom + window.scrollY - 200;
      leftPosition = inputRect.left + window.scrollX - 50;
      containerWidth = inputRect.width;
      containerHeight = 300;
    }

    resultsContainer.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      left: ${leftPosition}px;
      width: ${containerWidth}px;
      height: ${containerHeight}px;
      z-index: 999999;
      margin: 0;
      padding: 20px;
      border: 1px solid #ccc;
      border-radius: 10px;
      background-color: #000000d7;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      pointer-events: auto;
      -webkit-overflow-scrolling: touch;
      transform: translateZ(0);
      will-change: transform;
      display: block;
      visibility: visible;
      ${isMobile ? "backdrop-filter: blur(5px);" : ""}
    `;

    document.body.appendChild(resultsContainer);

    const updatePosition = () => {
      if (isMobile) {
        resultsContainer.style.top = "50px";
        resultsContainer.style.left = "50px";
        resultsContainer.style.width = `${window.innerWidth - 100}px`;
        resultsContainer.style.height = `${window.innerHeight - 100}px`;
      } else {
        const newRect = midiUrlInput.getBoundingClientRect();
        resultsContainer.style.top = `${newRect.bottom + window.scrollY - 200}px`;
        resultsContainer.style.left = `${newRect.left + window.scrollX - 50}px`;
        resultsContainer.style.width = `${newRect.width}px`;
      }
    };

    window.addEventListener("resize", updatePosition, { passive: true });
    window.addEventListener("orientationchange", updatePosition, { passive: true });

    resultsContainer._cleanup = () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("orientationchange", updatePosition);
    };

    if (results && results.length > 0) {
      const title = document.createElement("h4");
      title.textContent = `Found ${total} results (Page ${currentPage + 1} of ${pageTotal}):`;
      title.style.cssText = `
        margin: 0 0 20px 0;
        padding-top: 30px;
        color: #ffffff;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
        font-size: ${isMobile ? "16px" : "14px"};
        text-align: center;
      `;
      resultsContainer.appendChild(title);

      const resultsList = document.createElement("ul");
      resultsList.style.cssText = "margin: 0; padding: 0; list-style: none;";

      const frag = document.createDocumentFragment();

      results.forEach((result, index) => {
        const li = document.createElement("li");
        li.style.margin = "4px 0";

        const link = document.createElement("a");
        link.href = "#";
        link.textContent = result.name || `Result ${index + 1}`;
        link.style.cssText = `
          color: #ff00c8ff;
          text-decoration: none;
          cursor: pointer;
          display: block;
          padding: ${isMobile ? "16px 12px" : "8px 5px"};
          border-radius: 5px;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
          font-size: ${isMobile ? "16px" : "12px"};
          -webkit-tap-highlight-color: rgba(0,0,0,0);
          touch-action: manipulation;
          line-height: 1.4;
          border: 1px solid rgba(255, 255, 255, 0.2);
        `;

        link.addEventListener("mouseenter", () => {
          link.style.backgroundColor = "#4a6d8fa9";
        });
        link.addEventListener("mouseleave", () => {
          link.style.backgroundColor = "transparent";
        });

        link.addEventListener("click", e => {
          e.preventDefault();
          if (result.downloadUrl) {
            document.getElementById("midiUrl").value =
              "https://bitmidi.com" + result.downloadUrl;
            resultsContainer._cleanup();
            resultsContainer.remove();
            // Delegate to global reloadWithUrl already present in main.js
            if (typeof window.reloadWithUrl === "function") {
              window.reloadWithUrl();
            }
          }
        });

        li.appendChild(link);
        frag.appendChild(li);
      });

      resultsList.appendChild(frag);
      resultsContainer.appendChild(resultsList);

      if (pageTotal > 1) {
        const paginationDiv = document.createElement("div");
        paginationDiv.style.cssText = `
          margin: 20px 0 0 0;
          padding: 20px 0 0 0;
          border-top: 1px solid #555;
          text-align: center;
        `;

        if (currentPage > 0) {
          const prevButton = document.createElement("button");
          prevButton.textContent = "← Previous";
          prevButton.style.cssText = `
            background: #4a6d8f;
            color: white;
            border: none;
            padding: ${isMobile ? "12px 20px" : "8px 12px"};
            margin: 0 5px;
            border-radius: 5px;
            cursor: pointer;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            font-size: ${isMobile ? "14px" : "11px"};
            -webkit-tap-highlight-color: rgba(0,0,0,0);
            touch-action: manipulation;
          `;
          prevButton.addEventListener("click", () => search(query, currentPage - 1));
          paginationDiv.appendChild(prevButton);
        }

        const pageInfo = document.createElement("span");
        pageInfo.textContent = `${currentPage + 1}/${pageTotal}`;
        pageInfo.style.cssText = `
          color: #ffffff;
          margin: 0 15px;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
          font-size: ${isMobile ? "14px" : "11px"};
        `;
        paginationDiv.appendChild(pageInfo);

        if (currentPage < pageTotal - 1) {
          const nextButton = document.createElement("button");
          nextButton.textContent = "Next →";
          nextButton.style.cssText = `
            background: #4a6d8f;
            color: white;
            border: none;
            padding: ${isMobile ? "12px 20px" : "8px 12px"};
            margin: 0 5px;
            border-radius: 5px;
            cursor: pointer;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 1);
            font-size: ${isMobile ? "14px" : "11px"};
            -webkit-tap-highlight-color: rgba(0,0,0,0);
            touch-action: manipulation;
          `;
          nextButton.addEventListener("click", () => search(query, currentPage + 1));
          paginationDiv.appendChild(nextButton);
        }

        resultsContainer.appendChild(paginationDiv);
      }

    } else {
      resultsContainer.innerHTML = `<p style='color: white; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); text-align: center; font-size: ${isMobile ? "16px" : "14px"}; padding: 20px;'>No results found.</p>`;
      setTimeout(() => {
        resultsContainer._cleanup();
        resultsContainer.remove();
      }, 3000);
    }

    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.style.cssText = `
      position: absolute;
      top: 0;
      right: 15px;
      border: none;
      background: none;
      font-size: ${isMobile ? "28px" : "20px"};
      cursor: pointer;
      color: #ffffffff;
      text-shadow: 1px 1px 2px rgba(0, 26, 255, 1);
      padding: ${isMobile ? "10px 15px" : "4px 8px"};
      -webkit-tap-highlight-color: rgba(0,0,0,0);
      touch-action: manipulation;
    `;
    closeButton.addEventListener("click", () => {
      lastSearchResults = null;
      lastSearchQuery = null;
      lastSearchPage = 0;
      resultsContainer._cleanup();
      resultsContainer.remove();
    });
    resultsContainer.appendChild(closeButton);

    setTimeout(() => {
      const closeOnClickOutside = e => {
        if (!resultsContainer.contains(e.target) && !midiUrlInput.contains(e.target)) {
          document.removeEventListener("click", closeOnClickOutside);
          document.removeEventListener("touchend", closeOnClickOutside);
          resultsContainer._cleanup();
          resultsContainer.remove();
        }
      };
      document.addEventListener("click", closeOnClickOutside);
      document.addEventListener("touchend", closeOnClickOutside, { passive: true });
    }, 100);
  }

  global.BitMidiSearch = { init, search, showPrevious };
})(window);
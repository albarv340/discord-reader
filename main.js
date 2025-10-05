(function () {
  // --- Constants --- 
  const PANEL_STYLE = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    padding: 10px;
    z-index: 9999;
    display: none;
    cursor: move;
  `;

  const VOICE_SPEED_MIN = 0.5;
  const VOICE_SPEED_MAX = 10;
  const VOICE_SPEED_STEP = 0.5;
  const VOICE_SPEED_DEFAULT = 2;

  // --- State --- 
  const readingQueue = [];
  let currentElem = null;
  let paused = false;
  let speechRate = VOICE_SPEED_DEFAULT;
  let utterance = null;
  let lastRead = null;
  let userVoices = {};
  let voices = [];
  let currentUser = '';

  const synth = window.speechSynthesis;

  // --- Helper Functions --- 
  const hashString = (str) => {
    return Array.from(str).reduce((hash, char) => char.charCodeAt(0) + ((hash << 5) - hash), 0);
  };

  const assignVoice = (username) => {
    if (!voices.length || !username) return null;

    if (!userVoices[username]) {
      userVoices[username] = voices[hashString(username) % voices.length];
    }

    return userVoices[username];
  };

  const updateProgress = () => {
    const total = readingQueue.length + 1;
    const done = document.querySelectorAll('.reading-now').length;
    progressBar.value = done / total;
    progressBar.max = total;
    progressNumber.innerText = `${done}/${total}`;
  };

  const clearAll = () => {
    synth.cancel();
    readingQueue.length = 0;
    paused = false;
    currentElem = null;
    lastRead = null;
    currentUser = '';
    document.querySelectorAll('.reading-now, .reading-next').forEach(el =>
      el.classList.remove('reading-now', 'reading-next')
    );
    panel.style.display = 'none';
  };

  const shortenURLsInText = (text) => {
    const urlRegex = /\bhttps?:\/\/[^\s]+/gi;
  
    return text.replace(urlRegex, (url) => {
      try {
        const { hostname } = new URL(url);
        return hostname;
      } catch (e) {
        return url; // fallback to original if URL parsing fails
      }
    });
  };
  

  // Helper function to extract message details from an element
const extractMessageDetails = (node, lastUsername, lastAvatar, previousUsernameForSpeech) => {
  const usernameElem = node.querySelector('[id^="message-username"]');
  const messageElem = node.querySelector('[id^="message-content"]:not([class^="repliedText"])');
  const avatarElem = node.querySelector('img[aria-hidden="true"]');

  const username = usernameElem ? usernameElem.textContent.trim() : lastUsername;
  const message = messageElem ? messageElem.textContent.trim() : null;
  const avatarSrc = avatarElem ? avatarElem.src : lastAvatar;

  const needsUsername = username !== previousUsernameForSpeech;
  return { username, message, avatarSrc, needsUsername };
};

// Function to add a message to the reading queue
const addToQueue = (element, username, message, avatarSrc, needsUsername) => {
  const shortenedMessage = shortenURLsInText(message);
  const text = needsUsername && username
    ? `${username} says: ${shortenedMessage}`
    : shortenedMessage;

  readingQueue.push({
    element,
    text,
    username,
    avatar: avatarSrc
  });
};

// Function to build queue from the start element
const buildQueueFrom = (startElement) => {
  readingQueue.length = 0;
  let current = startElement;
  let lastUsername = null;
  let lastAvatar = null;
  let previousUsernameForSpeech = null;

  while (current) {
    const { username, message, avatarSrc, needsUsername } = extractMessageDetails(current, lastUsername, lastAvatar, previousUsernameForSpeech);

    if (message) {
      lastUsername = username || lastUsername;
      lastAvatar = avatarSrc || lastAvatar;

      addToQueue(current, username, message, avatarSrc, needsUsername);
    }

    previousUsernameForSpeech = username;
    current = current.nextElementSibling;
  }
};

// MutationObserver callback to handle newly added messages
const observer = new MutationObserver((mutations) => {
  let lastUsername = null;
  let lastAvatar = null;
  let previousUsernameForSpeech = null;

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {  // Ensure the node is an element
        const { username, message, avatarSrc, needsUsername } = extractMessageDetails(node, lastUsername, lastAvatar, previousUsernameForSpeech);

        if (message) {
          lastUsername = username || lastUsername;
          lastAvatar = avatarSrc || lastAvatar;

          addToQueue(node, username, message, avatarSrc, needsUsername);
        }

        previousUsernameForSpeech = username;
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
  

  // --- Speech Synthesis Logic ---
  const speakNext = () => {
    if (paused || readingQueue.length === 0) return;

    const { element, text, username, avatar } = readingQueue.shift();
    lastRead = { element, text, username, avatar };

    if (currentElem) currentElem.classList.remove('reading-now');
    currentElem = element;
    element.classList.add('reading-now');

    document.querySelectorAll('.reading-next').forEach(el => el.classList.remove('reading-next'));
    if (readingQueue[0]) {
      readingQueue[0].element.classList.add('reading-next');
    }

    updatePanelUI(username, avatar);

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.voice = assignVoice(username);
    utterance.onend = () => {
      element.classList.remove('reading-now');
      updateProgress();
      speakNext();
    };

    synth.speak(utterance);
  };

  const updatePanelUI = (username, avatar) => {
    currentUser = username || 'Anonymous';
    readerUser.innerText = currentUser;
    readerAvatar.src = avatar || '';
    readerAvatar.style.display = avatar ? 'block' : 'none';
    updateProgress();
  };

  const loadVoices = (language = 'en-US') => {
    let voices = synth.getVoices();
    
    if (!voices.length) {
      synth.onvoiceschanged = () => {
        voices = synth.getVoices();
        filterVoices(voices, language);
      };
    } else {
      filterVoices(voices, language);
    }
  };

  // Function to filter voices based on language
  const filterVoices = (voices, language) => {
    const filteredVoices = voices.filter(voice => voice.lang.startsWith(language));
    console.log(filteredVoices);
  };

  // --- UI Panel Setup ---
  const panel = document.createElement('div');
  panel.style.cssText = PANEL_STYLE;

  panel.innerHTML = `
    <div class="chat-reader-controls">
      <div style="display:flex; align-items:center; margin-bottom:8px;">
        <img id="reader-avatar" style="width:32px; height:32px; border-radius:50%; margin-right:8px; display:none;" />
        <span id="reader-user" style="font-weight:bold;"></span>
        <span id="progress-number" style="font-weight:bold; margin-left:auto;"></span>
      </div>
      <progress id="reader-progress" value="0" max="1" style="width: 100%; margin-bottom: 8px;"></progress><br/>
      <button id="reader-play">▶️</button>
      <button id="reader-pause">⏸️</button>
      <button id="reader-rewind">⏪</button>
      <button id="reader-skip">⏭️</button>
      <button id="reader-stop">⏹️</button>
      <label style="margin-left:10px;">Speed:
        <input type="range" id="reader-speed" min="${VOICE_SPEED_MIN}" max="${VOICE_SPEED_MAX}" step="${VOICE_SPEED_STEP}" value="${VOICE_SPEED_DEFAULT}">
      </label>
    </div>
  `;
  panel.setAttribute('draggable', true);

  document.body.appendChild(panel);

  const readerUser = panel.querySelector('#reader-user');
  const readerAvatar = panel.querySelector('#reader-avatar');
  const progressBar = panel.querySelector('#reader-progress');
  const progressNumber = panel.querySelector('#progress-number');

  // --- Dragging Logic ---
  panel.addEventListener('dragstart', function (e) {
    const style = window.getComputedStyle(panel);
    e.dataTransfer.setData("text/plain",
      (parseInt(style.left, 10) - e.clientX) + ',' + (parseInt(style.top, 10) - e.clientY));
  }, false);

  document.body.addEventListener('dragover', e => {
    e.preventDefault();
    return false;
  }, false);

  document.body.addEventListener('drop', function (e) {
    const offset = e.dataTransfer.getData("text/plain").split(',');
    panel.style.left = (e.clientX + parseInt(offset[0], 10)) + 'px';
    panel.style.top = (e.clientY + parseInt(offset[1], 10)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    e.preventDefault();
    return false;
  }, false);

  // --- Controls Setup ---
  panel.querySelector('#reader-play').addEventListener('click', () => {
    if (paused && utterance) {
      paused = false;
      synth.resume();
    } else if (!paused && readingQueue.length > 0) {
      speakNext();
    }
  });

  panel.querySelector('#reader-pause').addEventListener('click', () => {
    paused = true;
    synth.pause();
  });

  panel.querySelector('#reader-rewind').addEventListener('click', () => {
    synth.cancel();
    if (lastRead) {
      readingQueue.unshift(lastRead);
      speakNext();
    }
  });

  panel.querySelector('#reader-skip').addEventListener('click', () => {
    synth.cancel();
    speakNext();
  });

  panel.querySelector('#reader-stop').addEventListener('click', () => {
    clearAll();
  });

  panel.querySelector('#reader-speed').addEventListener('input', (e) => {
    speechRate = parseFloat(e.target.value);
  });

  // --- Event Listener for Click ---
  document.addEventListener('click', function (event) {
    if (!event.ctrlKey) return;

    const li = event.target.closest('li[id^="chat-messages-"]');
    if (!li) return;

    event.preventDefault();

    clearAll();
    buildQueueFrom(li);
    panel.style.display = 'block';
    speakNext();
  });

  // --- Load Voices ---
  loadVoices();

  // --- Styles --- 
  const injectStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      .reading-now {
        outline: 2px solid #007bff !important;
        background-color: rgba(0, 123, 255, 0.1);
      }
      .reading-next {
        outline: 2px dashed #ffc107 !important;
      }
      .chat-reader-controls button {
        margin-right: 5px;
        padding: 4px 8px;
        font-size: 14px;
        cursor: pointer;
      }
      .chat-reader-controls input[type="range"] {
        vertical-align: middle;
      }
    `;
    document.head.appendChild(style);
  };

  injectStyles();
})();

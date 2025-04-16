(function () {
    const readingQueue = [];
    let currentElem = null;
    let paused = false;
    let speechRate = 1;
    let utterance = null;
    let lastRead = null;
    let userVoices = {};
    let voices = [];
    let currentUser = '';
  
    const synth = window.speechSynthesis;
  
    const hashString = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return Math.abs(hash);
    };
  
    const assignVoice = (username) => {
        if (!voices.length || !username) return null;
      
        if (!userVoices[username]) {
          const hash = hashString(username);
          userVoices[username] = voices[hash % voices.length];
        }
      
        return userVoices[username];
      };
      
  
    const speakNext = () => {
      if (paused || readingQueue.length === 0) return;
  
      const { element, text, username, avatar } = readingQueue.shift();
      lastRead = { element, text, username, avatar };
  
      if (currentElem) currentElem.classList.remove('reading-now');
      currentElem = element;
      element.classList.add('reading-now');
  
      document.querySelectorAll('.reading-next').forEach(el =>
        el.classList.remove('reading-next')
      );
      if (readingQueue[0]) {
        readingQueue[0].element.classList.add('reading-next');
      }
  
      updatePanelUI(username, avatar);
  
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
  
    const updateProgress = () => {
      const total = readingQueue.length + 1; // current + queue
      const done = document.querySelectorAll('.reading-now').length;
      progressBar.value = done / total;
      progressBar.max = total;
      progressNumber.innerText = `${done}/${total}`;
    };
  
    const buildQueueFrom = (startElement) => {
        readingQueue.length = 0;
      
        let current = startElement;
        let lastUsername = null;
        let lastAvatar = null;
        let previousUsernameForSpeech = null;
        
        while (current) {
          const usernameElem = current.querySelector('[id^="message-username"]');
          const messageElem = current.querySelector('[id^="message-content"]:not([class^="repliedText"])');
        
          const username = usernameElem ? usernameElem.textContent.trim() : lastUsername;
          const message = messageElem ? messageElem.textContent.trim() : null;
        
          const avatarElem = current.querySelector('img[aria-hidden="true"]');
          const avatarSrc = avatarElem ? avatarElem.src : lastAvatar;
        
          if (message) {
            if (username) lastUsername = username;
            if (avatarSrc) lastAvatar = avatarSrc;
        
            // 🧠 Only say username if it’s different than the previous message
            const needsUsername = username !== previousUsernameForSpeech;
            const text = needsUsername && username ? `${username} says: ${message}` : message;
        
            readingQueue.push({
              element: current,
              text,
              username,
              avatar: avatarSrc
            });
        
            previousUsernameForSpeech = username;
          }
        
          current = current.nextElementSibling;
        }
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
  
    const updatePanelUI = (username, avatar) => {
      currentUser = username || 'Anonymous';
      readerUser.innerText = currentUser;
      readerAvatar.src = avatar || '';
      readerAvatar.style.display = avatar ? 'block' : 'none';
      updateProgress();
    };
  
    const loadVoices = () => {
      voices = synth.getVoices();
      if (!voices.length) {
        // Some browsers require waiting for the voices to load
        synth.onvoiceschanged = () => {
          voices = synth.getVoices();
        };
      }
    };
  
    // --- UI Panel Setup ---
    const panel = document.createElement('div');
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
          <input type="range" id="reader-speed" min="0.5" max="2" step="0.1" value="1">
        </label>
      </div>
    `;
    panel.style.position = 'fixed';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    panel.style.background = '#fff';
    panel.style.border = '1px solid #ccc';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    panel.style.padding = '10px';
    panel.style.zIndex = 9999;
    panel.style.display = 'none';
    panel.style.cursor = 'move';
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
  
    // --- Controls ---
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
      synth.cancel(); // go to next one immediately
      speakNext();
    });
  
    panel.querySelector('#reader-stop').addEventListener('click', () => {
      clearAll();
    });
  
    panel.querySelector('#reader-speed').addEventListener('input', (e) => {
      speechRate = parseFloat(e.target.value);
    });
  
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
  
    // --- Styles ---
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
  
    loadVoices();
  })();
  
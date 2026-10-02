// NovaBot: the Novacane chat widget
// Adds the chat bubble and window to the page, sends messages to the Worker and
// shows replies. NovaBot can also listen (microphone) and talk back (speaker),
// using the Worker's free Cloudflare Workers AI allowance.
//
// On Squarespace it's loaded from the Worker with novabot.css (see
// README-SQUARESPACE.md). Optional attributes on the <script> tag:
//   data-worker="http://localhost:8787"  talk to a different Worker (testing)
//   data-closed                          start with the chat window closed
//                                        (it always starts closed on phones)

(function () {
  // Only set up once, even if the script is included twice
  if (document.getElementById("nv-chat-panel")) return;

  const script = document.currentScript || document.querySelector('script[src*="novabot.js"]');

  // ===== THINGS YOU CAN EDIT =====

  // The live Worker address
  const LIVE_WORKER_URL = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";

  // The booking page (the "Book a session" button)
  const BOOKING_LINK = "https://novacane.co.uk/bookings-contact";

  // The privacy policy (linked under the message box)
  const PRIVACY_LINK = "https://novacane.co.uk/privacy-policy";

  // The speech bubble that pops up over the chat button when the chat starts
  // closed, and how long to wait (in milliseconds) before it appears
  const TEASER = "Hi! I can help you with booking, sessions, prices & more.";
  const TEASER_DELAY = 1500;

  // When the open chat window sits over any of these on the page, it tucks
  // itself into the chat button so they can be clicked. It stays put while
  // someone is typing in it, hovering over it or using the mic. Set to "" to
  // turn this off.
  const MOVE_AWAY_FROM = 'a[href], button, input, select, textarea, label, iframe, video, form, [role="button"]';

  // Once tucked away, it only comes back by itself onto empty space: nothing
  // above, and none of these either, so it never pops up over something
  // someone is reading. It also has to have been still for COME_BACK_AFTER
  // (milliseconds), with no clicking, tapping or typing on the page since it
  // tucked and the mouse not over that spot. After coming back by itself
  // MAX_COMEBACKS times, it waits for the chat button.
  const READING = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figure, img, picture, svg, canvas, table, pre";
  const COME_BACK_AFTER = 2000;
  const MAX_COMEBACKS = 2;

  // ===== THE CHAT'S HTML =====

  // Talk to the Worker this script was loaded from, unless told otherwise
  const scriptOrigin = script ? new URL(script.src, location.href).origin : "";
  const WORKER_URL =
    (script && script.dataset.worker) ||
    (/\.workers\.dev$|\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(scriptOrigin) ? scriptOrigin : LIVE_WORKER_URL);

  const widget = document.createElement("div");
  widget.id = "nv-chat";
  widget.innerHTML = `
    <button id="nv-chat-toggle" type="button" aria-label="Open chat with NovaBot" aria-controls="nv-chat-panel" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z"/>
        <g class="nv-wave" fill="currentColor" stroke="none">
          <rect x="6.3" y="7.5" width="1.4" height="6" rx="0.7"/>
          <rect x="8.8" y="7.5" width="1.4" height="6" rx="0.7"/>
          <rect x="11.3" y="7.5" width="1.4" height="6" rx="0.7"/>
          <rect x="13.8" y="7.5" width="1.4" height="6" rx="0.7"/>
          <rect x="16.3" y="7.5" width="1.4" height="6" rx="0.7"/>
        </g>
      </svg>
    </button>

    <div id="nv-chat-teaser" hidden>
      <button class="nv-teaser-open" type="button" aria-controls="nv-chat-panel">
        <span class="nv-teaser-name">NovaBot</span>
        <span class="nv-teaser-text"></span>
      </button>
      <button class="nv-teaser-close" type="button" aria-label="Dismiss">×</button>
    </div>

    <div id="nv-chat-panel" role="dialog" aria-label="NovaBot, Novacane chat">
      <div class="nv-header">
        <div>
          <p class="nv-title">Novacane</p>
          <p class="nv-subtitle">Sessions, prices &amp; booking</p>
        </div>
        <button id="nv-chat-close" type="button" aria-label="Close chat">×</button>
      </div>

      <div id="nv-chat-messages"></div>

      <div class="nv-composer">
        <div class="nv-input-row">
          <textarea id="nv-chat-input" rows="1" placeholder="Type or tap the mic…" maxlength="1000" autocomplete="off" aria-label="Message NovaBot"></textarea>
          <button id="nv-chat-send" type="button">
            <span>Send</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 12h15M13 6l6 6-6 6"/>
            </svg>
          </button>
        </div>
        <div class="nv-tools">
          <button id="nv-mic" class="nv-tool" type="button" aria-pressed="false" title="Speak to NovaBot" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>
            </svg>
            <span>Speak</span>
          </button>
          <button id="nv-voice-toggle" class="nv-tool" type="button" aria-pressed="false" title="Turn on voice replies" hidden>
            <svg class="nv-when-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>
            </svg>
            <svg class="nv-when-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>
            </svg>
            <span>Voice replies</span>
          </button>
        </div>
      </div>

      <div class="nv-foot">
        <button id="nv-keep-closed" type="button" role="switch" aria-checked="false" title="Keep the chat closed on every page until you switch this off">
          <span class="nv-switch" aria-hidden="true">
            <span class="nv-knob">
              <!-- The Novacane sigil: a broken ring cut by the slanted N -->
              <svg class="nv-sigil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
                <g class="nv-sigil-ring">
                  <path d="M20.19 6.26A10 10 0 0 1 6.26 20.19"/>
                  <path d="M3.81 17.74A10 10 0 0 1 17.74 3.81"/>
                </g>
                <path class="nv-sigil-n" d="M3.9 20.1 11.3 7.5M12.5 8.3 13.5 16M14.7 16.5 20.1 3.9"/>
              </svg>
            </span>
          </span>
          <span class="nv-keep-label">Keep chat closed</span>
        </button>
        <p class="nv-privacy">Chats are saved for 90 days. <a>Privacy policy</a></p>
      </div>

      <a class="nv-book">Book a session</a>
    </div>
  `;
  widget.querySelector(".nv-book").href = BOOKING_LINK;
  widget.querySelector(".nv-privacy a").href = PRIVACY_LINK;
  widget.querySelector(".nv-teaser-text").textContent = TEASER;
  document.body.appendChild(widget);

  // Find the HTML pieces
  const toggle = document.getElementById("nv-chat-toggle");
  const panel = document.getElementById("nv-chat-panel");
  const list = document.getElementById("nv-chat-messages");
  const input = document.getElementById("nv-chat-input");
  const send = document.getElementById("nv-chat-send");
  const close = document.getElementById("nv-chat-close"); // optional
  const voiceToggle = document.getElementById("nv-voice-toggle");
  const mic = document.getElementById("nv-mic");
  const teaser = document.getElementById("nv-chat-teaser");
  const keepClosedSwitch = document.getElementById("nv-keep-closed");

  // Same sizes as the "Phones: full screen chat" part of novabot.css
  const PHONE = "(max-width: 480px), (max-height: 560px)";

  // ===== THE CHAT CARRIES OVER BETWEEN PAGES =====
  // Saved for this browser tab only (sessionStorage), so moving to another
  // page on the website keeps the conversation.

  function loadSaved() {
    try {
      return JSON.parse(sessionStorage.getItem("nv-chat")) || {};
    } catch (err) {
      return {};
    }
  }
  const saved = loadSaved();

  // Identifies this conversation in the studio's chat log
  const chatId =
    saved.chatId ||
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // The conversation so far (sent to the Worker each time)
  const history = Array.isArray(saved.history) ? saved.history : [];

  function saveChat() {
    const shown = [...list.children]
      .filter((div) => !div.classList.contains("nv-typing") && div.dataset.text)
      .map((div) => ({ text: div.dataset.text, who: div.classList.contains("nv-user") ? "user" : "bot" }));
    try {
      sessionStorage.setItem(
        "nv-chat",
        JSON.stringify({
          chatId,
          history: history.slice(-20),
          shown: shown.slice(-60),
          closed: panel.classList.contains("nv-closed"),
        })
      );
    } catch (err) {}
  }

  // NovaBot's opening lines. One is picked at random each visit.
  const GREETINGS = [
    "Welcome to Novacane. I'm NovaBot. How can I help with your session?",
    "Yo, welcome to Novacane 🎙️ I'm NovaBot. What are we working on?",
    "NovaBot here. What can I help you with?",
    "Welcome to Novacane 🎙️ Recording, mixing, production or something else? NovaBot can point you in the right direction.",
    "Hey! NovaBot here 👋 What brings you to Novacane?",
    "Welcome to Novacane Studio. I'm NovaBot. Looking to book a session, check pricing or find out what we can do for your project?",
    "What's good? 🎙️ NovaBot here. You making music, recording vocals, mixing a track or planning something bigger?",
    "Yo, welcome to Novacane 🎙️ I'm NovaBot.\nWhat are we working on: recording, mixing, production, voiceover, studio hire or something else?",
  ];

  // Said when someone reopens the chat after already talking
  const WELCOME_BACK = [
    "Welcome back. What are we sorting out this time?",
    "Back again? Let's get this project moving.",
    "NovaBot's ready. What do you need?",
    "Alright, let's get back to it. What are you working on?",
  ];

  function pick(lines) {
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // Is the chat window showing right now?
  function isShowing() {
    return getComputedStyle(panel).display !== "none";
  }

  // Open or close the chat window
  function openClose() {
    unlockAudio();
    setTucked(false);
    panel.classList.toggle("nv-closed");
    toggle.setAttribute("aria-expanded", isShowing() ? "true" : "false");
    if (isShowing()) {
      hideTeaser();
      // Coming back after already chatting? Say welcome back.
      if (history.length > 0 && list.lastElementChild.dataset.welcome !== "yes") {
        addMessage(pick(WELCOME_BACK), "bot").dataset.welcome = "yes";
        saveChat();
      }
      input.focus();
    } else {
      stopSpeaking();
      stopListening();
    }
    saveChat();
  }

  // ===== "KEEP CHAT CLOSED" SWITCH =====
  // When it's on, the chat stays closed on every page and every visit (no
  // opening by itself, no speech bubble) until it's switched off. The chat
  // button still opens it. Remembered in this browser (localStorage).

  function readKeepClosed() {
    try {
      return localStorage.getItem("nv-keep-closed") === "yes";
    } catch (err) {
      return false;
    }
  }

  let keepClosed = readKeepClosed();

  function setKeepClosed(on) {
    keepClosed = on;
    keepClosedSwitch.setAttribute("aria-checked", on ? "true" : "false");
    try {
      if (on) localStorage.setItem("nv-keep-closed", "yes");
      else localStorage.removeItem("nv-keep-closed");
    } catch (err) {}
    if (on) {
      hideTeaser();
      // Let the switch slide across, then close the chat
      setTimeout(() => {
        if (keepClosed && isShowing()) openClose();
      }, 350);
    }
  }

  // The little speech bubble above the chat button. Shown once per visit
  // while the chat is closed, until it's tapped, dismissed or the chat opens.
  function showTeaser() {
    let seen = null;
    try {
      seen = sessionStorage.getItem("nv-teaser-seen");
    } catch (err) {}
    if (seen || keepClosed || isShowing()) return;
    teaser.hidden = false;
    toggle.classList.add("nv-attention");
  }

  function hideTeaser() {
    if (teaser.hidden) return;
    teaser.hidden = true;
    toggle.classList.remove("nv-attention");
    try {
      sessionStorage.setItem("nv-teaser-seen", "yes");
    } catch (err) {}
  }

  // ===== THE CHAT BUTTON'S WAVEFORM =====
  // The bars in the chat button sway gently all the time. While music or
  // video plays on the page, or NovaBot is talking, they get busier. Where the
  // browser lets us hear the page's audio (files on this website), they follow
  // the actual sound. Muted videos (like background videos) don't count.

  const bars = toggle.querySelectorAll(".nv-wave rect");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const playing = new Set(); // media playing out loud right now
  const hearing = new WeakSet(); // media whose sound we're following
  let ears = null; // { context, analyser, levels } once needed
  let waveFrame = null;

  // Bass to treble: which frequency slices each bar follows
  const BANDS = [[1, 3], [3, 8], [8, 16], [16, 32], [32, 64]];

  // Only same-website (or CORS-enabled) media can be listened to. Trying it on
  // anything else would silence it, so those just get the busier sway.
  function canHear(media) {
    if (media.crossOrigin !== null) return true;
    const src = media.currentSrc;
    if (!src) return false;
    if (/^(blob|data):/.test(src)) return true;
    try {
      return new URL(src, location.href).origin === location.origin;
    } catch (err) {
      return false;
    }
  }

  async function hear(media) {
    if (hearing.has(media)) return;
    try {
      if (!ears) {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyser.connect(context.destination);
        ears = { context, analyser, levels: new Uint8Array(analyser.frequencyBinCount) };
      }
      // Don't wait forever if the browser won't start audio yet
      await Promise.race([ears.context.resume(), new Promise((done) => setTimeout(done, 300))]);
      // Routing sound through audio that isn't running would mute it
      if (ears.context.state !== "running") return;
      ears.context.createMediaElementSource(media).connect(ears.analyser);
      hearing.add(media);
    } catch (err) {}
  }

  function mediaChanged(media) {
    if (media.paused || media.ended || media.muted || media.volume === 0) {
      playing.delete(media);
      updateWave();
      return;
    }
    playing.add(media);
    if (!calm && canHear(media)) hear(media).then(updateWave);
    else updateWave();
  }

  function updateWave() {
    const live = !calm && [...playing].some((media) => hearing.has(media));
    toggle.classList.toggle("nv-live", live);
    toggle.classList.toggle("nv-playing", playing.size > 0 && !live);
    if (live && !waveFrame) waveFrame = requestAnimationFrame(drawWave);
    if (!live && waveFrame) {
      cancelAnimationFrame(waveFrame);
      waveFrame = null;
    }
  }

  // Move the bars and glow with the sound, every frame
  function drawWave() {
    ears.analyser.getByteFrequencyData(ears.levels);
    let total = 0;
    bars.forEach((bar, i) => {
      const [from, to] = BANDS[i];
      let sum = 0;
      for (let k = from; k < to; k++) sum += ears.levels[k];
      const level = sum / (to - from) / 255;
      total += level;
      bar.style.setProperty("--nv-bar", (0.25 + 0.75 * level).toFixed(3));
    });
    toggle.style.setProperty("--nv-level", (total / bars.length).toFixed(3));
    waveFrame = requestAnimationFrame(drawWave);
  }

  // ===== MOVING OUT OF THE WAY =====
  // See MOVE_AWAY_FROM at the top

  let tucked = false;
  let tuckedAt = 0;
  let comebacks = 0;
  let hovering = false;
  let dragging = false; // pressing on the chat, e.g. dragging its scrollbar
  let mouse = null; // where the mouse is, if there is one
  let lastPageUse = 0; // last click, tap or typing on the page itself
  let checkTimer = null;
  let comeBackTimer = null;

  // Where the window normally sits (worked out from the CSS, so it's right
  // even while the window is tucked away)
  function homeSpot() {
    const style = getComputedStyle(panel);
    const right = document.documentElement.clientWidth - parseFloat(style.right);
    const bottom = document.documentElement.clientHeight - parseFloat(style.bottom);
    return { left: right - panel.offsetWidth, top: bottom - panel.offsetHeight, right, bottom };
  }

  // Is the chat window, in its usual spot, sitting over any of these things
  // on the page?
  function covers(things) {
    if (!things) return false;
    const { left, top, right, bottom } = homeSpot();
    for (const el of document.querySelectorAll(things)) {
      if (widget.contains(el)) continue;
      // The part of it under the window, if any
      const box = el.getBoundingClientRect();
      const x1 = Math.max(box.left, left);
      const x2 = Math.min(box.right, right);
      const y1 = Math.max(box.top, top);
      const y2 = Math.min(box.bottom, bottom);
      if (x2 - x1 < 4 || y2 - y1 < 4) continue;
      // Check it's really showing there, not hidden behind something else
      const under = document
        .elementsFromPoint((x1 + x2) / 2, (y1 + y2) / 2)
        .find((found) => !widget.contains(found));
      if (under && el.contains(under)) return true;
    }
    return false;
  }

  // Is the visitor using the chat right now?
  function inUse() {
    return hovering || dragging || recording || panel.contains(document.activeElement);
  }

  function mouseOverHomeSpot() {
    if (!mouse) return false;
    const spot = homeSpot();
    return mouse.x >= spot.left && mouse.x <= spot.right && mouse.y >= spot.top && mouse.y <= spot.bottom;
  }

  // Tuck the chat window into the chat button, or bring it back
  function setTucked(on) {
    clearTimeout(comeBackTimer);
    if (on === tucked) return;
    tucked = on;
    if (on) tuckedAt = Date.now();
    panel.classList.toggle("nv-tucked", on);
    toggle.setAttribute("aria-expanded", isShowing() && !on ? "true" : "false");
    if (!on) toggle.classList.remove("nv-unread");
  }

  function checkPosition() {
    if (!isShowing() || matchMedia(PHONE).matches) return setTucked(false);
    if (inUse()) return;
    if (covers(MOVE_AWAY_FROM)) return setTucked(true);
    if (!tucked) return;
    // The spot's clear. Come back only if it stays that way for a while.
    comeBackTimer = setTimeout(maybeComeBack, COME_BACK_AFTER);
  }

  function maybeComeBack() {
    // Busy with the page since tucking (or just before)? Wait for the button.
    if (lastPageUse > tuckedAt - 1000) return;
    if (comebacks >= MAX_COMEBACKS || mouseOverHomeSpot()) return;
    if (!MOVE_AWAY_FROM || covers(MOVE_AWAY_FROM + ", " + READING)) return;
    comebacks++;
    setTucked(false);
  }

  // Wait for things to settle (scrolling, focus moving) before checking
  function checkSoon(delay) {
    clearTimeout(checkTimer);
    clearTimeout(comeBackTimer);
    checkTimer = setTimeout(checkPosition, delay);
  }

  // Clicking, tapping or typing on the page means they're busy with it
  function pageUsed(e) {
    if (widget.contains(e.target)) return;
    lastPageUse = Date.now();
    checkSoon(300);
  }

  // Size the message box to what's typed, between its CSS min and max heights
  function fitInput() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + 2 + "px";
  }

  // Add a message to the screen. "who" is "user" or "bot".
  function addMessage(text, who) {
    // A reply arrived while tucked away: make the chat button pulse
    if (who === "bot" && tucked) toggle.classList.add("nv-unread");
    const div = document.createElement("div");
    div.dataset.text = text;
    div.className = "nv-msg nv-" + who;
    setText(div, text);
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div;
  }

  // Show text with any web links made clickable (e.g. booking page, WhatsApp).
  // Built from text nodes, so nothing in a message can inject HTML.
  function setText(div, text) {
    div.dataset.text = text;
    div.textContent = "";
    text.split(/(https?:\/\/[^\s<>"']+)/).forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) div.appendChild(document.createTextNode(part));
        return;
      }
      // Leave trailing punctuation outside the link
      const trail = part.match(/[.,!?;:)]+$/);
      const url = trail ? part.slice(0, -trail[0].length) : part;
      const link = document.createElement("a");
      link.href = url;
      link.textContent = linkLabel(link, url);
      if (link.origin === location.origin) {
        // This website: same tab (the chat carries over)
        link.addEventListener("click", followSiteLink);
      } else {
        link.target = "_blank";
        link.rel = "noopener";
      }
      div.appendChild(link);
      if (trail) div.appendChild(document.createTextNode(trail[0]));
    });
  }

  // What a link says in the chat: long addresses get a friendly name
  function linkLabel(link, url) {
    if (/wa\.me\//.test(url)) return "WhatsApp Odysi";
    if (/acuityscheduling\.com$/.test(link.hostname)) {
      // A link with the time already selected: "Book Tue 6 Oct, 14:00"
      const chosen = decodeURIComponent(link.pathname).match(/\/datetime\/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (chosen) {
        const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
          .format(new Date(chosen[1] + "T00:00:00Z"))
          .replace(/,/g, "");
        return `Book ${day}, ${chosen[2]}`;
      }
      const params = new URL(link.href).searchParams;
      return params.get("appointmentType") || params.get("appointmentTypeIds[]") ? "Book this session" : "Booking calendar";
    }
    return url.replace(/^https?:\/\//, "");
  }

  // Join lines that were broken in the middle of a sentence.
  // Keeps real paragraph breaks and "-" / "1." list items on their own lines.
  function tidy(text) {
    return text
      .replace(/\r/g, "")
      .replace(/[ \t]*\n(?!\n|\s*([-•*]|\d+[.)])\s)[ \t]*/g, (match, _, offset, all) =>
        all[offset - 1] === "\n" ? match : " "
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Send what the visitor typed (or said)
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || send.disabled) return;

    stopSpeaking();
    input.value = "";
    fitInput();
    addMessage(text, "user");
    history.push({ role: "user", content: text });

    // Show "typing…" and stop double-sending
    send.disabled = true;
    const typing = addMessage("NovaBot is typing…", "bot");
    typing.classList.add("nv-typing");

    try {
      const res = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, chatId, page: location.pathname }),
      });
      const data = await res.json();

      if (data.reply) {
        const replyText = tidy(data.reply);
        setText(typing, replyText);
        history.push({ role: "assistant", content: data.reply });
        speak(replyText);
      } else {
        setText(typing, data.message || "Sorry, something went wrong. Please try again.");
        history.pop();
      }
    } catch (err) {
      setText(typing, "Sorry, I couldn't connect. Please try again.");
      history.pop();
    }

    // Swap "typing…" into a normal reply
    typing.classList.remove("nv-typing");
    saveChat();
    send.disabled = false;
    input.focus();
    list.scrollTop = list.scrollHeight;
  }

  // ===== NovaBot's voice (text to speech) =====
  // 1. If the visitor's device has a good British female voice (most phones,
  //    Chrome, Edge, Macs), NovaBot uses that: British, free, no download.
  // 2. Otherwise the Worker makes the speech (MeloTTS, female, American accent).
  // 3. If that's unavailable too, any English voice on the device reads it.

  const synth = window.speechSynthesis;
  const player = new Audio();
  let voiceOn = false;
  let britishVoice = null; // a good British female voice on this device, if any
  let browserVoice = null; // the best English voice on this device (last resort)
  let speakId = 0; // lets a newer reply cancel an older one still loading
  let unlocked = false;

  // Phones only allow audio after a tap, so "unlock" the player on the first tap
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    player.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    player.play().catch(() => {});
  }

  // Known good British female voices, best first:
  // Edge (Natural), Chrome, Apple, Windows, then Android's UK voice
  const BRITISH_FEMALE = [
    /(libby|sonia|maisie|hollie|bella|abbi|olivia).*natural/i,
    /google uk english female/i,
    /serena|kate|stephanie|martha|flo\b|shelley/i,
    /hazel|susan/i,
    /english united kingdom/i,
  ];
  // Robotic system voices (e.g. Linux) aren't good enough to be first choice
  const ROBOTIC = /espeak|pico|festival|mbrola/i;

  function chooseBrowserVoice() {
    const voices = synth.getVoices().filter((v) => !ROBOTIC.test(v.name));
    britishVoice = null;
    for (const pattern of BRITISH_FEMALE) {
      britishVoice = voices.find((v) => /^en[-_]GB/i.test(v.lang) && pattern.test(v.name));
      if (britishVoice) break;
    }
    const score = (v) =>
      (/^en[-_]GB/i.test(v.lang) ? 10 : /^en/i.test(v.lang) ? 4 : 0) +
      (/natural|neural|premium|enhanced/i.test(v.name) ? 5 : 0) +
      (/female|serena|libby|sonia|kate|stephanie|martha|hazel|susan|samantha|zira|aria|jenny/i.test(v.name) ? 6 : 0);
    browserVoice = britishVoice || synth.getVoices().sort((a, b) => score(b) - score(a))[0] || null;
  }

  // Make the reply sound right when read aloud
  function forSpeech(text) {
    return text
      .replace(/https?:\/\/\S+/g, "the link in the chat")
      .replace(/\b0\d{4}\s?\d{3}\s?\d{3}\b/g, (n) => n.replace(/\s/g, "").split("").join(" "))
      .replace(/\p{Extended_Pictographic}|\uFE0F/gu, "")
      .replace(/\bGBP\s?(?=\d)/g, "£")
      .replace(/(\d)\s?GBP\b/g, "$1 pounds")
      .replace(/£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g, sayPounds)
      .replace(/\b(pounds?)\s+sterling\b/gi, "$1")
      .replace(/\bsterling\b/gi, "pounds")
      .replace(/£/g, "pounds")
      .replace(/(?<![\d-])(\d{1,3})\s*[–—-]\s*(\d{1,3})(?![\d-])/g, "$1 to $2")
      .replace(/\s*\/\s*(hour|hr|song|track|session|day|person)\b/gi, " per $1")
      .replace(/(\w)\/(\w)/g, "$1 or $2")
      .replace(/^\s*[-•*]\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // "£50" -> "50 pounds", "£1" -> "1 pound", "£12.50" -> "12 pounds 50",
  // "£0.50" -> "50p" (so the voice doesn't say "sterling")
  function sayPounds(match, whole, pence) {
    const pounds = Number(whole.replace(/,/g, ""));
    const p = pence && pence !== "00" ? Number(pence) : 0;
    if (pounds === 0 && p) return p + "p";
    const said = pounds.toLocaleString("en-GB") + (pounds === 1 ? " pound" : " pounds");
    return p ? said + " " + p : said;
  }

  async function speak(text) {
    if (!voiceOn) return;
    stopSpeaking();
    const id = speakId;
    const words = forSpeech(text);
    if (!words) return;

    // Device has a good British voice: use it
    if (britishVoice) {
      speakWithBrowser(words);
      return;
    }

    try {
      const res = await fetch(WORKER_URL + "/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: words }),
      });
      if (!res.ok) throw new Error("Voice unavailable");
      const audio = await res.blob();
      if (id !== speakId) return; // stopped or replaced while loading
      URL.revokeObjectURL(player.src);
      player.src = URL.createObjectURL(audio);
      await player.play();
    } catch (err) {
      if (id === speakId) speakWithBrowser(words);
    }
  }

  // The device's own voice, one sentence at a time
  // (some browsers cut off long speech)
  function speakWithBrowser(words) {
    if (!synth || !browserVoice) return;
    (words.match(/[^.!?]+[.!?]*/g) || []).forEach((sentence) => {
      const line = new SpeechSynthesisUtterance(sentence.trim());
      line.lang = "en-GB";
      line.voice = browserVoice;
      line.rate = 1;
      synth.speak(line);
    });
  }

  function stopSpeaking() {
    speakId++;
    player.pause();
    if (synth) synth.cancel();
  }

  function setVoice(on) {
    voiceOn = on;
    voiceToggle.setAttribute("aria-pressed", on ? "true" : "false");
    voiceToggle.title = on ? "Voice replies on: tap to mute" : "Turn on voice replies";
    if (!on) stopSpeaking();
    try {
      localStorage.setItem("nv-voice", on ? "on" : "off");
    } catch (err) {}
  }

  if (voiceToggle) {
    if (synth) {
      chooseBrowserVoice();
      synth.addEventListener("voiceschanged", chooseBrowserVoice);
    }
    let saved = null;
    try {
      saved = localStorage.getItem("nv-voice");
    } catch (err) {}
    // Off unless the visitor has switched it on before
    setVoice(saved === "on");
    voiceToggle.hidden = false;

    // Glow gently until they've tried it once, so they notice it's there
    let tried = null;
    try {
      tried = localStorage.getItem("nv-voice-tried");
    } catch (err) {}
    if (!tried) voiceToggle.classList.add("nv-nudge");

    voiceToggle.addEventListener("click", () => {
      unlockAudio();
      setVoice(!voiceOn);
      voiceToggle.classList.remove("nv-nudge");
      try {
        localStorage.setItem("nv-voice-tried", "yes");
      } catch (err) {}
    });
  }

  // ===== Talking to NovaBot (speech to text) =====
  // Records the visitor, stops by itself when they go quiet, then the Worker
  // works out what they said (Whisper). Works in every modern browser.

  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let recording = null; // the current recording, while listening

  function setMicState(state) {
    // state: "idle", "listening" or "thinking"
    mic.classList.toggle("nv-listening", state === "listening");
    mic.setAttribute("aria-pressed", state === "listening" ? "true" : "false");
    mic.disabled = state === "thinking";
    input.placeholder =
      state === "listening" ? "Listening… tap the mic when you're done"
      : state === "thinking" ? "Working out what you said…"
      : "Type or tap the mic…";
  }

  async function startListening() {
    unlockAudio();
    stopSpeaking();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      addMessage("I can't hear you, as microphone access is blocked. You can still type your message.", "bot");
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener("dataavailable", (e) => chunks.push(e.data));

    // Watch the volume so it can stop by itself when they go quiet
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = Date.now();
    let spoke = false;
    let lastSound = Date.now();

    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const loud = Math.sqrt(sum / samples.length) > 0.02;
      const now = Date.now();
      if (loud) {
        spoke = true;
        lastSound = now;
      }
      if ((spoke && now - lastSound > 1500) || // paused after talking
          (!spoke && now - started > 7000) ||   // never said anything
          now - started > 20000) {              // 20 second limit
        stopListening();
      }
    }, 100);

    recorder.addEventListener("stop", async () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      context.close();
      recording = null;
      if (!spoke || chunks.length === 0) {
        setMicState("idle");
        return;
      }
      setMicState("thinking");
      try {
        const wav = await toWav(new Blob(chunks, { type: recorder.mimeType }));
        const res = await fetch(WORKER_URL + "/listen", {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav,
        });
        const data = await res.json();
        setMicState("idle");
        if (data.text) {
          input.value = data.text;
          sendMessage();
        } else if (!res.ok) {
          addMessage("Sorry, I couldn't make that out. Try again, or type your message.", "bot");
        }
      } catch (err) {
        setMicState("idle");
        addMessage("Sorry, I couldn't make that out. Try again, or type your message.", "bot");
      }
    });

    recording = recorder;
    recorder.start();
    setMicState("listening");
  }

  function stopListening() {
    if (recording && recording.state === "recording") recording.stop();
  }

  // Turn any recording into a small 16kHz mono WAV, which the Worker can
  // always read (Safari records in a format it can't)
  async function toWav(blob) {
    const decoder = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    decoder.close();

    const rate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const pcm = (await offline.startRendering()).getChannelData(0);

    const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + pcm.length * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);        // PCM
    view.setUint16(22, 1, true);        // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); // bytes per second
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);       // 16-bit
    text(36, "data");
    view.setUint32(40, pcm.length * 2, true);
    pcm.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
    return new Blob([view], { type: "audio/wav" });
  }

  if (canRecord && mic) {
    mic.hidden = false;
    mic.addEventListener("click", () => (recording ? stopListening() : startListening()));
  }

  // Carry on the chat from the last page, or greet the visitor (the greeting
  // is shown on screen only, not sent to the Worker)
  if (Array.isArray(saved.shown) && saved.shown.length) {
    saved.shown.forEach((message) => addMessage(message.text, message.who === "user" ? "user" : "bot"));
  } else {
    addMessage(pick(GREETINGS), "bot");
    saveChat();
  }

  // The chat window starts open, except on phones (where it would fill the
  // screen) or when the <script> tag says data-closed
  // (or if the visitor closed it on an earlier page)
  // (and always if the visitor switched on "Keep chat closed")
  keepClosedSwitch.setAttribute("aria-checked", keepClosed ? "true" : "false");
  if (keepClosed || (saved.closed && !matchMedia(PHONE).matches)) {
    panel.classList.add("nv-closed");
  } else if (matchMedia(PHONE).matches || (script && script.hasAttribute("data-closed"))) {
    panel.classList.add("nv-closed");
    setTimeout(showTeaser, TEASER_DELAY);
  } else {
    // Hold it back until the page has finished loading (5 seconds at most),
    // then show it with its animation. If it would land on something on the
    // page, it starts tucked away instead.
    panel.classList.add("nv-waiting");
    if (document.readyState === "complete") requestAnimationFrame(showPanel);
    else {
      window.addEventListener("load", showPanel);
      setTimeout(showPanel, 5000);
    }
  }

  function showPanel() {
    if (!panel.classList.contains("nv-waiting")) return;
    panel.classList.remove("nv-waiting");
    toggle.setAttribute("aria-expanded", "true");
    checkPosition();
  }

  // ===== THE ENQUIRY FORM =====
  // Links ending in #enquiry (NovaBot gives these out) scroll down to the
  // form on the page, e.g. novacane.co.uk/bookings-contact#enquiry

  function scrollToEnquiryForm() {
    if (location.hash !== "#enquiry") return;
    const form = document.querySelector(".sqs-block-form, .form-block, form");
    if (!form) return;
    const block = form.closest(".sqs-block") || form;
    // Leave room for a header that stays at the top of the screen
    const header = document.querySelector("#header, header");
    const headerStyle = header ? getComputedStyle(header).position : "";
    const headerHeight = headerStyle === "fixed" || headerStyle === "sticky" ? header.offsetHeight : 0;
    const top = block.getBoundingClientRect().top + window.scrollY - headerHeight - 24;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  }

  function goToEnquiryForm() {
    scrollToEnquiryForm();
    // Images above the form can still be loading and push it down: check again
    setTimeout(scrollToEnquiryForm, 900);
  }

  // A link in the chat to a page on this website
  function followSiteLink(e) {
    const link = e.currentTarget;
    if (link.pathname !== location.pathname || link.hash !== "#enquiry") return;
    // Already on that page: just scroll down to the form
    e.preventDefault();
    if (location.hash !== "#enquiry") window.history.replaceState(null, "", "#enquiry");
    if (matchMedia(PHONE).matches && isShowing()) openClose(); // full-screen chat would cover it
    goToEnquiryForm();
  }

  if (document.readyState === "complete") goToEnquiryForm();
  else window.addEventListener("load", goToEnquiryForm);
  window.addEventListener("hashchange", goToEnquiryForm);

  // Connect the buttons. If the chat is tucked away, the chat button brings
  // it back instead of closing it.
  toggle.addEventListener("click", () => {
    // Pressed before the page finished loading: show it now
    if (panel.classList.contains("nv-waiting")) {
      panel.classList.remove("nv-waiting");
      toggle.setAttribute("aria-expanded", "true");
      return input.focus();
    }
    if (!tucked) return openClose();
    setTucked(false);
    input.focus();
  });
  if (close) close.addEventListener("click", openClose);
  teaser.querySelector(".nv-teaser-open").addEventListener("click", openClose);
  teaser.querySelector(".nv-teaser-close").addEventListener("click", hideTeaser);
  keepClosedSwitch.addEventListener("click", () => setKeepClosed(!keepClosed));
  send.addEventListener("click", () => {
    unlockAudio();
    sendMessage();
  });
  input.addEventListener("keydown", function (e) {
    // Enter sends; Shift+Enter starts a new line
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      unlockAudio();
      sendMessage();
    }
  });
  // The message box grows with what's typed (up to about 5 lines)
  input.addEventListener("input", fitInput);

  // Move out of the way of the page when needed
  panel.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") hovering = true;
  });
  panel.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    hovering = false;
    checkSoon(600);
  });
  panel.addEventListener("focusout", () => checkSoon(300));
  // Dragging the scrollbar can take the pointer outside the chat: stay put until let go
  panel.addEventListener("pointerdown", () => (dragging = true));
  document.addEventListener(
    "pointerup",
    () => {
      if (!dragging) return;
      dragging = false;
      checkSoon(600);
    },
    true
  );
  document.addEventListener("pointerdown", pageUsed, true);
  document.addEventListener("focusin", pageUsed, true);
  document.addEventListener("keydown", pageUsed, true);
  document.addEventListener(
    "pointermove",
    (e) => {
      mouse = e.pointerType === "mouse" ? { x: e.clientX, y: e.clientY } : null;
    },
    { capture: true, passive: true }
  );
  document.addEventListener("scroll", () => checkSoon(150), { capture: true, passive: true });
  window.addEventListener("resize", () => checkSoon(150));
  window.addEventListener("load", () => checkSoon(300));

  // The chat button's waveform: page media (these events don't bubble, so
  // listen on the way down) and NovaBot's own voice
  ["playing", "pause", "ended", "emptied", "volumechange"].forEach((type) => {
    document.addEventListener(
      type,
      (e) => {
        if (e.target instanceof HTMLMediaElement) mediaChanged(e.target);
      },
      true
    );
    player.addEventListener(type, () => mediaChanged(player));
  });
  checkSoon(800);
})();

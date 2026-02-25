/**
 * ShopBot Chat Widget
 * ====================
 * A self-contained chat widget that clients embed with a single script tag.
 *
 * HOW TO EMBED ON A CLIENT WEBSITE:
 * ----------------------------------
 * <script
 *   src="https://your-app.railway.app/static/shopbot-widget.js"
 *   data-api-url="https://your-app.railway.app"
 *   data-api-key="your-secret-api-key-here"
 *   data-client-id="biocyte"
 *   data-primary-color="#2E7D32"
 *   data-bot-name="Bibi"
 *   data-welcome-message="Bună! Sunt Bibi, asistentul tău virtual. Cu ce te pot ajuta azi?"
 * ></script>
 *
 * PARAMETERS (all go in the <script> tag as data- attributes):
 *   data-api-url          - URL of your ShopBot backend (required)
 *   data-api-key          - Your secret API key (required)
 *   data-client-id        - Client identifier, matches knowledge/{id}.json (required)
 *   data-primary-color    - Main color for the widget (optional, default: #2563EB blue)
 *   data-bot-name         - Name shown in the chat header (optional, default: ShopBot)
 *   data-welcome-message  - First message the bot shows (optional)
 */

(function () {
  "use strict";

  // ===========================================================================
  // 1. CONFIGURATION
  // Read settings from the <script> tag's data- attributes
  // ===========================================================================

  // Find the script tag that loaded this file
  const scriptTag = document.currentScript;

  const CONFIG = {
    apiUrl: scriptTag.getAttribute("data-api-url") || "",
    apiKey: scriptTag.getAttribute("data-api-key") || "",
    clientId: scriptTag.getAttribute("data-client-id") || "default",
    primaryColor: scriptTag.getAttribute("data-primary-color") || "#2563EB",
    botName: scriptTag.getAttribute("data-bot-name") || "ShopBot",
    welcomeMessage:
      scriptTag.getAttribute("data-welcome-message") ||
      "Bună! Sunt asistentul virtual. Cu ce te pot ajuta?",
  };

  // Validate required config
  if (!CONFIG.apiUrl || !CONFIG.apiKey) {
    console.error(
      "ShopBot: Missing required data-api-url or data-api-key attributes on the script tag."
    );
    return;
  }

  // ===========================================================================
  // 2. SESSION ID
  // Generate a unique ID for this browser session so the server
  // can remember conversation history per user
  // ===========================================================================

  function generateSessionId() {
    // Try to reuse an existing session ID stored in sessionStorage
    // sessionStorage is cleared when the browser tab is closed
    let sessionId = sessionStorage.getItem("shopbot_session_id");
    if (!sessionId) {
      // Create a random ID: "sb_" + random string + timestamp
      sessionId =
        "sb_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      sessionStorage.setItem("shopbot_session_id", sessionId);
    }
    return sessionId;
  }

  const SESSION_ID = generateSessionId();

  // ===========================================================================
  // 3. STYLES
  // All CSS is injected into the page so we have no external dependencies
  // ===========================================================================

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      /* The chat bubble button in the bottom-right corner */
      #shopbot-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${CONFIG.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        z-index: 999998;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        font-size: 26px;
        line-height: 1;
      }
      #shopbot-bubble:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      }

      /* The main chat window */
      #shopbot-window {
        position: fixed;
        bottom: 96px;
        right: 24px;
        width: 360px;
        height: 520px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        z-index: 999999;
        display: none;             /* Hidden by default, shown when bubble clicked */
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
      }
      #shopbot-window.open {
        display: flex;
      }

      /* Chat header with bot name */
      #shopbot-header {
        background-color: ${CONFIG.primaryColor};
        color: white;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      #shopbot-header-avatar {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: rgba(255,255,255,0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }
      #shopbot-header-info {
        flex: 1;
      }
      #shopbot-header-name {
        font-weight: 600;
        font-size: 15px;
        line-height: 1.2;
      }
      #shopbot-header-status {
        font-size: 11px;
        opacity: 0.85;
      }
      #shopbot-close-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 20px;
        padding: 2px 6px;
        opacity: 0.8;
        line-height: 1;
        border-radius: 4px;
      }
      #shopbot-close-btn:hover { opacity: 1; background: rgba(255,255,255,0.15); }

      /* Messages area - scrollable */
      #shopbot-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #f8f9fa;
      }

      /* Individual message bubbles */
      .shopbot-msg {
        max-width: 82%;
        padding: 9px 13px;
        border-radius: 14px;
        line-height: 1.5;
        word-wrap: break-word;
        animation: shopbot-fadein 0.25s ease;
      }
      @keyframes shopbot-fadein {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Bot messages - left aligned, white bubble */
      .shopbot-msg.bot {
        background: #ffffff;
        color: #1a1a1a;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }

      /* User messages - right aligned, colored bubble */
      .shopbot-msg.user {
        background-color: ${CONFIG.primaryColor};
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }

      /* Typing indicator (three animated dots) */
      #shopbot-typing {
        display: none;             /* Hidden until bot is "thinking" */
        align-self: flex-start;
        background: white;
        padding: 10px 14px;
        border-radius: 14px;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      #shopbot-typing.visible { display: flex; align-items: center; gap: 4px; }
      .shopbot-dot {
        width: 7px;
        height: 7px;
        background: #aaa;
        border-radius: 50%;
        animation: shopbot-bounce 1.3s infinite ease-in-out;
      }
      .shopbot-dot:nth-child(2) { animation-delay: 0.2s; }
      .shopbot-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes shopbot-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30%            { transform: translateY(-6px); }
      }

      /* Input area at the bottom */
      #shopbot-input-area {
        padding: 10px 12px;
        border-top: 1px solid #e9ecef;
        display: flex;
        gap: 8px;
        background: #fff;
        flex-shrink: 0;
      }
      #shopbot-input {
        flex: 1;
        border: 1px solid #dee2e6;
        border-radius: 20px;
        padding: 9px 14px;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        resize: none;
        line-height: 1.4;
        max-height: 80px;
        overflow-y: auto;
        transition: border-color 0.2s;
      }
      #shopbot-input:focus { border-color: ${CONFIG.primaryColor}; }
      #shopbot-send-btn {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background-color: ${CONFIG.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: opacity 0.2s;
        align-self: flex-end;
      }
      #shopbot-send-btn:hover { opacity: 0.85; }
      #shopbot-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      /* Powered by footer */
      #shopbot-footer {
        text-align: center;
        padding: 5px;
        font-size: 10px;
        color: #aaa;
        background: #fff;
        border-top: 1px solid #f0f0f0;
      }
      #shopbot-footer a { color: #aaa; text-decoration: none; }

      /* Mobile responsive: full-screen on small screens */
      @media (max-width: 420px) {
        #shopbot-window {
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          border-radius: 0;
        }
        #shopbot-bubble {
          bottom: 16px;
          right: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ===========================================================================
  // 4. HTML STRUCTURE
  // Build and inject the chat window HTML into the page
  // ===========================================================================

  function buildWidget() {
    // --- Chat bubble button ---
    const bubble = document.createElement("button");
    bubble.id = "shopbot-bubble";
    bubble.setAttribute("aria-label", "Open chat");
    bubble.innerHTML = "💬"; // Chat icon
    document.body.appendChild(bubble);

    // --- Chat window ---
    const chatWindow = document.createElement("div");
    chatWindow.id = "shopbot-window";
    chatWindow.setAttribute("role", "dialog");
    chatWindow.setAttribute("aria-label", `${CONFIG.botName} chat`);

    chatWindow.innerHTML = `
      <div id="shopbot-header">
        <div id="shopbot-header-avatar">🤖</div>
        <div id="shopbot-header-info">
          <div id="shopbot-header-name">${CONFIG.botName}</div>
          <div id="shopbot-header-status">● Online</div>
        </div>
        <button id="shopbot-close-btn" aria-label="Close chat">✕</button>
      </div>

      <div id="shopbot-messages" aria-live="polite">
        <!-- Messages are added here dynamically -->
        <div id="shopbot-typing">
          <span class="shopbot-dot"></span>
          <span class="shopbot-dot"></span>
          <span class="shopbot-dot"></span>
        </div>
      </div>

      <div id="shopbot-input-area">
        <textarea
          id="shopbot-input"
          placeholder="Scrie un mesaj..."
          rows="1"
          aria-label="Chat input"
        ></textarea>
        <button id="shopbot-send-btn" aria-label="Send message">
          <!-- Send arrow icon (SVG inline, no external deps) -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <div id="shopbot-footer">
        Powered by <a href="#" target="_blank">ShopBot</a>
      </div>
    `;

    document.body.appendChild(chatWindow);
  }

  // ===========================================================================
  // 5. CHAT LOGIC
  // Functions to open/close the widget, send messages, display replies
  // ===========================================================================

  let isOpen = false;
  let isWaiting = false; // True while waiting for API response (prevents spam)

  function openChat() {
    isOpen = true;
    document.getElementById("shopbot-window").classList.add("open");
    document.getElementById("shopbot-bubble").innerHTML = "✕"; // Change icon to X
    document.getElementById("shopbot-input").focus();
  }

  function closeChat() {
    isOpen = false;
    document.getElementById("shopbot-window").classList.remove("open");
    document.getElementById("shopbot-bubble").innerHTML = "💬";
  }

  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  /**
   * Adds a message bubble to the chat window.
   * @param {string} text - The message text to display
   * @param {string} role - "bot" or "user"
   */
  function addMessage(text, role) {
    const messagesDiv = document.getElementById("shopbot-messages");
    const typingIndicator = document.getElementById("shopbot-typing");

    const msgDiv = document.createElement("div");
    msgDiv.className = `shopbot-msg ${role}`;
    // Convert newlines to <br> for multi-line responses
    msgDiv.innerHTML = text.replace(/\n/g, "<br>");

    // Insert BEFORE the typing indicator (which stays at the bottom)
    messagesDiv.insertBefore(msgDiv, typingIndicator);

    // Auto-scroll to the bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function showTyping() {
    document.getElementById("shopbot-typing").classList.add("visible");
    const messagesDiv = document.getElementById("shopbot-messages");
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function hideTyping() {
    document.getElementById("shopbot-typing").classList.remove("visible");
  }

  /**
   * Sends the user's message to the ShopBot API and displays the response.
   */
  async function sendMessage() {
    const input = document.getElementById("shopbot-input");
    const sendBtn = document.getElementById("shopbot-send-btn");
    const text = input.value.trim();

    // Don't send empty messages or while waiting for a response
    if (!text || isWaiting) return;

    // Clear the input field and reset its height
    input.value = "";
    input.style.height = "auto";

    // Display the user's message in the chat
    addMessage(text, "user");

    // Set loading state
    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      // Call the ShopBot API
      const response = await fetch(`${CONFIG.apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": CONFIG.apiKey,
        },
        body: JSON.stringify({
          message: text,
          session_id: SESSION_ID,
          client_id: CONFIG.clientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const data = await response.json();

      // Display the bot's reply
      hideTyping();
      addMessage(data.reply, "bot");

    } catch (error) {
      console.error("ShopBot error:", error);
      hideTyping();
      addMessage(
        "Îmi pare rău, a apărut o eroare de conexiune. Te rog încearcă din nou.",
        "bot"
      );
    } finally {
      // Always re-enable input after response (or error)
      isWaiting = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ===========================================================================
  // 6. EVENT LISTENERS
  // Wire up button clicks and keyboard shortcuts
  // ===========================================================================

  function attachEventListeners() {
    // Toggle chat when bubble is clicked
    document.getElementById("shopbot-bubble").addEventListener("click", toggleChat);

    // Close chat when X button in header is clicked
    document.getElementById("shopbot-close-btn").addEventListener("click", closeChat);

    // Send button click
    document.getElementById("shopbot-send-btn").addEventListener("click", sendMessage);

    // Send on Enter key (Shift+Enter = new line)
    document.getElementById("shopbot-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // Prevent newline in textarea
        sendMessage();
      }
    });

    // Auto-resize textarea as user types
    document.getElementById("shopbot-input").addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 80) + "px";
    });
  }

  // ===========================================================================
  // 7. INITIALIZATION
  // Run everything after the page DOM is ready
  // ===========================================================================

  function init() {
    injectStyles();
    buildWidget();
    attachEventListeners();

    // Show the welcome message after a short delay (feels more natural)
    setTimeout(function () {
      addMessage(CONFIG.welcomeMessage, "bot");
    }, 500);
  }

  // Wait for the DOM to be ready before building the widget
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM is already ready (script loaded with defer or at end of body)
    init();
  }

})(); // End of IIFE (Immediately Invoked Function Expression)
      // The IIFE wrapper prevents our variables from leaking into the global scope

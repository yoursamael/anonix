let userId = sessionStorage.getItem("anonyx_sid");
if (!userId) {
  userId = localStorage.getItem("anonyx_user") || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `u_${Date.now()}`);
  sessionStorage.setItem("anonyx_sid", userId);
  localStorage.setItem("anonyx_user", userId);
}

const socket = io({ query: { userId } });

let room = null;
let encryptionKey = null;
let chatMode = "dm";
let groupRoomId = null;
let replyTo = null;
let matchStartedAt = null;
let chatTimerInterval = null;
let isMuted = sessionStorage.getItem("anonyx_sounds_muted") === "1";
let pendingImageFile = null;
let typingTimeout = null;
let groupOwnerUserId = null;
let groupInviteLocked = true;
let lastReadAllSent = 0;

const getEl = (id) => document.getElementById(id);

const chatPageRoot = getEl("chatPageRoot");
const chatTitle = getEl("chatTitle");
const chatMenuBtn = getEl("chatMenuBtn");
const chatBackBtn = getEl("chatBackBtn");
const chatDrawer = getEl("chatDrawer");
const chatDrawerBackdrop = getEl("chatDrawerBackdrop");
const groupInviteBar = getEl("groupInviteBar");
const groupInviteGuestHint = getEl("groupInviteGuestHint");
const groupInviteCodeDisplay = getEl("groupInviteCodeDisplay");
const copyInviteBtn = getEl("copyInviteBtn");
const groupQrImg = getEl("groupQrImg");
const readReceiptsToggle = getEl("readReceiptsToggle");
const themeSelectDrawer = getEl("themeSelectDrawer");
const chatTimerDrawer = getEl("chatTimerDrawer");
const muteBtnDrawer = getEl("muteBtnDrawer");
const reportBtnDrawer = getEl("reportBtnDrawer");
const skipBtnDrawer = getEl("skipBtnDrawer");
const leaveGroupBtnDrawer = getEl("leaveGroupBtnDrawer");
const messages = getEl("messages");
const typingDiv = getEl("typing");
const replyBox = getEl("replyBox");
const replyText = getEl("replyText");
const msgInput = getEl("msg");
const imgInput = getEl("imgInput");
const onlineEl = getEl("online");
const setupSection = getEl("setup");
const chatSection = getEl("chat");
const searchState = getEl("searchState");
const chatTimer = getEl("chatTimer");
const imagePreview = getEl("imagePreview");
const imagePreviewTag = getEl("imagePreviewTag");
const imagePreviewName = getEl("imagePreviewName");
const matchQuality = getEl("matchQuality");
const chatHint = getEl("chatHint");
const themeToggle = getEl("themeToggle");
const themeSelect = getEl("themeSelect");
const muteBtn = getEl("muteBtn");
const leaveGroupBtn = getEl("leaveGroupBtn");
const groupCreateBtn = getEl("groupCreateBtn");
const groupJoinBtn = getEl("groupJoinBtn");
const groupJoinInput = getEl("groupJoinInput");
const startBtn = getEl("startBtn");
const sendBtn = getEl("sendBtn");
const skipBtn = getEl("skipBtn");
const reportBtn = getEl("reportBtn");
const cancelReplyBtn = getEl("cancelReplyBtn");
const imgBtn = getEl("imgBtn");
const cancelImageBtn = getEl("cancelImageBtn");

if (window.AnonyxExperiments) {
  AnonyxExperiments.bootstrap(userId).catch(() => {});
}

function cleanupOldMessages() {
  if (!messages) return;
  const allMessages = messages.querySelectorAll('.message');
  if (allMessages.length > 200) {
    for (let i = 0; i < 50; i++) {
      allMessages[i].remove();
    }
    addSystem("Note: Older messages cleared for performance.");
  }
}

function attachReactionListener(div, msgId) {
  let lastClick = 0;
  div.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastClick < 300 && msgId && room) {
      socket.emit("message:reaction", { msgId, reaction: "❤️" });
      applyReactionUI(div, "❤️");
    }
    lastClick = now;
  });
}

function applyReactionUI(el, emoji) {
  let reactBox = el.querySelector('.msg-reaction-badge');
  if (!reactBox) {
    reactBox = document.createElement('span');
    reactBox.className = 'msg-reaction-badge';
    el.appendChild(reactBox);
  }
  reactBox.innerText = emoji;
  if (navigator.vibrate) navigator.vibrate(12);
}

function requestPushPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function smartScroll(container, force = false) {
  if (!container) return;
  const scroll = () => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldStick = force || distanceFromBottom < 150;
    if (shouldStick) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  };
  setTimeout(scroll, 50);
}

function throttle(fn, wait = 450) {
  let last = 0;
  let timeout = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      if (timeout) { clearTimeout(timeout); timeout = null; }
      fn(...args);
      return;
    }
    if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  };
}

const searchHints = [
  "Finding someone compatible…",
  "Scanning active users…",
  "Matching interests…",
  "Looking for a better vibe…",
  "Almost there…"
];

let searchHintTimer = null;

function startSearchHints() {
  let idx = 0;
  clearInterval(searchHintTimer);
  if (!searchState) return;
  searchState.innerText = searchHints[0];
  searchHintTimer = setInterval(() => {
    if (searchState && !searchState.classList.contains("hidden")) {
      idx = (idx + 1) % searchHints.length;
      searchState.innerText = searchHints[idx];
    }
  }, 1800);
}

function stopSearchHints() {
  clearInterval(searchHintTimer);
  searchHintTimer = null;
}

function setSendLoading(loading) {
  if (!sendBtn) return;
  sendBtn.classList.toggle("loading", !!loading);
  sendBtn.disabled = !!loading;
}

function updateSessionEnergy() {
  if (!messages || !matchQuality || chatMode !== "dm" || !room) return;
  const total = messages.querySelectorAll(".message.me, .message.stranger").length;
  if (total >= 20) matchQuality.innerText = "Strong vibe";
  else if (total >= 10) matchQuality.innerText = "Good flow";
  else if (total >= 4) matchQuality.innerText = "Warm";
  else matchQuality.innerText = "New match";
}

function readReceiptsOn() {
  return localStorage.getItem("anonyx_read_receipts") !== "0";
}

function generateMsgId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function setConversationMode(on) {
  if (chatPageRoot) chatPageRoot.classList.toggle("chat-page--conversation", !!on);
}

function setChatHeaderTitle(title, subtitle) {
  if (chatTitle) chatTitle.textContent = title || "Chat";
  if (chatHint && subtitle != null) chatHint.textContent = subtitle;
}

function isGroupHost() {
  return groupOwnerUserId && groupOwnerUserId === userId;
}

function hideGroupInviteUi() {
  if (groupInviteBar) groupInviteBar.classList.add("hidden");
  if (groupInviteGuestHint) groupInviteGuestHint.classList.add("hidden");
}

function updateGroupInviteUi() {
  if (chatMode !== "group" || !groupRoomId) {
    hideGroupInviteUi();
    return;
  }
  const code = groupRoomId.replace(/^grp-/, "");
  if (groupInviteCodeDisplay) groupInviteCodeDisplay.textContent = code;
  const showHostTools = !groupInviteLocked || isGroupHost();
  if (showHostTools) {
    if (groupInviteBar) groupInviteBar.classList.remove("hidden");
    if (groupInviteGuestHint) groupInviteGuestHint.classList.add("hidden");
    const joinUrl = `${location.origin}${location.pathname}?group=${encodeURIComponent(code)}`;
    if (groupQrImg) {
      groupQrImg.src = `/api/qr.svg?d=${encodeURIComponent(joinUrl)}`;
    }
  } else {
    if (groupInviteBar) groupInviteBar.classList.add("hidden");
    if (groupInviteGuestHint) groupInviteGuestHint.classList.remove("hidden");
  }
}

function openChatDrawer() {
  if (!chatDrawer || !chatDrawerBackdrop) return;
  chatDrawer.classList.add("is-open");
  chatDrawerBackdrop.classList.add("is-open");
  chatDrawer.setAttribute("aria-hidden", "false");
  chatDrawerBackdrop.setAttribute("aria-hidden", "false");
  chatMenuBtn?.setAttribute("aria-expanded", "true");
}

function closeChatDrawer() {
  if (!chatDrawer || !chatDrawerBackdrop) return;
  chatDrawer.classList.remove("is-open");
  chatDrawerBackdrop.classList.remove("is-open");
  chatDrawer.setAttribute("aria-hidden", "true");
  chatDrawerBackdrop.setAttribute("aria-hidden", "true");
  chatMenuBtn?.setAttribute("aria-expanded", "false");
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (chatDrawer?.classList.contains("is-open")) closeChatDrawer();
});

function syncMuteUi() {
  const label = isMuted ? "Sound off" : "Sound on";
  if (muteBtn) muteBtn.textContent = label;
  if (muteBtnDrawer) muteBtnDrawer.textContent = label;
}

if (readReceiptsToggle) {
  readReceiptsToggle.checked = readReceiptsOn();
  readReceiptsToggle.addEventListener("change", () => {
    localStorage.setItem("anonyx_read_receipts", readReceiptsToggle.checked ? "1" : "0");
  });
}

if (themeSelectDrawer && themeSelect) {
  themeSelectDrawer.value = themeSelect.value;
  themeSelectDrawer.addEventListener("change", () => {
    themeSelect.value = themeSelectDrawer.value;
    themeSelect.dispatchEvent(new Event("change"));
  });
  themeSelect.addEventListener("change", () => {
    if (themeSelectDrawer) themeSelectDrawer.value = themeSelect.value;
  });
}

chatMenuBtn?.addEventListener("click", () => openChatDrawer());
chatDrawerBackdrop?.addEventListener("click", () => closeChatDrawer());
muteBtnDrawer?.addEventListener("click", () => muteBtn?.click());
reportBtnDrawer?.addEventListener("click", () => {
  reportBtn?.click();
  closeChatDrawer();
});
skipBtnDrawer?.addEventListener("click", () => {
  skipBtn?.click();
  closeChatDrawer();
});
leaveGroupBtnDrawer?.addEventListener("click", () => {
  leaveGroupBtn?.click();
  closeChatDrawer();
});

copyInviteBtn?.addEventListener("click", async () => {
  const code = groupRoomId ? groupRoomId.replace(/^grp-/, "") : "";
  if (!code) return;
  const joinUrl = `${location.origin}${location.pathname}?group=${encodeURIComponent(code)}`;
  try {
    await navigator.clipboard.writeText(joinUrl);
    copyInviteBtn.textContent = "Copied!";
    setTimeout(() => {
      copyInviteBtn.textContent = "Copy link";
    }, 2000);
  } catch {
    prompt("Copy this link:", joinUrl);
  }
});

chatBackBtn?.addEventListener("click", () => {
  const msg = chatMode === "group" ? "Leave this group and go back?" : "Leave this chat? Your match will end.";
  if (!confirm(msg)) return;
  if (chatMode === "group") leaveGroupChat();
  else skip();
  setConversationMode(false);
  closeChatDrawer();
});

function tryEmitReadAll() {
  if (chatMode !== "dm" || !readReceiptsOn()) return;
  const el = messages;
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight > 100) return;
  const now = Date.now();
  if (now - lastReadAllSent < 3200) return;
  lastReadAllSent = now;
  socket.emit("dm:readAll");
}

messages?.addEventListener("scroll", () => tryEmitReadAll(), { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tryEmitReadAll();
});

const urlGroup = new URLSearchParams(location.search).get("group");
if (urlGroup && groupJoinInput) {
  groupJoinInput.value = urlGroup.trim();
}

syncMuteUi();
syncComposerState();

socket.on("session:sync", (s) => {
  if (!s) return;
  if (s.mode === "idle") {
    if (room || encryptionKey || groupRoomId) {
      const wasOpen = chatSection && !chatSection.classList.contains("hidden");
      stopSearchHints();
      resetGroupClientState();
      if (wasOpen) {
        if (setupSection) setupSection.classList.remove("hidden");
        if (chatSection) chatSection.classList.add("hidden");
        if (messages) messages.innerHTML = "";
        if (matchQuality) matchQuality.innerText = "Ready";
        setConversationMode(false);
        addSystem("You are not in an active chat room. Use Start Chat or join a group when you are ready.");
      }
    }
    return;
  }
  if (s.mode === "group" && s.groupRoomId) {
    chatMode = "group";
    groupRoomId = s.groupRoomId;
    encryptionKey = s.groupRoomId;
    room = true;
    groupOwnerUserId = s.ownerUserId || null;
    groupInviteLocked = s.inviteLocked !== false;
    openGroupShell(s.inviteCode ? `Code · ${s.inviteCode}` : "Group room", s.inviteCode || "");
    return;
  }
  if (s.mode === "dm" && s.active) {
    chatMode = "dm";
    groupRoomId = null;
    room = true;
    encryptionKey = "true";
    if (setupSection) setupSection.classList.add("hidden");
    if (chatSection) chatSection.classList.remove("hidden");
    if (searchState) searchState.classList.add("hidden");
    if (matchQuality) matchQuality.innerText = "Matched";
    setChatHeaderTitle("Stranger", "Connected. Be respectful and use report if needed.");
    setConversationMode(true);
    if (leaveGroupBtn) leaveGroupBtn.classList.add("hidden");
    if (leaveGroupBtnDrawer) leaveGroupBtnDrawer.classList.add("hidden");
    if (skipBtn) skipBtn.classList.remove("hidden");
    if (reportBtn) reportBtn.classList.remove("hidden");
  }
});

function resetGroupClientState() {
  chatMode = "dm";
  groupRoomId = null;
  encryptionKey = null;
  room = null;
  groupOwnerUserId = null;
  groupInviteLocked = true;
  hideGroupInviteUi();
  if (groupQrImg) groupQrImg.removeAttribute("src");
  if (leaveGroupBtn) leaveGroupBtn.classList.add("hidden");
  if (leaveGroupBtnDrawer) leaveGroupBtnDrawer.classList.add("hidden");
  if (skipBtn) skipBtn.classList.remove("hidden");
  if (reportBtn) reportBtn.classList.remove("hidden");
}

function openGroupShell(subtitle, codeForTitle) {
  stopSearchHints();
  chatMode = "group";
  if (setupSection) setupSection.classList.add("hidden");
  if (chatSection) chatSection.classList.remove("hidden");
  if (messages) messages.innerHTML = "";
  cancelReply();
  clearImagePreview();
  stopTimer();
  if (searchState) searchState.classList.add("hidden");
  if (matchQuality) matchQuality.innerText = "Group";
  const title = codeForTitle ? `Group · ${codeForTitle}` : "Group";
  setChatHeaderTitle(title, subtitle || "Group room — stay respectful.");
  setConversationMode(true);
  if (leaveGroupBtn) leaveGroupBtn.classList.remove("hidden");
  if (leaveGroupBtnDrawer) leaveGroupBtnDrawer.classList.remove("hidden");
  if (skipBtn) skipBtn.classList.add("hidden");
  if (reportBtn) reportBtn.classList.add("hidden");
  updateGroupInviteUi();
}

function leaveGroupChat() {
  stopSearchHints();
  socket.emit("group:leave");
  resetGroupClientState();
  if (setupSection) setupSection.classList.remove("hidden");
  if (chatSection) chatSection.classList.add("hidden");
  if (messages) messages.innerHTML = "";
  if (matchQuality) matchQuality.innerText = "Ready";
  syncComposerState();
  setConversationMode(false);
}

function startChat() {
  requestPushPermission();
  const gender = getEl("gender")?.value || "unspecified";
  const preference = getEl("preference")?.value || "both";
  const language = "en";
  const interests = [];
  resetGroupClientState();
  socket.emit("start", { gender, preference, language, interests });
  if (setupSection) setupSection.classList.add("hidden");
  if (chatSection) chatSection.classList.remove("hidden");
  if (messages) messages.innerHTML = "";
  if (searchState) {
    searchState.classList.remove("hidden");
    searchState.innerText = "Finding someone...";
  }
  if (matchQuality) matchQuality.innerText = "Searching";
  setChatHeaderTitle("Matching", "Looking for someone…");
  setConversationMode(true);
  startSearchHints();
  addSystem("🔎 Looking for stranger...");
}

function updateChatTimer() {
  let text = "00:00";
  if (matchStartedAt) {
    const seconds = Math.floor((Date.now() - matchStartedAt) / 1000);
    const min = String(Math.floor(seconds / 60)).padStart(2, "0");
    const sec = String(seconds % 60).padStart(2, "0");
    text = `${min}:${sec}`;
  }
  if (chatTimer) chatTimer.textContent = text;
  if (chatTimerDrawer) chatTimerDrawer.textContent = text;
}

function startTimer() {
  clearInterval(chatTimerInterval);
  matchStartedAt = Date.now();
  updateChatTimer();
  chatTimerInterval = setInterval(updateChatTimer, 1000);
}

function stopTimer() {
  clearInterval(chatTimerInterval);
  matchStartedAt = null;
  updateChatTimer();
}

function playTick() {
  if (isMuted) return;
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 550;
    gainNode.gain.value = 0.03;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
  } catch (error) {}
}

socket.on("online", (count) => {
  if (onlineEl) onlineEl.innerText = `Users Online: ${count}`;
});

socket.on("searching", () => {
  if (chatMode === "group") return;
  room = null;
  encryptionKey = null;
  stopTimer();
  if (matchQuality) matchQuality.innerText = "Searching";
  if (searchState) searchState.classList.remove("hidden");
  startSearchHints();
});

socket.on("tabLimitExceeded", (msg) => {
  alert(msg);
});

socket.on("matched", (data) => {
  if (document.visibilityState === "hidden") {
    new Notification("New Match! 💬", {
      body: "Someone is waiting to chat with you.",
      icon: "/favicon.svg"
    });
  }
  chatMode = "dm";
  groupRoomId = null;
  room = true;
  encryptionKey = "true";
  if (messages) messages.innerHTML = "";
  cancelReply();
  stopTimer();
  startTimer();
  stopSearchHints();
  if (searchState) searchState.classList.add("hidden");
  if (matchQuality) matchQuality.innerText = "Matched";
  setChatHeaderTitle("Stranger", "Connected. Be respectful and use report if needed.");
  setConversationMode(true);
  if (leaveGroupBtn) leaveGroupBtn.classList.add("hidden");
  if (leaveGroupBtnDrawer) leaveGroupBtnDrawer.classList.add("hidden");
  if (skipBtn) skipBtn.classList.remove("hidden");
  if (reportBtn) reportBtn.classList.remove("hidden");
  addSystem("💞 Connected with someone special! 💞");
  if (navigator.vibrate) {
    try { navigator.vibrate(120); } catch (_) {}
  }
  msgInput?.focus();
  const popup = getEl("matchPopup");
  if (popup) {
    popup.classList.add("show");
    setTimeout(() => popup.classList.remove("show"), 2000);
  }
});

socket.on("system", (msg) => {
  addSystem(msg);
  if (/Searching|Waiting/i.test(msg)) {
    if (searchState) {
      searchState.classList.remove("hidden");
      startSearchHints();
    }
    stopTimer();
  }
});

function findMeMessageByMsgId(mid) {
  if (!mid || !messages) return null;
  for (const el of messages.querySelectorAll(".message.me")) {
    if (el.dataset.msgId === mid) return el;
  }
  return null;
}

socket.on("messageAck", (payload) => {
  setSendLoading(false);
  const mid = payload && payload.msgId;
  let el = mid ? findMeMessageByMsgId(mid) : null;
  if (!el && messages) {
    const pend = messages.querySelector(".message.me.pending");
    if (pend) el = pend;
  }
  if (el) {
    el.classList.remove("pending");
    const ticks = el.querySelector(".msg-ticks");
    if (ticks) ticks.dataset.state = "sent";
  }
});

socket.on("dm:receipt", (p) => {
  if (chatMode !== "dm" || !p) return;
  if (p.kind === "delivered" && p.msgId) {
    const el = findMeMessageByMsgId(p.msgId);
    const ticks = el && el.querySelector(".msg-ticks");
    if (ticks) ticks.dataset.state = "delivered";
  }
  if (p.kind === "read_all" && messages) {
    messages.querySelectorAll(".message.me .msg-ticks").forEach((ticks) => {
      if (ticks.dataset.state && ticks.dataset.state !== "sending") ticks.dataset.state = "read";
    });
  }
});

socket.on("message:reaction", ({ msgId, reaction }) => {
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) applyReactionUI(el, reaction);
});

socket.on("group:created", (payload) => {
  if (!payload || !payload.roomId) return;
  groupRoomId = payload.roomId;
  encryptionKey = payload.roomId;
  room = true;
  groupOwnerUserId = payload.ownerUserId || userId;
  groupInviteLocked = payload.inviteLocked !== false;
  openGroupShell("Share the link or code with people you trust.", payload.inviteCode || "");
  addSystem("Group created. Share the code so others can join.");
});

socket.on("group:joined", (payload) => {
  if (!payload || !payload.roomId) return;
  groupRoomId = payload.roomId;
  encryptionKey = payload.roomId;
  room = true;
  groupOwnerUserId = payload.ownerUserId || null;
  groupInviteLocked = payload.inviteLocked !== false;
  openGroupShell("You are in this group.", payload.inviteCode || "");
  addSystem("You joined the group.");
});

socket.on("group:roster", (payload) => {
  const n = payload && typeof payload.memberCount === "number" ? payload.memberCount : "?";
  if (matchQuality) matchQuality.innerText = `Group (${n})`;
  if (payload && payload.ownerUserId) groupOwnerUserId = payload.ownerUserId;
  if (payload && typeof payload.inviteLocked === "boolean") groupInviteLocked = payload.inviteLocked;
  updateGroupInviteUi();
});

socket.on("group:message", (data) => {
  if (!encryptionKey) return;
  const who = data.senderId ? String(data.senderId).slice(0, 10) : "Member";
  if (data.img) {
    try {
      const decryptedImg = CryptoJS.AES.decrypt(data.img, encryptionKey).toString(CryptoJS.enc.Utf8);
      addStrangerImage(decryptedImg, data.replyTo || null, data.imageId || null, data.expiresIn || 10000, who);
    } catch (e) {
      addStrangerImage("", data.replyTo || null, data.imageId || null, data.expiresIn || 10000, who);
    }
  } else {
    try {
      const decryptedMsg = CryptoJS.AES.decrypt(data.msg, encryptionKey).toString(CryptoJS.enc.Utf8);
      addStranger(decryptedMsg, data.replyTo || null, who);
    } catch (e) {
      addStranger("Could not decrypt message", data.replyTo || null, who);
    }
  }
  if (typingDiv) typingDiv.innerText = "";
  playTick();
});

socket.on("group:messageAck", () => {
  const pending = document.querySelector(".message.pending");
  if (pending) pending.classList.remove("pending");
  setSendLoading(false);
});

socket.on("group:typing", () => {
  if (typingDiv) {
    typingDiv.innerHTML = `<span class="typing-indicator">Someone is typing<span class="typing-dots"><span></span><span></span><span></span></span></span>`;
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (typingDiv) typingDiv.innerText = "";
  }, 1200);
});

socket.on("group:shutdown", () => {
  addSystem("This group room was closed.");
  resetGroupClientState();
  if (setupSection) setupSection.classList.remove("hidden");
  if (chatSection) chatSection.classList.add("hidden");
  if (messages) messages.innerHTML = "";
  if (matchQuality) matchQuality.innerText = "Ready";
  syncComposerState();
  setConversationMode(false);
});

socket.on("message", (data) => {
  if (chatMode === "group") return;
  const key = encryptionKey || room;
  if (data.img) {
    try {
      const decryptedImg = CryptoJS.AES.decrypt(data.img, key).toString(CryptoJS.enc.Utf8);
      addStrangerImage(decryptedImg, data.replyTo || null, data.imageId || null, data.expiresIn || 10000, null, data.msgId);
    } catch (e) {
      addStrangerImage("", data.replyTo || null, data.imageId || null, data.expiresIn || 10000, null, data.msgId);
    }
  } else {
    try {
      const decryptedMsg = CryptoJS.AES.decrypt(data.msg, key).toString(CryptoJS.enc.Utf8);
      addStranger(decryptedMsg, data.replyTo || null, null, data.msgId);
    } catch (e) {
      addStranger("Error: Could not decrypt message", data.replyTo || null, null, data.msgId);
    }
  }
  if (typingDiv) typingDiv.innerText = "";
  playTick();
  requestAnimationFrame(() => tryEmitReadAll());
});

socket.on("typing", () => {
  if (typingDiv) {
    typingDiv.innerHTML = `<span class="typing-indicator">Stranger is typing<span class="typing-dots"><span></span><span></span><span></span></span></span>`;
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (typingDiv) typingDiv.innerText = "";
  }, 1200);
});

socket.on("clearChat", () => {
  if (messages) messages.innerHTML = "";
  cancelReply();
});
socket.on("reportSubmitted", () => {
  addSystem("✅ Report submitted. Thanks for helping keep chat clean.");
});

socket.on("connect_error", (error) => {
  addSystem("⚠️ Connection issue. Attempting to reconnect...");
});

socket.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    addSystem("🔄 Server disconnected. Reconnecting...");
  }
});

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sendMsg() {
  if (!msgInput) return;
  const text = msgInput.value.trim();
  if (!text) return;
  if (!room || !encryptionKey) {
    alert("Please start a chat or join a group first.");
    return;
  }
  const cleanText = sanitizeText(text);
  if (typeof CryptoJS === "undefined") {
    alert("Encryption library error.");
    return;
  }
  let encryptedMsg;
  try {
    encryptedMsg = CryptoJS.AES.encrypt(cleanText, encryptionKey).toString();
  } catch (err) {
    alert("Encryption failed.");
    return;
  }
  const msgId = chatMode === "dm" ? generateMsgId() : null;
  if (chatMode === "group") {
    socket.emit("group:message", { msg: encryptedMsg, replyTo });
  } else {
    socket.emit("message", { msg: encryptedMsg, replyTo, msgId });
  }
  addMe(cleanText, replyTo, true, msgId);
  setSendLoading(true);
  msgInput.value = "";
  syncComposerState();
  cancelReply();
}

function handleImageSelection() {
  if (!imgInput) return;
  const file = imgInput.files[0];
  if (!file) return;
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    alert("Invalid image type.");
    imgInput.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("File too large (max 5MB).");
    imgInput.value = "";
    return;
  }
  pendingImageFile = file;
  if (imagePreviewTag) imagePreviewTag.src = URL.createObjectURL(file);
  if (imagePreviewName) imagePreviewName.innerText = `${file.name} • ${Math.round(file.size / 1024)} KB`;
  if (imagePreview) imagePreview.classList.remove("hidden");
  syncComposerState();
}

function clearImagePreview() {
  pendingImageFile = null;
  if (imagePreview) imagePreview.classList.add("hidden");
  if (imagePreviewTag) imagePreviewTag.src = "";
  if (imagePreviewName) imagePreviewName.innerText = "";
  if (imgInput) imgInput.value = "";
  syncComposerState();
}

function sendImage() {
  if (!pendingImageFile) return;
  if (!room || !encryptionKey) {
    alert("Not connected.");
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    if (typeof CryptoJS === "undefined") return;
    const img = e.target.result;
    let encryptedImg;
    try {
      encryptedImg = CryptoJS.AES.encrypt(img, encryptionKey).toString();
    } catch (err) { return; }
    const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresIn = 10000;
    const msgId = chatMode === "dm" ? generateMsgId() : null;
    if (chatMode === "group") {
      socket.emit("group:message", { img: encryptedImg, replyTo, imageId, expiresIn });
    } else {
      socket.emit("message", { img: encryptedImg, replyTo, imageId, expiresIn, msgId });
    }
    addMyImage(img, replyTo, imageId, expiresIn, msgId);
    setSendLoading(true);
    cancelReply();
    clearImagePreview();
  };
  reader.readAsDataURL(pendingImageFile);
}

function skip() {
  if (chatMode === "group") {
    leaveGroupChat();
    return;
  }
  if (!room) return;
  if (messages) messages.innerHTML = "";
  cancelReply();
  clearImagePreview();
  syncComposerState();
  addSystem("🔎 Finding new stranger...");
  if (searchState) {
    searchState.classList.remove("hidden");
    searchState.innerText = "Finding a new stranger...";
  }
  socket.emit("skip");
  room = null;
  encryptionKey = null;
  stopTimer();
  if (matchQuality) matchQuality.innerText = "Searching";
  startSearchHints();
}

function reportUser() {
  const reason = prompt("Report reason? (spam, harassment, abuse)");
  if (!reason) return;
  socket.emit("report", { reason });
}

const emitTyping = throttle(() => {
  if (!room) return;
  if (chatMode === "group") socket.emit("group:typing");
  else socket.emit("typing");
}, 450);

msgInput?.addEventListener("input", () => {
  emitTyping();
  syncComposerState();
});

function syncComposerState() {
  if (!sendBtn || !msgInput) return;
  if (!sendBtn.classList.contains("loading")) {
    sendBtn.disabled = !msgInput.value.trim() && !pendingImageFile;
  }
}

msgInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
});

function setReply(messageText) {
  replyTo = messageText;
  if (replyBox) replyBox.classList.add("active");
  if (replyText) replyText.innerText = `Replying to: ${messageText}`;
  msgInput?.focus();
}

function cancelReply() {
  replyTo = null;
  if (replyBox) replyBox.classList.remove("active");
  if (replyText) replyText.innerText = "";
}

function scrollDown(force = false) {
  smartScroll(messages, force);
}

function getTime() {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function makeReplyHtml(reply) {
  if (!reply) return "";
  return `<div class="reply-preview">${escapeHtml(reply)}</div>`;
}

function startImageDestruct(container, expiresIn) {
  const timerEl = container.querySelector(".image-timer");
  const imgEl = container.querySelector("img");
  let remaining = Math.floor(expiresIn / 1000);
  const interval = setInterval(() => {
    remaining -= 1;
    if (timerEl && remaining >= 0) timerEl.innerText = `Disappears in ${remaining}s`;
    if (remaining <= 2 && imgEl) imgEl.style.filter = "blur(10px)";
    if (remaining <= 0) {
      clearInterval(interval);
      if (imgEl) imgEl.remove();
      if (timerEl) timerEl.innerText = "Image expired";
      container.classList.add("expired-image");
    }
  }, 1000);
}

function maybeAckInboundDm(inboundMsgId) {
  if (chatMode !== "dm" || !inboundMsgId || !readReceiptsOn()) return;
  socket.emit("dm:deliveryAck", { msgId: inboundMsgId });
}

function ticksMarkupForMe(pending) {
  if (chatMode !== "dm") return "";
  const state = pending ? "sending" : "sent";
  return `<span class="msg-ticks" data-state="${state}" aria-hidden="true">✓✓</span>`;
}

function addMe(text, reply = null, pending = false, msgId = null) {
  cleanupOldMessages();
  if (!messages) return;
  const div = document.createElement("div");
  div.className = `message me${pending ? " pending" : ""}`;
  if (msgId) div.dataset.msgId = msgId;
  div.innerHTML = `${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="msg-meta"><span class="timestamp">${getTime()}</span>${ticksMarkupForMe(pending)}</div>`;
  attachReactionListener(div, msgId);
  div.onclick = () => setReply(text);
  messages.appendChild(div);
  scrollDown();
  updateSessionEnergy();
}

function addStranger(text, reply = null, senderLabel = null, inboundMsgId = null) {
  cleanupOldMessages();
  if (!messages) return;
  const label = senderLabel ? `<div class="msg-sender-label">${escapeHtml(senderLabel)}</div>` : "";
  const div = document.createElement("div");
  div.className = "message stranger";
  if (inboundMsgId) div.dataset.msgId = inboundMsgId;
  div.innerHTML = `${label}${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="msg-meta"><span class="timestamp">${getTime()}</span></div>`;
  attachReactionListener(div, inboundMsgId);
  div.onclick = () => setReply(text);
  messages.appendChild(div);
  scrollDown();
  maybeAckInboundDm(inboundMsgId);
  updateSessionEnergy();
}

function addSystem(text) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = "message system";
  div.innerText = text;
  messages.appendChild(div);
  scrollDown();
}

function addMyImage(src, reply = null, imageId = null, expiresIn = 10000, msgId = null) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = chatMode === "dm" ? "message me pending" : "message me";
  if (imageId) div.dataset.imageId = imageId;
  if (msgId) div.dataset.msgId = msgId;
  const tickRow = chatMode === "dm" ? ticksMarkupForMe(true) : "";
  div.innerHTML = `${makeReplyHtml(reply)}<img src="${src}" alt="image" class="protected-image" draggable="false"><div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div><div class="msg-meta"><span class="timestamp">${getTime()}</span>${tickRow}</div>`;
  div.onclick = () => setReply("📷 Image");
  messages.appendChild(div);
  scrollDown();
  startImageDestruct(div, expiresIn);
}

function addStrangerImage(src, reply = null, imageId = null, expiresIn = 10000, senderLabel = null, inboundMsgId = null) {
  if (!messages) return;
  const div = document.createElement("div");
  div.className = "message stranger";
  if (imageId) div.dataset.imageId = imageId;
  const label = senderLabel ? `<div class="msg-sender-label">${escapeHtml(senderLabel)}</div>` : "";
  div.innerHTML = `${label}${makeReplyHtml(reply)}<img src="${src}" alt="image" class="protected-image" draggable="false"><div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div><div class="msg-meta"><span class="timestamp">${getTime()}</span></div>`;
  div.onclick = () => setReply("📷 Image");
  messages.appendChild(div);
  scrollDown();
  startImageDestruct(div, expiresIn);
  maybeAckInboundDm(inboundMsgId);
  updateSessionEnergy();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

document.addEventListener("contextmenu", (e) => {
  if (e.target.classList.contains("protected-image")) e.preventDefault();
});
document.addEventListener("dragstart", (e) => {
  if (e.target.classList.contains("protected-image")) e.preventDefault();
});

if (window.visualViewport) {
  const syncViewportHeight = () => {
    document.documentElement.style.setProperty("--vvh", `${window.visualViewport.height}px`);
    if (room) scrollDown(true);
  };
  window.visualViewport.addEventListener("resize", syncViewportHeight);
  window.visualViewport.addEventListener("scroll", syncViewportHeight);
  syncViewportHeight();
}

let swipeStartX = 0;
messages?.addEventListener("touchstart", (e) => {
  swipeStartX = e.changedTouches[0].screenX;
}, { passive: true });

messages?.addEventListener("touchend", (e) => {
  const delta = e.changedTouches[0].screenX - swipeStartX;
  if (Math.abs(delta) > 120 && chatMode === "dm" && room) {
    skip();
  }
}, { passive: true });

themeToggle?.addEventListener("click", () => {
  document.body.classList.toggle("compact");
});

themeSelect?.addEventListener("change", (e) => {
  document.body.setAttribute("data-theme", e.target.value);
  localStorage.setItem("theme", e.target.value);
  if (themeSelectDrawer) themeSelectDrawer.value = e.target.value;
});

const savedTheme = localStorage.getItem("theme") || "default";
document.body.setAttribute("data-theme", savedTheme);
if (themeSelect) themeSelect.value = savedTheme;
if (themeSelectDrawer) themeSelectDrawer.value = savedTheme;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

muteBtn?.addEventListener("click", () => {
  isMuted = !isMuted;
  sessionStorage.setItem("anonyx_sounds_muted", isMuted ? "1" : "0");
  syncMuteUi();
});

startBtn?.addEventListener("click", startChat);
sendBtn?.addEventListener("click", () => {
  if (pendingImageFile) sendImage();
  else sendMsg();
});
skipBtn?.addEventListener("click", skip);
reportBtn?.addEventListener("click", reportUser);
cancelReplyBtn?.addEventListener("click", cancelReply);
imgBtn?.addEventListener("click", () => imgInput?.click());
cancelImageBtn?.addEventListener("click", clearImagePreview);
imgInput?.addEventListener("change", handleImageSelection);

if (groupCreateBtn) {
  groupCreateBtn.addEventListener("click", () => socket.emit("group:create"));
}
if (groupJoinBtn && groupJoinInput) {
  groupJoinBtn.addEventListener("click", () => {
    const code = groupJoinInput.value.trim();
    if (!code) { alert("Enter a group code."); return; }
    socket.emit("group:join", { inviteCode: code });
  });
}
if (leaveGroupBtn) {
  leaveGroupBtn.addEventListener("click", () => leaveGroupChat());
}
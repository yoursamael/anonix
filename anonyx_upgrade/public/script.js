let userId = sessionStorage.getItem("anonyx_sid");
if (!userId) {
  userId = localStorage.getItem("anonyx_user") || crypto.randomUUID();
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

const chatPageRoot = document.getElementById("chatPageRoot");
const chatTitle = document.getElementById("chatTitle");
const chatMenuBtn = document.getElementById("chatMenuBtn");
const chatBackBtn = document.getElementById("chatBackBtn");
const chatDrawer = document.getElementById("chatDrawer");
const chatDrawerBackdrop = document.getElementById("chatDrawerBackdrop");
const groupInviteBar = document.getElementById("groupInviteBar");
const groupInviteGuestHint = document.getElementById("groupInviteGuestHint");
const groupInviteCodeDisplay = document.getElementById("groupInviteCodeDisplay");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const groupQrImg = document.getElementById("groupQrImg");
const readReceiptsToggle = document.getElementById("readReceiptsToggle");
const themeSelectDrawer = document.getElementById("themeSelectDrawer");
const chatTimerDrawer = document.getElementById("chatTimerDrawer");
const muteBtnDrawer = document.getElementById("muteBtnDrawer");
const reportBtnDrawer = document.getElementById("reportBtnDrawer");
const skipBtnDrawer = document.getElementById("skipBtnDrawer");
const leaveGroupBtnDrawer = document.getElementById("leaveGroupBtnDrawer");

const messages = document.getElementById("messages");
const typingDiv = document.getElementById("typing");
const replyBox = document.getElementById("replyBox");
const replyText = document.getElementById("replyText");
const msgInput = document.getElementById("msg");
const imgInput = document.getElementById("imgInput");
const onlineEl = document.getElementById("online");
const setupSection = document.getElementById("setup");
const chatSection = document.getElementById("chat");
const searchState = document.getElementById("searchState");
const chatTimer = document.getElementById("chatTimer");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewTag = document.getElementById("imagePreviewTag");
const imagePreviewName = document.getElementById("imagePreviewName");
const matchQuality = document.getElementById("matchQuality");
const chatHint = document.getElementById("chatHint");
const themeToggle = document.getElementById("themeToggle");
const themeSelect = document.getElementById("themeSelect");
const muteBtn = document.getElementById("muteBtn");
const leaveGroupBtn = document.getElementById("leaveGroupBtn");
const groupCreateBtn = document.getElementById("groupCreateBtn");
const groupJoinBtn = document.getElementById("groupJoinBtn");
const groupJoinInput = document.getElementById("groupJoinInput");

const startBtn = document.getElementById("startBtn");
const sendBtn = document.getElementById("sendBtn");
const skipBtn = document.getElementById("skipBtn");
const reportBtn = document.getElementById("reportBtn");
const cancelReplyBtn = document.getElementById("cancelReplyBtn");
const imgBtn = document.getElementById("imgBtn");
const cancelImageBtn = document.getElementById("cancelImageBtn");

if (window.AnonyxExperiments) {
  AnonyxExperiments.bootstrap(userId).catch(() => {});
}

function readReceiptsOn() {
  return localStorage.getItem("anonyx_read_receipts") !== "0";
}

function generateMsgId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
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
  const msg =
    chatMode === "group"
      ? "Leave this group and go back?"
      : "Leave this chat? Your match will end.";
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

socket.on("session:sync", (s) => {
  if (!s) return;
  if (s.mode === "idle") {
    if (room || encryptionKey || groupRoomId) {
      const wasOpen = chatSection && !chatSection.classList.contains("hidden");
      resetGroupClientState();
      if (wasOpen) {
        setupSection.classList.remove("hidden");
        chatSection.classList.add("hidden");
        messages.innerHTML = "";
        matchQuality.innerText = "Ready";
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
    openGroupShell(
      s.inviteCode ? `Code · ${s.inviteCode}` : "Group room",
      s.inviteCode || ""
    );
    return;
  }
  if (s.mode === "dm" && s.active) {
    chatMode = "dm";
    groupRoomId = null;
    room = true;
    encryptionKey = "true";
    setupSection.classList.add("hidden");
    chatSection.classList.remove("hidden");
    searchState.classList.add("hidden");
    matchQuality.innerText = "Matched";
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
  chatMode = "group";
  setupSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  messages.innerHTML = "";
  cancelReply();
  clearImagePreview();
  stopTimer();
  searchState.classList.add("hidden");
  matchQuality.innerText = "Group";
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
  socket.emit("group:leave");
  resetGroupClientState();
  setupSection.classList.remove("hidden");
  chatSection.classList.add("hidden");
  messages.innerHTML = "";
  matchQuality.innerText = "Ready";
  setConversationMode(false);
}

function startChat() {
  const gender = document.getElementById("gender").value;
  const preference = document.getElementById("preference").value;
  const language = document.getElementById("language").value;
  const interests = document
    .getElementById("interests")
    .value.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  console.log("Emitting start with:", { gender, preference, language, interests });
  resetGroupClientState();
  socket.emit("start", { gender, preference, language, interests });

  setupSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  messages.innerHTML = "";
  searchState.classList.remove("hidden");
  matchQuality.innerText = "Searching";
  setChatHeaderTitle("Matching", "Looking for someone…");
  setConversationMode(true);
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
  } catch (error) {
    // ignore audio issues
  }
}

socket.on("online", (count) => {
  onlineEl.innerText = `Users Online: ${count}`;
});

socket.on("searching", () => {
  if (chatMode === "group") return;
  room = null;
  encryptionKey = null;
  stopTimer();
  matchQuality.innerText = "Searching";
  searchState.classList.remove("hidden");
});

socket.on("tabLimitExceeded", (msg) => {
  alert(msg);
});

socket.on("matched", (data) => {
  chatMode = "dm";
  groupRoomId = null;
  room = true;
  encryptionKey = "true";
  messages.innerHTML = "";
  cancelReply();
  stopTimer();
  startTimer();
  searchState.classList.add("hidden");
  matchQuality.innerText = "Matched";
  setChatHeaderTitle("Stranger", "Connected. Be respectful and use report if needed.");
  setConversationMode(true);
  if (leaveGroupBtn) leaveGroupBtn.classList.add("hidden");
  if (leaveGroupBtnDrawer) leaveGroupBtnDrawer.classList.add("hidden");
  if (skipBtn) skipBtn.classList.remove("hidden");
  if (reportBtn) reportBtn.classList.remove("hidden");
  addSystem("💞 Connected with stranger! 💞");

  const popup = document.getElementById("matchPopup");
  if (popup) {
    popup.classList.add("show");
    setTimeout(() => popup.classList.remove("show"), 2000);
  }
});

socket.on("system", (msg) => {
  addSystem(msg);
  if (/Searching|Waiting/i.test(msg)) {
    searchState.classList.remove("hidden");
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
  sendBtn.classList.remove("loading");
  const mid = payload && payload.msgId;
  let el = mid ? findMeMessageByMsgId(mid) : null;
  if (!el) {
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
  if (p.kind === "read_all") {
    messages.querySelectorAll(".message.me .msg-ticks").forEach((ticks) => {
      if (ticks.dataset.state && ticks.dataset.state !== "sending") ticks.dataset.state = "read";
    });
  }
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
  matchQuality.innerText = `Group (${n})`;
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
      console.error("Group image decrypt failed", e);
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
  typingDiv.innerText = "";
  playTick();
});

socket.on("group:messageAck", () => {
  const pending = document.querySelector(".message.pending");
  if (pending) pending.classList.remove("pending");
  sendBtn.classList.remove("loading");
});

socket.on("group:typing", () => {
  typingDiv.innerHTML = `
  <span class="typing-indicator">
    Someone is typing
    <span class="typing-dots">
      <span></span><span></span><span></span>
    </span>
  </span>
`;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingDiv.innerText = "";
  }, 1200);
});

socket.on("group:shutdown", () => {
  addSystem("This group room was closed.");
  resetGroupClientState();
  setupSection.classList.remove("hidden");
  chatSection.classList.add("hidden");
  messages.innerHTML = "";
  matchQuality.innerText = "Ready";
  setConversationMode(false);
});

socket.on("group:left", () => {
  /* server ack; UI already updated locally if user initiated */
});

socket.on("message", (data) => {
  if (chatMode === "group") return;
  if (data.img) {
    try {
      const decryptedImg = CryptoJS.AES.decrypt(data.img, encryptionKey || room).toString(CryptoJS.enc.Utf8);
      addStrangerImage(decryptedImg, data.replyTo || null, data.imageId || null, data.expiresIn || 10000, null, data.msgId);
    } catch (e) {
      console.error('Image decryption failed', e);
      addStrangerImage('', data.replyTo || null, data.imageId || null, data.expiresIn || 10000, null, data.msgId);
    }
  } else {
    try {
      const decryptedMsg = CryptoJS.AES.decrypt(data.msg, encryptionKey || room).toString(CryptoJS.enc.Utf8);
      addStranger(decryptedMsg, data.replyTo || null, null, data.msgId);
    } catch (e) {
      console.error('Message decryption failed', e);
      addStranger('Error: Could not decrypt message', data.replyTo || null, null, data.msgId);
    }
  }
  typingDiv.innerText = "";
  playTick();
  requestAnimationFrame(() => tryEmitReadAll());
});

// Remove socket.on("image") since it's merged into "message"

socket.on("typing", () => {
  typingDiv.innerHTML = `
  <span class="typing-indicator">
    Stranger is typing
    <span class="typing-dots">
      <span></span><span></span><span></span>
    </span>
  </span>
`;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingDiv.innerText = "";
  }, 1200);
});

socket.on("clearChat", () => {
  messages.innerHTML = "";
  cancelReply();
});
socket.on("reportSubmitted", () => {
  addSystem("✅ Report submitted. Thanks for helping keep chat clean.");
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
  addSystem("⚠️ Connection issue. Attempting to reconnect...");
  setTimeout(() => {
    if (!socket.connected) {
      addSystem("❌ Still disconnected. Try refreshing the page if problems persist.");
    }
  }, 3000);
});

socket.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    addSystem("🔄 Server disconnected. Reconnecting...");
  } else if (reason !== "io client namespace disconnect") {
    console.warn("Socket disconnected:", reason);
  }
});

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sendMsg() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (!room || !encryptionKey) {
    alert('Please start a chat or join a group first.');
    return;
  }

  const cleanText = sanitizeText(text);
  if (typeof CryptoJS === "undefined") {
    alert("Chat encryption library did not load (check browser console / network). Try a hard refresh.");
    return;
  }
  let encryptedMsg;
  try {
    encryptedMsg = CryptoJS.AES.encrypt(cleanText, encryptionKey).toString();
  } catch (err) {
    console.error(err);
    alert("Could not encrypt your message. Try refreshing the page.");
    return;
  }
  const msgId = chatMode === "dm" ? generateMsgId() : null;
  if (chatMode === "group") {
    socket.emit("group:message", { msg: encryptedMsg, replyTo });
  } else {
    socket.emit("message", { msg: encryptedMsg, replyTo, msgId });
  }
  addMe(cleanText, replyTo, true, msgId);
  sendBtn.classList.add('loading');
  msgInput.value = "";
  cancelReply();
}

function handleImageSelection() {
  const file = imgInput.files[0];
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    alert("Only JPG, PNG, WEBP, and GIF are allowed.");
    imgInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Image too large. Keep it under 5 MB.");
    imgInput.value = "";
    return;
  }

  pendingImageFile = file;
  imagePreviewTag.src = URL.createObjectURL(file);
  imagePreviewName.innerText = `${file.name} • ${Math.round(file.size / 1024)} KB`;
  imagePreview.classList.remove("hidden");
}

function clearImagePreview() {
  pendingImageFile = null;
  imagePreview.classList.add("hidden");
  imagePreviewTag.src = "";
  imagePreviewName.innerText = "";
  imgInput.value = "";
}

function sendImage() {
  if (!pendingImageFile) return;
  if (!room || !encryptionKey) {
    alert('Please start a chat or join a group first.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    if (typeof CryptoJS === "undefined") {
      alert("Chat encryption library did not load. Try a hard refresh.");
      return;
    }
    const img = e.target.result;
    let encryptedImg;
    try {
      encryptedImg = CryptoJS.AES.encrypt(img, encryptionKey).toString();
    } catch (err) {
      console.error(err);
      alert("Could not encrypt the image. Try refreshing the page.");
      return;
    }
    const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresIn = 10000;
    const msgId = chatMode === "dm" ? generateMsgId() : null;

    if (chatMode === "group") {
      socket.emit("group:message", { img: encryptedImg, replyTo, imageId, expiresIn });
    } else {
      socket.emit("message", { img: encryptedImg, replyTo, imageId, expiresIn, msgId });
    }
    addMyImage(img, replyTo, imageId, expiresIn, msgId);
    sendBtn.classList.add('loading');
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
  messages.innerHTML = "";
  cancelReply();
  clearImagePreview();
  addSystem("🔎 Finding new stranger...");
  searchState.classList.remove("hidden");
  searchState.innerText = "Finding a new stranger...";
  socket.emit("skip");
  room = null;
  encryptionKey = null;
  stopTimer();
  matchQuality.innerText = "Searching";
}

function reportUser() {
  const reason = prompt("Report reason? Example: spam, harassment, abuse");
  if (!reason) return;
  socket.emit("report", { reason });
}

msgInput.addEventListener("input", () => {
  if (!room) return;
  if (chatMode === "group") socket.emit("group:typing");
  else socket.emit("typing");
});

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
});

function setReply(messageText) {
  replyTo = messageText;
  replyBox.classList.add("active");
  replyText.innerText = `Replying to: ${messageText}`;
  msgInput.focus();
}

function cancelReply() {
  replyTo = null;
  replyBox.classList.remove("active");
  replyText.innerText = "";
}

function scrollDown() {
  messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
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
    if (remaining <= 2 && imgEl) {
      imgEl.style.filter = "blur(10px)";
    }

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
  const div = document.createElement("div");
  div.className = `message me${pending ? " pending" : ""}`;
  if (msgId) div.dataset.msgId = msgId;
  div.innerHTML = `${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="msg-meta"><span class="timestamp">${getTime()}</span>${ticksMarkupForMe(pending)}</div>`;
  div.onclick = () => setReply(text);
  messages.appendChild(div);
  scrollDown();
}

function addStranger(text, reply = null, senderLabel = null, inboundMsgId = null) {
  const label = senderLabel
    ? `<div class="msg-sender-label">${escapeHtml(senderLabel)}</div>`
    : "";
  const div = document.createElement("div");
  div.className = "message stranger";
  div.innerHTML = `${label}${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="msg-meta"><span class="timestamp">${getTime()}</span></div>`;
  div.onclick = () => setReply(text);
  messages.appendChild(div);
  scrollDown();
  maybeAckInboundDm(inboundMsgId);
}

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "message system";
  div.innerText = text;
  messages.appendChild(div);
  scrollDown();
}

function addMyImage(src, reply = null, imageId = null, expiresIn = 10000, msgId = null) {
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
  const div = document.createElement("div");
  div.className = "message stranger";
  if (imageId) div.dataset.imageId = imageId;
  const label = senderLabel
    ? `<div class="msg-sender-label">${escapeHtml(senderLabel)}</div>`
    : "";
  div.innerHTML = `${label}${makeReplyHtml(reply)}<img src="${src}" alt="image" class="protected-image" draggable="false"><div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div><div class="msg-meta"><span class="timestamp">${getTime()}</span></div>`;
  div.onclick = () => setReply("📷 Image");
  messages.appendChild(div);
  scrollDown();
  startImageDestruct(div, expiresIn);
  maybeAckInboundDm(inboundMsgId);
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('Service Worker registered'))
    .catch(err => console.log('SW registration failed', err));
}
muteBtn?.addEventListener("click", () => {
  isMuted = !isMuted;
  sessionStorage.setItem("anonyx_sounds_muted", isMuted ? "1" : "0");
  syncMuteUi();
});
startBtn.addEventListener("click", startChat);
sendBtn.addEventListener("click", () => {
  if (pendingImageFile) sendImage(); else sendMsg();
});
skipBtn.addEventListener("click", skip);
reportBtn.addEventListener("click", reportUser);
cancelReplyBtn.addEventListener("click", cancelReply);
imgBtn.addEventListener("click", () => imgInput.click());
cancelImageBtn.addEventListener("click", clearImagePreview);
imgInput.addEventListener("change", handleImageSelection);

if (groupCreateBtn) {
  groupCreateBtn.addEventListener("click", () => socket.emit("group:create"));
}
if (groupJoinBtn && groupJoinInput) {
  groupJoinBtn.addEventListener("click", () => {
    const code = groupJoinInput.value.trim();
    if (!code) {
      alert("Enter a group code.");
      return;
    }
    socket.emit("group:join", { inviteCode: code });
  });
}
if (leaveGroupBtn) {
  leaveGroupBtn.addEventListener("click", () => leaveGroupChat());
}

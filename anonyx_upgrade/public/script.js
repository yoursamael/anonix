let userId = localStorage.getItem("anonyx_user");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("anonyx_user", userId);
}

const socket = io({ query: { userId } });

let room = null;
let replyTo = null;
let matchStartedAt = null;
let chatTimerInterval = null;
let isMuted = false;
let pendingImageFile = null;
let typingTimeout = null;

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
const muteBtn = document.getElementById("muteBtn");

const startBtn = document.getElementById("startBtn");
const sendBtn = document.getElementById("sendBtn");
const skipBtn = document.getElementById("skipBtn");
const reportBtn = document.getElementById("reportBtn");
const cancelReplyBtn = document.getElementById("cancelReplyBtn");
const imgBtn = document.getElementById("imgBtn");
const cancelImageBtn = document.getElementById("cancelImageBtn");

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

  socket.emit("start", { gender, preference, language, interests });
  setupSection.classList.add("hidden");
  chatSection.classList.remove("hidden");
  messages.innerHTML = "";
  searchState.classList.remove("hidden");
  searchState.innerText = "Looking for someone compatible...";
  addSystem("🔎 Looking for stranger...");
}

function updateChatTimer() {
  if (!matchStartedAt) {
    chatTimer.innerText = "00:00";
    return;
  }
  const seconds = Math.floor((Date.now() - matchStartedAt) / 1000);
  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  chatTimer.innerText = `${min}:${sec}`;
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
  chatTimer.innerText = "00:00";
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

socket.on("searching", (message) => {
  room = null;
  stopTimer();
  matchQuality.innerText = "Searching";
  searchState.classList.remove("hidden");
  searchState.innerText = message;
});

socket.on("tabLimitExceeded", (msg) => {
  alert(msg);
});

socket.on("matched", () => {
  room = true;
  messages.innerHTML = "";
  cancelReply();
  stopTimer();
  startTimer();
  searchState.classList.add("hidden");
  matchQuality.innerText = "Matched";
  chatHint.innerText = "Connected. Be respectful and use report if needed.";
  addSystem("💞 You are now connected with someone special.💞");

  // 🔥 MATCH POPUP
  const popup = document.getElementById("matchPopup");
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 2000);
});


socket.on("system", (msg) => {
  addSystem(msg);
  if (/Searching|Waiting/i.test(msg)) {
    searchState.classList.remove("hidden");
    searchState.innerText = msg;
    stopTimer();
  }
});

socket.on("messageAck", () => {
  const pending = document.querySelector(".message.pending");
  if (pending) pending.classList.remove("pending");
});

socket.on("message", (data) => {
  addStranger(data.msg, data.replyTo || null);
  typingDiv.innerText = "";
  playTick();
});

socket.on("image", (data) => {
  addStrangerImage(data.img, data.replyTo || null, data.imageId || null, data.expiresIn || 10000);
  playTick();
});

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
  addSystem("Report submitted. Thanks for helping keep chat clean.");
});

socket.on("connect_error", () => {
  addSystem("Connection issue. Refresh if chat stops working.");
});

function sendMsg() {
  const text = msgInput.value.trim();
  if (!text || !room) return;

  socket.emit("message", { msg: text, replyTo });
  addMe(text, replyTo, true);
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

  if (file.size > 700 * 1024) {
    alert("Image too large. Keep it under 700 KB.");
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
  if (!pendingImageFile || !room) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = e.target.result;
    const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresIn = 10000;

    socket.emit("image", { img, replyTo, imageId, expiresIn });
    addMyImage(img, replyTo, imageId, expiresIn);
    cancelReply();
    clearImagePreview();
  };
  reader.readAsDataURL(pendingImageFile);
}

function skip() {
  if (!room) return;
  messages.innerHTML = "";
  cancelReply();
  clearImagePreview();
  addSystem("🔎 Finding new stranger...");
  searchState.classList.remove("hidden");
  searchState.innerText = "Finding a new stranger...";
  socket.emit("skip");
  room = null;
  stopTimer();
  matchQuality.innerText = "Searching";
}

function reportUser() {
  const reason = prompt("Report reason? Example: spam, harassment, abuse");
  if (!reason) return;
  socket.emit("report", { reason });
}

msgInput.addEventListener("input", () => {
  if (room) socket.emit("typing");
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

function createMessageElement(className, html, replyTargetText) {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = html;
  if (replyTargetText) div.onclick = () => setReply(replyTargetText);
  messages.appendChild(div);
  scrollDown();
}

function addMe(text, reply = null, pending = false) {
  const html = `${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="timestamp">${getTime()}</div>`;
  createMessageElement(`message me${pending ? " pending" : ""}`, html, text);
}

function addStranger(text, reply = null) {
  const html = `${makeReplyHtml(reply)}<div class="message-text">${escapeHtml(text)}</div><div class="timestamp">${getTime()}</div>`;
  createMessageElement("message stranger", html, text);
}

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "message system";
  div.innerText = text;
  messages.appendChild(div);
  scrollDown();
}

function addMyImage(src, reply = null, imageId = null, expiresIn = 10000) {
  const div = document.createElement("div");
  div.className = "message me";
  if (imageId) div.dataset.imageId = imageId;
  div.innerHTML = `${makeReplyHtml(reply)}<img src="${src}" alt="image" class="protected-image" draggable="false"><div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div><div class="timestamp">${getTime()}</div>`;
  div.onclick = () => setReply("📷 Image");
  messages.appendChild(div);
  scrollDown();
  startImageDestruct(div, expiresIn);
}

function addStrangerImage(src, reply = null, imageId = null, expiresIn = 10000) {
  const div = document.createElement("div");
  div.className = "message stranger";
  if (imageId) div.dataset.imageId = imageId;
  div.innerHTML = `${makeReplyHtml(reply)}<img src="${src}" alt="image" class="protected-image" draggable="false"><div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div><div class="timestamp">${getTime()}</div>`;
  div.onclick = () => setReply("📷 Image");
  messages.appendChild(div);
  scrollDown();
  startImageDestruct(div, expiresIn);
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

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("compact");
});
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.innerText = isMuted ? "Unmute" : "Mute";
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

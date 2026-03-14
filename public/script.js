let userId = localStorage.getItem("anonyx_user");

if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("anonyx_user", userId);
}

const socket = io({
  query: {
    userId: userId
  }
});

let room = null;
let myGender = null;
let myPreference = null;
let replyTo = null;

const messages = document.getElementById("messages");
const typingDiv = document.getElementById("typing");
const replyBox = document.getElementById("replyBox");
const replyText = document.getElementById("replyText");
const msgInput = document.getElementById("msg");
const imgInput = document.getElementById("imgInput");
const onlineEl = document.getElementById("online");
const setupSection = document.getElementById("setup");
const chatSection = document.getElementById("chat");

function startChat() {
  myGender = document.getElementById("gender").value;
  myPreference = document.getElementById("preference").value;

  socket.emit("start", {
    gender: myGender,
    preference: myPreference
  });

  setupSection.style.display = "none";
  chatSection.style.display = "flex";

  messages.innerHTML = "";
  addSystem("🔎 Looking for stranger...");
}

socket.on("online", (count) => {
  onlineEl.innerText = "Users Online: " + count;
});

socket.on("tabLimitExceeded", (msg) => {
  alert(msg);
});

socket.on("matched", (r) => {
  room = r;
  messages.innerHTML = "";
  cancelReply();
});

socket.on("system", (msg) => {
  addSystem(msg);
});

socket.on("message", (data) => {
  addStranger(data.msg, data.replyTo || null);
});

socket.on("image", (data) => {
  addStrangerImage(
    data.img,
    data.replyTo || null,
    data.imageId || null,
    data.expiresIn || 10000
  );
});

socket.on("typing", () => {
  typingDiv.innerText = "Stranger is typing...";

  setTimeout(() => {
    typingDiv.innerText = "";
  }, 1000);
});

function sendMsg() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (!room) return;

  socket.emit("message", {
    msg: text,
    replyTo: replyTo
  });

  addMe(text, replyTo);

  msgInput.value = "";
  cancelReply();
}

function sendImage() {
  const file = imgInput.files[0];
  if (!file) return;
  if (!room) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    const img = e.target.result;
    const imageId =
      "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const expiresIn = 10000;

    socket.emit("image", {
      img: img,
      replyTo: replyTo,
      imageId: imageId,
      expiresIn: expiresIn
    });

    addMyImage(img, replyTo, imageId, expiresIn);
    cancelReply();
    imgInput.value = "";
  };

  reader.readAsDataURL(file);
}

function skip() {
  if (!room) return;

  messages.innerHTML = "";
  cancelReply();
  addSystem("🔎 Finding new stranger...");

  socket.emit("skip");
  room = null;
}

msgInput.addEventListener("input", () => {
  if (room) {
    socket.emit("typing");
  }
});

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMsg();
  }
});

msgInput.addEventListener("focus", () => {
  setTimeout(() => {
    scrollDown();
  }, 300);
});

/* Auto-send image after selection */
imgInput.addEventListener("change", () => {
  if (imgInput.files && imgInput.files[0]) {
    sendImage();
  }
});

function setReply(messageText) {
  replyTo = messageText;
  replyBox.classList.add("active");
  replyText.innerText = "Replying to: " + messageText;
  msgInput.focus();
}

function cancelReply() {
  replyTo = null;
  replyBox.classList.remove("active");
  replyText.innerText = "";
}

function scrollDown() {
  messages.scrollTo({
    top: messages.scrollHeight,
    behavior: "smooth"
  });
}

function getTime() {
  const d = new Date();
  return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
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
    remaining--;

    if (timerEl && remaining >= 0) {
      timerEl.innerText = `Disappears in ${remaining}s`;
    }

    if (remaining <= 0) {
      clearInterval(interval);

      if (imgEl) {
        imgEl.remove();
      }

      if (timerEl) {
        timerEl.innerText = "Image expired";
      }

      container.classList.add("expired-image");
    }
  }, 1000);
}

function createMessageElement(className, html, replyTargetText) {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = html;

  if (replyTargetText) {
    div.onclick = () => setReply(replyTargetText);
  }

  messages.appendChild(div);
  scrollDown();
}

function addMe(text, reply = null) {
  const html =
    makeReplyHtml(reply) +
    `<div class="message-text">${escapeHtml(text)}</div>` +
    `<div class="timestamp">${getTime()}</div>`;

  createMessageElement("message me", html, text);
}

function addStranger(text, reply = null) {
  const html =
    makeReplyHtml(reply) +
    `<div class="message-text">${escapeHtml(text)}</div>` +
    `<div class="timestamp">${getTime()}</div>`;

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

  if (imageId) {
    div.dataset.imageId = imageId;
  }

  div.innerHTML =
    makeReplyHtml(reply) +
    `<img src="${src}" alt="image" class="protected-image" draggable="false">` +
    `<div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div>` +
    `<div class="timestamp">${getTime()}</div>`;

  div.onclick = () => setReply("📷 Image");

  messages.appendChild(div);
  scrollDown();

  startImageDestruct(div, expiresIn);
}

function addStrangerImage(src, reply = null, imageId = null, expiresIn = 10000) {
  const div = document.createElement("div");
  div.className = "message stranger";

  if (imageId) {
    div.dataset.imageId = imageId;
  }

  div.innerHTML =
    makeReplyHtml(reply) +
    `<img src="${src}" alt="image" class="protected-image" draggable="false">` +
    `<div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div>` +
    `<div class="timestamp">${getTime()}</div>`;

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
  if (e.target.classList.contains("protected-image")) {
    e.preventDefault();
  }
});

document.addEventListener("dragstart", (e) => {
  if (e.target.classList.contains("protected-image")) {
    e.preventDefault();
  }
});
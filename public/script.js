let userId = localStorage.getItem("anonix_user");

if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("anonix_user", userId);
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

function startChat() {
  myGender = document.getElementById("gender").value;
  myPreference = document.getElementById("preference").value;

  socket.emit("start", { gender: myGender, preference: myPreference });

  document.getElementById("setup").style.display = "none";
  document.getElementById("chat").style.display = "flex";

  messages.innerHTML = "";
  addSystem("🔎 Looking for stranger...");
}

socket.on("online", (count) => {
  document.getElementById("online").innerText = "Users Online: " + count;
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
    const imageId = "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
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

msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMsg();
  }
});

msgInput.addEventListener("focus", () => {
  setTimeout(() => {
    scrollDown();
  }, 300);
});

function setReply(messageText) {
  replyTo = messageText;
  replyBox.style.display = "flex";
  replyText.innerText = "Replying to: " + messageText;
  msgInput.focus();
}

function cancelReply() {
  replyTo = null;
  replyBox.style.display = "none";
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

function addMe(text, reply = null) {
  const div = document.createElement("div");
  div.className = "me";
  div.innerHTML =
    makeReplyHtml(reply) +
    `${escapeHtml(text)}<div class='timestamp'>${getTime()}</div>`;

  div.onclick = () => setReply(text);

  messages.appendChild(div);
  scrollDown();
}

function addStranger(text, reply = null) {
  const div = document.createElement("div");
  div.className = "stranger";
  div.innerHTML =
    makeReplyHtml(reply) +
    `${escapeHtml(text)}<div class='timestamp'>${getTime()}</div>`;

  div.onclick = () => setReply(text);

  messages.appendChild(div);
  scrollDown();
}

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.innerText = text;

  messages.appendChild(div);
  scrollDown();
}

function addMyImage(src, reply = null, imageId = null, expiresIn = 10000) {
  const div = document.createElement("div");
  div.className = "me";
  if (imageId) div.dataset.imageId = imageId;

  const replyHtml = makeReplyHtml(reply);
  const img = `<img src="${src}" alt="image" class="protected-image" draggable="false">`;
  const timer = `<div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div>`;
  const time = `<div class='timestamp'>${getTime()}</div>`;

  div.innerHTML = replyHtml + img + timer + time;
  div.onclick = () => setReply("📷 Image");

  messages.appendChild(div);
  scrollDown();

  startImageDestruct(div, expiresIn);
}

function addStrangerImage(src, reply = null, imageId = null, expiresIn = 10000) {
  const div = document.createElement("div");
  div.className = "stranger";
  if (imageId) div.dataset.imageId = imageId;

  const replyHtml = makeReplyHtml(reply);
  const img = `<img src="${src}" alt="image" class="protected-image" draggable="false">`;
  const timer = `<div class="image-timer">Disappears in ${Math.floor(expiresIn / 1000)}s</div>`;
  const time = `<div class='timestamp'>${getTime()}</div>`;

  div.innerHTML = replyHtml + img + timer + time;
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
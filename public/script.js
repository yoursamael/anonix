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
  addStrangerImage(data.img, data.replyTo || null);
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

    socket.emit("image", {
      img: img,
      replyTo: replyTo
    });

    addMyImage(img, replyTo);
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

function addMyImage(src, reply = null) {
  const div = document.createElement("div");
  div.className = "me";

  const replyHtml = makeReplyHtml(reply);
  const img = `<img src="${src}" alt="image">`;
  const time = `<div class='timestamp'>${getTime()}</div>`;

  div.innerHTML = replyHtml + img + time;
  div.onclick = () => setReply("📷 Image");

  messages.appendChild(div);
  scrollDown();
}

function addStrangerImage(src, reply = null) {
  const div = document.createElement("div");
  div.className = "stranger";

  const replyHtml = makeReplyHtml(reply);
  const img = `<img src="${src}" alt="image">`;
  const time = `<div class='timestamp'>${getTime()}</div>`;

  div.innerHTML = replyHtml + img + time;
  div.onclick = () => setReply("📷 Image");

  messages.appendChild(div);
  scrollDown();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}
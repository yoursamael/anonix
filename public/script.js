const socket = io();

let room = null;
let myGender = null;
let myPreference = null;

const messages = document.getElementById("messages");
const typingDiv = document.getElementById("typing");


/* ---------- START CHAT ---------- */

function startChat(){

myGender = document.getElementById("gender").value;
myPreference = document.getElementById("preference").value;

socket.emit("start",{gender:myGender,preference:myPreference});

document.getElementById("setup").style.display="none";
document.getElementById("chat").style.display="flex";

messages.innerHTML="";

addSystem("🔎 Looking for stranger...");

}


/* ---------- ONLINE USERS ---------- */

socket.on("online",(count)=>{

document.getElementById("online").innerText="Users Online: "+count;

});


/* ---------- SYSTEM EVENTS ---------- */

socket.on("system",(msg)=>{

addSystem(msg);

if(msg==="Stranger disconnected" || msg==="Stranger skipped"){

setTimeout(()=>{

addSystem("🔎 Searching new stranger...");

socket.emit("start",{gender:myGender,preference:myPreference});

},1500);

}

});


/* ---------- RECEIVE MESSAGE ---------- */

socket.on("message",(msg)=>{

addStranger(msg);

});


/* ---------- RECEIVE IMAGE ---------- */

socket.on("image",(img)=>{

addStrangerImage(img);

});


/* ---------- TYPING ---------- */

socket.on("typing",()=>{

typingDiv.innerText="Stranger is typing...";

setTimeout(()=>{

typingDiv.innerText="";

},1000);

});


/* ---------- SEND MESSAGE ---------- */

function sendMsg(){

const input = document.getElementById("msg");

if(!input.value.trim()) return;

socket.emit("message",{msg:input.value});

addMe(input.value);

input.value="";

}


/* ---------- ENTER KEY SEND ---------- */

document.getElementById("msg").addEventListener("keypress",(e)=>{

if(e.key==="Enter"){
sendMsg();
}

});


/* ---------- SEND IMAGE ---------- */

function sendImage(){

const file=document.getElementById("imgInput").files[0];

if(!file) return;

const reader=new FileReader();

reader.onload=function(e){

const img=e.target.result;

socket.emit("image",{img:img});

addMyImage(img);

};

reader.readAsDataURL(file);

}


/* ---------- SKIP ---------- */

function skip(){

messages.innerHTML="";

addSystem("🔎 Finding new stranger...");

socket.emit("skip");

}


/* ---------- TYPING EVENT ---------- */

document.getElementById("msg").addEventListener("input",()=>{

socket.emit("typing");

});


/* ---------- SMOOTH SCROLL ---------- */

function scrollDown(){

messages.scrollTo({
top:messages.scrollHeight,
behavior:"smooth"
});

}


/* ---------- TIME ---------- */

function getTime(){

const d=new Date();

return d.getHours()+":"+String(d.getMinutes()).padStart(2,"0");

}


/* ---------- MY MESSAGE ---------- */

function addMe(text){

const div=document.createElement("div");

div.className="me";

div.innerHTML=text+"<div class='timestamp'>"+getTime()+"</div>";

messages.appendChild(div);

scrollDown();

}


/* ---------- STRANGER MESSAGE ---------- */

function addStranger(text){

const div=document.createElement("div");

div.className="stranger";

div.innerHTML=text+"<div class='timestamp'>"+getTime()+"</div>";

messages.appendChild(div);

scrollDown();

}


/* ---------- SYSTEM MESSAGE ---------- */

function addSystem(text){

const div=document.createElement("div");

div.className="system";

div.innerText=text;

messages.appendChild(div);

scrollDown();

}


/* ---------- MY IMAGE ---------- */

function addMyImage(src){

const div=document.createElement("div");

div.className="me";

const img=document.createElement("img");

img.src=src;

div.appendChild(img);

messages.appendChild(div);

scrollDown();

}


/* ---------- STRANGER IMAGE ---------- */

function addStrangerImage(src){

const div=document.createElement("div");

div.className="stranger";

const img=document.createElement("img");

img.src=src;

div.appendChild(img);

messages.appendChild(div);

scrollDown();

}

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");

const app = express();

/* -------- HELMET FIX FOR SOCKET.IO -------- */

app.use(
helmet({
contentSecurityPolicy:false
})
);

const server = http.createServer(app);

const io = new Server(server,{
maxHttpBufferSize:1e6
});

app.use(express.static("public"));

/* -------- QUEUES -------- */

const queue = {
male_female:[],
female_male:[],
male_both:[],
female_both:[]
};

/* -------- RATE LIMIT -------- */

const messageLimit = new Map();

/* -------- MATCH USER -------- */

function matchUser(socket){

let partnerId = null;

if(socket.gender==="male" && socket.preference==="female"){

partnerId = queue.female_male.shift() || queue.female_both.shift();

}

else if(socket.gender==="female" && socket.preference==="male"){

partnerId = queue.male_female.shift() || queue.male_both.shift();

}

else if(socket.preference==="both"){

if(socket.gender==="male"){
partnerId = queue.female_male.shift() || queue.female_both.shift();
}
else{
partnerId = queue.male_female.shift() || queue.male_both.shift();
}

}

if(partnerId){

const partner = io.sockets.sockets.get(partnerId);

if(!partner){
addToQueue(socket);
return;
}

const room = "room-"+socket.id+"-"+partner.id;

socket.join(room);
partner.join(room);

socket.room = room;
partner.room = room;

socket.partner = partner.id;
partner.partner = socket.id;

io.to(room).emit("system","Connected to stranger");

}
else{

addToQueue(socket);

socket.emit("system","Waiting for partner...");

}

}

/* -------- ADD TO QUEUE -------- */

function addToQueue(socket){

if(socket.gender==="male" && socket.preference==="female")
queue.male_female.push(socket.id);

else if(socket.gender==="female" && socket.preference==="male")
queue.female_male.push(socket.id);

else if(socket.gender==="male")
queue.male_both.push(socket.id);

else
queue.female_both.push(socket.id);

}

/* -------- REMOVE FROM QUEUES -------- */

function removeFromQueues(socket){

Object.keys(queue).forEach(q=>{

queue[q] = queue[q].filter(id => id !== socket.id);

});

}

/* -------- SOCKET CONNECTION -------- */

io.on("connection",(socket)=>{

io.emit("online",io.engine.clientsCount);


/* -------- START CHAT -------- */

socket.on("start",({gender,preference})=>{

socket.gender = gender;
socket.preference = preference;

matchUser(socket);

});


/* -------- MESSAGE -------- */

socket.on("message",({msg})=>{

if(!socket.room) return;

if(!msg || msg.length>300) return;

const now = Date.now();

if(messageLimit.has(socket.id)){

if(now - messageLimit.get(socket.id) < 500) return;

}

messageLimit.set(socket.id,now);

socket.to(socket.room).emit("message",msg);

});


/* -------- IMAGE -------- */

socket.on("image",({img})=>{

if(!socket.room) return;

if(!img) return;

if(img.length>500000) return;

socket.to(socket.room).emit("image",img);

});


/* -------- TYPING -------- */

socket.on("typing",()=>{

if(socket.room){
socket.to(socket.room).emit("typing");
}

});


/* -------- SKIP -------- */

socket.on("skip",()=>{

if(socket.room){

socket.to(socket.room).emit("system","Stranger skipped");

socket.leave(socket.room);

}

socket.room = null;

removeFromQueues(socket);

matchUser(socket);

});


/* -------- DISCONNECT -------- */

socket.on("disconnect",()=>{

if(socket.room){

socket.to(socket.room).emit("system","Stranger disconnected");

}

removeFromQueues(socket);

io.emit("online",io.engine.clientsCount);

});

});


/* -------- START SERVER -------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Anonix server running on port " + PORT);
});

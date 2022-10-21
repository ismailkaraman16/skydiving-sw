const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const crypto = require('node:crypto');
const schedule = require('node-schedule');
const socket = require("socket.io");

const app = express();

const cors = require("cors");
app.use(cors());

app.use("/game/skydiving/", express.static(path.join(__dirname, "game/skydiving/")));
app.use("/game/sky/", express.static(path.join(__dirname, "game/sky/")));

const sessionMiddleware = session({
    secret: 'Yp3s6v9y$B&E)H@MbQeThWmZq4t7w!z%', 
    resave: false, 
    saveUninitialized: true,
});

app.use(sessionMiddleware);

const server = app.listen(process.env.PORT || "7777",function(){
    console.log("Server started on port 7777");
});

const io = socket(server);

var sessionManager;
var isGameActive = false;
var factor = 1;
var factorHistory = [];

var participantsOnThisSession = {};
var onlineUsers = {};


async function calculateFactor(){
    await new Promise(resolve => setTimeout(resolve, 300));
    if(isGameActive){
        var varE = 4; var varH = (Math.floor(Math.random() * (3 - 1 + 1) + 1));
        factor += 0.99*varE/(varE*varH*20);
        calculateFactor();
    }
}

app.get("/clearSessions", function(req,res){
    req.session.destroy();
    sessionManager = req.session;
});


const startGame = schedule.scheduleJob('00 * * * * *', function(){
    isGameActive = true;
    calculateFactor();
});

const stopGame = schedule.scheduleJob('15 * * * * *', function(){
    isGameActive = false;
    stopGameFunction(factor);
    factor = 1;
});

var stopGameFunction = async function(saveFactor){

    if(factorHistory.length>19){
        var newHistory = [];
        for(let i = 0; i<factorHistory.length; i++){
            if(i!=0){
                newHistory.push(factorHistory[i]);
            }
        }
        factorHistory = newHistory;
    }
    factorHistory.push(saveFactor);

    if(Object.keys(participantsOnThisSession).length>0){
        for(let i = 0; i<Object.keys(participantsOnThisSession).length; i++){
            onlineUsers[Object.keys(participantsOnThisSession)[i]].instantBetAmount = 0;
            onlineUsers[Object.keys(participantsOnThisSession)[i]].isJoinedTheGame = false;
            onlineUsers[Object.keys(participantsOnThisSession)[i]].userHistory.push(onlineUsers[Object.keys(participantsOnThisSession)[i]].instantBetAmount+" | 0");
        }
    }
    
    participantsOnThisSession = {};
}

app.get("/message", function(req, res){
    res.sendFile(path.join(__dirname, "client.html"));
});

//websocket

const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(sessionMiddleware));

io.use((socket, next) => {
    if (socket.request.session.user) {
        onlineUsers[socket.client.id] = socket.request.session.user;
        next();
    }
    else {
        socket.request.session.user = {"displayName": "user", "balance": 1000, "instantBetAmount": 0, "isJoinedTheGame": false, "userHistory": ["0 | 0"] };
        socket.request.session.save();
        onlineUsers[socket.client.id] = socket.request.session.user;
        next(); 
    }
});

io.on("connection", socket => {
    if(!socket.request.session.user){ console.log("notLoggedInBruhhhhhh"); return; }
    if(socket.request.session.user.instantBetAmount>0){ let newUH = socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount) + " | 0"; socket.request.session.user.userHistory = newUH; socket.request.session.user.instantBetAmount = 0; socket.request.session.user.isJoinedTheGame = false; socket.request.session.save(); }

    io.sockets.emit('connectionInfo', "Bir sihirdar bağlandı. Sihirdarın id'si: " + socket.client.id);
    io.sockets.emit('onlineUsersCount', (Object.keys(onlineUsers).length).toString());

    //console.log("a user connected.", socket.client.id);

    socket.on("test", data=>{
        socket.emit("test", participantsOnThisSession);
    });

    socket.on("getAllSessions", data=>{
        socket.request.sessionStore.all((err, sessions)=>{ socket.emit("ses", {"ses": sessions}); });
    });

    socket.on("changeUsername", newUsername => {
        socket.request.session.user.displayName = newUsername;
        socket.request.session.save();
    })

    socket.on("gameData", async data => {
        console.log(socket.request.session);

        var remainingTime;

        var thisMinute = new Date().getMinutes();
        var thisHour = new Date().getHours();
        var thisDay = new Date().getDate();
        var thisMonth = new Date().getMonth();
        var thisYear = new Date().getFullYear();

        if((new Date() - new Date(thisYear, thisMonth, thisDay, thisHour, thisMinute, 15))>0){
            remainingTime = new Date(thisYear, thisMonth, thisDay, thisHour, thisMinute+1, 00) - new Date();
        }
        else{
            remainingTime = new Date(thisYear, thisMonth, thisDay, thisHour, thisMinute, 00) - new Date();
        }

        //socket.request.session.reload(err=>{return socket.emit('gameData', {"status": "sessionReloadError"} );});
        var _isJoinedTheGame = socket.request.session.user.isJoinedTheGame;
        var _balance = socket.request.session.user.balance; 
        var _instantBetAmount = socket.request.session.user.instantBetAmount;
        var _userHistory = socket.request.session.user.userHistory;
        var _displayName = socket.request.session.user.displayName

        socket.emit('gameData', {"responseCode": "1", "remainingTime": remainingTime/1000, "isGameActive": isGameActive, "factor": factor, "isJoinedTheGame": _isJoinedTheGame, "balance": _balance, "instantBetAmount": _instantBetAmount, "displayName": _displayName, "userHistory": _userHistory} );
    });

    socket.on("hit", data => {
        try{
            //socket.request.session.reload(err=>{return socket.emit('hit', {"status": "sessionReloadError"} );});
            if(!isGameActive){return socket.emit("hit", {"status": "gameIsNotActive"}); }
            let gain = socket.request.session.user.instantBetAmount * factor;
            socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount+" | "+factor);
            socket.request.session.user.instantBetAmount = 0;
            socket.request.session.user.balance += gain; 
            socket.request.session.user.isJoinedTheGame = false;
            socket.request.session.save();
            delete participantsOnThisSession[socket.client.id];
            socket.emit('hit', {"status": "succes"} );
        }
        catch{
            socket.emit('hit', {"status": "failed"} );
        }
    });

    socket.on("joinGame", betAmount => {
        try{
            betAmount = parseInt(betAmount);
            //socket.request.session.reload(err=>{return socket.emit('joinGame', {"status": "sessionReloadError"} );});

            if(isGameActive){return socket.emit("joinGame", {"status": "gameAlreadyStarted"}); }
            if(betAmount > socket.request.session.user.balance){return socket.emit("joinGame", {"status": "balance<betamount"}); }
            if(socket.request.session.user.isJoinedTheGame){return socket.emit("joinGame", {"status": "alreadyJoinedTheGame"}); }

            socket.request.session.user.instantBetAmount = parseInt(betAmount);
            socket.request.session.user.balance -= parseInt(betAmount);
            socket.request.session.user.isJoinedTheGame = true;
            socket.request.session.save();
            participantsOnThisSession[socket.client.id] = socket.request.session.user;
            socket.emit('joinGame', {"status": "succes"} );
        }
        catch{
            socket.emit('joinGame', {"status": "failed"} );
        }
    });

    socket.on("leaveGame", data => {
        try{
            if(!socket.request.session.user.isJoinedTheGame){return socket.emit("leaveGame", {"status": "notJoined"});}
            //socket.request.session.reload(err=>{return socket.emit('leaveGame', {"status": "sessionReloadError"} );});
            if(isGameActive){return socket.emit("leaveGame", {"status": "gameIsActive"}); }
            socket.request.session.user.balance += socket.request.session.user.instantBetAmount;
            socket.request.session.user.instantBetAmount = 0;
            socket.request.session.user.isJoinedTheGame = false;
            socket.request.session.save();
            delete participantsOnThisSession[socket.client.id];
            socket.emit('leaveGame', {"status": "succes"} );
        }
        catch{
            socket.emit('leaveGame', {"status": "failed"} );
        }
    });

    socket.on("history", data => {
        io.sockets.emit('history', {"result": factorHistory});
    });

    socket.on("chatMessage", data => {
        io.sockets.emit('chatMessage', {[socket.request.session.user.displayName]: data} );
    });

    socket.on("disconnect", () => {
        //console.log("a user disconnect.", socket.client.id);
        delete onlineUsers[socket.client.id];
        if(socket.request.session.user.isJoinedTheGame){
            delete participantsOnThisSession[socket.client.id];
            socket.request.session.user.isJoinedTheGame = false;
            socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount+" | 0");
            socket.request.session.user.instantBetAmount = 0;
            socket.request.session.save();
        }

        io.sockets.emit("disconnectionInfo", "bir sihirdarın bağlantısı koptu ("+ socket.client.id + ")");
        io.sockets.emit('onlineUsersCount', (Object.keys(onlineUsers).length).toString());
    });
});
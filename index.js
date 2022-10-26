const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const crypto = require('node:crypto');
const socket = require("socket.io");
const fs = require("fs");

const getTopVal = require("./getTopValue");
//const algorithm = require("./algorithm");

const app = express();

const cors = require("cors");
app.use(cors());

app.enable('trust proxy');
app.use(function(request, response, next) {

    if (process.env.NODE_ENV != 'development' && !request.secure) {
       return response.redirect("https://" + request.headers.host + request.url);
    }

    next();
});

app.use("/game/skydiving/", express.static(path.join(__dirname, "game/skydiving/")));
app.use("/game/sky/", express.static(path.join(__dirname, "game/sky/")));

const sessionMiddleware = session({
    secret: 'Yp3s6v9y$B&E)H@MbQeThWmZq4t7w!z%', 
    resave: false, 
    saveUninitialized: true,
});

app.use(sessionMiddleware);

const server = app.listen(80,function(){
    console.log("Server started on port " + 80);
});

const io = socket(server);

var isGameActive = false;
var factor = 1;
var factorHistory = [];

var participantsOnThisSession = {};
var logs = {"participantsCount": 0};
var onlineUsers = {};

var startedTime = Date.now();
var highestFactor = getTopVal.generate_stop_value();
var gameTime = (Math.random() * (highestFactor - 2 + 1) + 2);
var func = (Math.random() * (5 - 1.5 + 1) + 1.5);
calculateFactor(startedTime, gameTime, highestFactor, func);

async function calculateFactor(startedTime, gameTime, highestFactor, func){
    let finishTime = startedTime + parseInt(gameTime*1000);
    if( (Date.now() - finishTime) <= 0 ){6
        isGameActive = true;

        let x = (Date.now()-startedTime)/(gameTime*1000);
        factor = 1 + (highestFactor * (x**func));
        //console.log(factor);
        await new Promise(resolve => setTimeout(resolve, 100));
        calculateFactor(startedTime, gameTime, highestFactor, func);
    }
    else{
        isGameActive = false;
        stopGameFunction(factor, finishTime);
        //factor = 1; //bu seçenek açılırsa oyun bittikten sonra, diğer oyun başlayana kadar factor = 1 datası gönderilir açılmazsa factor önceki oyunda maximum eriştiği değer gönderilir.
    }
}

async function stopGameFunction(factor, finishedTime){
    var saveFactor = factor;
    factor = 1;
    if(factorHistory.length>18){
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
            onlineUsers[Object.keys(participantsOnThisSession)[i]].isJoinedTheGame = false;
            onlineUsers[Object.keys(participantsOnThisSession)[i]].userHistory.push(onlineUsers[Object.keys(participantsOnThisSession)[i]].instantBetAmount+" | 0");
            onlineUsers[Object.keys(participantsOnThisSession)[i]].instantBetAmount = 0;
        }
    }

    let stringifiedLogs = JSON.stringify(logs);
    addLog("participantsLogs.txt", new Date() + " - " + stringifiedLogs);
    addLog("factorHistory.txt", new Date() + " - " + saveFactor);
    //io.sockets.emit('chatMessage', {"system": "gameFinished"} );
    
    logs = {"participantsCount": 0};
    
    participantsOnThisSession = {};

    startedTime = finishedTime + 20000; //15 sn sonra yeni oyun
    highestFactor = getTopVal.generate_stop_value();
    gameTime = (Math.random() * (highestFactor - 2 + 1) + 2);
    func = (Math.random() * (5 - 1.5 + 1) + 1.5);

    await new Promise(resolve => setTimeout(resolve, (startedTime - Date.now()) ));

    calculateFactor(startedTime, gameTime, highestFactor, func);
}

function addLog(filename, data){
    //io.sockets.emit('chatMessage', {"system": "add log" + data} );
    fs.appendFile(filename, "\n"+data, function (err) {
        if (err) {console.log(err); } 
    });
}

app.get("/message", function(req, res){
    res.sendFile(path.join(__dirname, "client.html"));
});

app.get("/pLogs", function(req, res){
    res.sendFile(path.join(__dirname, "participantsLogs.txt"));
    /* */
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
        socket.request.session.user = {"displayName": "user", "balance": 1000, "instantBetAmount": 0, /*"isFiftyCashouted": false,*/ "isJoinedTheGame": false, "userHistory": [] };
        socket.request.session.save();
        onlineUsers[socket.client.id] = socket.request.session.user;
        next(); 
    }
});

io.on("connection", socket => {
    if(!socket.request.session.user){ console.log("notLoggedInBruhhhhhh"); return; }
    if(socket.request.session.user.instantBetAmount>0){ socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount + " | 0"); socket.request.session.user.instantBetAmount = 0; socket.request.session.user.isJoinedTheGame = false; socket.request.session.save(); }

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
        socket.request.session.user.displayName = newUsername.toString();
        socket.request.session.save();
    })

    socket.on("gameData", async data => {
        var remainingTime = (startedTime - Date.now());

        //socket.request.session.reload(err=>{return socket.emit('gameData', {"status": "sessionReloadError"} );});
        var _isJoinedTheGame = socket.request.session.user.isJoinedTheGame;
        var _balance = socket.request.session.user.balance; 
        var _instantBetAmount = socket.request.session.user.instantBetAmount;
        var _userHistory = socket.request.session.user.userHistory;
        var _displayName = socket.request.session.user.displayName

        socket.emit('gameData', {"responseCode": "1", "remainingTime": (remainingTime/1000).toString(), "isGameActive": isGameActive, "factor": factor.toString(), "isJoinedTheGame": _isJoinedTheGame, "balance": _balance.toString(), "instantBetAmount": _instantBetAmount.toString(), "displayName": _displayName, "userHistory": _userHistory.toString()} );
    });

    socket.on("hit", data => {
        try{
            //socket.request.session.reload(err=>{return socket.emit('hit', {"status": "sessionReloadError"} );});
            if(!socket.request.session.user.isJoinedTheGame){return socket.emit("hit", {"status": "notJoined"});}
            if(!isGameActive){return socket.emit("hit", {"status": "gameIsNotActive"}); }
            //if(!socket.request.session.user.isJoinedTheGame){return socket.emit("hit", {"status": "notJoined"}); }
            if(factor == null){factor = 1}
            let saveFactor = factor;
            let gain = socket.request.session.user.instantBetAmount * saveFactor;
            socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount+" | "+saveFactor);
            socket.request.session.user.instantBetAmount = 0;
            socket.request.session.user.balance += gain; 
            socket.request.session.user.isJoinedTheGame = false;
            socket.request.session.save();
            delete participantsOnThisSession[socket.client.id];
            logs[socket.client.id].checkOutFactor = saveFactor;
            socket.emit('hit', {"status": "succes", "factorOnHit": saveFactor.toString(), "gain": gain.toString()} );
        }
        catch{
            socket.emit('hit', {"status": "failed"} );
        }
    });

    
    socket.on("fiftyCashout", data => {
        try{
            //if(socket.request.session.user.isFiftyCashouted){return socket.emit("hit", {"status": "alreadyCashouted"});}
            if(!socket.request.session.user.isJoinedTheGame){return socket.emit("fiftyCashout", {"status": "notJoined"});}
            if(!isGameActive){return socket.emit("fiftyCashout", {"status": "gameIsNotActive"}); }
            if(factor == null){factor = 1}
            let saveFactor = factor;
            let gain = (socket.request.session.user.instantBetAmount * saveFactor)/2;
            socket.request.session.user.userHistory.push(socket.request.session.user.instantBetAmount+" | "+saveFactor);
            socket.request.session.user.instantBetAmount = (socket.request.session.user.instantBetAmount/2);
            socket.request.session.user.balance += gain; 
            socket.request.session.save();
            socket.emit('fiftyCashout', {"status": "succes", "factorOnHit": saveFactor.toString(), "gain": gain.toString()} );
        }
        catch{
            socket.emit('fiftyCashout', {"status": "failed"} );
        }
    });

    socket.on("joinGame", betAmount => {
        try{
            betAmount = parseInt(betAmount);
            if(betAmount <= 0 ||  isNaN(betAmount)){
                return socket.emit("joinGame", {"status": "invalidBetAmount"});
            }
            //socket.request.session.reload(err=>{return socket.emit('joinGame', {"status": "sessionReloadError"} );});

            if(isGameActive){return socket.emit("joinGame", {"status": "gameAlreadyStarted"}); }
            if(betAmount > socket.request.session.user.balance){return socket.emit("joinGame", {"status": "balance<betamount"}); }
            if(socket.request.session.user.isJoinedTheGame){return socket.emit("joinGame", {"status": "alreadyJoinedTheGame"}); }

            socket.request.session.user.instantBetAmount = betAmount;
            socket.request.session.user.balance -= betAmount;
            socket.request.session.user.isJoinedTheGame = true;
            socket.request.session.save();
            participantsOnThisSession[socket.client.id] = socket.request.session.user;
            logs.participantsCount += 1;
            logs[socket.client.id] = {"betAmount": betAmount};
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
            logs.participantsCount += -1;
            delete logs[socket.client.id];

            socket.emit('leaveGame', {"status": "succes"} );
        }
        catch{
            socket.emit('leaveGame', {"status": "failed"} );
        }
    });

    socket.on("history", data => {
        socket.emit('history', {"result": factorHistory.toString()});
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
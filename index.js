const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
//const firebaseManager = require("./firebase");
//const firebaseAdminManager = require("./firebase-admin");
const crypto = require('node:crypto');
const schedule = require('node-schedule');
const socket = require("socket.io");

const app = express();

const cors = require("cors");
app.use(cors());

app.use("/game/skydiving/", express.static(path.join(__dirname, "game/skydiving/")));
app.use("/game/sky/", express.static(path.join(__dirname, "game/sky/")));

/*
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.set("view engine", "ejs");
*/

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

/*
app.post("/login", async function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!(req.body.email && req.body.password)){
        return res.send({"responseCode": "-7"});
    }
    firebaseManager.login(req.body.email, req.body.password, async function(err, user){
        if(err){
            if(err == "auth/invalid-email"){ res.send({"responseCode": "-8"}); }
            else if(err == "auth/wrong-password"){ res.send({"responseCode": "-9"}); }
            else if(err == "auth/internal-error"){ res.send({"responseCode": "-10"}); }
            else if(err == "auth/user-not-found"){ res.send({"responseCode": "-11"}); }
            else if(err == "auth/quota-exceeded"){ res.send({"responseCode": "-12"}); }
            else{ res.send({"responseCode": "-13"}); }
            console.log(err);
        }
        else{
            console.log("uid: "+user.uid+" displayName: "+user.displayName+" Logged in");
            sessionManager.user = user;

            var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
            if(userDb.err){ return res.send({"responseCode": "-96"}); }

            //sessionManager.userDb = userDb.result.data();

            var isJoinedTheGame = false; var instantBetAmount = 0;
            if(userDb.result.data().instantBetAmount > 0){
                isJoinedTheGame = true;
                instantBetAmount = userDb.result.data().instantBetAmount;
            }

            res.send({"responseCode": "1", "isGameActive": isGameActive, "additional": {"displayName": user.displayName, "isJoinedTheGame": isJoinedTheGame, "instantBetAmount": parseInt(instantBetAmount), "balance": parseInt(userDb.result.data().balance)} })
        } 
    });
});

app.get("/remainingTime", async function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!sessionManager.user){ return res.send({"responseCode": "-1"}); }

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

    //SILINECEK
    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }
    //sessionManager.userDb = userDb.result.data();
    //SILINECEK

    var isJoinedTheGame = false; var instantBetAmount = 0;
    if(userDb.result.data().instantBetAmount > 0){
        isJoinedTheGame = true;
        instantBetAmount = userDb.result.data().instantBetAmount;
    }
/*
    var factor = 1; var varE = 10; var varH = (Math.floor(Math.random() * (9 - 3 + 1) + 3));
    if(isGameActive){
        factor = 0.99*varE/(varE*varH);
    }
/
    res.send({"responseCode": "1", "remainingTime": remainingTime/1000, "isGameActive": isGameActive, "factor": factor, "additional": { "displayName": sessionManager.user.displayName, "userHistory": userDb.result.data().history, "isJoinedTheGame": isJoinedTheGame, "instantBetAmount": parseInt(instantBetAmount), "balance": parseInt(userDb.result.data().balance) }});
});

app.get("/hit", async function(req, res){
    var saveFactor = factor;
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!sessionManager.user){ return res.send({"responseCode": "-1"}); }

    //SILINECEK
    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }
    //sessionManager.userDb = userDb.result.data();
    //SILINECEK

    var isJoinedTheGame = false; var instantBetAmount = 0;
    if(userDb.result.data().instantBetAmount > 0){
        isJoinedTheGame = true;
        instantBetAmount = userDb.result.data().instantBetAmount;
    }

    if(!isJoinedTheGame){ return res.send({"responseCode": "-50"}); }

    var history = userDb.result.data().history;
    history.push(new Date() + " | " + instantBetAmount + " | " + saveFactor);

    var earned = saveFactor * instantBetAmount;

    var updateUser = await firebaseAdminManager.updateDocument("users/"+sessionManager.user.uid, {"instantBetAmount": 0, "balance": (parseInt(userDb.result.data().balance) + parseInt(earned)), "history": history });
    if(updateUser.err){ return res.send({"responseCode": "-95"}); }

    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }

    //console.log(sessionManager.user, new Date().getTime()); //to firebase

    res.send({"responseCode": "1", "factorOnHit": saveFactor, "earnedBalance": earned});
});

app.post("/joinGame", async function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!sessionManager.user){ return res.send({"responseCode": "-1"}); }
    if(!(req.body.betAmount)){ return res.send({"responseCode": "-99"}); }
    if(isGameActive){ return res.send({"responseCode": "-33"}); }
    if(req.body.betAmount <= 0){ return res.send({"responseCode": "-32"}); }

    //SILINECEK
    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }
    //sessionManager.userDb = userDb.result.data();
    //SILINECEK

    if(userDb.result.data().instantBetAmount > 0){
        return res.send({"responseCode": "-31"})
    }

    if(parseInt(userDb.result.data().balance) < parseInt(req.body.betAmount)){
        return res.send({"responseCode": "-30"})
    }

    var newBalance = (parseInt(userDb.result.data().balance) - parseInt(req.body.betAmount));

    var updateUser = await firebaseAdminManager.updateDocument("users/"+sessionManager.user.uid, {"instantBetAmount": parseInt(req.body.betAmount), "balance": newBalance});
    if(updateUser.err){ return res.send({"responseCode": "-95"}); }

    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }

    participantsOnThisSession[sessionManager.user.uid] = sessionManager.user;

    res.send({"responseCode": "1", "additional": {"displayName": sessionManager.user.displayName, "isJoinedTheGame": true, "instantBetAmount": parseInt(req.body.betAmount), "balance": newBalance}});
});

app.get("/leaveGame", async function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!sessionManager.user){ return res.send({"responseCode": "-1"}); }
    if(isGameActive){ return res.send({"responseCode": "-70"}); }

    //SILINECEK
    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }
    //sessionManager.userDb = userDb.result.data();
    //SILINECEK

    if(userDb.result.data().instantBetAmount == 0){ return res.send({"responseCode": "-71"}); }

    var newBalance = (parseInt(userDb.result.data().balance) + parseInt(userDb.result.data().instantBetAmount));

    var updateUser = await firebaseAdminManager.updateDocument("users/"+sessionManager.user.uid, {"instantBetAmount": 0, "balance": newBalance});
    if(updateUser.err){ return res.send({"responseCode": "-95"}); }

    var userDb = await firebaseAdminManager.getSnap("users/"+sessionManager.user.uid);
    if(userDb.err){ return res.send({"responseCode": "-96"}); }
    
    delete participantsOnThisSession[sessionManager.user.uid];

    res.send({"responseCode": "1", "additional": {"displayName": sessionManager.user.displayName, "isJoinedTheGame": false, "instantBetAmount": 0, "balance": newBalance}});
});
*/
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
    /*
    var historyDb = await firebaseAdminManager.getSnap("history/factorHistory");
    if(historyDb.err){ return; }
    var history = historyDb.result.data().factors;

    if(history.length>19){
        var newHistory = [];
        for(let i = 0; i<history.length; i++){
            if(i!=0){
                newHistory.push(history[i]);
            }
        }
        history = newHistory;
    }

    history.push(saveFactor)
    var updateHistory = await firebaseAdminManager.updateDocument("history/factorHistory", {"factors": history})
    if(updateHistory.err){ return; }
*/

    
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
        /*
        for(let participant in participantsOnThisSession){
            var uid = (participantsOnThisSession[participant]).uid;
            await firebaseAdminManager.updateDocument("users/"+uid, {"instantBetAmount": 0});
            
        }*/
        for(let i = 0; i<Object.keys(participantsOnThisSession).length; i++){
            onlineUsers[Object.keys(participantsOnThisSession)[i]].instantBetAmount = 0;
        }
    }
    
    participantsOnThisSession = {};
}
/*
app.get("/history", async function(req, res){
    var historyDb = await firebaseAdminManager.getSnap("history/factorHistory");
    if(historyDb.err){ return res.send({"responseCode": "-96"}); }
    res.send({"responseCode": "1", "history": historyDb.result.data().factors});
});

app.post("/addUser", async function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!(req.body.email && req.body.password && req.body.dpn)){ res.send({"responseCode": "-99"}); }

    var user = await firebaseAdminManager.createNewUser(req.body.email, req.body.password, req.body.dpn);
    
    if(user.err){
        if(user.err == "auth/email-already-exists"){ return res.send({"responseCode": "-21"}); }
        else if(user.err == "auth/invalid-password"){ return res.send({"responseCode": "-22"}); }
        else if(user.err == "auth/invalid-email"){ return res.send({"responseCode": "-23"}); }
        else{
            console.log(user.err)
            return res.send({"responseCode": "-24"});
        }   
    }

    var parameters = {
        "username": "usname",
        "balance": 1000, //starting balance
        "instantBetAmount": 0,
        "history": [],
    }

    var createUserInDb = await firebaseAdminManager.createDocument("users/"+user.result.uid, parameters);
    if(createUserInDb.err){ return res.send({"responseCode": "-97"}); }
    
    res.send({"responseCode": "1"});
});

app.get("/message", function(req, res){
    res.sendFile(path.join(__dirname, "client.html"));
});

app.get("/post", function(req, res){
    res.sendFile(path.join(__dirname, "post.html"));
});



app.get("/onlineUsers", function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    res.send(onlineUsers)
});

/*
app.get("/connection", function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(sessionManager.user){ return res.send({"response": "already logged in"}); }
    sessionManager.user = {"displayName": "user", "uid": "123"};
    res.send({"response": "logged in successfully"});
});


app.post("/changeUsername", function(req, res){
    res.set({'content-type': 'application/json; charset=utf-8'});
    sessionManager = req.session;
    if(!sessionManager.user){ return res.send({"responseCode": "-5"}); } // you must login first
    if(!req.body.username){ return res.send({"responseCode": "-99"}); }

    sessionManager.user.displayName = req.body.username;

    res.send(sessionManager.user);
});
*/
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
        socket.request.session.user = {"displayName": "user", "balance": 1000, "instantBetAmount": 0, "isJoinedTheGame": false, "userHistory": [] };
        socket.request.session.save();
        onlineUsers[socket.client.id] = socket.request.session.user;
        next(); 
    }
});

io.on("connection", socket => {
    if(!socket.request.session.user){ console.log("notLoggedInBruhhhhhh"); return; }
    if(socket.request.session.user.instantBetAmount>0){ socket.request.session.history += socket.request.session.user.instantBetAmount.toString() + " | 0"; socket.request.session.user.instantBetAmount = 0; socket.request.session.user.isJoinedTheGame = false; socket.request.session.save(); }

    io.sockets.emit('connectionInfo', "Bir sihirdar bağlandı. Sihirdarın id'si: " + socket.client.id);
    io.sockets.emit('onlineUsersCount', (Object.keys(onlineUsers).length).toString());

    //console.log("a user connected.", socket.client.id);

    socket.on("test", data=>{
        socket.emit("test", participantsOnThisSession);
    });

    socket.on("getAllSessions", data=>{
        socket.request.sessionStore.all((err, sessions)=>{ console.log(sessions); });
    });

    socket.on("changeUsername", newUsername => {
        socket.request.session.user.displayName = newUsername;
        socket.request.session.save();
    })

    socket.on("gameData", async data => {
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

        var _isJoinedTheGame = socket.request.session.isJoinedTheGame;
        var _balance = socket.request.session.balance; 
        var _instantBetAmount = socket.request.session.instantBetAmount;
        var _userHistory = socket.request.session.userHistory;
        var _displayName = socket.request.session.displayName

        socket.emit('gameData', {"responseCode": "1", "remainingTime": remainingTime/1000, "isGameActive": isGameActive, "factor": factor }, "isJoinedTheGame" );
    });

    socket.on("hit", data => {
        try{
            socket.request.session.reload(err=>{return socket.emit('joinGame', {"status": "succes"} );});
            if(!isGameActive){return socket.emit("hit", {"status": "gameIsNotActive"}); }
            let gain = socket.request.session.user.instantBetAmount * factor;
            socket.request.session.user.userHistory += factor+" | "+socket.request.session.user.instantBetAmount;
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
            socket.request.session.reload(err=>{return socket.emit('joinGame', {"status": "succes"} );});

            if(isGameActive){return socket.emit("joinGame", {"status": "gameAlreadyStarted"}); }
            if(betAmount > socket.request.session.balance){return socket.emit("joinGame", {"status": "balance<betamount"}); }

            socket.request.session.user.instantBetAmount = parseInt(betAmount);
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
            if(onlineUsers[socket.client.id])
            socket.request.session.reload(err=>{return socket.emit('leaveGame', {"status": "succes"} );});
            if(!isGameActive){return socket.emit("joinGame", {"status": "gameIsntActive"}); }
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
        io.sockets.emit('chatMessage', {[onlineUsers[socket.client.id].displayName]: data} );
    });

    socket.on("disconnect", () => {
        //console.log("a user disconnect.", socket.client.id);
        delete onlineUsers[socket.client.id];
        io.sockets.emit("disconnectionInfo", "bir sihirdarın bağlantısı koptu ("+ socket.client.id + ")");
        io.sockets.emit('onlineUsersCount', (Object.keys(onlineUsers).length).toString());
    });
});
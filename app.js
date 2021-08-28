const MAXAGE = 6000000;
const multer = require("multer");
const path = require("path");
var uuid = require("node-uuid");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const ejs = require("ejs");
const socketio = require("socket.io");
const session = require("express-session")({
  secret: "someSecret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: MAXAGE },
});
const sha1 = require("sha1");
const nodemailer = require("nodemailer");
const sharedSession = require("express-socket.io-session");
const { info } = require("console");


const app = express();
const server = http.createServer(app);
const upload = multer({ dest: path.join(__dirname, "uploads/") });
const io = socketio(server);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "rukshanathapaththu07@gmail.com",
    pass: "RUKshan!!07",
  },
});

//setups
app.set("view engine", "ejs");
//middlwar
app.use(express.static("./public"));
app.use(express.urlencoded({ extended: false }));
app.use(session);
io.use(sharedSession(session));
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "RUKshan!!07",
  database: "userdb"
});
db.connect((err) => {
  if (err) throw err;
  console.log("mysql connected");
});

// function
function hash(password) {
  return sha1(password);
}
function checkAuth(req, res, next) {
  if (req.session.athenticated) {
    req.session.cookie.maxAge = MAXAGE;
    next();
  } else {
    res.redirect("/checkLog");
  }
}
function getRequestData(reqId,callBack) {
  let sql = `SELECT * FROM  requests WHERE requestId="${reqId}" LIMIT 1`;
  db.query(sql, (err, result) => {
    if (err) throw err;
    callBack(result[0]);
  });
}
function addComment(obj,callBack) {
  let sql ="INSERT INTO comments (requestId, userName, comment, date) VALUES (?, ?, ?, ?)";
  console.log("in");
	db.query(sql, [obj.reqId, obj.user, obj.comment, obj.date], (error, results, fields) => {
    let sql1 = "UPDATE requests SET lastModification = ? WHERE requestId = ?";
    db.query(sql1, [Date.now(), obj.reqId], (error, results, fields) => {
			callBack(error, obj);
    })
	});
}
function updateStatus(inform,callBack){
  inform.date=Date.now();
  let sql2 = "UPDATE requests SET status = ? , lastModification = ? WHERE requestId = ?";
	db.query(sql2, [inform.status, inform.date  ,inform.reqId], (error, results, fields) => {
		callBack(error,inform);
		});
}


//run when client coonect to dashboard
io.on("connection", (socket) => {
  //io.emit(); everyone
  //socket.emit(); current user (one)
  //socket.broadcast.emit(); athul wechcha ekana nathuwa anith okkotama
  const socketSession = socket.handshake.session;
  if (socketSession.athenticated) {
    if (socketSession.isAdmin) socket.join("staff_" + socketSession.user);
    else socket.join("student_" + socketSession.user);
    socket.on("joinChat", (reqId) => {
      if (!socketSession.athenticated) return;
      getRequestData(reqId, (reqData) => {
        if (reqData &&(reqData.userName === socketSession.user ||reqData.lecturer === socketSession.user)){
          console.log("room_"+reqId+ " add "+socketSession.user);
          socket.join("room_" + reqId);
        }
      });
    });
    socket.on('postComment', (postComment)=>{
      //{reqId : reqId, comment : message}
      if (!socketSession.athenticated) return;
      postComment.user=socketSession.user;
      postComment.date=Date.now();
      addComment(postComment,(err,data)=>{
        console.log("room_"+data.reqId);
        if(err) console.log(err);
        else{ 
          console.log(data);
          io.to("room_"+data.reqId).emit("newComment",data);
          io.to("student_" + data.student).emit("updatePossition", data);
          io.to("staff_" + data.lecturer).emit("updatePossition", data);}
      });
    });
    socket.on('setStatus',(inform)=>{
      //{reqId : reqId,status : status}
      if (!socketSession.athenticated) return;
      updateStatus(inform,(err,data)=>{
        if(err) console.log(err);
        else {
          console.log(data.student+"|"+data.lecturer+"|");
          io.to("room_"+data.reqId).emit("updateStatus",data);
          io.to("student_" + data.student).emit("updateStatus", data);
          io.to("staff_" + data.lecturer).emit("updateStatus", data);     
      }
      });
  });


  }

  //Run when client disconnects
  socket.on("disconnect", () => {
    console.log("disconect");
  });
});

//routers
app.get("/cover", (req, res) => {
  res.render("cover_page");
});
app.get("/signIn", (req, res) => {
  if (req.session.athenticated) {
    res.redirect("/dashboard");
  } else {
    const { invalid } = req.query;
    res.render("signIn", {
      invalidLogin: invalid === "true",
      message: req.query.msg || "Invalid login details",
    });
  }
});
app.post("/signIn", (req, res) => {
  const { UserName, password } = req.body;
  const hashPassword = hash(password);
  let sql = `SELECT * FROM user WHERE userName="${UserName}" AND password="${hashPassword}"`;
  let query = db.query(sql, (err, result) => {
    if (err) {
      throw err;
    } else {
      if (result.length > 0) {
        req.session.athenticated = true;
        req.session.user = UserName;
        req.session.isAdmin = "staff" === result[0].type;
        console.log(result[0].type);
        res.redirect("/dashboard");
      } else {
        res.redirect("/signIn?invalid=true");
      }
    }
  });
});

app.get("/signIn/forget", (req, res) => {
  res.render("forget");
});

app.post("/signIn/forget", (req, res) => {
  const { to } = req.body;
  const mailOptions = {
    from: "rukshanathapaththu07@gmail.com",
    to: to,
    subject: "sending email using node.js",
    text: "hi i know  i can do that!!",
    html: `<div style="background-color:black;color:white;padding:20px;">
            <h2>London</h2>
            <p>London is the capital city of England. It is the most populous city in the United Kingdom, with a metropolitan area of over 13 million inhabitants.</p>
            <p>Standing on the River Thames, London has been a major settlement for two millennia, its history going back to its founding by the Romans, who named it Londinium.</p>
          </div> `,
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.log("error");
    else console.log("send");
  });
  res.redirect("/signIn");
});

app.get("/signUp", (req, res) => {
  if (req.session.athenticated) {
    res.redirect("/dashboard");
  } else {
    const { invalid } = req.query;
    res.render("signUp", {
      invalidLogin: invalid === "true",
      message: req.query.msg || "Invalid  details",
    });
  }
});
var indexLecture = 3;
app.post("/signUp", (req, res) => {
  const { UserName, password, typ, telephone, email, index, department } =
    req.body;
  const finalUserName = UserName.trim();
  const finalpassword = password.trim();
  const finaltype = typ.trim();
  const finaltelephone = telephone.trim();
  const finalemail = email.trim();
  const hashPassword = hash(finalpassword);
  var finalindex;
  var finaldepartment;
  if (finaltype == "student") {
    finalindex = index.trim();
    finaldepartment = department.trim();
  } else {
    finalindex = indexLecture++;
    finaldepartment = "-";
  }
  //prepare database query
  let sql = `INSERT INTO user(userName,password,type,telephone,email,indexNo,department) 
  VALUES("${finalUserName}","${hashPassword}","${finaltype}","${finaltelephone}","${finalemail}","${finalindex}","${finaldepartment}")`;
  let query = db.query(sql, (err, result) => {
    if (err) {
      res.redirect("/signUp?invalid=true");
    } else {
      res.redirect("/signIn");
    }
  });
});

app.get("/dashboard/requestForm", checkAuth, (req, res) => {
  const UserName = req.session.user;
  let sql1 = `SELECT userName FROM user WHERE type="staff"`;
  let lectureList;
  let query1 = db.query(sql1, (err, result) => {
    lectureList = result;
  });
  let sql2 = `SELECT * FROM user WHERE userName="${UserName}"`;
  db.query(sql2, (err, result) => {
    if (err) {
      console.log(err.message);
      res.sendStatus(404);
    } else {
      res.render("request_form", {
        fullName: result[0].userName,
        contact: result[0].telephone,
        email: result[0].email,
        index: result[0].indexNo,
        requests: lectureList,
        department: result[0].department,
      });
    }
  });
});
app.post(
  "/dashboard/requestForm",
  checkAuth,
  upload.array("files"),
  (req, res) => {
    const { reqtype, reason, description, lecturer } = req.body;
    const date = Date.now();
    const userName = req.session.user;
    const finalreqtype = reqtype.trim();
    const finalreason = reason.trim();
    const finallecturer = lecturer.trim();
    const finaldescription = description.trim();
    const files = req.files.map((file) => {
      return {
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
      };
    });
    const finalfile = JSON.stringify(files);
    //prepare database query
    let sql =
      "INSERT INTO requests (reqtype, reason, description, files, date, userName,lecturer,lastModification) VALUES (?, ?, ?, ?, ?, ?,?,?)";
    db.query(
      sql,
      [
        finalreqtype,
        finalreason,
        finaldescription,
        finalfile,
        date,
        userName,
        finallecturer,
        date,
      ],
      (error, reqData) => {
        //let reqID = null;
        if (error) {
          console.log("error");
        } else {
          //reqID = results.insertId;
          console.log("request saved : ID=" + reqData.insertId);
          reqData.user = req.session.user;
          reqData.type = finalreqtype;
          reqData.reason = finalreason;
          reqData.lastModification = date;
          reqData.status = "pending";
          io.to("student_" + userName).emit("newRequest", reqData);
          io.to("staff_" + finallecturer).emit("newRequest", reqData);
          
        }
        //callFunc(error, {reqId : reqID, date : curDate});
      }
    );
    res.redirect("/dashboard");
  }
);

app.get("/", (req, res) => {
  res.redirect("/cover");
});

app.get("/dashboard", checkAuth, (req, res) => {
  if (req.session.athenticated) {
    const UserName = req.session.user;
    if (!req.session.isAdmin) {
      let sql = `SELECT * FROM  requests WHERE userName="${UserName}" ORDER BY lastModification DESC`;
      db.query(sql, (error, results) => {
        if (error) {
          console.log("error");
        } else {
          res.render("home_student", {
            fullname: req.session.user,
            requests: results,
          });
        }
        //callFunc(error, {reqId : reqID, date : curDate});
      });
    } else {
      let sql = `SELECT * FROM  requests WHERE lecturer="${UserName}"  ORDER BY lastModification DESC`;
      db.query(sql, (error, results) => {
        if (error) {
          console.log("error");
        } else {
          res.render("home_admin", {
            fullname: req.session.user,
            requests: results,
          });
        }
        //callFunc(error, {reqId : reqID, date : curDate});
      });
    }
  } else {
    res.redirect("/signIn");
  }
});
app.get("/signOut", (req, res) => {
  req.session.destroy();
  res.redirect("/signIn");
});
app.get("/checkLog", (req, res) => {
  res.render("checkLog");
});

app.get("/dashboard/request_view", checkAuth, (req, res) => {
  const { id } = req.query;
  let sql3 = `SELECT * FROM  requests WHERE requestId="${id}" LIMIT 1`;
  db.query(sql3, (err, result1) => {
    if (err) console.log("error");
    else {
      if (result1[0] &&( result1[0].userName === req.session.user ||result1[0].lecturer === req.session.user)) {
        let sql1 = `SELECT * FROM comments WHERE requestId=${id} ORDER BY commentId`;
        db.query(sql1, (err, result2) => {
          if (err) console.log("error1");
          else {
            res.render("request_view", {
              reqId: id,
              user: result1[0].userName,
              reason: result1[0].reason,
              type: result1[0].reqtype,
              description: result1[0].description,
              files: JSON.parse(result1[0].files),
              date: result1[0].date,
              lecturer:result1[0].lecturer,
              status: result1[0].status,
              isAdmin: req.session.isAdmin,
              comments: result2,
            });
          }
        });
      } else {
        res.send("<script>window.close();</script > ");
      }
    }
  });
});
app.get("/dashboard/request_view/file", function (req, res) {
  const userName = req.session.username;
  const reqId = req.query.req;
  const file_var = req.query.file;
  if (reqId && file_var && /^\d+$/.test(reqId)) {
    let sql = `SELECT * FROM  requests WHERE requestId="${reqId}" LIMIT 1`;
    db.query(sql, (err, request) => {
      if (err) {
        console.log(err.message);
        res.sendStatus(404);
      } else {
        console.log(request);
        if (request.userName === userName || req.session.isAdmin) {
          let files = JSON.parse(request[0].files);
          let notFound = true;
          files.forEach((file) => {
            if (file.filename === file_var) {
              res.download(
                path.join(__dirname, "/uploads/") + file_var,
                file.originalname
              );
              notFound = false;
            }
          });
          if (notFound) {
            res.sendStatus(404);
          }
        } else {
          res.sendStatus(404);
        }
      }
    });
  } else {
    res.sendStatus(400);
  }
});
app.get("/test",(req,res)=>{
  res.redirect("/dashboard");
});
app.all("*", (req, res) => {
  res.status(404).send("resource not found");
});

//port listning
var port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`listening port ${port}!!!..`);
});

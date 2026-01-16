import express from "express";
//START DISCORD BOT
require("./client");
const PORT = process.env.PORT || 4001;

const app = express();

app.listen(PORT, function () {
  console.log("Listening on Port " + PORT);
});

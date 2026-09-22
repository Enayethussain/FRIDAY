const WebSocket = require('ws');
try {
  new WebSocket("wss://generativelanguage.googleapis.com/ws/something?key=AIzaSy%Invalid");
  console.log("Success");
} catch (e) {
  console.log("Error:", e.stack);
}

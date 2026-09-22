const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/live?voice=Aoede');
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'setup',
    context: {
        memoriesDigest: "Some memory"
    }
  }));
});
ws.on('message', (data) => {
    console.log("MSG", data.toString());
    process.exit(0);
});
ws.on('error', (e) => console.error(e));

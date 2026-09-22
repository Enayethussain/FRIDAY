const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/live?voice=Aoede');
ws.on('open', () => {
  console.log('WS Open');
  ws.send(JSON.stringify({
    type: 'setup',
    context: {
      commanderName: 'Test',
      callSign: 'Test',
      clearance: 'LEVEL 5',
      enforceOnly: false
    }
  }));
});
ws.on('message', (data) => {
  console.log('WS Message:', data.toString());
});
ws.on('close', () => {
  console.log('WS Close');
});
ws.on('error', (err) => {
  console.error('WS Error:', err);
});

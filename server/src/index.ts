import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { SYNC_PORT } from '@field-form/shared';
import { WebSocketServer } from 'ws';
import { Hub } from './hub';
import { openSqliteStore } from './store';

const port = Number(process.env.PORT ?? SYNC_PORT);
const dbPath = resolve(process.env.DB_PATH ?? 'data/field-form.db');
const log = (line: string) => console.log(`[sync] ${line}`);

const hub = new Hub(openSqliteStore(dbPath), log);

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http });
wss.on('connection', (ws) => {
  const session = hub.connect((msg) => ws.send(JSON.stringify(msg)));
  ws.on('message', (data) => session.receive(data.toString()));
  ws.on('close', () => session.close());
});

http.listen(port, '0.0.0.0', () => {
  log(`listening on ws://0.0.0.0:${port}  (db: ${dbPath})`);
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  for (const ip of lan) log(`  physical devices on this network: ws://${ip}:${port}`);
  log(`  Android emulator: ws://10.0.2.2:${port}`);
});

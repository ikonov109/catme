const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname)));

const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE));
        }
    } catch (e) {}
    return { users: [], messages: [], groups: [] };
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();
let online = new Map();

function hash(p) {
    let h = 0;
    for (let i = 0; i < p.length; i++) h = ((h << 5) - h) + p.charCodeAt(i);
    return Math.abs(h).toString(36);
}

app.post('/api/register', (req, res) => {
    const { name, pass } = req.body;
    if (db.users.find(u => u.name === name)) return res.status(400).json({ error: 'есть' });
    const user = { id: 'u' + Date.now(), name, pass: hash(pass), avatar: name[0] };
    db.users.push(user);
    saveDB();
    res.json(user);
});

app.post('/api/login', (req, res) => {
    const { name, pass } = req.body;
    const u = db.users.find(u => u.name === name);
    if (!u || u.pass !== hash(pass)) return res.status(401).json({ error: 'no' });
    res.json({ id: u.id, name: u.name, avatar: u.avatar });
});

app.get('/api/users', (req, res) => {
    res.json(db.users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar })));
});

app.get('/api/messages/:me/:to', (req, res) => {
    const { me, to } = req.params;
    const list = db.messages.filter(m => 
        (m.from === me && m.to === to) || (m.from === to && m.to === me)
    );
    res.json(list);
});

app.post('/api/upload', (req, res) => {
    const { from, to, type, data } = req.body;
    const msg = { id: 'm' + Date.now(), from, to, type, data, time: Date.now() };
    db.messages.push(msg);
    saveDB();

    const ws = online.get(to);
    if (ws) ws.send(JSON.stringify({ type: 'msg', msg }));

    res.json({ ok: true });
});

wss.on('connection', (ws) => {
    ws.on('message', (d) => {
        const m = JSON.parse(d);
        if (m.type === 'login') {
            ws.id = m.id;
            online.set(m.id, ws);
            broadcastOnline();
        }
        if (m.type === 'msg') {
            const msg = { id: 'm' + Date.now(), from: m.from, to: m.to, type: 'text', data: m.data, time: Date.now() };
            db.messages.push(msg);
            saveDB();

            const to = online.get(m.to);
            if (to) to.send(JSON.stringify({ type: 'msg', msg }));
        }
        if (m.type === 'call' || m.type === 'answer' || m.type === 'ice') {
            const to = online.get(m.to);
            if (to) to.send(JSON.stringify(m));
        }
    });
    ws.on('close', () => {
        if (ws.id) online.delete(ws.id);
        broadcastOnline();
    });
});

function broadcastOnline() {
    const list = Array.from(online.keys());
    online.forEach(ws => ws.send(JSON.stringify({ type: 'online', list })));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('✅ http://localhost:' + PORT));

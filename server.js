const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const DB_FILE = path.join(__dirname, 'database.json');

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {}
    return { users: [], messages: [] };
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {}
}

let db = loadDatabase();
let onlineUsers = new Map();

function hashPassword(pass) {
    if (!pass) return '';
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
    }
    return Math.abs(hash).toString(36);
}

// API
app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    if (db.users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'Уже есть' });
    }
    const user = {
        id: 'user_' + Date.now(),
        name,
        avatar: name.charAt(0).toUpperCase(),
        password: hashPassword(password)
    };
    db.users.push(user);
    saveDatabase();
    res.json({ success: true, user });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = db.users.find(u => u.name === name);
    if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ error: 'Неверный логин/пароль' });
    }
    res.json(user);
});

app.get('/api/users', (req, res) => {
    res.json(db.users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar })));
});

app.get('/api/messages/:userId1/:userId2', (req, res) => {
    const { userId1, userId2 } = req.params;
    const messages = db.messages.filter(m => 
        (m.from === userId1 && m.to === userId2) ||
        (m.from === userId2 && m.to === userId1)
    );
    res.json(messages);
});

// WebSocket
wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'login') {
            ws.userId = msg.userId;
            onlineUsers.set(msg.userId, ws);
            
            // Уведомляем всех о новом онлайн
            broadcastOnline();
        }
        
        if (msg.type === 'message') {
            // Сохраняем
            const message = {
                id: 'msg_' + Date.now(),
                from: msg.from,
                to: msg.to,
                text: msg.text,
                time: Date.now()
            };
            db.messages.push(message);
            saveDatabase();
            
            // Отправляем получателю
            const recipientWs = onlineUsers.get(msg.to);
            if (recipientWs) {
                recipientWs.send(JSON.stringify({
                    type: 'message',
                    message: message
                }));
            }
            
            // Подтверждение отправителю
            ws.send(JSON.stringify({
                type: 'sent',
                id: message.id
            }));
        }
    });
    
    ws.on('close', () => {
        if (ws.userId) {
            onlineUsers.delete(ws.userId);
            broadcastOnline();
        }
    });
});

function broadcastOnline() {
    const online = Array.from(onlineUsers.keys());
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'online', users: online }));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});

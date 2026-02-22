const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ========== ФАЙЛОВАЯ БАЗА ДАННЫХ ==========
const DB_FILE = path.join(__dirname, 'database.json');

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('Ошибка загрузки:', e);
    }
    return { users: [], messages: [] };
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log('💾 База сохранена');
    } catch (e) {
        console.log('Ошибка сохранения:', e);
    }
}

let db = loadDatabase();
let onlineUsers = new Map();

function saveDB() {
    saveDatabase();
}

// ========== ХЕШ ПАРОЛЯ ==========
function hashPassword(pass) {
    if (!pass) return '';
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
    }
    return Math.abs(hash).toString(36);
}

// ========== API ==========
app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Заполните поля' });

    const exists = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(400).json({ error: 'Уже есть' });

    const user = {
        id: 'user_' + Date.now(),
        name,
        avatar: name.charAt(0).toUpperCase(),
        password: hashPassword(password),
        created: Date.now()
    };

    db.users.push(user);
    saveDB();
    res.json({ success: true, user: { id: user.id, name: user.name, avatar: user.avatar } });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Не найден' });
    if (user.password !== hashPassword(password)) return res.status(401).json({ error: 'Неверный пароль' });

    res.json({ id: user.id, name: user.name, avatar: user.avatar });
});

app.get('/api/users', (req, res) => {
    const usersPublic = db.users.map(u => ({
        id: u.id, name: u.name, avatar: u.avatar
    }));
    res.json(usersPublic);
});

app.get('/api/messages/:userId', (req, res) => {
    const userMessages = db.messages.filter(m => m.from === req.params.userId || m.to === req.params.userId);
    res.json(userMessages);
});

// ========== WEB SOCKET ==========
wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'login') {
            ws.userId = msg.userId;
            ws.userName = msg.userName;
            onlineUsers.set(msg.userId, ws);
            broadcastOnline();
        }
        if (msg.type === 'message') {
            db.messages.push(msg);
            saveDB();
            const recipient = onlineUsers.get(msg.to);
            if (recipient) recipient.send(JSON.stringify(msg));
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
    onlineUsers.forEach(ws => ws.send(JSON.stringify({ type: 'online', users: online })));
}

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер на порту ${PORT}, пользователей: ${db.users.length}`);
});

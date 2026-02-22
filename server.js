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
    return { users: [], messages: [], groups: [], channels: [], friends: [] };
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

function saveDB() { saveDatabase(); }

// ========== ХЕШ ПАРОЛЯ ==========
function hashPassword(pass) {
    if (!pass) return '';
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
    }
    return Math.abs(hash).toString(36);
}

// ========== API ПОЛЬЗОВАТЕЛЕЙ ==========
app.post('/api/register', (req, res) => {
    const { name, password, bio, avatar } = req.body;
    if (!name || !password) return res.status(400).json({ error: 'Заполните поля' });

    const exists = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(400).json({ error: 'Уже есть' });

    const user = {
        id: 'user_' + Date.now(),
        name,
        avatar: avatar || name.charAt(0).toUpperCase(),
        password: hashPassword(password),
        bio: bio || '',
        friends: [],
        created: Date.now()
    };

    db.users.push(user);
    saveDB();
    res.json({ success: true, user: { id: user.id, name: user.name, avatar: user.avatar, bio: user.bio } });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Не найден' });
    if (user.password !== hashPassword(password)) return res.status(401).json({ error: 'Неверный пароль' });
    res.json({ id: user.id, name: user.name, avatar: user.avatar, bio: user.bio, friends: user.friends });
});

app.get('/api/users', (req, res) => {
    const usersPublic = db.users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar, bio: u.bio }));
    res.json(usersPublic);
});

app.post('/api/add-friend', (req, res) => {
    const { userId, friendId } = req.body;
    const user = db.users.find(u => u.id === userId);
    if (user && !user.friends.includes(friendId)) {
        user.friends.push(friendId);
        saveDB();
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Уже в друзьях' });
    }
});

app.post('/api/remove-friend', (req, res) => {
    const { userId, friendId } = req.body;
    const user = db.users.find(u => u.id === userId);
    if (user) {
        user.friends = user.friends.filter(id => id !== friendId);
        saveDB();
        res.json({ success: true });
    }
});

// ========== ГРУППЫ И КАНАЛЫ ==========
app.post('/api/create-group', (req, res) => {
    const { name, creatorId, avatar } = req.body;
    const group = {
        id: 'group_' + Date.now(),
        name,
        avatar: avatar || '👥',
        creator: creatorId,
        members: [creatorId],
        messages: [],
        created: Date.now()
    };
    db.groups.push(group);
    saveDB();
    res.json(group);
});

app.post('/api/create-channel', (req, res) => {
    const { name, creatorId, avatar } = req.body;
    const channel = {
        id: 'channel_' + Date.now(),
        name,
        avatar: avatar || '📢',
        creator: creatorId,
        subscribers: [creatorId],
        messages: [],
        created: Date.now()
    };
    db.channels.push(channel);
    saveDB();
    res.json(channel);
});

app.post('/api/join-group', (req, res) => {
    const { groupId, userId } = req.body;
    const group = db.groups.find(g => g.id === groupId);
    if (group && !group.members.includes(userId)) {
        group.members.push(userId);
        saveDB();
        res.json({ success: true });
    }
});

app.post('/api/subscribe-channel', (req, res) => {
    const { channelId, userId } = req.body;
    const channel = db.channels.find(c => c.id === channelId);
    if (channel && !channel.subscribers.includes(userId)) {
        channel.subscribers.push(userId);
        saveDB();
        res.json({ success: true });
    }
});

app.get('/api/groups', (req, res) => {
    res.json(db.groups);
});

app.get('/api/channels', (req, res) => {
    res.json(db.channels);
});

// ========== СООБЩЕНИЯ (ТЕПЕРЬ С МЕДИА) ==========
app.get('/api/messages/:chatId', (req, res) => {
    const chatId = req.params.chatId;
    const chatMessages = db.messages.filter(m => m.chatId === chatId);
    res.json(chatMessages);
});

app.post('/api/upload', (req, res) => {
    const { file, type, chatId, senderId } = req.body;
    const message = {
        id: 'msg_' + Date.now(),
        chatId,
        senderId,
        type: type || 'text',
        content: file || req.body.text,
        time: Date.now()
    };
    db.messages.push(message);
    saveDB();

    const recipients = [...(db.users.map(u => u.id)), ...(db.groups.map(g => g.members).flat())];
    recipients.forEach(uid => {
        const ws = onlineUsers.get(uid);
        if (ws) ws.send(JSON.stringify({ type: 'message', message }));
    });

    res.json({ success: true, message });
});

// ========== ПОИСК ==========
app.get('/api/search', (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    const users = db.users.filter(u => u.name.toLowerCase().includes(query)).map(u => ({ id: u.id, name: u.name, avatar: u.avatar }));
    const groups = db.groups.filter(g => g.name.toLowerCase().includes(query)).map(g => ({ id: g.id, name: g.name, avatar: g.avatar }));
    const channels = db.channels.filter(c => c.name.toLowerCase().includes(query)).map(c => ({ id: c.id, name: c.name, avatar: c.avatar }));
    const messages = db.messages.filter(m => m.content?.toLowerCase?.().includes(query)).slice(-20);
    res.json({ users, groups, channels, messages });
});

// ========== WEB SOCKET (ВИДЕОЗВОНКИ) ==========
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
        if (msg.type === 'call-offer' || msg.type === 'call-answer' || msg.type === 'ice-candidate') {
            const target = onlineUsers.get(msg.to);
            if (target) target.send(JSON.stringify(msg));
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Сервер на порту ${PORT}, пользователей: ${db.users.length}`);
});

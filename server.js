const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// База данных
let users = [];
let messages = [];
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
    
    if (users.find(u => u.name === name)) {
        return res.status(400).json({ error: 'Уже есть' });
    }
    
    const user = {
        id: 'user_' + Date.now(),
        name,
        avatar: name.charAt(0).toUpperCase(),
        password: hashPassword(password)
    };
    
    users.push(user);
    res.json(user);
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    const user = users.find(u => u.name === name);
    
    if (user && user.password === hashPassword(password)) {
        res.json(user);
    } else {
        res.status(401).json({ error: 'Неверный пароль' });
    }
});

app.get('/api/users', (req, res) => {
    res.json(users);
});

app.get('/api/messages/:userId', (req, res) => {
    const userMessages = messages.filter(m => 
        m.from === req.params.userId || m.to === req.params.userId
    );
    res.json(userMessages);
});

// WebSocket
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
            messages.push(msg);
            
            const recipient = onlineUsers.get(msg.to);
            if (recipient) {
                recipient.send(JSON.stringify(msg));
            }
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
    const msg = JSON.stringify({ type: 'online', users: online });
    
    onlineUsers.forEach(ws => {
        ws.send(msg);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

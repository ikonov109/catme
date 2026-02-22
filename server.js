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

// Загружаем данные из файла
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`✅ Загружена БД: ${parsed.users?.length || 0} пользователей`);
            return parsed;
        }
    } catch (e) {
        console.log('❌ Ошибка загрузки БД:', e.message);
    }
    
    // Если файла нет или ошибка - создаем новую БД
    return {
        users: [],
        messages: []
    };
}

// Сохраняем данные в файл
function saveDatabase() {
    try {
        const data = {
            users: db.users,
            messages: db.messages
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 БД сохранена: ${db.users.length} пользователей`);
    } catch (e) {
        console.log('❌ Ошибка сохранения БД:', e.message);
    }
}

// Инициализация БД
let db = loadDatabase();
let onlineUsers = new Map(); // Онлайн статусы (не сохраняем)

// Сохраняем при изменениях
function saveDB() {
    saveDatabase();
}

// ========== ХЕШ ПАРОЛЯ ==========
function hashPassword(pass) {
    if (!pass) return '';
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

// ========== API ==========
app.post('/api/register', (req, res) => {
    const { name, password } = req.body;
    
    console.log(`📝 Попытка регистрации: ${name}`);
    
    if (!name || !password) {
        return res.status(400).json({ error: 'Имя и пароль обязательны' });
    }
    
    // Проверяем существование (без учета регистра)
    const exists = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        console.log(`❌ Уже существует: ${name}`);
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    const user = {
        id: 'user_' + Date.now(),
        name: name,
        avatar: name.charAt(0).toUpperCase(),
        password: hashPassword(password),
        created: Date.now()
    };
    
    db.users.push(user);
    saveDB(); // Сохраняем в файл!
    
    console.log(`✅ Зарегистрирован: ${name}, всего пользователей: ${db.users.length}`);
    res.json({ success: true, user: { id: user.id, name: user.name, avatar: user.avatar } });
});

app.post('/api/login', (req, res) => {
    const { name, password } = req.body;
    
    console.log(`🔑 Попытка входа: ${name}`);
    
    const user = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
    
    if (!user) {
        console.log(`❌ Не найден: ${name}`);
        return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    if (user.password !== hashPassword(password)) {
        console.log(`❌ Неверный пароль для: ${name}`);
        return res.status(401).json({ error: 'Неверный пароль' });
    }
    
    console.log(`✅ Вход: ${name}`);
    res.json({ id: user.id, name: user.name, avatar: user.avatar });
});

app.get('/api/users', (req, res) => {
    console.log(`📋 Запрос списка пользователей: ${db.users.length} всего`);
    // Отправляем только публичные данные (без паролей)
    const usersPublic = db.users.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        created: u.created
    }));
    res.json(usersPublic);
});

app.get('/api/messages/:userId', (req, res) => {
    const userId = req.params.userId;
    const userMessages = db.messages.filter(m => 
        m.from === userId || m.to === userId
    );
    res.json(userMessages);
});

// ========== WEB SOCKET ==========
wss.on('connection', (ws) => {
    console.log('🔌 WebSocket подключен');
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            if (msg.type === 'login') {
                ws.userId = msg.userId;
                ws.userName = msg.userName;
                onlineUsers.set(msg.userId, ws);
                console.log(`🟢 ${msg.userName} онлайн (всего онлайн: ${onlineUsers.size})`);
                broadcastOnline();
            }
            
            if (msg.type === 'message') {
                // Сохраняем сообщение
                db.messages.push(msg);
                saveDB(); // Сохраняем в файл!
                
                // Отправляем получателю если онлайн
                const recipient = onlineUsers.get(msg.to);
                if (recipient) {
                    recipient.send(JSON.stringify(msg));
                }
                
                console.log(`💬 Сообщение: ${msg.from} → ${msg.to}`);
            }
        } catch (e) {
            console.log('❌ Ошибка обработки сообщения:', e.message);
        }
    });
    
    ws.on('close', () => {
        if (ws.userId) {
            onlineUsers.delete(ws.userId);
            console.log(`🔴 ${ws.userName} офлайн (осталось: ${onlineUsers.size})`);
            broadcastOnline();
        }
    });
});

function broadcastOnline() {
    const online = Array.from(onlineUsers.keys());
    const msg = JSON.stringify({ type: 'online', users: online });
    
    onlineUsers.forEach(ws => {
        try {
            ws.send(msg);
        } catch (e) {}
    });
}

// ========== СТАТИКА ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════╗
║     🐱 CatMe Messenger       ║
╠══════════════════════════════╣
║ Порт: ${PORT}                      ║
║ Пользователей: ${db.users.length}          ║
║ Сообщений: ${db.messages.length}           ║
║ Файл БД: ${DB_FILE}           ║
╚══════════════════════════════╝
    `);
});

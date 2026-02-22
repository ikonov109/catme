// ========== ШИФРОВАНИЕ ДАННЫХ ==========
const ENCRYPTION_KEY = generateKey();

function generateKey() {
    let key = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for(let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

function encrypt(data) {
    try {
        const json = JSON.stringify(data);
        const encrypted = btoa(json);
        return encrypted;
    } catch(e) {
        return null;
    }
}

function decrypt(encrypted) {
    try {
        const json = atob(encrypted);
        return JSON.parse(json);
    } catch(e) {
        return null;
    }
}

// ========== БАЗА ДАННЫХ ==========
class Database {
    constructor() {
        this.load();
    }
    
    load() {
        const saved = localStorage.getItem('catme_encrypted');
        if(saved) {
            this.data = decrypt(saved) || this.getDefaultData();
        } else {
            this.data = this.getDefaultData();
        }
    }
    
    save() {
        localStorage.setItem('catme_encrypted', encrypt(this.data));
    }
    
    getDefaultData() {
        return {
            users: [],
            messages: [],
            contacts: [
                { id: 'cat1', name: 'Мурзик', avatar: 'М', isBot: true },
                { id: 'cat2', name: 'Барсик', avatar: 'Б', isBot: true },
                { id: 'cat3', name: 'Рыжик', avatar: 'Р', isBot: true },
                { id: 'cat4', name: 'Снежок', avatar: 'С', isBot: true },
                { id: 'cat5', name: 'Василий', avatar: 'В', isBot: true }
            ]
        };
    }
    
    addUser(name, password) {
        let user = this.data.users.find(u => u.name === name);
        if(!user) {
            user = {
                id: 'user_' + Date.now(),
                name: name,
                avatar: name.charAt(0).toUpperCase(),
                password: this.hashPassword(password),
                created: Date.now()
            };
            this.data.users.push(user);
            this.save();
        }
        return user;
    }
    
    checkUser(name, password) {
        const user = this.data.users.find(u => u.name === name);
        if(!user) return false;
        if(!user.password && !password) return true;
        return user.password === this.hashPassword(password);
    }
    
    hashPassword(pass) {
        if(!pass) return '';
        let hash = 0;
        for(let i = 0; i < pass.length; i++) {
            hash = ((hash << 5) - hash) + pass.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }
    
    changePassword(userId, newPass) {
        const user = this.data.users.find(u => u.id === userId);
        if(user) {
            user.password = this.hashPassword(newPass);
            this.save();
            return true;
        }
        return false;
    }
    
    addMessage(msg) {
        msg.id = 'msg_' + Date.now();
        msg.time = Date.now();
        this.data.messages.push(msg);
        this.save();
        return msg;
    }
    
    getMessages(userId, contactId) {
        return this.data.messages.filter(m => 
            (m.from === userId && m.to === contactId) ||
            (m.from === contactId && m.to === userId)
        ).sort((a,b) => a.time - b.time);
    }
    
    getContacts(userId) {
        const contacts = [];
        
        // Боты
        this.data.contacts.forEach(bot => {
            contacts.push({
                ...bot,
                lastMsg: this.getLastMessage(userId, bot.id)
            });
        });
        
        // Реальные пользователи
        this.data.users.forEach(u => {
            if(u.id !== userId) {
                const msgs = this.getMessages(userId, u.id);
                if(msgs.length > 0) {
                    contacts.push({
                        id: u.id,
                        name: u.name,
                        avatar: u.avatar,
                        isReal: true,
                        lastMsg: msgs[msgs.length-1].text
                    });
                }
            }
        });
        
        return contacts;
    }
    
    getLastMessage(userId, contactId) {
        const msgs = this.getMessages(userId, contactId);
        return msgs.length > 0 ? msgs[msgs.length-1].text : '';
    }
    
    botReply(msg) {
        const replies = {
            'cat1': ['Мяу!', 'Мур!', 'Кушать хочу'],
            'cat2': ['Привет!', 'Как сам?', 'Норм'],
            'cat3': ['Ок', 'Понятно', 'Давай'],
            'cat4': ['Есть хочу', 'Мяяяу', 'Спать'],
            'cat5': ['Мур-мур', 'Хорошо', 'Ага']
        };
        const botReplies = replies[msg.to] || ['Мяу'];
        return botReplies[Math.floor(Math.random() * botReplies.length)];
    }
}

const db = new Database();

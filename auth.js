// ========== АВТОРИЗАЦИЯ ==========
let currentUser = null;

function login() {
    const name = document.getElementById('loginName').value.trim();
    const pass = document.getElementById('loginPass').value;
    
    if(!name) {
        alert('Введите имя');
        return;
    }
    
    if(db.checkUser(name, pass)) {
        currentUser = db.addUser(name, pass);
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userAvatar').textContent = currentUser.avatar;
        document.getElementById('userStatus').textContent = 'Онлайн';
        
        if(!currentUser.password) {
            setTimeout(() => showChangePassword(), 1000);
        }
        
        loadContacts();
    } else {
        alert('Неверный пароль');
    }
}

function showChangePassword() {
    const html = `
        <div style="padding: 20px; text-align: center;">
            <h3>Установите пароль</h3>
            <input type="password" id="newPass1" placeholder="Новый пароль">
            <input type="password" id="newPass2" placeholder="Повторите">
            <button onclick="changePassword()">Сохранить</button>
        </div>
    `;
    document.getElementById('messages').innerHTML = html;
}

function changePassword() {
    const p1 = document.getElementById('newPass1').value;
    const p2 = document.getElementById('newPass2').value;
    
    if(p1 !== p2) {
        alert('Пароли не совпадают');
        return;
    }
    if(p1.length < 3) {
        alert('Минимум 3 символа');
        return;
    }
    
    db.changePassword(currentUser.id, p1);
    currentUser.password = db.hashPassword(p1);
    alert('Пароль установлен');
    location.reload();
}

// ========== АДМИНКА (ЗАШИФРОВАНА) ==========
const ADMIN_HASH = (function() {
    let h = 0;
    const p = 'Oo!123987';
    for(let i = 0; i < p.length; i++) {
        h = ((h << 5) - h) + p.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
})();

function adminLogin() {
    const pass = prompt('🔐 Введите пароль администратора:');
    if(!pass) return;
    
    let hash = 0;
    for(let i = 0; i < pass.length; i++) {
        hash = ((hash << 5) - hash) + pass.charCodeAt(i);
        hash |= 0;
    }
    hash = Math.abs(hash).toString(36);
    
    if(hash === ADMIN_HASH) {
        showAdminPanel();
    } else {
        alert('❌ Доступ запрещен');
    }
}

function showAdminPanel() {
    let html = '<h2>👑 Админ панель</h2>';
    
    html += '<h3>👥 Пользователи:</h3>';
    db.data.users.forEach(u => {
        html += `<div style="padding: 10px; border-bottom: 1px solid #ccc;">
            <b>${u.name}</b> (ID: ${u.id})<br>
            Пароль: ${u.password ? '✓ установлен' : '✗ пустой'}<br>
            Сообщений: ${db.data.messages.filter(m => m.from === u.id || m.to === u.id).length}
        </div>`;
    });
    
    html += '<h3>💬 Последние сообщения:</h3>';
    db.data.messages.slice(-10).reverse().forEach(m => {
        html += `<div style="padding: 5px; border-bottom: 1px solid #eee;">
            ${m.from} → ${m.to}: ${m.text}
        </div>`;
    });
    
    html += '<br><button onclick="exportData()">📥 Экспорт</button> ';
    html += '<button onclick="clearData()">⚠️ Очистить</button>';
    
    document.getElementById('messages').innerHTML = html;
    document.querySelector('.chat-header').style.display = 'none';
    document.querySelector('.message-input').style.display = 'none';
}

function exportData() {
    const dataStr = JSON.stringify(db.data, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catme_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function clearData() {
    if(confirm('⚠️ Удалить ВСЕ данные?')) {
        localStorage.removeItem('catme_encrypted');
        location.reload();
    }
}

// Секретный вход (клик по заголовку 5 раз)
let headerClicks = 0;
document.querySelector('.header').addEventListener('click', () => {
    headerClicks++;
    if(headerClicks === 5) {
        adminLogin();
        headerClicks = 0;
    }
});

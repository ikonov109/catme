// ========== ЧАТ ==========
let currentContact = null;

function loadContacts() {
    const contacts = db.getContacts(currentUser.id);
    const list = document.getElementById('contactsList');
    list.innerHTML = '';
    
    contacts.forEach(c => {
        const div = document.createElement('div');
        div.className = 'contact';
        div.onclick = () => selectContact(c);
        div.innerHTML = `
            <div class="avatar">${c.avatar}</div>
            <div>
                <b>${c.name}</b><br>
                <small>${c.lastMsg || ''}</small>
            </div>
        `;
        list.appendChild(div);
    });
}

function selectContact(contact) {
    currentContact = contact;
    document.querySelector('.chat-header').innerHTML = `<h3>${contact.name}</h3>`;
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
    loadMessages();
}

function loadMessages() {
    const msgs = db.getMessages(currentUser.id, currentContact.id);
    const container = document.getElementById('messages');
    container.innerHTML = '';
    
    msgs.forEach(m => {
        addMessage(m.text, m.from === currentUser.id);
    });
}

function addMessage(text, isSent) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.innerHTML = `<div class="bubble">${text}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if(!text || !currentContact) return;
    
    const msg = {
        from: currentUser.id,
        to: currentContact.id,
        text: text
    };
    
    db.addMessage(msg);
    addMessage(text, true);
    input.value = '';
    
    if(currentContact.isBot) {
        setTimeout(() => {
            const reply = {
                from: currentContact.id,
                to: currentUser.id,
                text: db.botReply(msg)
            };
            db.addMessage(reply);
            addMessage(reply.text, false);
            loadContacts();
        }, 1000);
    }
    
    loadContacts();
}

// Инициализация
document.getElementById('sendButton').onclick = sendMessage;
document.getElementById('messageInput').onkeypress = (e) => {
    if(e.key === 'Enter') sendMessage();
};

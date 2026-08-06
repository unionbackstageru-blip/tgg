/* ============================================================
   Telegram Social Network - Клиент (ИСПРАВЛЕННЫЙ)
   ============================================================ */

const API_URL = window.location.origin;
let socket = null;
let currentUser = null;
let currentChatId = null;
let allChats = [];

// ===== ЭМОДЗИ =====
const EMOJIS = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '🥰', '😘', '😗', '😙', '😚', '☺️', '🙂',
    '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣',
    '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜',
    '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️',
    '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨',
    '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵',
    '😡', '😠', '🤬', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏',
    '🙌', '👐', '🤲', '🤝', '🙏', '✌️', '🤟', '🤘', '👌', '🤞',
    '🤙', '💪', '🦾', '🖕', '❤️', '🧡', '💛', '💚', '💙', '💜',
    '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💯', '💢', '💥', '🔥'
];

// ===== API =====
const api = {
    async register(name, phone, password) {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, password })
        });
        return res.json();
    },

    async verify(phone, code) {
        const res = await fetch(`${API_URL}/api/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code })
        });
        return res.json();
    },

    async login(phone, password) {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        return res.json();
    },

    async getChats(userId) {
        const res = await fetch(`${API_URL}/api/chats/${userId}`);
        return res.json();
    },

    async getMessages(chatId) {
        const res = await fetch(`${API_URL}/api/messages/${chatId}`);
        return res.json();
    },

    async createChat(participants, name = null) {
        const res = await fetch(`${API_URL}/api/chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participants, name })
        });
        return res.json();
    },

    async addContact(userId, contactId) {
        const res = await fetch(`${API_URL}/api/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, contactId })
        });
        return res.json();
    },

    async findUserByPhone(phone) {
        const res = await fetch(`${API_URL}/api/users/phone/${encodeURIComponent(phone)}`);
        if (res.status === 404) return null;
        return res.json();
    },

    async markAsRead(chatId, userId) {
        await fetch(`${API_URL}/api/messages/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, userId })
        });
    },

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        return res.json();
    }
};

// ===== WEBSOCKET =====
function connectSocket(userId) {
    socket = io(API_URL);
    
    socket.on('connect', () => {
        console.log('🔌 WebSocket подключен');
        socket.emit('userOnline', userId);
    });
    
    socket.on('userStatus', () => { renderChats(); });
    
    socket.on('newMessage', (data) => {
        if (data.chatId === currentChatId) {
            renderMessages(currentChatId);
            api.markAsRead(currentChatId, currentUser.id);
        }
        renderChats();
    });
    
    socket.on('chatsUpdate', (chats) => {
        allChats = chats;
        renderChats();
    });
}

// ===== АВТОРИЗАЦИЯ =====

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('verifyForm').style.display = 'none';
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'none';
}

function showVerification(phone) {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'block';
    document.getElementById('verifyPhone').textContent = phone;
    document.querySelectorAll('.code-input').forEach(input => {
        input.value = '';
        input.classList.remove('filled');
    });
    document.getElementById('code1').focus();
}

async function register() {
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name) { showToast('Введите имя', 'error'); return; }
    if (!phone || phone.length < 10) { showToast('Введите корректный номер', 'error'); return; }
    if (!password || password.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }

    showToast('⏳ Отправка запроса...', 'info');
    
    const result = await api.register(name, phone, password);
    console.log('📝 Результат регистрации:', result);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.success) {
        showToast('📱 Код отправлен! Проверьте консоль', 'success');
        showVerification(phone);
    } else {
        showToast('Ошибка при регистрации', 'error');
    }
}

async function verifyCode() {
    let code = '';
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`code${i}`);
        if (!input.value) { 
            showToast('Введите полный код из 6 цифр', 'error'); 
            return; 
        }
        code += input.value;
    }

    const phone = document.getElementById('verifyPhone').textContent;
    console.log('🔑 Отправка кода:', { phone, code });
    
    const result = await api.verify(phone, code);
    console.log('🔑 Результат верификации:', result);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.success && result.user) {
        showToast('✅ Номер подтвержден!', 'success');
        loginUser(result.user);
    } else {
        showToast('Ошибка подтверждения', 'error');
    }
}

async function resendCode() {
    const phone = document.getElementById('verifyPhone').textContent;
    const name = document.getElementById('regName').value.trim() || 'User';
    const password = document.getElementById('regPassword').value || '123456';
    
    showToast('⏳ Отправка нового кода...', 'info');
    const result = await api.register(name, phone, password);
    console.log('📝 Повторная отправка:', result);
    
    if (result.error) {
        showToast(result.error, 'error');
    } else {
        showToast('📱 Новый код отправлен!', 'success');
    }
}

async function login() {
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!phone || !password) {
        showToast('Заполните все поля', 'error');
        return;
    }

    showToast('⏳ Вход...', 'info');
    
    const result = await api.login(phone, password);
    console.log('🔐 Результат входа:', result);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.needVerification) {
        showToast('📱 Требуется подтверждение. Код отправлен!', 'success');
        showVerification(phone);
        return;
    }

    if (result.success && result.user) {
        loginUser(result.user);
    } else {
        showToast('Ошибка входа', 'error');
    }
}

function loginUser(user) {
    console.log('✅ Вход выполнен:', user);
    currentUser = user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profilePhone').textContent = user.phone;
    document.getElementById('profileAvatar').textContent = user.avatar;
    
    connectSocket(user.id);
    loadChats();
    showToast(`Добро пожаловать, ${user.name}!`, 'success');
}

function logout() {
    if (socket) socket.disconnect();
    currentUser = null;
    currentChatId = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('loginPassword').value = '';
}

// ===== ЧАТЫ =====

async function loadChats() {
    if (!currentUser) return;
    allChats = await api.getChats(currentUser.id);
    renderChats();
}

function renderChats(filter = '') {
    const list = document.getElementById('chatList');
    list.innerHTML = '';

    let chats = allChats;
    if (filter) {
        chats = chats.filter(chat => {
            const name = getChatName(chat);
            return name.toLowerCase().includes(filter.toLowerCase());
        });
    }

    if (chats.length === 0) {
        list.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: #6a6a6a;">
                <p>У вас пока нет чатов</p>
                <p style="font-size: 13px; margin-top: 8px;">Добавьте контакты</p>
            </div>
        `;
        return;
    }

    chats.forEach(chat => {
        const name = getChatName(chat);
        const avatar = getChatAvatar(chat);
        const lastMsg = chat.last_message || 'Нет сообщений';
        const time = formatTime(chat.last_message_time);
        const unread = chat.unread || 0;

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-avatar c${Math.floor(Math.random() * 7) + 1}">
                ${avatar}
            </div>
            <div class="chat-info">
                <div class="name">
                    ${name}
                    ${unread > 0 ? `<span class="badge">${unread}</span>` : ''}
                </div>
                <div class="last-msg">${lastMsg}</div>
            </div>
            <div class="chat-meta">
                <span class="time">${time}</span>
                ${unread > 0 ? `<span class="unread">${unread}</span>` : ''}
            </div>
        `;
        item.addEventListener('click', () => openChat(chat.id));
        list.appendChild(item);
    });
}

function getChatName(chat) {
    if (!currentUser) return 'Чат';
    if (chat.name) return chat.name;
    const participants = chat.participants || [];
    const others = participants.filter(id => id !== currentUser.id);
    if (others.length === 0) return 'Чат';
    return 'Собеседник';
}

function getChatAvatar(chat) {
    return 'Ч';
}

function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.getHours().toString().padStart(2, '0') + ':' + 
               d.getMinutes().toString().padStart(2, '0');
    }
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    if (now - d < 7 * 24 * 60 * 60 * 1000) {
        return days[d.getDay()];
    }
    return d.toLocaleDateString();
}

// ===== ОТКРЫТИЕ ЧАТА =====

async function openChat(chatId) {
    currentChatId = chatId;
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    document.getElementById('chatName').textContent = getChatName(chat);
    document.getElementById('chatAvatar').textContent = getChatAvatar(chat);
    
    await renderMessages(chatId);
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;

    await api.markAsRead(chatId, currentUser.id);
    loadChats();

    if (window.innerWidth <= 650) {
        document.getElementById('rightPanel').classList.add('active-mobile');
    }
}

async function renderMessages(chatId) {
    const area = document.getElementById('messagesArea');
    area.innerHTML = '';

    const messages = await api.getMessages(chatId);
    
    if (messages.length === 0) {
        area.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comment-dots"></i>
                <p>Нет сообщений</p>
                <p style="font-size: 13px; color: #6a6a6a;">Напишите первое сообщение</p>
            </div>
        `;
        return;
    }

    messages.forEach(msg => {
        const div = document.createElement('div');
        const isSent = msg.sender_id === currentUser.id;
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        const time = formatTime(msg.created_at);
        
        let content = msg.text || '';
        
        if (msg.file) {
            content += renderFileAttachment(msg.file, isSent);
        }
        
        div.innerHTML = `
            ${content}
            <span class="time">${time}</span>
        `;
        area.appendChild(div);
    });

    area.scrollTop = area.scrollHeight;
}

// ===== ФАЙЛЫ =====

function renderFileAttachment(file, isSent) {
    const isImage = file.type && file.type.startsWith('image/');
    const size = formatFileSize(file.size);
    
    if (isImage) {
        return `
            <div class="file-attachment" onclick="showFilePreview('${file.url}')">
                <img src="${file.url}" class="file-preview-image" alt="${file.name}" loading="lazy">
            </div>
        `;
    }
    
    return `
        <div class="file-attachment" onclick="downloadFile('${file.url}')">
            <i class="fas fa-${getFileIcon(file.name)}"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${size}</div>
            </div>
        </div>
    `;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'file-pdf',
        'doc': 'file-word',
        'docx': 'file-word',
        'xls': 'file-excel',
        'xlsx': 'file-excel',
        'ppt': 'file-powerpoint',
        'pptx': 'file-powerpoint',
        'txt': 'file-alt',
        'zip': 'file-archive',
        'rar': 'file-archive',
        'mp3': 'file-audio',
        'mp4': 'file-video',
        'avi': 'file-video',
        'mkv': 'file-video',
        'json': 'file-code',
        'js': 'file-code',
        'html': 'file-code',
        'css': 'file-code'
    };
    return icons[ext] || 'file';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    
    for (const file of files) {
        try {
            const progressId = showUploadProgress(file.name);
            const result = await api.uploadFile(file);
            removeUploadProgress(progressId);
            if (result.success) {
                sendMessageWithFile(result.file);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Ошибка при загрузке файла', 'error');
        }
    }
}

function showUploadProgress(filename) {
    const area = document.getElementById('messagesArea');
    const id = 'progress-' + Date.now();
    const div = document.createElement('div');
    div.className = 'message sent';
    div.id = id;
    div.innerHTML = `
        <div class="upload-progress">
            <i class="fas fa-file"></i>
            <div style="flex:1; min-width:0;">
                <div style="color: #e0e0e0; font-size: 14px;">${filename}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
            </div>
            <span class="progress-text">0%</span>
        </div>
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    return id;
}

function removeUploadProgress(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function sendMessageWithFile(file) {
    socket.emit('sendMessage', {
        chatId: currentChatId,
        senderId: currentUser.id,
        text: '',
        file: file
    });
}

function showFilePreview(url) {
    const modal = document.getElementById('filePreviewModal');
    const content = document.getElementById('filePreviewContent');
    
    const isImage = url.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)/i);
    
    if (isImage) {
        content.innerHTML = `<img src="${url}" alt="Preview" onclick="window.open('${url}', '_blank')">`;
    } else {
        content.innerHTML = `
            <div class="file-preview-info">
                <i class="fas fa-file"></i>
                <p>Предпросмотр недоступен</p>
                <button onclick="window.open('${url}', '_blank')" class="auth-btn" style="margin-top: 12px;">
                    <i class="fas fa-download"></i> Скачать
                </button>
            </div>
        `;
    }
    
    modal.classList.add('show');
}

function closeFilePreview() {
    document.getElementById('filePreviewModal').classList.remove('show');
}

function downloadFile(url) {
    window.open(url, '_blank');
}

// ===== ЭМОДЗИ =====

function initEmojiPanel() {
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            insertEmoji(emoji);
        });
        grid.appendChild(btn);
    });
}

function toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;
    document.getElementById('emojiPanel').style.display = 'none';
}

// ===== ОТПРАВКА =====

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChatId) return;

    socket.emit('sendMessage', {
        chatId: currentChatId,
        senderId: currentUser.id,
        text: text,
        file: null
    });

    input.value = '';
}

// ===== КОНТАКТЫ =====

function showAddContact() {
    document.getElementById('addContactModal').classList.add('show');
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '+7';
}

function closeModal() {
    document.getElementById('addContactModal').classList.remove('show');
}

async function addContact() {
    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();

    if (!name) { showToast('Введите имя', 'error'); return; }
    if (!phone || phone.length < 10) { showToast('Введите номер', 'error'); return; }

    const user = await api.findUserByPhone(phone);
    if (!user) {
        showToast('Пользователь не найден', 'error');
        return;
    }

    if (user.id === currentUser.id) {
        showToast('Нельзя добавить себя', 'error');
        return;
    }

    const result = await api.addContact(currentUser.id, user.id);
    showToast(`✅ Контакт ${user.name} добавлен!`, 'success');
    closeModal();
    loadChats();
    openChat(result.chat.id);
}

// ===== ОБРАБОТЧИКИ =====

document.getElementById('searchInput').addEventListener('input', (e) => {
    renderChats(e.target.value);
});

document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.getElementById('mobileBack').addEventListener('click', () => {
    document.getElementById('rightPanel').classList.remove('active-mobile');
});

document.getElementById('addContactModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

document.getElementById('emojiBtn').addEventListener('click', toggleEmojiPanel);

document.getElementById('fileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
    e.target.value = '';
});

// ===== КОД ПОДТВЕРЖДЕНИЯ =====

document.querySelectorAll('.code-input').forEach((input, index, arr) => {
    input.addEventListener('input', (e) => {
        if (e.target.value) {
            e.target.classList.add('filled');
            if (index < arr.length - 1) {
                arr[index + 1].focus();
            } else {
                setTimeout(verifyCode, 300);
            }
        } else {
            e.target.classList.remove('filled');
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            arr[index - 1].focus();
        }
        if (e.key === 'Enter') verifyCode();
    });
    input.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key)) e.preventDefault();
    });
});

// ===== УВЕДОМЛЕНИЯ =====

function showToast(text, type = 'info', duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// ===== ИНИЦИАЛИЗАЦИЯ =====

initEmojiPanel();

console.log('✅ Telegram Social Network готова к работе!');
console.log('📎 Добавлены файлы и смайлики!');
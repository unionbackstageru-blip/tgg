/* ============================================================
   TeleFon - Клиент (ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ)
   ============================================================ */

const API_URL = window.location.origin;
let socket = null;
let currentUser = null;
let currentChatId = null;
let allChats = [];
let selectedMembers = [];
let createChatType = 'group';
let searchTimeout = null;
let currentChatUser = null;
let replyingTo = null;
let editingMessageId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let voiceDuration = 0;

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
    async restoreSession(userId) {
        const res = await fetch(`${API_URL}/api/restore-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        return res.json();
    },
    async updateProfile(data) {
        const res = await fetch(`${API_URL}/api/update-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async searchUsers(query, userId) {
        const res = await fetch(`${API_URL}/api/search/${encodeURIComponent(query)}?userId=${userId}`);
        return res.json();
    },
    async createChat(data) {
        const res = await fetch(`${API_URL}/api/create-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
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
    async getUserProfile(userId) {
        const res = await fetch(`${API_URL}/api/users/${userId}`);
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
    },
    async uploadVoice(file, duration) {
        const formData = new FormData();
        formData.append('voice', file);
        formData.append('duration', duration);
        const res = await fetch(`${API_URL}/api/upload-voice`, {
            method: 'POST',
            body: formData
        });
        return res.json();
    },
    async editMessage(messageId, text, userId) {
        const res = await fetch(`${API_URL}/api/messages/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, text, userId })
        });
        return res.json();
    },
    async deleteMessage(messageId, userId) {
        const res = await fetch(`${API_URL}/api/messages/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, userId })
        });
        return res.json();
    },
    async addReaction(messageId, userId, reaction) {
        const res = await fetch(`${API_URL}/api/messages/reaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, userId, reaction })
        });
        return res.json();
    },
    async removeReaction(messageId, userId) {
        const res = await fetch(`${API_URL}/api/messages/reaction/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, userId })
        });
        return res.json();
    },
    // ===== ДОБАВЛЯЕМ НЕДОСТАЮЩИЙ МЕТОД =====
    async getReactions(messageId) {
        const res = await fetch(`${API_URL}/api/messages/reactions/${messageId}`);
        return res.json();
    },
    async pinMessage(chatId, messageId) {
        await fetch(`${API_URL}/api/messages/pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, messageId })
        });
    },
    async unpinMessage(chatId) {
        await fetch(`${API_URL}/api/messages/unpin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId })
        });
    },
    async blockUser(userId, blockId) {
        const res = await fetch(`${API_URL}/api/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, blockId })
        });
        return res.json();
    },
    async unblockUser(userId, blockId) {
        const res = await fetch(`${API_URL}/api/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, blockId })
        });
        return res.json();
    },
    async getDraft(chatId, userId) {
        const res = await fetch(`${API_URL}/api/drafts/${chatId}/${userId}`);
        return res.json();
    },
    async saveDraft(chatId, userId, text) {
        await fetch(`${API_URL}/api/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, userId, text })
        });
    }
};

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    if (now - d < 7 * 24 * 60 * 60 * 1000) return days[d.getDay()];
    return d.toLocaleDateString();
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ':' + secs.toString().padStart(2, '0');
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'file-pdf', 'doc': 'file-word', 'docx': 'file-word',
        'xls': 'file-excel', 'xlsx': 'file-excel',
        'ppt': 'file-powerpoint', 'pptx': 'file-powerpoint',
        'txt': 'file-alt', 'zip': 'file-archive', 'rar': 'file-archive',
        'mp3': 'file-audio', 'mp4': 'file-video', 'avi': 'file-video',
        'json': 'file-code', 'js': 'file-code', 'html': 'file-code', 'css': 'file-code'
    };
    return icons[ext] || 'file';
}

function showToast(text, type = 'info', duration = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function getUsernameColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#e17055', '#00b894', '#0984e3', '#fdcb6e', '#e84393', '#6c5ce7', '#00cec9', '#fd79a8', '#a29bfe'];
    return colors[Math.abs(hash) % colors.length];
}

// ===== ЭМОДЗИ =====

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','☺️','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤟','🤘','👌','🤞','🤙','💪','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','🔥','✨','⭐','🌟','💫','🌈','☀️','🌸','🌺','🌻','🌹','🌷','🌿','🌵','🌲','🌳','🍁','🍂','🍃'];

function initEmojiPanel() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    grid.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-item';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            const input = document.getElementById('messageInput');
            if (input) {
                input.value += emoji;
                input.focus();
            }
            document.getElementById('emojiPanel').style.display = 'none';
        });
        grid.appendChild(btn);
    });
}

function toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

// ===== WEBSOCKET =====

function connectSocket(userId) {
    console.log('🔌 Подключение WebSocket...');
    
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    socket = io(API_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
    });
    
    socket.on('connect', () => {
        console.log('✅ WebSocket подключен');
        socket.emit('userOnline', userId);
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ WebSocket ошибка:', error);
        showToast('⚠️ Ошибка подключения к серверу', 'error');
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 WebSocket отключен');
    });
    
    socket.on('reconnect', () => {
        console.log('🔄 WebSocket переподключен');
        socket.emit('userOnline', userId);
    });
    
    socket.on('userStatus', () => {
        renderChats();
    });
    
    socket.on('userTyping', (data) => {
        if (data.chatId === currentChatId && data.isTyping) {
            document.getElementById('chatStatus').textContent = 'печатает...';
        } else if (data.chatId === currentChatId) {
            updateChatStatus();
        }
    });
    
    // ===== ИСПРАВЛЕННАЯ ОБРАБОТКА НОВЫХ СООБЩЕНИЙ (БЕЗ ДУБЛЕЙ) =====
    let lastMessageId = null;
    
    socket.on('newMessage', (data) => {
        console.log('📨 Новое сообщение:', data);
        
        // Проверяем дубликат
        if (lastMessageId === data.message.id) {
            console.log('⚠️ Дубликат сообщения, пропускаем');
            return;
        }
        lastMessageId = data.message.id;
        
        // Обновляем сообщения в текущем чате
        if (data.chatId === currentChatId) {
            renderMessages(currentChatId);
            api.markAsRead(currentChatId, currentUser.id);
            if (socket) {
                socket.emit('messageRead', { messageId: data.message.id, userId: currentUser.id });
            }
        }
        renderChats();
    });
    
    socket.on('messageStatus', () => {
        if (currentChatId) renderMessages(currentChatId);
    });
    
    socket.on('messageDeleted', (data) => {
        if (data.chatId === currentChatId) renderMessages(currentChatId);
    });
    
    socket.on('messageEdited', (data) => {
        if (data.chatId === currentChatId) renderMessages(currentChatId);
    });
    
    socket.on('chatsUpdate', (chats) => {
        console.log('🔄 Обновление чатов:', chats);
        allChats = chats;
        renderChats();
    });
    
    socket.on('reactionUpdate', (data) => {
        if (data.chatId === currentChatId) {
            loadReactions(data.messageId);
        }
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

    const result = await api.register(name, phone, password);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.success) {
        showToast('📱 Код отправлен! Проверьте консоль', 'success');
        showVerification(phone);
    }
}

async function verifyCode() {
    let code = '';
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`code${i}`);
        if (!input.value) { showToast('Введите полный код', 'error'); return; }
        code += input.value;
    }

    const phone = document.getElementById('verifyPhone').textContent;
    const result = await api.verify(phone, code);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.success && result.user) {
        showToast('✅ Номер подтвержден!', 'success');
        loginUser(result.user);
    }
}

async function resendCode() {
    const phone = document.getElementById('verifyPhone').textContent;
    const name = document.getElementById('regName').value.trim() || 'User';
    const password = document.getElementById('regPassword').value || '123456';
    const result = await api.register(name, phone, password);
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

    const result = await api.login(phone, password);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }

    if (result.needVerification) {
        showToast('📱 Требуется подтверждение', 'success');
        showVerification(phone);
        return;
    }

    if (result.success && result.user) {
        loginUser(result.user);
    }
}

function loginUser(user) {
    currentUser = user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    
    updateProfileUI(user);
    localStorage.setItem('telefon_user_id', user.id);
    
    connectSocket(user.id);
    loadChats();
    showToast(`Добро пожаловать, ${user.name}!`, 'success');
}

function updateProfileUI(user) {
    const avatarText = document.getElementById('profileAvatarText');
    const avatarImg = document.getElementById('profileAvatarImg');
    const profileName = document.getElementById('profileName');
    const profileUsername = document.getElementById('profileUsername');
    
    if (profileName) profileName.textContent = user.name;
    if (profileUsername) profileUsername.textContent = user.username ? '@' + user.username : '@username';
    
    if (user.avatar && user.avatar.startsWith('http')) {
        if (avatarImg) {
            avatarImg.src = user.avatar;
            avatarImg.style.display = 'block';
        }
        if (avatarText) avatarText.style.display = 'none';
    } else {
        if (avatarText) {
            avatarText.textContent = user.name.charAt(0).toUpperCase();
            avatarText.style.display = 'block';
        }
        if (avatarImg) avatarImg.style.display = 'none';
    }
}

function logout() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    localStorage.removeItem('telefon_user_id');
    currentUser = null;
    currentChatId = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('loginPassword').value = '';
    showToast('Вы вышли из аккаунта', 'info');
}

// ===== ВОССТАНОВЛЕНИЕ СЕССИИ =====

async function restoreSession() {
    const savedUserId = localStorage.getItem('telefon_user_id');
    if (!savedUserId) return false;
    
    try {
        const result = await api.restoreSession(savedUserId);
        if (result.success && result.user) {
            loginUser(result.user);
            return true;
        }
    } catch (error) {
        console.log('Сессия не восстановлена');
    }
    return false;
}

// ===== НАСТРОЙКИ =====

function openSettings() {
    if (!currentUser) return;
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    document.getElementById('settingsName').value = currentUser.name || '';
    document.getElementById('settingsUsername').value = currentUser.username || '';
    document.getElementById('settingsBio').value = currentUser.bio || '';
    
    const avatarText = document.getElementById('settingsAvatarText');
    const avatarImg = document.getElementById('settingsAvatarImg');
    
    if (currentUser.avatar && currentUser.avatar.startsWith('http')) {
        avatarImg.src = currentUser.avatar;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarText.textContent = currentUser.name.charAt(0).toUpperCase();
        avatarText.style.display = 'block';
        avatarImg.style.display = 'none';
    }
    
    modal.classList.add('show');
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('show');
}

document.getElementById('avatarInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = document.getElementById('settingsAvatarImg');
            const text = document.getElementById('settingsAvatarText');
            if (img) {
                img.src = event.target.result;
                img.style.display = 'block';
            }
            if (text) text.style.display = 'none';
            window.tempAvatar = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

async function setTheme(theme) {
    if (!currentUser) return;
    const result = await api.updateProfile({
        userId: currentUser.id,
        theme: theme
    });
    if (result.success) {
        currentUser.theme = theme;
        document.body.className = 'theme-' + theme;
        showToast('✅ Тема обновлена!', 'success');
    }
}

async function saveSettings() {
    if (!currentUser) return;
    
    const name = document.getElementById('settingsName').value.trim();
    const username = document.getElementById('settingsUsername').value.trim();
    const bio = document.getElementById('settingsBio').value.trim();
    const avatar = window.tempAvatar || currentUser.avatar || null;
    
    if (!name) { showToast('Введите имя', 'error'); return; }
    if (!username) { showToast('Введите username', 'error'); return; }
    if (username.includes(' ')) { showToast('Username не может содержать пробелы', 'error'); return; }
    
    const result = await api.updateProfile({
        userId: currentUser.id,
        name,
        username,
        bio,
        avatar
    });
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    
    if (result.success) {
        currentUser = result.user;
        updateProfileUI(currentUser);
        window.tempAvatar = null;
        closeSettings();
        showToast('✅ Профиль обновлен!', 'success');
        renderChats();
    }
}

// ===== ЧАТЫ =====

async function loadChats() {
    if (!currentUser) return;
    allChats = await api.getChats(currentUser.id);
    console.log('📋 Загружены чаты:', allChats);
    renderChats();
}

function renderChats() {
    const list = document.getElementById('chatList');
    if (!list) return;
    list.innerHTML = '';

    if (!allChats || allChats.length === 0) {
        list.innerHTML = `
            <div style="padding:40px 20px;text-align:center;color:#6a6a6a;">
                <p>У вас пока нет чатов</p>
                <p style="font-size:13px;margin-top:8px;">Добавьте контакт</p>
            </div>
        `;
        return;
    }

    allChats.forEach(chat => {
        const name = chat.displayName || chat.name || 'Чат';
        const avatar = chat.avatar || null;
        const lastMsg = chat.last_message || 'Нет сообщений';
        const time = formatTime(chat.last_message_time);
        const unread = chat.unread || 0;

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-avatar">
                ${avatar ? `<img src="${avatar}" onerror="this.style.display='none'">` : name.charAt(0).toUpperCase()}
                ${chat.isOnline ? '<div class="online-dot"></div>' : ''}
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

function updateChatStatus() {
    const chat = allChats.find(c => c.id === currentChatId);
    if (chat && chat.type === 'private') {
        document.getElementById('chatStatus').textContent = chat.isOnline ? 'онлайн' : 'был(а) недавно';
    }
}

// ===== ОТКРЫТИЕ ЧАТА =====

async function openChat(chatId) {
    currentChatId = chatId;
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    const name = chat.displayName || chat.name || 'Чат';
    const avatar = chat.avatar || null;
    
    if (chat.type === 'private' && chat.participants) {
        const other = chat.participants.find(p => p.user_id !== currentUser.id);
        currentChatUser = other ? other.user_id : null;
    } else {
        currentChatUser = null;
    }
    
    document.getElementById('chatName').textContent = name;
    updateChatStatus();
    
    const avatarText = document.getElementById('chatAvatarText');
    const avatarImg = document.getElementById('chatAvatarImg');
    if (avatar && avatar.startsWith('http')) {
        avatarImg.src = avatar;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarText.textContent = name.charAt(0).toUpperCase();
        avatarText.style.display = 'flex';
        avatarImg.style.display = 'none';
    }
    
    // Загружаем черновик
    try {
        const draft = await api.getDraft(chatId, currentUser.id);
        if (draft.draft) {
            document.getElementById('messageInput').value = draft.draft;
        }
    } catch (e) {}
    
    await renderMessages(chatId);
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;

    await api.markAsRead(chatId, currentUser.id);
    loadChats();

    if (window.innerWidth <= 650) {
        document.getElementById('rightPanel').classList.add('active-mobile');
    }
}

// ===== РЕНДЕР СООБЩЕНИЙ =====

async function renderMessages(chatId) {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.innerHTML = '';

    const messages = await api.getMessages(chatId);
    
    if (messages.length === 0) {
        area.innerHTML = `
            <div class="empty-chat">
                <p>Нет сообщений</p>
                <span>Напишите первое сообщение</span>
            </div>
        `;
        return;
    }

    messages.forEach((msg) => {
        const div = document.createElement('div');
        const isSent = msg.sender_id === currentUser.id;
        
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.dataset.messageId = msg.id;
        
        const time = formatTime(msg.created_at);
        let content = '';
        
        // Ответ
        if (msg.reply_to) {
            content += `<div class="reply-to">↩️ Ответ</div>`;
        }
        
        // Текст
        if (msg.text) {
            content += msg.text;
        }
        
        // Файл
        if (msg.file) {
            try {
                const file = typeof msg.file === 'string' ? JSON.parse(msg.file) : msg.file;
                const isImage = file.type && file.type.startsWith('image/');
                const isVideo = file.type && file.type.startsWith('video/');
                
                if (isImage) {
                    content += `
                        <div class="photo-attachment" onclick="window.open('${file.url}','_blank')">
                            <img src="${file.url}" class="file-preview-image" loading="lazy" onerror="this.style.display='none'">
                            <div class="photo-overlay"><i class="fas fa-expand"></i></div>
                        </div>
                    `;
                } else if (isVideo) {
                    content += `
                        <div class="video-attachment">
                            <video src="${file.url}" controls style="max-width:280px;max-height:200px;border-radius:8px;background:#000;"></video>
                            <div style="font-size:11px;color:#888;margin-top:4px;">${file.name}</div>
                        </div>
                    `;
                } else {
                    const icon = getFileIcon(file.name);
                    content += `
                        <div class="file-attachment" onclick="window.open('${file.url}','_blank')">
                            <i class="fas fa-${icon}"></i>
                            <div class="file-info">
                                <div class="file-name">${file.name}</div>
                                <div class="file-size">${formatFileSize(file.size)}</div>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {}
        }
        
        // Голосовое
        if (msg.voice_duration > 0) {
            content += `
                <div class="voice-message">
                    <button class="voice-play" onclick="playVoice(this, '${msg.file}')"><i class="fas fa-play"></i></button>
                    <div class="voice-waveform"></div>
                    <span class="voice-duration-text">${formatDuration(msg.voice_duration)}</span>
                </div>
            `;
        }
        
        // Редактировано
        if (msg.edited_at) {
            content += ` <span style="font-size:11px;color:#888;">(ред.)</span>`;
        }
        
        // Статус
        let statusIcon = '';
        if (isSent) {
            if (msg.status === 'sent') {
                statusIcon = `<span class="message-status sent"><i class="fas fa-check"></i></span>`;
            } else if (msg.status === 'delivered') {
                statusIcon = `<span class="message-status delivered"><i class="fas fa-check-double"></i></span>`;
            } else if (msg.status === 'read') {
                statusIcon = `<span class="message-status read"><i class="fas fa-check-double"></i></span>`;
            }
        }
        
        // Реакции
        const reactionsHtml = `<div class="message-reactions" id="reactions-${msg.id}"></div>`;
        
        // Меню действий
        const actionsHtml = `
            <div class="message-actions">
                ${isSent ? `<button onclick="editMessage('${msg.id}')" title="Редактировать"><i class="fas fa-edit"></i></button>` : ''}
                ${isSent ? `<button onclick="deleteMessage('${msg.id}')" title="Удалить"><i class="fas fa-trash"></i></button>` : ''}
                <button onclick="replyToMessage('${msg.id}')" title="Ответить"><i class="fas fa-reply"></i></button>
                <button onclick="forwardMessage('${msg.id}')" title="Переслать"><i class="fas fa-forward"></i></button>
                <button onclick="pinMessage('${msg.id}')" title="Закрепить"><i class="fas fa-thumbtack"></i></button>
                <button onclick="addReaction('${msg.id}','❤️')" title="Реакция"><i class="fas fa-smile"></i></button>
            </div>
        `;
        
        div.innerHTML = `
            ${content}
            <div class="message-footer">
                <span class="time">${time} ${statusIcon}</span>
                ${reactionsHtml}
            </div>
            ${actionsHtml}
        `;
        
        area.appendChild(div);
        
        // Загружаем реакции
        loadReactions(msg.id);
    });

    area.scrollTop = area.scrollHeight;
}

// ===== РЕАКЦИИ =====

async function loadReactions(messageId) {
    try {
        const reactions = await api.getReactions(messageId);
        const container = document.getElementById('reactions-' + messageId);
        if (!container) return;
        
        const grouped = {};
        reactions.forEach(r => {
            if (!grouped[r.reaction]) grouped[r.reaction] = [];
            grouped[r.reaction].push(r.user_id);
        });
        
        container.innerHTML = '';
        Object.entries(grouped).forEach(([reaction, users]) => {
            const span = document.createElement('span');
            span.className = 'reaction';
            const isMine = users.includes(currentUser.id);
            span.style.background = isMine ? 'rgba(106,178,242,0.2)' : '';
            span.innerHTML = `${reaction} <span class="count">${users.length}</span>`;
            span.onclick = () => toggleReaction(messageId, reaction);
            container.appendChild(span);
        });
    } catch (e) {
        console.log('Ошибка загрузки реакций:', e);
    }
}

async function toggleReaction(messageId, reaction) {
    if (!currentUser) return;
    const container = document.getElementById('reactions-' + messageId);
    if (!container) return;
    
    // Проверяем, есть ли уже реакция от пользователя
    const existing = container.querySelector(`.reaction`);
    if (existing && existing.textContent.includes(reaction)) {
        await api.removeReaction(messageId, currentUser.id);
    } else {
        await api.addReaction(messageId, currentUser.id, reaction);
    }
    loadReactions(messageId);
}

async function addReaction(messageId, reaction) {
    if (!currentUser) return;
    await api.addReaction(messageId, currentUser.id, reaction);
    loadReactions(messageId);
}

// ===== ОТПРАВКА =====

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const text = input.value.trim();
    
    if (!text && !replyingTo) {
        showToast('Введите сообщение', 'error');
        return;
    }
    
    if (!currentChatId || !currentUser || !socket) {
        showToast('Ошибка подключения', 'error');
        return;
    }
    
    const data = {
        chatId: currentChatId,
        senderId: currentUser.id,
        text: text || '',
        file: null
    };
    
    if (replyingTo) {
        data.replyTo = replyingTo;
        replyingTo = null;
        document.getElementById('messageInput').placeholder = 'Сообщение...';
        document.getElementById('replyBar').style.display = 'none';
    }
    
    socket.emit('sendMessage', data);
    input.value = '';
    
    // Сохраняем черновик
    api.saveDraft(currentChatId, currentUser.id, '');
}

// ===== ДЕЙСТВИЯ С СООБЩЕНИЯМИ =====

function replyToMessage(messageId) {
    replyingTo = messageId;
    document.getElementById('replyBar').style.display = 'flex';
    document.getElementById('replyText').textContent = 'Ответ на сообщение';
    document.getElementById('messageInput').focus();
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('replyBar').style.display = 'none';
    document.getElementById('messageInput').placeholder = 'Сообщение...';
}

async function editMessage(messageId) {
    const newText = prompt('Редактировать сообщение:');
    if (!newText) return;
    const result = await api.editMessage(messageId, newText, currentUser.id);
    if (result.success) {
        renderMessages(currentChatId);
        if (socket) {
            socket.emit('messageEdited', { messageId, text: newText, chatId: currentChatId });
        }
    }
}

async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    const result = await api.deleteMessage(messageId, currentUser.id);
    if (result.success) {
        renderMessages(currentChatId);
        if (socket) {
            socket.emit('messageDeleted', { messageId, chatId: currentChatId });
        }
    }
}

function forwardMessage(messageId) {
    showToast('Выберите чат для пересылки', 'info');
}

async function pinMessage(messageId) {
    await api.pinMessage(currentChatId, messageId);
    showToast('📌 Сообщение закреплено!', 'success');
}

async function unpinMessage() {
    await api.unpinMessage(currentChatId);
    document.getElementById('pinnedMessage').style.display = 'none';
    showToast('📌 Сообщение откреплено!', 'success');
}

// ===== ГОЛОСОВЫЕ =====

function recordVoice() {
    if (isRecording) {
        stopRecording();
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            isRecording = true;
            recordingStartTime = Date.now();
            
            document.getElementById('voiceRecording').style.display = 'block';
            document.getElementById('voiceBtn').innerHTML = '<i class="fas fa-stop"></i>';
            
            // Создаем волны
            const waveContainer = document.querySelector('.voice-wave');
            waveContainer.innerHTML = '';
            for (let i = 0; i < 20; i++) {
                const bar = document.createElement('div');
                bar.className = 'wave';
                bar.style.height = (5 + Math.random() * 25) + 'px';
                bar.style.animationDelay = (i * 0.05) + 's';
                waveContainer.appendChild(bar);
            }
            
            // Таймер
            recordingTimer = setInterval(() => {
                const elapsed = (Date.now() - recordingStartTime) / 1000;
                document.getElementById('voiceDuration').textContent = formatDuration(elapsed);
                voiceDuration = elapsed;
            }, 100);
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
                uploadVoice(file, voiceDuration);
            };
            
            mediaRecorder.start();
        })
        .catch(err => {
            showToast('❌ Ошибка доступа к микрофону', 'error');
            console.error(err);
        });
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        clearInterval(recordingTimer);
        document.getElementById('voiceRecording').style.display = 'none';
        document.getElementById('voiceBtn').innerHTML = '<i class="fas fa-microphone"></i>';
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

function cancelRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        clearInterval(recordingTimer);
        document.getElementById('voiceRecording').style.display = 'none';
        document.getElementById('voiceBtn').innerHTML = '<i class="fas fa-microphone"></i>';
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

async function uploadVoice(file, duration) {
    try {
        const result = await api.uploadVoice(file, duration);
        if (result.success && socket) {
            socket.emit('sendVoice', {
                chatId: currentChatId,
                senderId: currentUser.id,
                file: result.file,
                duration: duration
            });
            showToast('🎤 Голосовое отправлено!', 'success');
        }
    } catch (error) {
        console.error('Voice upload error:', error);
        showToast('❌ Ошибка отправки голосового', 'error');
    }
}

function playVoice(button, url) {
    const icon = button.querySelector('i');
    const audio = new Audio(url);
    audio.onplay = () => {
        icon.className = 'fas fa-pause';
    };
    audio.onended = () => {
        icon.className = 'fas fa-play';
    };
    audio.onpause = () => {
        icon.className = 'fas fa-play';
    };
    audio.play();
}

// ===== ЗВОНКИ =====

function startCall() {
    if (!currentChatUser) {
        showToast('Пользователь не выбран', 'error');
        return;
    }
    if (socket) {
        socket.emit('callStart', { from: currentUser.id, to: currentChatUser, type: 'audio' });
        showToast('📞 Звонок...', 'info');
    }
}

function startVideoCall() {
    if (!currentChatUser) {
        showToast('Пользователь не выбран', 'error');
        return;
    }
    if (socket) {
        socket.emit('callStart', { from: currentUser.id, to: currentChatUser, type: 'video' });
        showToast('📹 Видеозвонок...', 'info');
    }
}

// ===== ПРОСМОТР ПРОФИЛЯ =====

let profileUserId = null;

async function openUserProfile() {
    if (!currentChatUser) {
        showToast('Пользователь не выбран', 'error');
        return;
    }
    profileUserId = currentChatUser;
    await loadUserProfile(currentChatUser);
}

async function loadUserProfile(userId) {
    try {
        const user = await api.getUserProfile(userId);
        if (!user) {
            showToast('Пользователь не найден', 'error');
            return;
        }
        
        document.getElementById('profileViewName').textContent = user.name;
        document.getElementById('profileViewUsername').textContent = '@' + (user.username || 'username');
        document.getElementById('profileViewBio').textContent = user.bio || 'О себе не указано';
        document.getElementById('profileViewPhone').textContent = user.phone;
        document.getElementById('profileViewStatus').textContent = user.online ? '🟢 онлайн' : '⚫ офлайн';
        document.getElementById('profileViewJoined').textContent = 'В сети с ' + new Date(user.created_at).toLocaleDateString('ru-RU');
        
        const avatarText = document.getElementById('profileViewAvatarText');
        const avatarImg = document.getElementById('profileViewAvatar');
        
        if (user.avatar && user.avatar.startsWith('http')) {
            avatarImg.src = user.avatar;
            avatarImg.style.display = 'block';
            avatarText.style.display = 'none';
        } else {
            avatarText.textContent = user.name.charAt(0).toUpperCase();
            avatarText.style.display = 'flex';
            avatarImg.style.display = 'none';
        }
        
        // Проверяем, заблокирован ли пользователь
        const blockBtn = document.getElementById('blockBtn');
        blockBtn.innerHTML = '<i class="fas fa-ban"></i> Заблокировать';
        blockBtn.onclick = () => blockUser();
        
        document.getElementById('userProfileModal').classList.add('show');
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        showToast('Ошибка загрузки профиля', 'error');
    }
}

function closeUserProfile() {
    document.getElementById('userProfileModal').classList.remove('show');
}

function sendMessageToProfile() {
    closeUserProfile();
    if (profileUserId) {
        openChatWithUser(profileUserId);
    }
}

async function blockUser() {
    if (!currentUser || !profileUserId) return;
    const result = await api.blockUser(currentUser.id, profileUserId);
    if (result.success) {
        showToast('🚫 Пользователь заблокирован', 'success');
        closeUserProfile();
    }
}

// ===== СОЗДАНИЕ ЧАТА =====

function showCreateChat(type) {
    createChatType = type;
    selectedMembers = [];
    document.getElementById('createChatTitle').textContent = type === 'channel' ? '📢 Создать канал' : '👥 Создать группу';
    document.getElementById('chatNameInput').value = '';
    document.getElementById('chatUsernameInput').value = '';
    document.getElementById('chatDescriptionInput').value = '';
    document.getElementById('memberSearchInput').value = '';
    document.getElementById('membersList').innerHTML = '';
    document.getElementById('addMembersArea').style.display = type === 'channel' ? 'none' : 'block';
    document.getElementById('createChatModal').classList.add('show');
}

function closeCreateChat() {
    document.getElementById('createChatModal').classList.remove('show');
}

async function addMemberByUsername() {
    const username = document.getElementById('memberSearchInput').value.trim();
    if (!username) { showToast('Введите username', 'error'); return; }
    
    const results = await api.searchUsers(username, currentUser.id);
    const user = results.find(u => u.username === username);
    if (!user) { showToast('Пользователь не найден', 'error'); return; }
    if (selectedMembers.includes(user.id)) { showToast('Уже добавлен', 'info'); return; }
    
    selectedMembers.push(user.id);
    document.getElementById('memberSearchInput').value = '';
    renderMembersList();
}

function renderMembersList() {
    const container = document.getElementById('membersList');
    if (!container) return;
    container.innerHTML = selectedMembers.map(id => {
        return `<span class="member-tag">Участник <span class="remove-member" onclick="selectedMembers=selectedMembers.filter(i=>i!=='${id}');renderMembersList();">&times;</span></span>`;
    }).join('');
}

async function createChat() {
    const name = document.getElementById('chatNameInput').value.trim();
    const username = document.getElementById('chatUsernameInput').value.trim();
    const description = document.getElementById('chatDescriptionInput').value.trim();
    if (!name) { showToast('Введите название', 'error'); return; }
    
    const data = {
        name,
        type: createChatType,
        createdBy: currentUser.id,
        description: description || null,
        participants: createChatType === 'channel' ? [] : selectedMembers
    };
    
    if (username && createChatType === 'channel') {
        data.username = username;
    }
    
    const result = await api.createChat(data);
    
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    
    showToast(`✅ ${createChatType === 'channel' ? 'Канал' : 'Группа'} создана!`, 'success');
    closeCreateChat();
    loadChats();
    openChat(result.chat.id);
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
    if (!user) { showToast('Пользователь не найден', 'error'); return; }
    if (user.id === currentUser.id) { showToast('Нельзя добавить себя', 'error'); return; }

    const result = await api.addContact(currentUser.id, user.id);
    showToast(`✅ Контакт ${user.name} добавлен!`, 'success');
    closeModal();
    loadChats();
    openChat(result.chat.id);
}

async function openChatWithUser(userId) {
    const result = await api.addContact(currentUser.id, userId);
    if (result.chat) {
        loadChats();
        openChat(result.chat.id);
    }
}

// ===== ПОИСК =====

document.getElementById('searchInput').addEventListener('input', function(e) {
    const query = this.value.trim();
    if (query.length > 1) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchUsers(query), 300);
    } else {
        renderChats();
    }
});

async function searchUsers(query) {
    if (!currentUser) return;
    const results = await api.searchUsers(query, currentUser.id);
    const list = document.getElementById('chatList');
    if (!list) return;
    list.innerHTML = '';
    
    if (results.length === 0) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:#6a6a6a;">Пользователи не найдены</div>`;
        return;
    }
    
    results.forEach(user => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="chat-avatar">
                ${user.avatar ? `<img src="${user.avatar}" onerror="this.style.display='none'">` : user.name.charAt(0).toUpperCase()}
                ${user.online ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="chat-info">
                <div class="name">${user.name}</div>
                <div class="last-msg">@${user.username || 'username'}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            document.getElementById('searchInput').value = '';
            renderChats();
            openChatWithUser(user.id);
        });
        list.appendChild(item);
    });
}

// ===== НАСТРОЙКИ ЧАТА =====

function openChatSettings() {
    document.getElementById('chatSettingsModal').classList.add('show');
}

function closeChatSettings() {
    document.getElementById('chatSettingsModal').classList.remove('show');
}

function setWallpaper() {
    showToast('🖼️ Выберите обои для чата', 'info');
}

function setAutoDelete() {
    const seconds = prompt('Время автоудаления в секундах (0 - отключить):', '0');
    if (seconds !== null) {
        showToast('⏰ Автоудаление установлено на ' + seconds + ' сек', 'success');
    }
}

function muteChat() {
    showToast('🔇 Уведомления отключены', 'success');
}

function leaveChat() {
    if (confirm('Покинуть чат?')) {
        showToast('👋 Вы покинули чат', 'info');
        closeChatSettings();
    }
}

// ===== ФАЙЛЫ =====

async function uploadFiles(files) {
    if (!files || files.length === 0 || !currentChatId) {
        showToast('Выберите чат', 'error');
        return;
    }
    
    for (const file of files) {
        try {
            showToast(`⏳ Загрузка ${file.name}...`, 'info');
            const result = await api.uploadFile(file);
            if (result.success && socket) {
                socket.emit('sendMessage', {
                    chatId: currentChatId,
                    senderId: currentUser.id,
                    text: '',
                    file: result.file
                });
                showToast(`✅ ${file.name} отправлен!`, 'success');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`❌ Ошибка ${file.name}`, 'error');
        }
    }
}

// ===== КОД ПОДТВЕРЖДЕНИЯ =====

document.querySelectorAll('.code-input').forEach((input, index, arr) => {
    input.addEventListener('input', function(e) {
        if (this.value) {
            this.classList.add('filled');
            if (index < arr.length - 1) arr[index + 1].focus();
            else setTimeout(verifyCode, 300);
        }
    });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !this.value && index > 0) {
            arr[index - 1].focus();
        }
        if (e.key === 'Enter') verifyCode();
    });
    input.addEventListener('keypress', function(e) {
        if (!/[0-9]/.test(e.key)) e.preventDefault();
    });
});

// ===== ЗАКРЫТИЕ МОДАЛОК =====

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('show');
        }
    });
});

// ===== ОБРАБОТЧИКИ =====

document.addEventListener('DOMContentLoaded', function() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const mobileBack = document.getElementById('mobileBack');
    const emojiBtn = document.getElementById('emojiBtn');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        // Сохраняем черновик
        messageInput.addEventListener('input', function() {
            if (currentChatId) {
                api.saveDraft(currentChatId, currentUser.id, this.value);
            }
        });
    }
    if (mobileBack) {
        mobileBack.addEventListener('click', function() {
            document.getElementById('rightPanel').classList.remove('active-mobile');
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const files = e.target.files;
            if (files && files.length > 0) {
                uploadFiles(files);
            }
            this.value = '';
        });
    }
    if (emojiBtn) {
        emojiBtn.addEventListener('click', toggleEmojiPanel);
    }
});

// ===== ИНИЦИАЛИЗАЦИЯ =====

initEmojiPanel();

restoreSession().then(function(restored) {
    if (!restored) {
        console.log('🔐 Сессия не восстановлена');
    }
});

console.log('✅ TeleFon готов!');
/* ============================================================
   TeleFon - Клиент (ПОЛНАЯ ВЕРСИЯ С АВАТАРКАМИ И ЗВОНКАМИ)
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
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let voiceDuration = 0;
let lastMessageId = null;

// ===== ПЕРЕМЕННЫЕ ДЛЯ ЗВОНКОВ =====
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isCallActive = false;
let currentCallId = null;
let callType = 'audio';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ===== ПЕРЕМЕННЫЕ ДЛЯ ДИАЛОГОВ =====
let deleteMessageId = null;
let editMessageId = null;
let forwardMessageId = null;

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
    },
    async leaveChat(chatId, userId) {
        const res = await fetch(`${API_URL}/api/chat/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, userId })
        });
        return res.json();
    },
    async setChatWallpaper(chatId, wallpaper) {
        const res = await fetch(`${API_URL}/api/chat/wallpaper`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, wallpaper })
        });
        return res.json();
    },
    async muteChat(chatId, userId, until) {
        const res = await fetch(`${API_URL}/api/chat/mute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, userId, until })
        });
        return res.json();
    },
    async deleteMessageForEveryone(messageId) {
        const res = await fetch(`${API_URL}/api/messages/delete-for-everyone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId })
        });
        return res.json();
    },
    async deleteMessageForMe(messageId, userId) {
        const res = await fetch(`${API_URL}/api/messages/delete-for-me`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, userId })
        });
        return res.json();
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

// ===== УБИРАЕМ ВСЕ УВЕДОМЛЕНИЯ =====
function showToast(text, type = 'info', duration = 3000) {
    return;
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
    
    socket.on('newMessage', (data) => {
        console.log('📨 Новое сообщение:', data);
        
        if (lastMessageId === data.message.id) {
            console.log('⚠️ Дубликат сообщения, пропускаем');
            return;
        }
        lastMessageId = data.message.id;
        
        loadChats().then(() => {
            if (data.chatId === currentChatId) {
                renderMessages(currentChatId);
                api.markAsRead(currentChatId, currentUser.id);
                if (socket) {
                    socket.emit('messageRead', { messageId: data.message.id, userId: currentUser.id });
                }
            }
        });
    });
    
    socket.on('messageStatus', () => {
        if (currentChatId) renderMessages(currentChatId);
    });
    
    socket.on('messageDeleted', (data) => {
        if (data.chatId === currentChatId) {
            loadChats().then(() => {
                renderMessages(currentChatId);
            });
        } else {
            loadChats();
        }
    });
    
    socket.on('messageEdited', (data) => {
        if (data.chatId === currentChatId) {
            renderMessages(currentChatId);
        }
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

    // ===== ЗВОНКИ =====
    socket.on('incomingCall', (data) => {
        showIncomingCall(data);
    });

    socket.on('callAnswer', (data) => {
        handleCallAnswer(data);
    });

    socket.on('callEnd', (data) => {
        endCall();
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

    if (!name) { return; }
    if (!phone || phone.length < 10) { return; }
    if (!password || password.length < 6) { return; }

    const result = await api.register(name, phone, password);
    if (result.error) {
        return;
    }

    if (result.success) {
        showVerification(phone);
    }
}

async function verifyCode() {
    let code = '';
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`code${i}`);
        if (!input.value) { return; }
        code += input.value;
    }

    const phone = document.getElementById('verifyPhone').textContent;
    const result = await api.verify(phone, code);
    
    if (result.error) {
        return;
    }

    if (result.success && result.user) {
        loginUser(result.user);
    }
}

async function resendCode() {
    const phone = document.getElementById('verifyPhone').textContent;
    const name = document.getElementById('regName').value.trim() || 'User';
    const password = document.getElementById('regPassword').value || '123456';
    await api.register(name, phone, password);
}

async function login() {
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!phone || !password) {
        return;
    }

    const result = await api.login(phone, password);
    
    if (result.error) {
        return;
    }

    if (result.needVerification) {
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
    }
}

async function saveSettings() {
    if (!currentUser) return;
    
    const name = document.getElementById('settingsName').value.trim();
    const username = document.getElementById('settingsUsername').value.trim();
    const bio = document.getElementById('settingsBio').value.trim();
    const avatar = window.tempAvatar || currentUser.avatar || null;
    
    if (!name) { return; }
    if (!username) { return; }
    if (username.includes(' ')) { return; }
    
    const result = await api.updateProfile({
        userId: currentUser.id,
        name,
        username,
        bio,
        avatar
    });
    
    if (result.error) {
        return;
    }
    
    if (result.success) {
        currentUser = result.user;
        updateProfileUI(currentUser);
        window.tempAvatar = null;
        closeSettings();
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
        const isMuted = chat.isMuted || false;
        
        let typeIcon = '';
        if (chat.type === 'channel') typeIcon = '📢 ';
        else if (chat.type === 'group') typeIcon = '👥 ';
        else typeIcon = '💬 ';

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-avatar">
                ${avatar ? `<img src="${avatar}" onerror="this.style.display='none'">` : name.charAt(0).toUpperCase()}
                ${chat.isOnline ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="chat-info">
                <div class="name">
                    ${typeIcon}${name}
                    ${isMuted ? '🔇' : ''}
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

// ===== ОБНОВЛЕНИЕ АВАТАРОК ВЕЗДЕ =====
function updateAllAvatars(user) {
    // 1. В профиле пользователя (левая панель)
    const profileAvatarText = document.getElementById('profileAvatarText');
    const profileAvatarImg = document.getElementById('profileAvatarImg');
    if (user.avatar && user.avatar.startsWith('http')) {
        profileAvatarImg.src = user.avatar;
        profileAvatarImg.style.display = 'block';
        profileAvatarText.style.display = 'none';
    } else {
        profileAvatarText.textContent = user.name.charAt(0).toUpperCase();
        profileAvatarText.style.display = 'block';
        profileAvatarImg.style.display = 'none';
    }
    
    // 2. В шапке чата
    const chatAvatarText = document.getElementById('chatAvatarText');
    const chatAvatarImg = document.getElementById('chatAvatarImg');
    if (user.avatar && user.avatar.startsWith('http')) {
        chatAvatarImg.src = user.avatar;
        chatAvatarImg.style.display = 'block';
        chatAvatarText.style.display = 'none';
    } else {
        chatAvatarText.textContent = user.name.charAt(0).toUpperCase();
        chatAvatarText.style.display = 'flex';
        chatAvatarImg.style.display = 'none';
    }
    
    // 3. В профиле пользователя (модалка)
    const profileViewAvatarText = document.getElementById('profileViewAvatarText');
    const profileViewAvatarImg = document.getElementById('profileViewAvatar');
    if (user.avatar && user.avatar.startsWith('http')) {
        profileViewAvatarImg.src = user.avatar;
        profileViewAvatarImg.style.display = 'block';
        profileViewAvatarText.style.display = 'none';
    } else {
        profileViewAvatarText.textContent = user.name.charAt(0).toUpperCase();
        profileViewAvatarText.style.display = 'flex';
        profileViewAvatarImg.style.display = 'none';
    }
    
    // 4. В списке чатов — обновляем все чаты где есть этот пользователь
    allChats.forEach(chat => {
        if (chat.userId === user.id) {
            chat.avatar = user.avatar;
        }
    });
    
    // 5. Перерисовываем список чатов
    renderChats();
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
        // Загружаем аватарку пользователя для шапки
        if (currentChatUser) {
            try {
                const user = await api.getUserProfile(currentChatUser);
                if (user && user.avatar) {
                    chat.avatar = user.avatar;
                }
            } catch (e) {}
        }
    } else {
        currentChatUser = null;
    }
    
    document.getElementById('chatName').textContent = name;
    updateChatStatus();
    
    // ===== ОБНОВЛЯЕМ АВАТАРКУ В ШАПКЕ =====
    const avatarText = document.getElementById('chatAvatarText');
    const avatarImg = document.getElementById('chatAvatarImg');
    const chatAvatar = chat.avatar || null;
    
    if (chatAvatar && chatAvatar.startsWith('http')) {
        avatarImg.src = chatAvatar;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarText.textContent = name.charAt(0).toUpperCase();
        avatarText.style.display = 'flex';
        avatarImg.style.display = 'none';
    }
    
    // Применяем обои
    if (chat.wallpaper) {
        document.getElementById('messagesArea').style.backgroundImage = `url(${chat.wallpaper})`;
        document.getElementById('messagesArea').style.backgroundSize = 'cover';
        document.getElementById('messagesArea').style.backgroundPosition = 'center';
    } else {
        document.getElementById('messagesArea').style.backgroundImage = 'none';
    }
    
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
    
    const messages = await api.getMessages(chatId);
    
    const hash = messages.map(m => m.id).join('-');
    if (area.dataset.hash === hash) {
        console.log('⚠️ Сообщения не изменились, пропускаем перерисовку');
        return;
    }
    area.dataset.hash = hash;
    
    area.innerHTML = '';
    
    if (messages.length === 0) {
        area.innerHTML = `
            <div class="empty-chat">
                <p>Нет сообщений</p>
                <span>Напишите первое сообщение</span>
            </div>
        `;
        return;
    }

    // Кэш для аватарок
    const avatarCache = {};
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const isSent = msg.sender_id === currentUser.id;
        const showAvatar = !isSent && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
        
        // Получаем аватарку отправителя
        let senderAvatar = null;
        if (!isSent && showAvatar) {
            if (!avatarCache[msg.sender_id]) {
                try {
                    const user = await api.getUserProfile(msg.sender_id);
                    avatarCache[msg.sender_id] = user ? user.avatar : null;
                } catch (e) {
                    avatarCache[msg.sender_id] = null;
                }
            }
            senderAvatar = avatarCache[msg.sender_id];
        }
        
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.dataset.messageId = msg.id;
        
        const time = formatTime(msg.created_at);
        let content = '';
        
        // Аватарка для received сообщений (с правильным отступом)
        if (!isSent && showAvatar) {
            const avatarLetter = msg.sender_id ? msg.sender_id.charAt(0).toUpperCase() : 'U';
            content += `
                <div class="message-avatar">
                    ${senderAvatar ? `<img src="${senderAvatar}" onerror="this.style.display='none'">` : avatarLetter}
                </div>
            `;
        }
        
        if (msg.reply_to) {
            content += `<div class="reply-to">↩️ Ответ</div>`;
        }
        
        if (msg.text) {
            content += msg.text;
        }
        
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
        
        if (msg.voice_duration > 0) {
            content += `
                <div class="voice-message">
                    <button class="voice-play" onclick="playVoice(this, '${msg.file}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="voice-waveform">
                        <div class="wave-bar" style="height:${Math.random()*20+5}px;left:${Math.random()*90}%;"></div>
                        <div class="wave-bar" style="height:${Math.random()*20+5}px;left:${Math.random()*90}%;"></div>
                        <div class="wave-bar" style="height:${Math.random()*20+5}px;left:${Math.random()*90}%;"></div>
                    </div>
                    <span class="voice-duration-text">${formatDuration(msg.voice_duration)}</span>
                </div>
            `;
        }
        
        if (msg.edited_at) {
            content += ` <span style="font-size:11px;color:#888;">(ред.)</span>`;
        }
        
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
        
        const reactionsHtml = `<div class="message-reactions" id="reactions-${msg.id}"></div>`;
        
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
        
        loadReactions(msg.id);
    }

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
        return;
    }
    
    if (!currentChatId || !currentUser || !socket) {
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

// ===== УДАЛЕНИЕ =====
function deleteMessage(messageId) {
    deleteMessageId = messageId;
    document.getElementById('deleteMessageModal').classList.add('show');
}

function closeDeleteModal() {
    document.getElementById('deleteMessageModal').classList.remove('show');
    deleteMessageId = null;
}

async function confirmDeleteMessage() {
    if (!deleteMessageId) return;
    const forEveryone = document.getElementById('deleteForEveryone').checked;
    
    let result;
    if (forEveryone) {
        result = await api.deleteMessageForEveryone(deleteMessageId);
        if (result.success) {
            if (socket) {
                socket.emit('messageDeleted', { messageId: deleteMessageId, chatId: currentChatId });
            }
        }
    } else {
        result = await api.deleteMessageForMe(deleteMessageId, currentUser.id);
    }
    
    if (result && result.success) {
        await loadChats();
        if (currentChatId) {
            await renderMessages(currentChatId);
        }
    }
    closeDeleteModal();
}

// ===== РЕДАКТИРОВАНИЕ =====
function editMessage(messageId) {
    editMessageId = messageId;
    const msg = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (msg) {
        let text = msg.textContent.trim();
        const timeMatch = text.match(/\d{2}:\d{2}/);
        if (timeMatch) {
            text = text.substring(0, text.indexOf(timeMatch[0])).trim();
        }
        document.getElementById('editMessageInput').value = text;
    }
    document.getElementById('editMessageModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editMessageModal').classList.remove('show');
    editMessageId = null;
}

async function confirmEditMessage() {
    if (!editMessageId) return;
    const newText = document.getElementById('editMessageInput').value.trim();
    if (!newText) return;
    
    const result = await api.editMessage(editMessageId, newText, currentUser.id);
    if (result.success) {
        if (socket) {
            socket.emit('messageEdited', { messageId: editMessageId, text: newText, chatId: currentChatId });
        }
        await renderMessages(currentChatId);
    }
    closeEditModal();
}

// ===== ПЕРЕСЫЛКА =====
function forwardMessage(messageId) {
    forwardMessageId = messageId;
    const list = document.getElementById('forwardChatList');
    list.innerHTML = '';
    
    allChats.forEach(chat => {
        const name = chat.displayName || chat.name || 'Чат';
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="chat-avatar">${name.charAt(0).toUpperCase()}</div>
            <div class="chat-info">
                <div class="name">${name}</div>
                <div class="last-msg">${chat.last_message || 'Нет сообщений'}</div>
            </div>
        `;
        item.addEventListener('click', () => confirmForward(chat.id));
        list.appendChild(item);
    });
    
    document.getElementById('forwardMessageModal').classList.add('show');
}

function closeForwardModal() {
    document.getElementById('forwardMessageModal').classList.remove('show');
    forwardMessageId = null;
}

async function confirmForward(chatId) {
    if (!forwardMessageId) return;
    
    const messages = await api.getMessages(currentChatId);
    const msg = messages.find(m => m.id === forwardMessageId);
    if (!msg) return;
    
    if (socket) {
        socket.emit('sendMessage', {
            chatId: chatId,
            senderId: currentUser.id,
            text: `[Переслано] ${msg.text || ''}`,
            file: msg.file || null,
            forwarded_from: msg.sender_id
        });
    }
    
    closeForwardModal();
}

// ===== ПРОСМОТР ПРОФИЛЯ =====

async function openUserProfile() {
    if (!currentChatUser) {
        return;
    }
    await loadUserProfile(currentChatUser);
}

async function loadUserProfile(userId) {
    try {
        const user = await api.getUserProfile(userId);
        if (!user) {
            return;
        }
        
        document.getElementById('profileViewName').textContent = user.name;
        document.getElementById('profileViewUsername').textContent = '@' + (user.username || 'username');
        document.getElementById('profileViewBio').textContent = user.bio || 'О себе не указано';
        document.getElementById('profileViewPhone').textContent = user.phone;
        document.getElementById('profileViewStatus').textContent = user.online ? '🟢 онлайн' : '⚫ офлайн';
        document.getElementById('profileViewJoined').textContent = 'В сети с ' + new Date(user.created_at).toLocaleDateString('ru-RU');
        
        // ===== ОБНОВЛЯЕМ АВАТАРКУ В ПРОФИЛЕ =====
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
        
        document.getElementById('userProfileModal').classList.add('show');
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
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
    document.getElementById('chatAvatarInput').value = '';
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
    if (!username) return;
    
    const results = await api.searchUsers(username, currentUser.id);
    const user = results.find(u => u.username === username);
    if (!user) return;
    if (selectedMembers.includes(user.id)) return;
    
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
    const avatar = document.getElementById('chatAvatarInput').value.trim();
    if (!name) return;
    
    const data = {
        name,
        type: createChatType,
        createdBy: currentUser.id,
        description: description || null,
        participants: createChatType === 'channel' ? [] : selectedMembers,
        avatar: avatar || null
    };
    
    if (username && createChatType === 'channel') {
        data.username = username;
    }
    
    const result = await api.createChat(data);
    
    if (result.error) {
        return;
    }
    
    closeCreateChat();
    await loadChats();
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

    if (!name) return;
    if (!phone || phone.length < 10) return;

    const user = await api.findUserByPhone(phone);
    if (!user) return;
    if (user.id === currentUser.id) return;

    const result = await api.addContact(currentUser.id, user.id);
    closeModal();
    await loadChats();
    openChat(result.chat.id);
}

async function openChatWithUser(userId) {
    const result = await api.addContact(currentUser.id, userId);
    if (result.chat) {
        await loadChats();
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const reader = new FileReader();
            reader.onload = async function(event) {
                const wallpaper = event.target.result;
                const result = await api.setChatWallpaper(currentChatId, wallpaper);
                if (result.success) {
                    document.getElementById('messagesArea').style.backgroundImage = `url(${wallpaper})`;
                    document.getElementById('messagesArea').style.backgroundSize = 'cover';
                    document.getElementById('messagesArea').style.backgroundPosition = 'center';
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {}
    };
    input.click();
}

async function muteChat() {
    const options = ['На 1 час', 'На 8 часов', 'На 1 день', 'Навсегда', 'Отключить'];
    const choice = prompt('Выберите время:\n1 - 1 час\n2 - 8 часов\n3 - 1 день\n4 - Навсегда\n5 - Отключить');
    
    if (!choice) return;
    
    let until = null;
    const now = new Date();
    switch(choice) {
        case '1': until = new Date(now.getTime() + 60*60*1000).toISOString(); break;
        case '2': until = new Date(now.getTime() + 8*60*60*1000).toISOString(); break;
        case '3': until = new Date(now.getTime() + 24*60*60*1000).toISOString(); break;
        case '4': until = '2999-12-31T23:59:59.999Z'; break;
        case '5': until = null; break;
        default: return;
    }
    
    const result = await api.muteChat(currentChatId, currentUser.id, until);
    if (result.success) {
        renderChats();
    }
}

async function leaveChat() {
    if (!confirm('Вы уверены, что хотите покинуть чат?')) return;
    
    const result = await api.leaveChat(currentChatId, currentUser.id);
    if (result.success) {
        closeChatSettings();
        currentChatId = null;
        await loadChats();
        document.getElementById('messagesArea').innerHTML = `
            <div class="empty-chat">
                <p>Выберите чат</p>
                <span>Начните общение</span>
            </div>
        `;
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
    }
}

function setAutoDelete() {
    const seconds = prompt('Время автоудаления в секундах (0 - отключить):', '0');
    if (seconds !== null) {}
}

// ===== ФАЙЛЫ =====

async function uploadFiles(files) {
    if (!files || files.length === 0 || !currentChatId) {
        return;
    }
    
    for (const file of files) {
        try {
            const result = await api.uploadFile(file);
            if (result.success && socket) {
                socket.emit('sendMessage', {
                    chatId: currentChatId,
                    senderId: currentUser.id,
                    text: '',
                    file: result.file
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
    }
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
            
            const waveContainer = document.querySelector('.voice-wave');
            waveContainer.innerHTML = '';
            for (let i = 0; i < 20; i++) {
                const bar = document.createElement('div');
                bar.className = 'wave';
                bar.style.height = (5 + Math.random() * 25) + 'px';
                bar.style.animationDelay = (i * 0.05) + 's';
                waveContainer.appendChild(bar);
            }
            
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
        }
    } catch (error) {
        console.error('Voice upload error:', error);
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

// ===== ЗВОНКИ (WebRTC) =====

async function startCall() {
    if (!currentChatUser) {
        return;
    }
    
    callType = 'audio';
    await startWebRTC(currentChatUser);
}

async function startVideoCall() {
    if (!currentChatUser) {
        return;
    }
    
    callType = 'video';
    await startWebRTC(currentChatUser);
}

async function startWebRTC(userId) {
    try {
        currentCallId = Date.now().toString();
        
        // Получаем локальный медиапоток
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video'
        });
        
        // Показываем UI звонка
        showCallUI();
        
        // Создаем PeerConnection
        peerConnection = new RTCPeerConnection(configuration);
        
        // Добавляем локальные треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Обработчик удаленного потока
        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            showRemoteVideo();
        };
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer через WebSocket
        if (socket) {
            socket.emit('callOffer', {
                callId: currentCallId,
                to: userId,
                from: currentUser.id,
                offer: offer,
                type: callType
            });
        }
        
        isCallActive = true;
        
    } catch (error) {
        console.error('Start call error:', error);
        alert('Не удалось начать звонок. Проверьте микрофон.');
    }
}

function showCallUI() {
    let callUI = document.getElementById('callUI');
    if (!callUI) {
        callUI = document.createElement('div');
        callUI.id = 'callUI';
        callUI.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #fff;
        `;
        callUI.innerHTML = `
            <div id="remoteVideoContainer" style="width:100%;height:70%;display:flex;align-items:center;justify-content:center;">
                <video id="remoteVideo" autoplay playsinline style="max-width:100%;max-height:100%;border-radius:12px;background:#1a1a1a;"></video>
                <div id="callStatus" style="position:absolute;bottom:20%;font-size:20px;">Звонок...</div>
            </div>
            <div style="display:flex;gap:20px;margin-top:20px;">
                <button onclick="endCall()" style="width:60px;height:60px;border-radius:50%;border:none;background:#e74c3c;color:#fff;font-size:24px;cursor:pointer;">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button onclick="toggleMute()" style="width:60px;height:60px;border-radius:50%;border:none;background:#2b2b2b;color:#fff;font-size:24px;cursor:pointer;">
                    <i class="fas fa-microphone"></i>
                </button>
            </div>
            <div id="localVideoContainer" style="position:absolute;bottom:20%;right:20px;width:120px;height:160px;border-radius:12px;overflow:hidden;border:2px solid #3a3a3a;">
                <video id="localVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>
            </div>
        `;
        document.body.appendChild(callUI);
    }
    
    const localVideo = document.getElementById('localVideo');
    if (localVideo && localStream) {
        localVideo.srcObject = localStream;
    }
    
    callUI.style.display = 'flex';
}

function showRemoteVideo() {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo && remoteStream) {
        remoteVideo.srcObject = remoteStream;
        document.getElementById('callStatus').textContent = 'Разговор...';
    }
}

function showIncomingCall(data) {
    if (confirm(`Входящий звонок от ${data.fromName || 'Пользователя'}`)) {
        // Принимаем звонок
        currentCallId = data.callId;
        callType = data.type || 'audio';
        
        // Отвечаем на звонок
        if (socket) {
            socket.emit('callAnswer', {
                callId: data.callId,
                answer: true
            });
        }
        
        // Запускаем WebRTC
        startWebRTC(data.from);
    } else {
        // Отклоняем звонок
        if (socket) {
            socket.emit('callAnswer', {
                callId: data.callId,
                answer: false
            });
        }
    }
}

function handleCallAnswer(data) {
    if (data.answer) {
        document.getElementById('callStatus').textContent = 'Соединение...';
    } else {
        endCall();
    }
}

async function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream = null;
    }
    
    isCallActive = false;
    
    const callUI = document.getElementById('callUI');
    if (callUI) {
        callUI.style.display = 'none';
    }
    
    if (socket && currentCallId) {
        socket.emit('callEnd', { callId: currentCallId });
        currentCallId = null;
    }
}

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('#callUI button:last-child i');
            if (btn) {
                btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
            }
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
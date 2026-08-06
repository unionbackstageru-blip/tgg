/* ============================================================
   Telegram Social Network - Клиент
   ============================================================ */

const API_URL = window.location.origin;
let socket = null;
let currentUser = null;
let currentChatId = null;
let allChats = [];
let selectedMembers = [];
let createChatType = 'group';
let searchTimeout = null;

// ===== ЭМОДЗИ =====
const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😗','😙','😚','☺️','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✌️','🤟','🤘','👌','🤞','🤙','💪','🦾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💯','💢','💥','🔥','✨','⭐','🌟','💫','☀️','🌈','☁️','⛅','🌧️','🌨️','❄️','☃️','⛄','🌊','🌸','🌺','🌻','🌹','🌷','🌿','🌵','🌲','🌳','🍁','🍂','🍃','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓'];

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
    
    socket.on('userStatus', () => renderChats());
    
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

// ===== ВОССТАНОВЛЕНИЕ СЕССИИ =====
async function restoreSession() {
    const savedUserId = localStorage.getItem('telegram_user_id');
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
    localStorage.setItem('telegram_user_id', user.id);
    
    connectSocket(user.id);
    loadChats();
    showToast(`Добро пожаловать, ${user.name}!`, 'success');
}

function updateProfileUI(user) {
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profilePhone').textContent = user.phone;
    document.getElementById('profileUsername').textContent = user.username ? '@' + user.username : '@username';
    
    const avatarText = document.getElementById('profileAvatarText');
    const avatarImg = document.getElementById('profileAvatarImg');
    
    if (user.avatar && user.avatar.startsWith('http')) {
        avatarImg.src = user.avatar;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarText.textContent = user.name.charAt(0).toUpperCase();
        avatarText.style.display = 'block';
        avatarImg.style.display = 'none';
    }
}

function logout() {
    if (socket) socket.disconnect();
    localStorage.removeItem('telegram_user_id');
    currentUser = null;
    currentChatId = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('loginPassword').value = '';
    showToast('Вы вышли из аккаунта', 'info');
}

// ===== НАСТРОЙКИ =====

function openSettings() {
    if (!currentUser) return;
    const modal = document.getElementById('settingsModal');
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
    document.getElementById('settingsModal').classList.remove('show');
}

document.getElementById('avatarInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = document.getElementById('settingsAvatarImg');
            img.src = event.target.result;
            img.style.display = 'block';
            document.getElementById('settingsAvatarText').style.display = 'none';
            // Временно сохраняем как data URL
            window.tempAvatar = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

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

// ===== ПОИСК =====

document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
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
    list.innerHTML = '';
    
    if (results.length === 0) {
        list.innerHTML = `<div style="padding: 20px; text-align: center; color: #6a6a6a;">Пользователи не найдены</div>`;
        return;
    }
    
    results.forEach(user => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <div class="chat-avatar c${Math.floor(Math.random() * 7) + 1}">
                ${user.avatar ? `<img src="${user.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : user.name.charAt(0).toUpperCase()}
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

async function openChatWithUser(userId) {
    const result = await api.addContact(currentUser.id, userId);
    if (result.chat) {
        loadChats();
        openChat(result.chat.id);
    }
}

// ===== ЧАТЫ =====

async function loadChats() {
    if (!currentUser) return;
    allChats = await api.getChats(currentUser.id);
    renderChats();
}

function renderChats() {
    const list = document.getElementById('chatList');
    list.innerHTML = '';

    if (!allChats || allChats.length === 0) {
        list.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: #6a6a6a;">
                <p>У вас пока нет чатов</p>
                <p style="font-size: 13px; margin-top: 8px;">Создайте группу, канал или добавьте контакт</p>
            </div>
        `;
        return;
    }

    allChats.forEach(chat => {
        const name = chat.name || 'Чат';
        const lastMsg = chat.last_message || 'Нет сообщений';
        const time = formatTime(chat.last_message_time);
        const unread = chat.unread || 0;
        
        let typeIcon = '';
        if (chat.type === 'channel') typeIcon = '📢 ';
        else if (chat.type === 'group') typeIcon = '👥 ';
        else typeIcon = '💬 ';

        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-avatar c${Math.floor(Math.random() * 7) + 1}">
                ${name.charAt(0).toUpperCase()}
            </div>
            <div class="chat-info">
                <div class="name">
                    ${typeIcon}${name}
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

// ===== ОТКРЫТИЕ ЧАТА =====

async function openChat(chatId) {
    currentChatId = chatId;
    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    document.getElementById('chatName').textContent = chat.name || 'Чат';
    document.getElementById('chatAvatar').textContent = chat.name ? chat.name.charAt(0).toUpperCase() : 'Ч';
    
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
            const file = typeof msg.file === 'string' ? JSON.parse(msg.file) : msg.file;
            content += renderFile(file);
        }
        
        div.innerHTML = `${content}<span class="time">${time}</span>`;
        area.appendChild(div);
    });

    area.scrollTop = area.scrollHeight;
}

// ===== ФАЙЛЫ =====

function renderFile(file) {
    const isImage = file.type && file.type.startsWith('image/');
    if (isImage) {
        return `<div class="file-attachment"><img src="${file.url}" class="file-preview-image" onclick="window.open('${file.url}','_blank')"></div>`;
    }
    return `
        <div class="file-attachment" onclick="window.open('${file.url}','_blank')">
            <i class="fas fa-file"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
        </div>
    `;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    
    for (const file of files) {
        try {
            const result = await api.uploadFile(file);
            if (result.success) {
                socket.emit('sendMessage', {
                    chatId: currentChatId,
                    senderId: currentUser.id,
                    text: '',
                    file: result.file
                });
            }
        } catch (error) {
            showToast('Ошибка загрузки файла', 'error');
        }
    }
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
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
            document.getElementById('emojiPanel').style.display = 'none';
        });
        grid.appendChild(btn);
    });
}

function toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
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

// ===== СОЗДАНИЕ ЧАТА =====

function showCreateChat(type) {
    createChatType = type;
    selectedMembers = [];
    document.getElementById('createChatTitle').textContent = type === 'channel' ? '📢 Создать канал' : '👥 Создать группу';
    document.getElementById('chatNameInput').value = '';
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
    container.innerHTML = selectedMembers.map(id => `
        <span class="member-tag">
            ${id}
            <span class="remove-member" onclick="selectedMembers=selectedMembers.filter(i=>i!=='${id}');renderMembersList();">&times;</span>
        </span>
    `).join('');
}

async function createChat() {
    const name = document.getElementById('chatNameInput').value.trim();
    const description = document.getElementById('chatDescriptionInput').value.trim();
    if (!name) { showToast('Введите название', 'error'); return; }
    
    const result = await api.createChat({
        name,
        type: createChatType,
        createdBy: currentUser.id,
        description: description || null,
        participants: createChatType === 'channel' ? [] : selectedMembers
    });
    
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

// ===== ОБРАБОТЧИКИ =====

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

document.getElementById('mobileBack').addEventListener('click', () => {
    document.getElementById('rightPanel').classList.remove('active-mobile');
});

document.getElementById('emojiBtn').addEventListener('click', toggleEmojiPanel);
document.getElementById('fileInput').addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
});

// Закрытие модалок по клику вне
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
});

// ===== КОД ПОДТВЕРЖДЕНИЯ =====

document.querySelectorAll('.code-input').forEach((input, index, arr) => {
    input.addEventListener('input', (e) => {
        if (e.target.value) {
            e.target.classList.add('filled');
            if (index < arr.length - 1) arr[index + 1].focus();
            else setTimeout(verifyCode, 300);
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

// Восстанавливаем сессию
restoreSession().then(restored => {
    if (!restored) {
        console.log('🔐 Сессия не восстановлена');
    }
});

console.log('✅ Telegram Social Network готова!');
/* ============================================================
   TeleFon - Полная копия Telegram
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

// ===== АВТОРИЗАЦИЯ (как раньше) =====
// ... (весь код авторизации остаётся без изменений)

// ===== ОТПРАВКА СООБЩЕНИЯ =====
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
    }
    
    socket.emit('sendMessage', data);
    input.value = '';
}

// ===== РЕНДЕР СООБЩЕНИЙ (С АВАТАРКАМИ) =====
async function renderMessages(chatId) {
    const area = document.getElementById('messagesArea');
    if (!area) return;
    area.innerHTML = '';

    const messages = await api.getMessages(chatId);
    
    if (messages.length === 0) {
        area.innerHTML = `
            <div class="empty-chat">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="#2b2b2b" stroke-width="2"/>
                    <path d="M20 26L32 34L44 26" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
                    <path d="M44 26V44H20V26" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>Нет сообщений</p>
                <span>Напишите первое сообщение</span>
            </div>
        `;
        return;
    }

    let lastSender = null;
    
    messages.forEach((msg, index) => {
        const div = document.createElement('div');
        const isSent = msg.sender_id === currentUser.id;
        const showAvatar = !isSent && (index === 0 || messages[index - 1].sender_id !== msg.sender_id);
        
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
                            <img src="${file.url}" class="file-preview-image" alt="${file.name}" loading="lazy">
                            <div class="photo-overlay"><i class="fas fa-expand"></i></div>
                        </div>
                    `;
                } else if (isVideo) {
                    content += `
                        <div class="video-attachment">
                            <video src="${file.url}" controls></video>
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
        
        // Реакции (скрыты до наведения)
        const reactionsHtml = `
            <div class="reactions" style="display:none;">
                ${['👍','❤️','🔥','😂','😮','😢','🙏'].map(r => 
                    `<button class="reaction-btn" onclick="addReaction('${msg.id}','${r}')">${r}</button>`
                ).join('')}
            </div>
        `;
        
        // Меню действий (скрыто до наведения)
        const actionsHtml = `
            <div class="message-actions">
                ${isSent ? `<button onclick="editMessage('${msg.id}')"><i class="fas fa-edit"></i></button>` : ''}
                ${isSent ? `<button onclick="deleteMessage('${msg.id}')"><i class="fas fa-trash"></i></button>` : ''}
                <button onclick="replyToMessage('${msg.id}')"><i class="fas fa-reply"></i></button>
                <button onclick="forwardMessage('${msg.id}')"><i class="fas fa-forward"></i></button>
                <button onclick="pinMessage('${msg.id}')"><i class="fas fa-thumbtack"></i></button>
            </div>
        `;
        
        // Аватарка для received сообщений
        let avatarHtml = '';
        if (!isSent && showAvatar) {
            const sender = await api.getUserProfile(msg.sender_id);
            avatarHtml = `
                <div class="message-avatar" style="position:absolute;bottom:-4px;left:-32px;width:24px;height:24px;border-radius:50%;background:#3a3a3a;overflow:hidden;border:2px solid #1a1a1a;">
                    ${sender && sender.avatar ? `<img src="${sender.avatar}" style="width:100%;height:100%;object-fit:cover;">` : sender ? sender.name.charAt(0).toUpperCase() : 'U'}
                </div>
            `;
        }
        
        div.innerHTML = `
            ${avatarHtml}
            ${content}
            <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
                <span class="time">${time}</span>
                ${statusIcon}
            </div>
            ${reactionsHtml}
            ${actionsHtml}
        `;
        
        // Показываем реакции при наведении
        div.addEventListener('mouseenter', () => {
            const reactions = div.querySelector('.reactions');
            if (reactions) reactions.style.display = 'flex';
        });
        
        div.addEventListener('mouseleave', () => {
            const reactions = div.querySelector('.reactions');
            if (reactions) reactions.style.display = 'none';
        });
        
        area.appendChild(div);
    });

    area.scrollTop = area.scrollHeight;
}

// ===== РЕАКЦИИ =====
async function addReaction(messageId, reaction) {
    if (!currentUser) return;
    const result = await api.addReaction(messageId, currentUser.id, reaction);
    renderMessages(currentChatId);
}

// ===== ДЕЙСТВИЯ С СООБЩЕНИЯМИ =====
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

function replyToMessage(messageId) {
    replyingTo = messageId;
    document.getElementById('messageInput').placeholder = '↩️ Ответ...';
    document.getElementById('messageInput').focus();
}

function forwardMessage(messageId) {
    showToast('Выберите чат для пересылки', 'info');
}

async function pinMessage(messageId) {
    await api.pinMessage(currentChatId, messageId);
    showToast('📌 Сообщение закреплено!', 'success');
}

// ===== ПРОСМОТР ПРОФИЛЯ =====
async function openUserProfile() {
    if (!currentChatUser) {
        showToast('Пользователь не выбран', 'error');
        return;
    }
    
    try {
        const user = await api.getUserProfile(currentChatUser);
        if (!user) {
            showToast('Пользователь не найден', 'error');
            return;
        }
        
        document.getElementById('profileViewName').textContent = user.name;
        document.getElementById('profileViewUsername').textContent = '@' + (user.username || 'username');
        document.getElementById('profileViewBio').textContent = user.bio || 'О себе не указано';
        document.getElementById('profileViewPhone').textContent = user.phone;
        document.getElementById('profileViewStatus').textContent = user.online ? 'онлайн' : 'был(а) недавно';
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
        
        document.getElementById('userProfileModal').classList.add('show');
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        showToast('Ошибка загрузки профиля', 'error');
    }
}

function closeUserProfile() {
    document.getElementById('userProfileModal').classList.remove('show');
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
console.log('✅ TeleFon — полная копия Telegram!');
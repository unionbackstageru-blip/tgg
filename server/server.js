const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');

console.log('🚀 Запуск сервера...');

const publicDir = path.join(__dirname, '..', 'public');
const uploadDir = path.join(publicDir, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Создана папка uploads');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 50 * 1024 * 1024,
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// ===== ЗАГРУЗКА ФАЙЛОВ =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
        res.json({
            success: true,
            file: {
                name: req.file.originalname,
                url: '/uploads/' + req.file.filename,
                size: req.file.size,
                type: req.file.mimetype
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// ===== API РОУТЫ =====

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        if (!name || !phone || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const existing = await db.getUser(phone);
        if (existing) return res.status(400).json({ error: 'Пользователь уже существует' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = name.toLowerCase().replace(/\s/g, '') + Date.now().toString().slice(-4);
        
        const user = await db.createUser({
            id: Date.now().toString(),
            name,
            username,
            phone,
            password: hashedPassword,
            avatar: null,
            bio: null
        });
        
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
        console.log(`📱 КОД для ${phone}: ${code}`);
        
        res.json({ success: true, phone });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Подтверждение
app.post('/api/verify', async (req, res) => {
    try {
        const { phone, code } = req.body;
        const verification = await db.getVerification(phone);
        
        if (!verification) return res.status(400).json({ error: 'Код не найден' });
        if (Date.now() > verification.expires) {
            await db.deleteVerification(phone);
            return res.status(400).json({ error: 'Код истек' });
        }
        if (verification.code !== code) {
            return res.status(400).json({ error: 'Неверный код' });
        }
        
        await db.deleteVerification(phone);
        await db.verifyUser(phone);
        const user = await db.getUser(phone);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                avatar: user.avatar,
                bio: user.bio,
                verified: true
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const user = await db.getUser(phone);
        if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Неверный пароль' });
        
        if (!user.verified) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
            console.log(`📱 КОД для ${phone}: ${code}`);
            return res.json({ needVerification: true, phone });
        }
        
        await db.setUserOnline(user.id, true);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                avatar: user.avatar,
                bio: user.bio,
                verified: true
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Восстановление сессии
app.post('/api/restore-session', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'ID не указан' });
        
        const user = await db.getUserById(userId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        
        await db.setUserOnline(user.id, true);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                avatar: user.avatar,
                bio: user.bio,
                verified: user.verified === 1
            }
        });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление профиля
app.post('/api/update-profile', async (req, res) => {
    try {
        const { userId, name, username, bio, avatar } = req.body;
        console.log('📝 Обновление профиля:', { userId, name, username });
        
        const user = await db.getUserById(userId);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
        
        if (username) {
            const existing = await db.getUserByUsername(username);
            if (existing && existing.id !== userId) {
                return res.status(400).json({ error: 'Username уже занят' });
            }
        }
        
        const updateData = {};
        if (name) updateData.name = name;
        if (username) updateData.username = username;
        if (bio !== undefined) updateData.bio = bio;
        if (avatar !== undefined) updateData.avatar = avatar;
        
        if (Object.keys(updateData).length > 0) {
            await db.updateUser(userId, updateData);
        }
        
        const updated = await db.getUserById(userId);
        res.json({
            success: true,
            user: {
                id: updated.id,
                name: updated.name,
                username: updated.username,
                phone: updated.phone,
                avatar: updated.avatar,
                bio: updated.bio,
                verified: updated.verified === 1
            }
        });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Поиск
app.get('/api/search/:query', async (req, res) => {
    try {
        const users = await db.searchUsers(req.params.query);
        const filtered = users.filter(u => u.id !== req.query.userId);
        res.json(filtered.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            avatar: u.avatar,
            bio: u.bio,
            online: u.online === 1
        })));
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить чаты
app.get('/api/chats/:userId', async (req, res) => {
    try {
        const chats = await db.getChats(req.params.userId);
        res.json(chats);
    } catch (error) {
        console.error('Chats error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить сообщения
app.get('/api/messages/:chatId', async (req, res) => {
    try {
        const messages = await db.getMessages(req.params.chatId);
        res.json(messages);
    } catch (error) {
        console.error('Messages error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Создать чат
app.post('/api/create-chat', async (req, res) => {
    try {
        const { name, type, createdBy, participants, description } = req.body;
        const allParticipants = [createdBy, ...(participants || [])];
        const chat = await db.createChat(allParticipants, name, type || 'group', createdBy, description);
        
        for (const userId of allParticipants) {
            const socketId = onlineUsers.get(userId);
            if (socketId) {
                const chats = await db.getChats(userId);
                io.to(socketId).emit('chatsUpdate', chats);
            }
        }
        
        res.json({ success: true, chat });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить контакт
app.post('/api/contacts', async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        let chat = await db.getChatByUsers(userId, contactId);
        if (!chat) {
            chat = await db.createChat([userId, contactId]);
        }
        const contact = await db.getUserById(contactId);
        res.json({ chat, contact });
    } catch (error) {
        console.error('Add contact error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить пользователя по номеру
app.get('/api/users/phone/:phone', async (req, res) => {
    try {
        const user = await db.getUser(req.params.phone);
        if (!user) return res.status(404).json({ error: 'Не найден' });
        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
            bio: user.bio,
            online: user.online === 1
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить пользователя по ID
app.get('/api/users/:userId', async (req, res) => {
    try {
        const user = await db.getUserById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'Не найден' });
        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            phone: user.phone,
            avatar: user.avatar,
            bio: user.bio,
            online: user.online === 1,
            last_seen: user.last_seen,
            created_at: user.created_at
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отметить прочитанные
app.post('/api/messages/read', async (req, res) => {
    try {
        const { chatId, userId } = req.body;
        await db.markAllChatMessagesAsRead(chatId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Редактировать сообщение
app.post('/api/messages/edit', async (req, res) => {
    try {
        const { messageId, text, userId } = req.body;
        const message = await db.getMessage(messageId);
        if (!message || message.sender_id !== userId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        const edited = await db.editMessage(messageId, text);
        res.json({ success: true, message: edited });
    } catch (error) {
        console.error('Edit error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удалить сообщение
app.post('/api/messages/delete', async (req, res) => {
    try {
        const { messageId, userId } = req.body;
        const message = await db.getMessage(messageId);
        if (!message || message.sender_id !== userId) {
            return res.status(403).json({ error: 'Нет прав' });
        }
        await db.deleteMessage(messageId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить реакцию
app.post('/api/messages/reaction', async (req, res) => {
    try {
        const { messageId, userId, reaction } = req.body;
        const reactions = await db.addReaction(messageId, userId, reaction);
        // Уведомляем всех в чате
        const message = await db.getMessage(messageId);
        if (message) {
            const participants = await db.getChatParticipants(message.chat_id);
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    io.to(socketId).emit('reactionUpdate', { messageId, reactions });
                }
            }
        }
        res.json({ success: true, reactions });
    } catch (error) {
        console.error('Reaction error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удалить реакцию
app.post('/api/messages/reaction/remove', async (req, res) => {
    try {
        const { messageId, userId } = req.body;
        const reactions = await db.removeReaction(messageId, userId);
        res.json({ success: true, reactions });
    } catch (error) {
        console.error('Remove reaction error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить черновик
app.get('/api/drafts/:chatId/:userId', async (req, res) => {
    try {
        const draft = await db.getDraft(req.params.chatId, req.params.userId);
        res.json({ draft: draft ? draft.text : null });
    } catch (error) {
        console.error('Get draft error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Сохранить черновик
app.post('/api/drafts', async (req, res) => {
    try {
        const { chatId, userId, text } = req.body;
        await db.saveDraft(chatId, userId, text);
        res.json({ success: true });
    } catch (error) {
        console.error('Save draft error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Закрепить сообщение
app.post('/api/messages/pin', async (req, res) => {
    try {
        const { chatId, messageId } = req.body;
        await db.pinMessage(chatId, messageId);
        res.json({ success: true });
    } catch (error) {
        console.error('Pin error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Открепить сообщение
app.post('/api/messages/unpin', async (req, res) => {
    try {
        const { chatId } = req.body;
        await db.unpinMessage(chatId);
        res.json({ success: true });
    } catch (error) {
        console.error('Unpin error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Поиск по сообщениям
app.get('/api/search/messages/:query/:userId', async (req, res) => {
    try {
        const messages = await db.searchMessages(req.params.query, req.params.userId);
        res.json(messages);
    } catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== WEBSOCKET =====

const onlineUsers = new Map();
const typingUsers = new Map();

io.on('connection', (socket) => {
    console.log('👤 Подключен:', socket.id);
    
    socket.on('userOnline', async (userId) => {
        onlineUsers.set(userId, socket.id);
        await db.setUserOnline(userId, true);
        io.emit('userStatus', { userId, online: true });
    });
    
    socket.on('typing', async (data) => {
        const { chatId, userId, isTyping } = data;
        const participants = await db.getChatParticipants(chatId);
        for (const p of participants) {
            if (p.user_id !== userId) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    io.to(socketId).emit('userTyping', { chatId, userId, isTyping });
                }
            }
        }
    });
    
    socket.on('sendMessage', async (data) => {
        try {
            console.log('📨 Отправка сообщения:', data);
            const { chatId, senderId, text, file, replyTo } = data;
            
            const message = {
                id: Date.now().toString(),
                chat_id: chatId,
                sender_id: senderId,
                text: text || '',
                file: file || null,
                reply_to: replyTo || null,
                created_at: new Date().toISOString()
            };
            
            await db.createMessage(message);
            
            const participants = await db.getChatParticipants(chatId);
            
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    if (p.user_id !== senderId) {
                        await db.markMessageAsDelivered(message.id);
                    }
                    io.to(socketId).emit('newMessage', { message, chatId, senderId });
                    const chats = await db.getChats(p.user_id);
                    io.to(socketId).emit('chatsUpdate', chats);
                }
            }
            
        } catch (error) {
            console.error('❌ Send message error:', error);
        }
    });
    
    socket.on('messageRead', async (data) => {
        try {
            const { messageId, userId } = data;
            await db.markMessageAsRead(messageId, userId);
            const message = await db.getMessage(messageId);
            if (message) {
                const senderSocket = onlineUsers.get(message.sender_id);
                if (senderSocket) {
                    io.to(senderSocket).emit('messageStatus', { messageId, status: 'read' });
                }
            }
        } catch (error) {
            console.error('Message read error:', error);
        }
    });
    
    socket.on('messageDeleted', async (data) => {
        try {
            const { messageId, chatId } = data;
            const message = await db.getMessage(messageId);
            if (message) {
                const participants = await db.getChatParticipants(chatId);
                for (const p of participants) {
                    const socketId = onlineUsers.get(p.user_id);
                    if (socketId) {
                        io.to(socketId).emit('messageDeleted', { messageId, chatId });
                    }
                }
            }
        } catch (error) {
            console.error('Message delete error:', error);
        }
    });
    
    socket.on('messageEdited', async (data) => {
        try {
            const { messageId, text, chatId } = data;
            const message = await db.editMessage(messageId, text);
            if (message) {
                const participants = await db.getChatParticipants(chatId);
                for (const p of participants) {
                    const socketId = onlineUsers.get(p.user_id);
                    if (socketId) {
                        io.to(socketId).emit('messageEdited', { messageId, text, chatId });
                    }
                }
            }
        } catch (error) {
            console.error('Message edit error:', error);
        }
    });
    
    socket.on('disconnect', async () => {
        let userId = null;
        for (const [id, socketId] of onlineUsers) {
            if (socketId === socket.id) {
                userId = id;
                onlineUsers.delete(id);
                break;
            }
        }
        if (userId) {
            await db.setUserOnline(userId, false);
            io.emit('userStatus', { userId, online: false });
        }
    });
});

// ===== ЗАПУСК =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
});
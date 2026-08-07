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
const voiceDir = path.join(publicDir, 'voices');
const storyDir = path.join(publicDir, 'stories');

[uploadDir, voiceDir, storyDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Создана папка: ${dir}`);
    }
});

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
app.use('/voices', express.static(voiceDir));
app.use('/stories', express.static(storyDir));

// ===== ЗАГРУЗКА ФАЙЛОВ =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dir = uploadDir;
        if (file.fieldname === 'voice') dir = voiceDir;
        if (file.fieldname === 'story') dir = storyDir;
        cb(null, dir);
    },
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

app.post('/api/upload-voice', upload.single('voice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Голосовое не загружено' });
        res.json({
            success: true,
            file: {
                url: '/voices/' + req.file.filename,
                duration: parseInt(req.body.duration) || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

app.post('/api/upload-story', upload.single('story'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'История не загружена' });
        const story = await db.createStory({
            id: Date.now().toString(),
            user_id: req.body.userId,
            file: '/stories/' + req.file.filename,
            text: req.body.text || '',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        res.json({ success: true, story });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// ===== API РОУТЫ =====

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
                verified: true,
                wallpaper: user.wallpaper,
                theme: user.theme
            }
        });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

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
                verified: true,
                wallpaper: user.wallpaper,
                theme: user.theme
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

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
                verified: user.verified === 1,
                wallpaper: user.wallpaper,
                theme: user.theme
            }
        });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/update-profile', async (req, res) => {
    try {
        const { userId, name, username, bio, avatar, wallpaper, theme } = req.body;
        
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
        if (wallpaper !== undefined) updateData.wallpaper = wallpaper;
        if (theme !== undefined) updateData.theme = theme;
        
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
                verified: updated.verified === 1,
                wallpaper: updated.wallpaper,
                theme: updated.theme
            }
        });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ОСНОВНЫЕ РОУТЫ =====

app.get('/api/chats/:userId', async (req, res) => {
    try {
        const chats = await db.getChats(req.params.userId);
        res.json(chats);
    } catch (error) {
        console.error('Chats error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/messages/:chatId', async (req, res) => {
    try {
        const messages = await db.getMessages(req.params.chatId);
        res.json(messages);
    } catch (error) {
        console.error('Messages error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/create-chat', async (req, res) => {
    try {
        const { name, type, createdBy, participants, description, avatar } = req.body;
        const allParticipants = [createdBy, ...(participants || [])];
        const chat = await db.createChat(allParticipants, name, type || 'group', createdBy, description, avatar || null);
        
        if (type === 'channel') {
            await db.subscribeToChannel(chat.id, createdBy);
        }
        
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
            created_at: user.created_at,
            wallpaper: user.wallpaper,
            theme: user.theme
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

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

// ===== НОВЫЕ РОУТЫ =====

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

app.get('/api/messages/reactions/:messageId', async (req, res) => {
    try {
        const reactions = await db.getReactions(req.params.messageId);
        res.json(reactions);
    } catch (error) {
        console.error('Get reactions error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/messages/reaction', async (req, res) => {
    try {
        const { messageId, userId, reaction } = req.body;
        const reactions = await db.addReaction(messageId, userId, reaction);
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

app.get('/api/stories/:userId', async (req, res) => {
    try {
        const stories = await db.getStoriesForUser(req.params.userId);
        res.json(stories);
    } catch (error) {
        console.error('Stories error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/stories/view', async (req, res) => {
    try {
        const { storyId, userId } = req.body;
        await db.viewStory(storyId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('View story error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/calls/:userId', async (req, res) => {
    try {
        const calls = await db.getCalls(req.params.userId);
        res.json(calls);
    } catch (error) {
        console.error('Calls error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/block', async (req, res) => {
    try {
        const { userId, blockId } = req.body;
        await db.addToBlacklist(userId, blockId);
        res.json({ success: true });
    } catch (error) {
        console.error('Block error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/unblock', async (req, res) => {
    try {
        const { userId, blockId } = req.body;
        await db.removeFromBlacklist(userId, blockId);
        res.json({ success: true });
    } catch (error) {
        console.error('Unblock error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/chat/settings', async (req, res) => {
    try {
        const { chatId, wallpaper, autoDelete } = req.body;
        if (wallpaper !== undefined) await db.setChatWallpaper(chatId, wallpaper);
        if (autoDelete !== undefined) await db.setAutoDelete(chatId, autoDelete);
        res.json({ success: true });
    } catch (error) {
        console.error('Chat settings error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/drafts/:chatId/:userId', async (req, res) => {
    try {
        const draft = await db.getDraft(req.params.chatId, req.params.userId);
        res.json({ draft: draft ? draft.text : null });
    } catch (error) {
        console.error('Get draft error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

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

// ===== НОВЫЕ РОУТЫ ДЛЯ ФУНКЦИЙ =====

app.post('/api/chat/leave', async (req, res) => {
    try {
        const { chatId, userId } = req.body;
        await db.removeParticipant(chatId, userId);
        
        const participants = await db.getChatParticipants(chatId);
        for (const p of participants) {
            const socketId = onlineUsers.get(p.user_id);
            if (socketId) {
                const chats = await db.getChats(p.user_id);
                io.to(socketId).emit('chatsUpdate', chats);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Leave chat error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/chat/wallpaper', async (req, res) => {
    try {
        const { chatId, wallpaper } = req.body;
        await db.setChatWallpaper(chatId, wallpaper);
        res.json({ success: true });
    } catch (error) {
        console.error('Wallpaper error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/chat/mute', async (req, res) => {
    try {
        const { chatId, userId, until } = req.body;
        await db.muteChat(chatId, userId, until);
        res.json({ success: true });
    } catch (error) {
        console.error('Mute error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/messages/delete-for-everyone', async (req, res) => {
    try {
        const { messageId } = req.body;
        await db.deleteMessageForEveryone(messageId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete for everyone error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/messages/delete-for-me', async (req, res) => {
    try {
        const { messageId, userId } = req.body;
        await db.deleteMessageForMe(messageId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete for me error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ЗВОНКИ (WebRTC сигнализация) =====
const calls = new Map();

app.post('/api/call/offer', async (req, res) => {
    try {
        const { callId, userId } = req.body;
        calls.set(callId, { userId, offer: null, answer: null });
        res.json({ success: true });
    } catch (error) {
        console.error('Call offer error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/call/answer', async (req, res) => {
    try {
        const { callId, answer } = req.body;
        const call = calls.get(callId);
        if (call) {
            call.answer = answer;
            calls.set(callId, call);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Call answer error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/call/end', async (req, res) => {
    try {
        const { callId } = req.body;
        calls.delete(callId);
        res.json({ success: true });
    } catch (error) {
        console.error('Call end error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== WEBSOCKET =====

const onlineUsers = new Map();

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
                }
            }
            
            const uniqueUsers = [...new Set(participants.map(p => p.user_id))];
            for (const userId of uniqueUsers) {
                const socketId = onlineUsers.get(userId);
                if (socketId) {
                    const chats = await db.getChats(userId);
                    io.to(socketId).emit('chatsUpdate', chats);
                }
            }
            
        } catch (error) {
            console.error('❌ Send message error:', error);
        }
    });
    
    socket.on('sendVoice', async (data) => {
        try {
            const { chatId, senderId, file, duration } = data;
            const message = {
                id: Date.now().toString(),
                chat_id: chatId,
                sender_id: senderId,
                text: '',
                file: file,
                voice_duration: duration,
                created_at: new Date().toISOString()
            };
            await db.createVoiceMessage(message);
            
            const participants = await db.getChatParticipants(chatId);
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    io.to(socketId).emit('newMessage', { message, chatId, senderId });
                }
            }
        } catch (error) {
            console.error('Send voice error:', error);
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
            await db.editMessage(messageId, text);
            const participants = await db.getChatParticipants(chatId);
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    io.to(socketId).emit('messageEdited', { messageId, text, chatId });
                }
            }
        } catch (error) {
            console.error('Message edit error:', error);
        }
    });
    
    // ===== ЗВОНКИ (WebRTC) =====
    socket.on('callOffer', (data) => {
        const { callId, to, from, offer, type } = data;
        const toSocket = onlineUsers.get(to);
        if (toSocket) {
            db.getUserById(from).then(user => {
                io.to(toSocket).emit('incomingCall', {
                    callId,
                    from,
                    fromName: user ? user.name : 'Пользователь',
                    offer,
                    type
                });
            });
        }
    });

    socket.on('callAnswer', (data) => {
        const { callId, answer } = data;
        io.emit('callAnswer', { callId, answer });
    });

    socket.on('callEnd', (data) => {
        const { callId } = data;
        io.emit('callEnd', { callId });
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
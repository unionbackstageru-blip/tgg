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

// ===== СОЗДАЁМ ПАПКИ =====
const publicDir = path.join(__dirname, '..', 'public');
const uploadDir = path.join(publicDir, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Создана папка uploads');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 50 * 1024 * 1024
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(publicDir));

console.log('✅ Middleware настроены');

// ===== ЗАГРУЗКА ФАЙЛОВ =====
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const file = {
            name: req.file.originalname,
            url: '/uploads/' + req.file.filename,
            size: req.file.size,
            type: req.file.mimetype
        };
        
        res.json({ success: true, file });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла: ' + error.message });
    }
});

// ===== API РОУТЫ =====

// РЕГИСТРАЦИЯ
app.post('/api/register', async (req, res) => {
    try {
        console.log('📝 Регистрация:', req.body);
        const { name, phone, password } = req.body;
        
        if (!name || !phone || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const existing = await db.getUser(phone);
        if (existing) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const username = name.toLowerCase().replace(/\s/g, '') + Date.now().toString().slice(-4);
        
        const user = {
            id: Date.now().toString(),
            name,
            username,
            phone,
            password: hashedPassword,
            avatar: null,
            bio: null
        };
        
        await db.createUser(user);
        console.log('✅ Пользователь создан:', user.id);
        
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
        console.log(`📱 КОД для ${phone}: ${code}`);
        
        res.json({ 
            success: true, 
            message: 'Код подтверждения отправлен',
            phone: phone 
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// ПОДТВЕРЖДЕНИЕ
app.post('/api/verify', async (req, res) => {
    try {
        console.log('🔑 Подтверждение:', req.body);
        const { phone, code } = req.body;
        
        const verification = await db.getVerification(phone);
        if (!verification) {
            return res.status(400).json({ error: 'Код не найден' });
        }
        
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
        console.log(`✅ Пользователь ${user.name} подтвержден`);
        
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
        console.error('❌ Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ВХОД
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔐 Вход:', req.body);
        const { phone, password } = req.body;
        
        if (!phone || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        const user = await db.getUser(phone);
        if (!user) {
            console.log('❌ Пользователь не найден:', phone);
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        if (!user.verified) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
            console.log(`📱 КОД для ${phone}: ${code}`);
            return res.json({ 
                needVerification: true,
                phone: phone
            });
        }
        
        await db.setUserOnline(user.id, true);
        console.log(`✅ Пользователь ${user.name} вошел`);
        
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
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// ===== ОБНОВЛЕНИЕ ПРОФИЛЯ =====
app.post('/api/update-profile', async (req, res) => {
    try {
        const { userId, name, username, bio, avatar } = req.body;
        console.log('📝 Обновление профиля:', { userId, name, username, bio });
        
        // Проверяем, существует ли пользователь
        const user = await db.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Проверяем, свободен ли username
        if (username) {
            const existing = await db.getUserByUsername(username);
            if (existing && existing.id !== userId) {
                return res.status(400).json({ error: 'Этот username уже занят' });
            }
        }
        
        // Собираем данные для обновления
        const updateData = {};
        if (name) updateData.name = name;
        if (username) updateData.username = username;
        if (bio !== undefined) updateData.bio = bio;
        if (avatar !== undefined && avatar !== user.avatar) updateData.avatar = avatar;
        
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }
        
        console.log('📝 Обновляем поля:', Object.keys(updateData));
        await db.updateUser(userId, updateData);
        
        // Получаем обновлённого пользователя
        const updatedUser = await db.getUserById(userId);
        console.log('✅ Профиль обновлён для:', updatedUser.name);
        
        res.json({
            success: true,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                username: updatedUser.username,
                phone: updatedUser.phone,
                avatar: updatedUser.avatar,
                bio: updatedUser.bio,
                verified: updatedUser.verified === 1
            }
        });
    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// ===== ВОССТАНОВЛЕНИЕ СЕССИИ =====
app.post('/api/restore-session', async (req, res) => {
    try {
        const { userId } = req.body;
        console.log('🔄 Восстановление сессии:', userId);
        
        if (!userId) {
            return res.status(400).json({ error: 'ID пользователя не указан' });
        }
        
        const user = await db.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        await db.setUserOnline(user.id, true);
        console.log(`✅ Сессия восстановлена для ${user.name}`);
        
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
        console.error('❌ Restore session error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ПОИСК =====
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const users = await db.searchUsers(query);
        const filteredUsers = users.filter(u => u.id !== req.query.userId);
        res.json(filteredUsers.map(u => ({
            id: u.id,
            name: u.name,
            username: u.username,
            phone: u.phone,
            avatar: u.avatar,
            online: u.online === 1
        })));
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== КАНАЛЫ И ГРУППЫ =====
app.post('/api/create-chat', async (req, res) => {
    try {
        const { name, type, createdBy, participants, description, avatar } = req.body;
        console.log('📝 Создание чата:', { name, type, createdBy });
        
        let allParticipants = [createdBy];
        if (participants) {
            allParticipants = [...allParticipants, ...participants];
        }
        
        const chat = await db.createChat(
            allParticipants,
            name,
            type || 'group',
            createdBy,
            description || null,
            avatar || null
        );
        
        if (type === 'channel') {
            await db.subscribeToChannel(chat.id, createdBy);
        }
        
        // Уведомляем всех участников
        for (const userId of allParticipants) {
            const socketId = onlineUsers.get(userId);
            if (socketId) {
                const chats = await db.getChats(userId);
                io.to(socketId).emit('chatsUpdate', chats);
            }
        }
        
        res.json({ success: true, chat });
    } catch (error) {
        console.error('❌ Create chat error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

app.post('/api/subscribe', async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        await db.subscribeToChannel(channelId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Subscribe error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/unsubscribe', async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        await db.unsubscribeFromChannel(channelId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Unsubscribe error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===== ОСТАЛЬНЫЕ РОУТЫ =====

app.get('/api/chats/:userId', async (req, res) => {
    try {
        const chats = await db.getChats(req.params.userId);
        res.json(chats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/messages/:chatId', async (req, res) => {
    try {
        const messages = await db.getMessages(req.params.chatId);
        res.json(messages);
    } catch (error) {
        console.error('Get messages error:', error);
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

app.get('/api/users/phone/:phone', async (req, res) => {
    try {
        const user = await db.getUser(req.params.phone);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            phone: user.phone,
            avatar: user.avatar,
            online: user.online === 1,
            verified: user.verified === 1
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

// ===== WEBSOCKET =====

const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('👤 Новое подключение:', socket.id);
    
    socket.on('userOnline', async (userId) => {
        onlineUsers.set(userId, socket.id);
        await db.setUserOnline(userId, true);
        io.emit('userStatus', { userId, online: true });
        console.log(`🟢 ${userId} онлайн`);
    });
    
    socket.on('sendMessage', async (data) => {
        try {
            const { chatId, senderId, text, file } = data;
            
            const message = {
                id: Date.now().toString(),
                chat_id: chatId,
                sender_id: senderId,
                text: text || '',
                file: file || null,
                created_at: new Date().toISOString()
            };
            
            await db.createMessage(message);
            
            const participants = await db.getChatParticipants(chatId);
            
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    io.to(socketId).emit('newMessage', {
                        message,
                        chatId,
                        senderId
                    });
                }
            }
            
            for (const p of participants) {
                const socketId = onlineUsers.get(p.user_id);
                if (socketId) {
                    const chats = await db.getChats(p.user_id);
                    io.to(socketId).emit('chatsUpdate', chats);
                }
            }
        } catch (error) {
            console.error('Send message error:', error);
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
            console.log(`🔴 ${userId} офлайн`);
        }
    });
});

// ===== ЗАПУСК =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер успешно запущен на порту ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});
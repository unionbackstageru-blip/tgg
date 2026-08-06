const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('./database');

console.log('🚀 Запуск сервера...');

// ===== ПРОВЕРЯЕМ ПАПКИ =====
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
    }
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

console.log('✅ Middleware настроены');

// ===== API РОУТЫ =====

// Регистрация
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
        const user = {
            id: Date.now().toString(),
            name,
            phone,
            password: hashedPassword,
            avatar: name.charAt(0).toUpperCase()
        };
        
        await db.createUser(user);
        console.log('✅ Пользователь создан:', user.id);
        
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
        console.log(`📱 Код для ${phone}: ${code}`);
        
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

// Подтверждение
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
                phone: user.phone,
                avatar: user.avatar,
                verified: true
            }
        });
    } catch (error) {
        console.error('❌ Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔐 Вход:', req.body);
        const { phone, password } = req.body;
        
        const user = await db.getUser(phone);
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        if (!user.verified) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            await db.saveVerification(phone, code, Date.now() + 5 * 60 * 1000);
            console.log(`📱 Код для ${phone}: ${code}`);
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
                phone: user.phone,
                avatar: user.avatar,
                verified: true
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
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

app.post('/api/chats', async (req, res) => {
    try {
        const { participants, name } = req.body;
        const chat = await db.createChat(participants, name);
        res.json(chat);
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

app.get('/api/users/phone/:phone', async (req, res) => {
    try {
        const user = await db.getUser(req.params.phone);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({
            id: user.id,
            name: user.name,
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
            
            for (const userId of participants) {
                const socketId = onlineUsers.get(userId);
                if (socketId) {
                    io.to(socketId).emit('newMessage', {
                        message,
                        chatId,
                        senderId
                    });
                }
            }
            
            for (const userId of participants) {
                const socketId = onlineUsers.get(userId);
                if (socketId) {
                    const chats = await db.getChats(userId);
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
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
});

// ===== ОБРАБОТКА ОШИБОК =====
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});
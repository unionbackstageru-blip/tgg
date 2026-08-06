const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('📦 Инициализация базы данных...');

// ===== СОЗДАЁМ ПАПКУ ДЛЯ ДАННЫХ =====
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Создана папка data');
}

const dbPath = path.join(dataDir, 'database.sqlite');
console.log('📄 Путь к БД:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка открытия БД:', err.message);
        process.exit(1);
    }
    console.log('✅ База данных открыта');
});

// ===== СОЗДАЁМ ТАБЛИЦЫ =====
db.serialize(() => {
    // Пользователи
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT,
            verified INTEGER DEFAULT 0,
            online INTEGER DEFAULT 0,
            created_at TEXT
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка users:', err.message);
        else console.log('✅ Таблица users');
    });

    // Верификация
    db.run(`
        CREATE TABLE IF NOT EXISTS verifications (
            phone TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires INTEGER NOT NULL
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка verifications:', err.message);
        else console.log('✅ Таблица verifications');
    });

    // Чаты
    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT DEFAULT 'private',
            created_at TEXT,
            last_message TEXT,
            last_message_time TEXT
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка chats:', err.message);
        else console.log('✅ Таблица chats');
    });

    // Участники
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_participants (
            chat_id TEXT,
            user_id TEXT,
            PRIMARY KEY (chat_id, user_id)
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка chat_participants:', err.message);
        else console.log('✅ Таблица chat_participants');
    });

    // Сообщения
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            text TEXT,
            file TEXT,
            read INTEGER DEFAULT 0,
            created_at TEXT
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка messages:', err.message);
        else console.log('✅ Таблица messages');
    });

    // Непрочитанные
    db.run(`
        CREATE TABLE IF NOT EXISTS unread_messages (
            message_id TEXT,
            user_id TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `, (err) => {
        if (err) console.error('❌ Ошибка unread_messages:', err.message);
        else console.log('✅ Таблица unread_messages');
    });

    console.log('✅ Все таблицы созданы');
});

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С БД =====

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('❌ runQuery ошибка:', err.message);
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('❌ getQuery ошибка:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('❌ allQuery ошибка:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// ===== КЛАСС ДЛЯ РАБОТЫ С БД =====

class Database {
    // ---------- ПОЛЬЗОВАТЕЛИ ----------
    async getUser(phone) {
        return getQuery('SELECT * FROM users WHERE phone = ?', [phone]);
    }

    async getUserById(id) {
        return getQuery('SELECT * FROM users WHERE id = ?', [id]);
    }

    async createUser(user) {
        await runQuery(
            `INSERT INTO users (id, name, phone, password, avatar, verified, online, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.name, user.phone, user.password, user.avatar, 0, 0, new Date().toISOString()]
        );
        return user;
    }

    async verifyUser(phone) {
        await runQuery('UPDATE users SET verified = 1 WHERE phone = ?', [phone]);
    }

    async setUserOnline(userId, online) {
        await runQuery('UPDATE users SET online = ? WHERE id = ?', [online ? 1 : 0, userId]);
    }

    // ---------- ВЕРИФИКАЦИЯ ----------
    async saveVerification(phone, code, expires) {
        await runQuery(
            `INSERT OR REPLACE INTO verifications (phone, code, expires) VALUES (?, ?, ?)`,
            [phone, code, expires]
        );
    }

    async getVerification(phone) {
        return getQuery('SELECT * FROM verifications WHERE phone = ?', [phone]);
    }

    async deleteVerification(phone) {
        await runQuery('DELETE FROM verifications WHERE phone = ?', [phone]);
    }

    // ---------- ЧАТЫ ----------
    async getChats(userId) {
        const chats = await allQuery(
            `SELECT c.* FROM chats c 
             JOIN chat_participants cp ON c.id = cp.chat_id 
             WHERE cp.user_id = ? 
             ORDER BY c.last_message_time DESC`,
            [userId]
        );
        
        for (const chat of chats) {
            chat.participants = await this.getChatParticipants(chat.id);
            chat.unread = await this.getUnreadCount(chat.id, userId);
        }
        return chats;
    }

    async getChat(chatId) {
        const chat = await getQuery('SELECT * FROM chats WHERE id = ?', [chatId]);
        if (chat) {
            chat.participants = await this.getChatParticipants(chatId);
        }
        return chat;
    }

    async getChatByUsers(user1, user2) {
        const chats = await allQuery(
            `SELECT c.id FROM chats c 
             JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
             JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
             WHERE c.type = 'private'`,
            [user1, user2]
        );
        if (chats.length > 0) {
            return this.getChat(chats[0].id);
        }
        return null;
    }

    async createChat(participants, name = null, type = 'private') {
        const chatId = Date.now().toString();
        await runQuery(
            `INSERT INTO chats (id, name, type, created_at, last_message, last_message_time) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [chatId, name, type, new Date().toISOString(), null, null]
        );
        
        for (const userId of participants) {
            await runQuery(
                `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
                [chatId, userId]
            );
        }
        
        return this.getChat(chatId);
    }

    async getChatParticipants(chatId) {
        const rows = await allQuery(
            `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
            [chatId]
        );
        return rows.map(row => row.user_id);
    }

    async updateChatLastMessage(chatId, message) {
        await runQuery(
            `UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?`,
            [message.text || '[Файл]', message.created_at, chatId]
        );
    }

    // ---------- СООБЩЕНИЯ ----------
    async getMessages(chatId, limit = 100) {
        return allQuery(
            `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?`,
            [chatId, limit]
        );
    }

    async createMessage(message) {
        await runQuery(
            `INSERT INTO messages (id, chat_id, sender_id, text, file, read, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [message.id, message.chat_id, message.sender_id, message.text, 
             message.file ? JSON.stringify(message.file) : null, 0, message.created_at]
        );
        
        const participants = await this.getChatParticipants(message.chat_id);
        for (const userId of participants) {
            if (userId !== message.sender_id) {
                await runQuery(
                    `INSERT INTO unread_messages (message_id, user_id) VALUES (?, ?)`,
                    [message.id, userId]
                );
            }
        }
        
        await this.updateChatLastMessage(message.chat_id, message);
        return message;
    }

    async markAllChatMessagesAsRead(chatId, userId) {
        await runQuery(
            `DELETE FROM unread_messages WHERE message_id IN 
             (SELECT id FROM messages WHERE chat_id = ?) AND user_id = ?`,
            [chatId, userId]
        );
    }

    async getUnreadCount(chatId, userId) {
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM unread_messages um 
             JOIN messages m ON um.message_id = m.id 
             WHERE m.chat_id = ? AND um.user_id = ?`,
            [chatId, userId]
        );
        return result ? result.count : 0;
    }
}

module.exports = new Database();
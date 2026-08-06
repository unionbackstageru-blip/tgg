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

// ===== МИГРАЦИЯ: ДОБАВЛЯЕМ НЕДОСТАЮЩИЕ КОЛОНКИ =====
db.serialize(() => {
    // Проверяем и добавляем колонку username
    db.run(`ALTER TABLE users ADD COLUMN username TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('⚠️ username уже существует или ошибка:', err.message);
        } else if (!err) {
            console.log('✅ Добавлена колонка username');
        }
    });

    // Проверяем и добавляем колонку bio
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('⚠️ bio уже существует или ошибка:', err.message);
        } else if (!err) {
            console.log('✅ Добавлена колонка bio');
        }
    });

    // Проверяем и добавляем колонку avatar
    db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('⚠️ avatar уже существует или ошибка:', err.message);
        } else if (!err) {
            console.log('✅ Добавлена колонка avatar');
        }
    });
});

// ===== СОЗДАЁМ ТАБЛИЦЫ =====
db.serialize(() => {
    // Пользователи (с полной структурой)
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            username TEXT UNIQUE,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT,
            bio TEXT,
            verified INTEGER DEFAULT 0,
            online INTEGER DEFAULT 0,
            created_at TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS verifications (
            phone TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires INTEGER NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            name TEXT,
            type TEXT DEFAULT 'private',
            avatar TEXT,
            description TEXT,
            created_by TEXT,
            created_at TEXT,
            last_message TEXT,
            last_message_time TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_participants (
            chat_id TEXT,
            user_id TEXT,
            role TEXT DEFAULT 'member',
            joined_at TEXT,
            PRIMARY KEY (chat_id, user_id)
        )
    `);

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
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS unread_messages (
            message_id TEXT,
            user_id TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS channel_subscribers (
            channel_id TEXT,
            user_id TEXT,
            subscribed_at TEXT,
            PRIMARY KEY (channel_id, user_id)
        )
    `);

    console.log('✅ Все таблицы созданы');
});

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

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
        try {
            return await getQuery('SELECT * FROM users WHERE phone = ?', [phone]);
        } catch (error) {
            console.error('getUser error:', error);
            return null;
        }
    }

    async getUserById(id) {
        try {
            return await getQuery('SELECT * FROM users WHERE id = ?', [id]);
        } catch (error) {
            console.error('getUserById error:', error);
            return null;
        }
    }

    async getUserByUsername(username) {
        try {
            return await getQuery('SELECT * FROM users WHERE username = ?', [username]);
        } catch (error) {
            console.error('getUserByUsername error:', error);
            return null;
        }
    }

    async searchUsers(query) {
        try {
            return await allQuery(
                `SELECT * FROM users WHERE 
                 name LIKE ? OR phone LIKE ? OR username LIKE ? 
                 ORDER BY name ASC LIMIT 20`,
                [`%${query}%`, `%${query}%`, `%${query}%`]
            );
        } catch (error) {
            console.error('searchUsers error:', error);
            return [];
        }
    }

    async createUser(user) {
        await runQuery(
            `INSERT INTO users (id, name, username, phone, password, avatar, bio, verified, online, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.name, user.username || null, user.phone, user.password, 
             user.avatar || null, user.bio || null, 0, 0, new Date().toISOString()]
        );
        return user;
    }

    async updateUser(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        values.push(id);
        await runQuery(
            `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        console.log('✅ Обновлены поля:', fields.join(', '));
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
            if (chat.type === 'channel') {
                chat.subscribers = await this.getChannelSubscribers(chat.id);
            }
        }
        return chats;
    }

    async getChat(chatId) {
        const chat = await getQuery('SELECT * FROM chats WHERE id = ?', [chatId]);
        if (chat) {
            chat.participants = await this.getChatParticipants(chatId);
            if (chat.type === 'channel') {
                chat.subscribers = await this.getChannelSubscribers(chatId);
            }
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

    async createChat(participants, name = null, type = 'private', createdBy = null, description = null, avatar = null) {
        const chatId = Date.now().toString();
        await runQuery(
            `INSERT INTO chats (id, name, type, avatar, description, created_by, created_at, last_message, last_message_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [chatId, name, type, avatar || null, description || null, createdBy, new Date().toISOString(), null, null]
        );
        
        for (const userId of participants) {
            const role = userId === createdBy ? 'admin' : (type === 'channel' ? 'subscriber' : 'member');
            await runQuery(
                `INSERT INTO chat_participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
                [chatId, userId, role, new Date().toISOString()]
            );
        }
        
        return this.getChat(chatId);
    }

    async getChatParticipants(chatId) {
        const rows = await allQuery(
            `SELECT user_id, role FROM chat_participants WHERE chat_id = ?`,
            [chatId]
        );
        return rows;
    }

    async addParticipant(chatId, userId, role = 'member') {
        await runQuery(
            `INSERT OR REPLACE INTO chat_participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
            [chatId, userId, role, new Date().toISOString()]
        );
    }

    async removeParticipant(chatId, userId) {
        await runQuery(
            `DELETE FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
            [chatId, userId]
        );
    }

    // ---------- КАНАЛЫ ----------
    async getChannelSubscribers(channelId) {
        const rows = await allQuery(
            `SELECT user_id FROM channel_subscribers WHERE channel_id = ?`,
            [channelId]
        );
        return rows.map(row => row.user_id);
    }

    async subscribeToChannel(channelId, userId) {
        await runQuery(
            `INSERT OR REPLACE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?, ?, ?)`,
            [channelId, userId, new Date().toISOString()]
        );
        await this.addParticipant(channelId, userId, 'subscriber');
    }

    async unsubscribeFromChannel(channelId, userId) {
        await runQuery(
            `DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?`,
            [channelId, userId]
        );
        await this.removeParticipant(channelId, userId);
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
        for (const p of participants) {
            if (p.user_id !== message.sender_id) {
                await runQuery(
                    `INSERT INTO unread_messages (message_id, user_id) VALUES (?, ?)`,
                    [message.id, p.user_id]
                );
            }
        }
        
        await this.updateChatLastMessage(message.chat_id, message);
        return message;
    }

    async updateChatLastMessage(chatId, message) {
        await runQuery(
            `UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?`,
            [message.text || '[Файл]', message.created_at, chatId]
        );
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
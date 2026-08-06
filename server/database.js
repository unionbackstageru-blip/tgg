const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Создаём папку для данных
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Инициализация таблиц
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
    `);

    // Коды подтверждения
    db.run(`
        CREATE TABLE IF NOT EXISTS verifications (
            phone TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires INTEGER NOT NULL
        )
    `);

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
    `);

    // Участники чатов
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_participants (
            chat_id TEXT,
            user_id TEXT,
            PRIMARY KEY (chat_id, user_id),
            FOREIGN KEY (chat_id) REFERENCES chats(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Сообщения
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            text TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY (chat_id) REFERENCES chats(id),
            FOREIGN KEY (sender_id) REFERENCES users(id)
        )
    `);

    // Непрочитанные сообщения
    db.run(`
        CREATE TABLE IF NOT EXISTS unread_messages (
            message_id TEXT,
            user_id TEXT,
            PRIMARY KEY (message_id, user_id),
            FOREIGN KEY (message_id) REFERENCES messages(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    console.log('✅ База данных инициализирована');
});

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С БД (ПРОМИСЫ) =====

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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

    async getUsers() {
        return allQuery('SELECT * FROM users');
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
        
        // Добавляем информацию об участниках
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
            [message.text, message.created_at, chatId]
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
            `INSERT INTO messages (id, chat_id, sender_id, text, read, created_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [message.id, message.chat_id, message.sender_id, message.text, 0, message.created_at]
        );
        
        // Добавляем непрочитанные для всех участников кроме отправителя
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

    async markAsRead(messageId, userId) {
        await runQuery(
            `DELETE FROM unread_messages WHERE message_id = ? AND user_id = ?`,
            [messageId, userId]
        );
        // Проверяем, все ли прочитали
        const unreadCount = await getQuery(
            `SELECT COUNT(*) as count FROM unread_messages WHERE message_id = ?`,
            [messageId]
        );
        if (unreadCount.count === 0) {
            await runQuery(`UPDATE messages SET read = 1 WHERE id = ?`, [messageId]);
        }
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

    async markAllChatMessagesAsRead(chatId, userId) {
        // Получаем все непрочитанные сообщения в чате для пользователя
        const unread = await allQuery(
            `SELECT um.message_id FROM unread_messages um 
             JOIN messages m ON um.message_id = m.id 
             WHERE m.chat_id = ? AND um.user_id = ?`,
            [chatId, userId]
        );
        
        for (const item of unread) {
            await this.markAsRead(item.message_id, userId);
        }
    }
}

module.exports = new Database();
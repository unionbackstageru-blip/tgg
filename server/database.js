const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('📦 Инициализация базы данных...');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Создана папка data');
}

const dbPath = path.join(dataDir, 'database.sqlite');
console.log('📄 Путь к БД:', dbPath);

const db = new sqlite3.Database(dbPath);

// ===== СОЗДАЁМ ВСЕ ТАБЛИЦЫ =====
db.serialize(() => {
    // Пользователи
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
            last_seen TEXT,
            created_at TEXT
        )
    `);

    // Коды верификации
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
            avatar TEXT,
            description TEXT,
            created_by TEXT,
            created_at TEXT,
            last_message TEXT,
            last_message_time TEXT,
            pinned_message_id TEXT
        )
    `);

    // Участники чатов
    db.run(`
        CREATE TABLE IF NOT EXISTS chat_participants (
            chat_id TEXT,
            user_id TEXT,
            role TEXT DEFAULT 'member',
            joined_at TEXT,
            muted_until TEXT,
            PRIMARY KEY (chat_id, user_id)
        )
    `);

    // Сообщения (расширенные)
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            text TEXT,
            file TEXT,
            reply_to TEXT,
            forwarded_from TEXT,
            status TEXT DEFAULT 'sent',
            read INTEGER DEFAULT 0,
            read_at TEXT,
            edited_at TEXT,
            deleted INTEGER DEFAULT 0,
            auto_delete_at TEXT,
            created_at TEXT
        )
    `);

    // Реакции на сообщения
    db.run(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            message_id TEXT,
            user_id TEXT,
            reaction TEXT,
            created_at TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `);

    // Непрочитанные сообщения
    db.run(`
        CREATE TABLE IF NOT EXISTS unread_messages (
            message_id TEXT,
            user_id TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `);

    // Черновики
    db.run(`
        CREATE TABLE IF NOT EXISTS drafts (
            chat_id TEXT,
            user_id TEXT,
            text TEXT,
            updated_at TEXT,
            PRIMARY KEY (chat_id, user_id)
        )
    `);

    // Подписчики каналов
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

// ===== ФУНКЦИИ =====

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

// ===== КЛАСС =====

class Database {
    // ---------- ПОЛЬЗОВАТЕЛИ ----------
    async getUser(phone) {
        return getQuery('SELECT * FROM users WHERE phone = ?', [phone]);
    }

    async getUserById(id) {
        return getQuery('SELECT * FROM users WHERE id = ?', [id]);
    }

    async getUserByUsername(username) {
        return getQuery('SELECT * FROM users WHERE username = ?', [username]);
    }

    async searchUsers(query) {
        return allQuery(
            `SELECT * FROM users WHERE 
             name LIKE ? OR phone LIKE ? OR username LIKE ? 
             ORDER BY name ASC LIMIT 20`,
            [`%${query}%`, `%${query}%`, `%${query}%`]
        );
    }

    async createUser(user) {
        await runQuery(
            `INSERT INTO users (id, name, username, phone, password, avatar, bio, verified, online, last_seen, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.name, user.username, user.phone, user.password, 
             user.avatar || null, user.bio || null, 0, 0, null, new Date().toISOString()]
        );
        return user;
    }

    async updateUser(id, data) {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0) return;
        values.push(id);
        await runQuery(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    async verifyUser(phone) {
        await runQuery('UPDATE users SET verified = 1 WHERE phone = ?', [phone]);
    }

    async setUserOnline(userId, online) {
        const lastSeen = online ? null : new Date().toISOString();
        await runQuery('UPDATE users SET online = ?, last_seen = ? WHERE id = ?', [online ? 1 : 0, lastSeen, userId]);
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
             WHERE cp.user_id = ? AND c.id NOT IN (
                 SELECT chat_id FROM chat_participants WHERE user_id = ? AND muted_until > datetime('now')
             )
             ORDER BY c.last_message_time DESC`,
            [userId, userId]
        );
        
        for (const chat of chats) {
            const participants = await this.getChatParticipants(chat.id);
            chat.participants = participants;
            chat.unread = await this.getUnreadCount(chat.id, userId);
            
            if (chat.type === 'private') {
                const otherUser = participants.find(p => p.user_id !== userId);
                if (otherUser) {
                    const user = await this.getUserById(otherUser.user_id);
                    chat.displayName = user ? user.name : 'Неизвестный';
                    chat.avatar = user ? user.avatar : null;
                    chat.userId = user ? user.id : null;
                    chat.isOnline = user ? user.online === 1 : false;
                }
            } else {
                chat.displayName = chat.name || 'Чат';
                chat.avatar = chat.avatar || null;
            }
        }
        return chats;
    }

    async getChat(chatId) {
        return getQuery('SELECT * FROM chats WHERE id = ?', [chatId]);
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

    async createChat(participants, name = null, type = 'private', createdBy = null, description = null) {
        const chatId = Date.now().toString();
        await runQuery(
            `INSERT INTO chats (id, name, type, description, created_by, created_at, last_message, last_message_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [chatId, name, type, description || null, createdBy, new Date().toISOString(), null, null]
        );
        
        for (const userId of participants) {
            const role = userId === createdBy ? 'admin' : 'member';
            await runQuery(
                `INSERT INTO chat_participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
                [chatId, userId, role, new Date().toISOString()]
            );
        }
        
        return this.getChat(chatId);
    }

    async getChatParticipants(chatId) {
        const rows = await allQuery(
            `SELECT user_id, role, muted_until FROM chat_participants WHERE chat_id = ?`,
            [chatId]
        );
        return rows;
    }

    async addParticipant(chatId, userId) {
        await runQuery(
            `INSERT OR REPLACE INTO chat_participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
            [chatId, userId, 'member', new Date().toISOString()]
        );
    }

    // ---------- СООБЩЕНИЯ ----------
    async getMessages(chatId, limit = 50) {
        return allQuery(
            `SELECT * FROM messages WHERE chat_id = ? AND deleted = 0 ORDER BY created_at ASC LIMIT ?`,
            [chatId, limit]
        );
    }

    async createMessage(message) {
        await runQuery(
            `INSERT INTO messages (id, chat_id, sender_id, text, file, reply_to, forwarded_from, status, read, read_at, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [message.id, message.chat_id, message.sender_id, message.text, 
             message.file ? JSON.stringify(message.file) : null, 
             message.reply_to || null, message.forwarded_from || null,
             'sent', 0, null, message.created_at]
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
        
        await runQuery(
            `UPDATE chats SET last_message = ?, last_message_time = ? WHERE id = ?`,
            [message.text || '[Файл]', message.created_at, message.chat_id]
        );
        
        return message;
    }

    async editMessage(messageId, text) {
        await runQuery(
            `UPDATE messages SET text = ?, edited_at = ? WHERE id = ?`,
            [text, new Date().toISOString(), messageId]
        );
        return this.getMessage(messageId);
    }

    async deleteMessage(messageId, userId) {
        await runQuery(
            `UPDATE messages SET deleted = 1 WHERE id = ? AND sender_id = ?`,
            [messageId, userId]
        );
    }

    async getMessage(messageId) {
        return getQuery('SELECT * FROM messages WHERE id = ? AND deleted = 0', [messageId]);
    }

    async markMessageAsDelivered(messageId) {
        await runQuery(
            `UPDATE messages SET status = 'delivered' WHERE id = ? AND status = 'sent'`,
            [messageId]
        );
    }

    async markMessageAsRead(messageId, userId) {
        await runQuery(
            `UPDATE messages SET status = 'read', read = 1, read_at = ? WHERE id = ?`,
            [new Date().toISOString(), messageId]
        );
        await runQuery(
            `DELETE FROM unread_messages WHERE message_id = ? AND user_id = ?`,
            [messageId, userId]
        );
    }

    async markAllChatMessagesAsRead(chatId, userId) {
        const messages = await allQuery(
            `SELECT id FROM messages WHERE chat_id = ? AND sender_id != ? AND read = 0`,
            [chatId, userId]
        );
        for (const msg of messages) {
            await this.markMessageAsRead(msg.id, userId);
        }
    }

    async getUnreadCount(chatId, userId) {
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM unread_messages um 
             JOIN messages m ON um.message_id = m.id 
             WHERE m.chat_id = ? AND um.user_id = ? AND m.deleted = 0`,
            [chatId, userId]
        );
        return result ? result.count : 0;
    }

    // ---------- РЕАКЦИИ ----------
    async addReaction(messageId, userId, reaction) {
        await runQuery(
            `INSERT OR REPLACE INTO message_reactions (message_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)`,
            [messageId, userId, reaction, new Date().toISOString()]
        );
        return this.getReactions(messageId);
    }

    async removeReaction(messageId, userId) {
        await runQuery(
            `DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?`,
            [messageId, userId]
        );
        return this.getReactions(messageId);
    }

    async getReactions(messageId) {
        return allQuery(
            `SELECT user_id, reaction FROM message_reactions WHERE message_id = ?`,
            [messageId]
        );
    }

    // ---------- ЧЕРНОВИКИ ----------
    async saveDraft(chatId, userId, text) {
        await runQuery(
            `INSERT OR REPLACE INTO drafts (chat_id, user_id, text, updated_at) VALUES (?, ?, ?, ?)`,
            [chatId, userId, text, new Date().toISOString()]
        );
    }

    async getDraft(chatId, userId) {
        return getQuery('SELECT text FROM drafts WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
    }

    // ---------- КАНАЛЫ ----------
    async subscribeToChannel(channelId, userId) {
        await runQuery(
            `INSERT OR REPLACE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?, ?, ?)`,
            [channelId, userId, new Date().toISOString()]
        );
        await this.addParticipant(channelId, userId);
    }

    // ---------- ЗАКРЕПЛЁННЫЕ СООБЩЕНИЯ ----------
    async pinMessage(chatId, messageId) {
        await runQuery(
            `UPDATE chats SET pinned_message_id = ? WHERE id = ?`,
            [messageId, chatId]
        );
    }

    async unpinMessage(chatId) {
        await runQuery(
            `UPDATE chats SET pinned_message_id = NULL WHERE id = ?`,
            [chatId]
        );
    }

    // ---------- ТАЙМЕР АВТОУДАЛЕНИЯ ----------
    async setAutoDelete(chatId, seconds) {
        const deleteAt = seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
        await runQuery(
            `UPDATE chats SET auto_delete_at = ? WHERE id = ?`,
            [deleteAt, chatId]
        );
    }

    async getAutoDeleteMessages() {
        return allQuery(
            `SELECT * FROM messages WHERE auto_delete_at IS NOT NULL AND auto_delete_at <= datetime('now') AND deleted = 0`
        );
    }

    // ---------- ПОИСК ПО СООБЩЕНИЯМ ----------
    async searchMessages(query, userId) {
        const chats = await this.getChats(userId);
        const chatIds = chats.map(c => c.id);
        if (chatIds.length === 0) return [];
        return allQuery(
            `SELECT * FROM messages WHERE chat_id IN (${chatIds.map(() => '?').join(',')}) 
             AND text LIKE ? AND deleted = 0 ORDER BY created_at DESC LIMIT 50`,
            [...chatIds, `%${query}%`]
        );
    }
}

module.exports = new Database();
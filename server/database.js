const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('📦 Инициализация базы данных...');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // ===== ПОЛЬЗОВАТЕЛИ =====
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
            wallpaper TEXT,
            theme TEXT DEFAULT 'dark',
            created_at TEXT,
            blacklist TEXT
        )
    `);

    // ===== ВЕРИФИКАЦИЯ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS verifications (
            phone TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires INTEGER NOT NULL
        )
    `);

    // ===== ЧАТЫ =====
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
            pinned_message_id TEXT,
            auto_delete INTEGER DEFAULT 0,
            wallpaper TEXT
        )
    `);

    // ===== УЧАСТНИКИ ЧАТОВ =====
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

    // ===== СООБЩЕНИЯ =====
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
            created_at TEXT,
            voice_duration INTEGER DEFAULT 0
        )
    `);

    // ===== РЕАКЦИИ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            message_id TEXT,
            user_id TEXT,
            reaction TEXT,
            created_at TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `);

    // ===== НЕПРОЧИТАННЫЕ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS unread_messages (
            message_id TEXT,
            user_id TEXT,
            PRIMARY KEY (message_id, user_id)
        )
    `);

    // ===== ЧЕРНОВИКИ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS drafts (
            chat_id TEXT,
            user_id TEXT,
            text TEXT,
            updated_at TEXT,
            PRIMARY KEY (chat_id, user_id)
        )
    `);

    // ===== ПОДПИСЧИКИ КАНАЛОВ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS channel_subscribers (
            channel_id TEXT,
            user_id TEXT,
            subscribed_at TEXT,
            PRIMARY KEY (channel_id, user_id)
        )
    `);

    // ===== ИСТОРИИ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS stories (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            file TEXT NOT NULL,
            text TEXT,
            created_at TEXT,
            expires_at TEXT
        )
    `);

    // ===== ПРОСМОТРЫ ИСТОРИЙ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS story_views (
            story_id TEXT,
            user_id TEXT,
            viewed_at TEXT,
            PRIMARY KEY (story_id, user_id)
        )
    `);

    // ===== ЗВОНКИ =====
    db.run(`
        CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            from_user TEXT,
            to_user TEXT,
            type TEXT DEFAULT 'audio',
            status TEXT DEFAULT 'ringing',
            started_at TEXT,
            ended_at TEXT,
            duration INTEGER DEFAULT 0
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

class Database {
    // ===== ПОЛЬЗОВАТЕЛИ =====
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
            `INSERT INTO users (id, name, username, phone, password, avatar, bio, verified, online, last_seen, wallpaper, theme, created_at, blacklist) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.name, user.username, user.phone, user.password,
             user.avatar || null, user.bio || null, 0, 0, null, 
             user.wallpaper || null, user.theme || 'dark', new Date().toISOString(), '[]']
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

    async addToBlacklist(userId, blockedId) {
        const user = await this.getUserById(userId);
        if (!user) return;
        const blacklist = JSON.parse(user.blacklist || '[]');
        if (!blacklist.includes(blockedId)) {
            blacklist.push(blockedId);
            await runQuery('UPDATE users SET blacklist = ? WHERE id = ?', [JSON.stringify(blacklist), userId]);
        }
    }

    async removeFromBlacklist(userId, blockedId) {
        const user = await this.getUserById(userId);
        if (!user) return;
        const blacklist = JSON.parse(user.blacklist || '[]');
        const index = blacklist.indexOf(blockedId);
        if (index > -1) {
            blacklist.splice(index, 1);
            await runQuery('UPDATE users SET blacklist = ? WHERE id = ?', [JSON.stringify(blacklist), userId]);
        }
    }

    async getBlacklist(userId) {
        const user = await this.getUserById(userId);
        return user ? JSON.parse(user.blacklist || '[]') : [];
    }

    // ===== ВЕРИФИКАЦИЯ =====
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

    // ===== ЧАТЫ =====
    async getChats(userId) {
        const blacklist = await this.getBlacklist(userId);
        const chats = await allQuery(
            `SELECT c.* FROM chats c 
             JOIN chat_participants cp ON c.id = cp.chat_id 
             WHERE cp.user_id = ? 
             ORDER BY c.last_message_time DESC`,
            [userId]
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
                    chat.isBlocked = blacklist.includes(user ? user.id : '');
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

    async createChat(participants, name = null, type = 'private', createdBy = null, description = null, avatar = null) {
        const chatId = Date.now().toString();
        await runQuery(
            `INSERT INTO chats (id, name, type, avatar, description, created_by, created_at, last_message, last_message_time) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [chatId, name, type, avatar || null, description || null, createdBy, new Date().toISOString(), null, null]
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

    async muteChat(chatId, userId, until) {
        await runQuery(
            `UPDATE chat_participants SET muted_until = ? WHERE chat_id = ? AND user_id = ?`,
            [until, chatId, userId]
        );
    }

    async setChatWallpaper(chatId, wallpaper) {
        await runQuery('UPDATE chats SET wallpaper = ? WHERE id = ?', [wallpaper, chatId]);
    }

    async setUserWallpaper(userId, wallpaper) {
        await runQuery('UPDATE users SET wallpaper = ? WHERE id = ?', [wallpaper, userId]);
    }

    async setUserTheme(userId, theme) {
        await runQuery('UPDATE users SET theme = ? WHERE id = ?', [theme, userId]);
    }

    // ===== СООБЩЕНИЯ =====
    async getMessages(chatId, limit = 50) {
        return allQuery(
            `SELECT * FROM messages WHERE chat_id = ? AND deleted = 0 ORDER BY created_at ASC LIMIT ?`,
            [chatId, limit]
        );
    }

    async createMessage(message) {
        await runQuery(
            `INSERT INTO messages (id, chat_id, sender_id, text, file, reply_to, forwarded_from, status, read, read_at, created_at, voice_duration) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [message.id, message.chat_id, message.sender_id, message.text,
             message.file ? JSON.stringify(message.file) : null,
             message.reply_to || null, message.forwarded_from || null,
             'sent', 0, null, message.created_at, message.voice_duration || 0]
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

    async createVoiceMessage(message) {
        return this.createMessage(message);
    }

    async getMessage(messageId) {
        return getQuery('SELECT * FROM messages WHERE id = ? AND deleted = 0', [messageId]);
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

    async pinMessage(chatId, messageId) {
        await runQuery('UPDATE chats SET pinned_message_id = ? WHERE id = ?', [messageId, chatId]);
    }

    async unpinMessage(chatId) {
        await runQuery('UPDATE chats SET pinned_message_id = NULL WHERE id = ?', [chatId]);
    }

    async getPinnedMessage(chatId) {
        const chat = await this.getChat(chatId);
        if (chat && chat.pinned_message_id) {
            return this.getMessage(chat.pinned_message_id);
        }
        return null;
    }

    // ===== РЕАКЦИИ =====
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

    // ===== ЧЕРНОВИКИ =====
    async saveDraft(chatId, userId, text) {
        await runQuery(
            `INSERT OR REPLACE INTO drafts (chat_id, user_id, text, updated_at) VALUES (?, ?, ?, ?)`,
            [chatId, userId, text, new Date().toISOString()]
        );
    }

    async getDraft(chatId, userId) {
        return getQuery('SELECT text FROM drafts WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
    }

    // ===== КАНАЛЫ =====
    async subscribeToChannel(channelId, userId) {
        await runQuery(
            `INSERT OR REPLACE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?, ?, ?)`,
            [channelId, userId, new Date().toISOString()]
        );
        await this.addParticipant(channelId, userId);
    }

    async unsubscribeFromChannel(channelId, userId) {
        await runQuery(
            `DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?`,
            [channelId, userId]
        );
    }

    async getChannelSubscribers(channelId) {
        const rows = await allQuery(
            `SELECT user_id FROM channel_subscribers WHERE channel_id = ?`,
            [channelId]
        );
        return rows.map(row => row.user_id);
    }

    // ===== ИСТОРИИ =====
    async createStory(story) {
        await runQuery(
            `INSERT INTO stories (id, user_id, file, text, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [story.id, story.user_id, story.file, story.text || '', story.created_at, story.expires_at]
        );
        return story;
    }

    async getActiveStories(userId) {
        const now = new Date().toISOString();
        const stories = await allQuery(
            `SELECT s.*, (SELECT COUNT(*) FROM story_views WHERE story_id = s.id) as views_count
             FROM stories s 
             WHERE s.user_id = ? AND s.expires_at > ? 
             ORDER BY s.created_at DESC`,
            [userId, now]
        );
        return stories;
    }

    async getStoriesForUser(userId) {
        const now = new Date().toISOString();
        const stories = await allQuery(
            `SELECT s.*, u.name as user_name, u.avatar as user_avatar,
             (SELECT COUNT(*) FROM story_views WHERE story_id = s.id) as views_count
             FROM stories s 
             JOIN users u ON s.user_id = u.id
             WHERE s.expires_at > ? 
             ORDER BY s.created_at DESC`,
            [now]
        );
        return stories;
    }

    async viewStory(storyId, userId) {
        await runQuery(
            `INSERT OR IGNORE INTO story_views (story_id, user_id, viewed_at) VALUES (?, ?, ?)`,
            [storyId, userId, new Date().toISOString()]
        );
    }

    async deleteStory(storyId, userId) {
        await runQuery(
            `DELETE FROM stories WHERE id = ? AND user_id = ?`,
            [storyId, userId]
        );
    }

    // ===== ЗВОНКИ =====
    async createCall(call) {
        await runQuery(
            `INSERT INTO calls (id, from_user, to_user, type, status, started_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [call.id, call.from_user, call.to_user, call.type, call.status, call.started_at]
        );
        return call;
    }

    async updateCallStatus(callId, status, endedAt = null, duration = 0) {
        await runQuery(
            `UPDATE calls SET status = ?, ended_at = ?, duration = ? WHERE id = ?`,
            [status, endedAt || new Date().toISOString(), duration, callId]
        );
    }

    async getCalls(userId) {
        return allQuery(
            `SELECT * FROM calls WHERE from_user = ? OR to_user = ? ORDER BY started_at DESC LIMIT 50`,
            [userId, userId]
        );
    }

    // ===== АВТОУДАЛЕНИЕ =====
    async setAutoDelete(chatId, seconds) {
        await runQuery(
            `UPDATE chats SET auto_delete = ? WHERE id = ?`,
            [seconds || 0, chatId]
        );
    }

    async getAutoDeleteMessages() {
        return allQuery(
            `SELECT * FROM messages WHERE auto_delete_at IS NOT NULL AND auto_delete_at <= datetime('now') AND deleted = 0`
        );
    }
}

module.exports = new Database();
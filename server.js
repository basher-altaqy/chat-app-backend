const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// الاتصال بقاعدة البيانات
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

// إنشاء محادثة جديدة
app.post('/api/conversations', async (req, res) => {
    try {
        const [result] = await pool.execute(
            'INSERT INTO conversations () VALUES ()'
        );
        res.json({ success: true, conversationId: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// جلب رسائل محادثة
app.get('/api/conversations/:id', async (req, res) => {
    try {
        const [messages] = await pool.execute(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// إرسال رسالة
app.post('/api/chat', async (req, res) => {
    try {
        const { conversationId, message } = req.body;
        
        // حفظ رسالة المستخدم
        await pool.execute(
            'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
            [conversationId, 'user', message]
        );
        
        // رد تلقائي
        const replies = ['مرحباً!', 'كيف حالك؟', 'أخبرني المزيد'];
        const botReply = replies[Math.floor(Math.random() * replies.length)];
        
        // حفظ رد البوت
        await pool.execute(
            'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
            [conversationId, 'assistant', botReply]
        );
        
        res.json({ success: true, reply: botReply });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// جلب كل المحادثات
app.get('/api/conversations', async (req, res) => {
    try {
        const [conversations] = await pool.execute(
            'SELECT * FROM conversations ORDER BY created_at DESC'
        );
        res.json({ success: true, conversations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
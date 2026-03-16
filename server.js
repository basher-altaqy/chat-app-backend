const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();

// إعدادات CORS مفصلة
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());

// الاتصال بقاعدة البيانات
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 60000
});

// ==============================================
// 📊 اختبار الاتصال بقاعدة البيانات
// ==============================================
app.get('/api/test-db', async (req, res) => {
    try {
        const [result] = await pool.execute('SELECT 1+1 as result');
        res.json({ 
            success: true, 
            message: '✅ الاتصال بقاعدة البيانات ناجح',
            db: result[0].result 
        });
    } catch (error) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ==============================================
// 💬 مسارات المحادثات
// ==============================================

// إنشاء محادثة جديدة
app.post('/api/conversations', async (req, res) => {
    try {
        const [result] = await pool.execute(
            'INSERT INTO conversations () VALUES ()'
        );
        res.json({ success: true, conversationId: result.insertId });
    } catch (error) {
        console.error('خطأ في إنشاء محادثة:', error);
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
        console.error('خطأ في جلب الرسائل:', error);
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
        
        // تحديث وقت المحادثة
        await pool.execute(
            'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
            [conversationId]
        );
        
        res.json({ success: true, reply: botReply });
    } catch (error) {
        console.error('خطأ في إرسال الرسالة:', error);
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
        console.error('خطأ في جلب المحادثات:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================================
// 🔐 نظام المصادقة - تسجيل مستخدم جديد
// ==============================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, full_name } = req.body;
        
        // التحقق من المدخلات
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'الرجاء إدخال اسم المستخدم والبريد الإلكتروني وكلمة السر' 
            });
        }
        
        // التحقق من عدم وجود المستخدم مسبقاً
        const [existing] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
        
        if (existing.length > 0) {
            return res.status(409).json({ 
                success: false, 
                error: 'اسم المستخدم أو البريد الإلكتروني موجود مسبقاً' 
            });
        }
        
        // تشفير كلمة السر
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // إدراج المستخدم الجديد
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, full_name || null]
        );
        
        // إنشاء توكن
        const token = jwt.sign(
            { userId: result.insertId, username },
            process.env.JWT_SECRET || 'your-secret-key-change-this',
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'تم التسجيل بنجاح',
            token,
            user: {
                id: result.insertId,
                username,
                email,
                full_name: full_name || null
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في التسجيل:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'حدث خطأ أثناء التسجيل'
        });
    }
});

// ==============================================
// 🔐 نظام المصادقة - تسجيل الدخول
// ==============================================
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'الرجاء إدخال البريد الإلكتروني وكلمة السر' 
            });
        }
        
        const [users] = await pool.execute(
            'SELECT id, username, email, password_hash, full_name FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' 
            });
        }
        
        const user = users[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'البريد الإلكتروني أو كلمة السر غير صحيحة' 
            });
        }
        
        await pool.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET || 'your-secret-key-change-this',
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            message: 'تم تسجيل الدخول بنجاح',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الدخول:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'حدث خطأ أثناء تسجيل الدخول'
        });
    }
});

// ==============================================
// 🔐 التحقق من صحة التوكن (Middleware)
// ==============================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'توكن غير موجود' 
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this', (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                error: 'توكن غير صالح أو منتهي الصلاحية' 
            });
        }
        req.user = user;
        next();
    });
};

// ==============================================
// الحصول على معلومات المستخدم الحالي
// ==============================================
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, username, email, full_name, created_at FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'المستخدم غير موجود' 
            });
        }
        
        res.json({
            success: true,
            user: users[0]
        });
        
    } catch (error) {
        console.error('خطأ في جلب معلومات المستخدم:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في جلب المعلومات' 
        });
    }
});

// ==============================================
// 🚀 تشغيل الخادم
// ==============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 اختبار قاعدة البيانات: http://localhost:${PORT}/api/test-db`);
});
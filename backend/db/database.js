const path = require('path');
const fs = require('fs');

const isPostgres = !!process.env.DATABASE_URL;
let db = null;
let pgPool = null;

if (isPostgres) {
    const { Pool } = require('pg');
    // Railway provides DATABASE_URL. For production, rejecting unauthorized SSL is standard, but sometimes needs to be relaxed
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
            rejectUnauthorized: false
        }
    });
    console.log('[DB] Configured for PostgreSQL.');
    initDbPostgres();
} else {
    const sqlite3 = require('sqlite3').verbose();
    const dbDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new sqlite3.Database(path.join(dbDir, 'bot.sqlite'), (err) => {
        if (err) {
            console.error('[DB] Error opening database', err.message);
        } else {
            console.log('[DB] Connected to SQLite database.');
            initDbSqlite();
        }
    });
}

async function initDbPostgres() {
    try {
        await runQuery(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS posted_files (
            url_hash TEXT PRIMARY KEY,
            url TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            level TEXT,
            message TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS reddit_processed_posts (
            post_id TEXT PRIMARY KEY,
            subreddit TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await runQuery(`CREATE TABLE IF NOT EXISTS redgifs_processed_posts (
            post_id TEXT PRIMARY KEY,
            search_term TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('[DB] PostgreSQL tables checked/created successfully.');
    } catch (err) {
        console.error('[DB] Error initializing PostgreSQL tables:', err.message);
    }
}

function initDbSqlite() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS posted_files (
            url_hash TEXT PRIMARY KEY,
            url TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS reddit_processed_posts (
            post_id TEXT PRIMARY KEY,
            subreddit TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS redgifs_processed_posts (
            post_id TEXT PRIMARY KEY,
            search_term TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            // Postgres uses $1, $2, etc., whereas SQLite uses ?
            const pgSql = convertSqlToPostgres(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        } else {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        }
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            const pgSql = convertSqlToPostgres(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (err) reject(err);
                else resolve(res.rows[0] || null);
            });
        } else {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        }
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            const pgSql = convertSqlToPostgres(sql);
            pgPool.query(pgSql, params, (err, res) => {
                if (err) reject(err);
                else resolve(res.rows);
            });
        } else {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }
    });
}

// Simple helper to replace SQLite "?" parameters with PostgreSQL "$1, $2, ..." parameters
function convertSqlToPostgres(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

async function getConfig(key) {
    const row = await getQuery(`SELECT value FROM config WHERE key = ?`, [key]);
    return row ? JSON.parse(row.value) : null;
}

async function setConfig(key, value) {
    const val = JSON.stringify(value);
    if (isPostgres) {
        // Postgres syntax for upsert (ON CONFLICT)
        await runQuery(`
            INSERT INTO config (key, value) 
            VALUES (?, ?) 
            ON CONFLICT (key) 
            DO UPDATE SET value = EXCLUDED.value
        `, [key, val]);
    } else {
        await runQuery(`
            INSERT INTO config (key, value) 
            VALUES (?, ?) 
            ON CONFLICT(key) 
            DO UPDATE SET value = excluded.value
        `, [key, val]);
    }
}

async function addLog(level, message) {
    await runQuery(`INSERT INTO logs (level, message) VALUES (?, ?)`, [level, message]);
    
    // Trim logs
    if (isPostgres) {
        await runQuery(`
            DELETE FROM logs 
            WHERE id NOT IN (
                SELECT id FROM logs 
                ORDER BY id DESC 
                LIMIT 1000
            )
        `);
    } else {
        await runQuery(`
            DELETE FROM logs 
            WHERE id NOT IN (
                SELECT id FROM logs 
                ORDER BY id DESC 
                LIMIT 1000
            )
        `);
    }
}

async function getLogs(limit = 100) {
    return await allQuery(`SELECT * FROM logs ORDER BY id DESC LIMIT ?`, [limit]);
}

async function isFilePosted(urlHash) {
    const row = await getQuery(`SELECT 1 FROM posted_files WHERE url_hash = ?`, [urlHash]);
    return !!row;
}

async function markFilePosted(urlHash, url) {
    if (isPostgres) {
        await runQuery(`INSERT INTO posted_files (url_hash, url) VALUES (?, ?) ON CONFLICT (url_hash) DO NOTHING`, [urlHash, url]);
    } else {
        await runQuery(`INSERT OR IGNORE INTO posted_files (url_hash, url) VALUES (?, ?)`, [urlHash, url]);
    }
}

async function isRedditPostProcessed(postId) {
    const row = await getQuery(`SELECT 1 FROM reddit_processed_posts WHERE post_id = ?`, [postId]);
    return !!row;
}

async function markRedditPostProcessed(postId, subreddit) {
    if (isPostgres) {
        await runQuery(`INSERT INTO reddit_processed_posts (post_id, subreddit) VALUES (?, ?) ON CONFLICT (post_id) DO NOTHING`, [postId, subreddit]);
        await runQuery(`
            DELETE FROM reddit_processed_posts 
            WHERE post_id NOT IN (
                SELECT post_id FROM reddit_processed_posts 
                ORDER BY timestamp DESC 
                LIMIT 2000
            )
        `);
    } else {
        await runQuery(`INSERT OR IGNORE INTO reddit_processed_posts (post_id, subreddit) VALUES (?, ?)`, [postId, subreddit]);
        await runQuery(`DELETE FROM reddit_processed_posts WHERE post_id NOT IN (SELECT post_id FROM reddit_processed_posts ORDER BY timestamp DESC LIMIT 2000)`);
    }
}

async function isRedgifsPostProcessed(postId) {
    const row = await getQuery(`SELECT 1 FROM redgifs_processed_posts WHERE post_id = ?`, [postId]);
    return !!row;
}

async function markRedgifsPostProcessed(postId, searchTerm) {
    if (isPostgres) {
        await runQuery(`INSERT INTO redgifs_processed_posts (post_id, search_term) VALUES (?, ?) ON CONFLICT (post_id) DO NOTHING`, [postId, searchTerm]);
        await runQuery(`
            DELETE FROM redgifs_processed_posts 
            WHERE post_id NOT IN (
                SELECT post_id FROM redgifs_processed_posts 
                ORDER BY timestamp DESC 
                LIMIT 2000
            )
        `);
    } else {
        await runQuery(`INSERT OR IGNORE INTO redgifs_processed_posts (post_id, search_term) VALUES (?, ?)`, [postId, searchTerm]);
        await runQuery(`DELETE FROM redgifs_processed_posts WHERE post_id NOT IN (SELECT post_id FROM redgifs_processed_posts ORDER BY timestamp DESC LIMIT 2000)`);
    }
}

module.exports = {
    getConfig,
    setConfig,
    addLog,
    getLogs,
    isFilePosted,
    markFilePosted,
    isRedditPostProcessed,
    markRedditPostProcessed,
    isRedgifsPostProcessed,
    markRedgifsPostProcessed
};

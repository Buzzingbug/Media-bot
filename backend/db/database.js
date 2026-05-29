const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(dbDir, 'bot.sqlite'), (err) => {
    if (err) {
        console.error('[DB] Error opening database', err.message);
    } else {
        console.log('[DB] Connected to SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Table for simple key-value config
        db.run(`CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Table for deduplication
        db.run(`CREATE TABLE IF NOT EXISTS posted_files (
            url_hash TEXT PRIMARY KEY,
            url TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table for logs to display on the dashboard
        db.run(`CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT,
            message TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table for Reddit post deduplication
        db.run(`CREATE TABLE IF NOT EXISTS reddit_processed_posts (
            post_id TEXT PRIMARY KEY,
            subreddit TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table for Redgifs post deduplication
        db.run(`CREATE TABLE IF NOT EXISTS redgifs_processed_posts (
            post_id TEXT PRIMARY KEY,
            search_term TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    });
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
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

async function getConfig(key) {
    const row = await getQuery(`SELECT value FROM config WHERE key = ?`, [key]);
    return row ? JSON.parse(row.value) : null;
}

async function setConfig(key, value) {
    const val = JSON.stringify(value);
    await runQuery(`INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, val]);
}

async function addLog(level, message) {
    await runQuery(`INSERT INTO logs (level, message) VALUES (?, ?)`, [level, message]);
    // Optionally trim logs to last 1000
    await runQuery(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 1000)`);
}

async function getLogs(limit = 100) {
    return await allQuery(`SELECT * FROM logs ORDER BY id DESC LIMIT ?`, [limit]);
}

async function isFilePosted(urlHash) {
    const row = await getQuery(`SELECT 1 FROM posted_files WHERE url_hash = ?`, [urlHash]);
    return !!row;
}

async function markFilePosted(urlHash, url) {
    await runQuery(`INSERT OR IGNORE INTO posted_files (url_hash, url) VALUES (?, ?)`, [urlHash, url]);
}

async function isRedditPostProcessed(postId) {
    const row = await getQuery(`SELECT 1 FROM reddit_processed_posts WHERE post_id = ?`, [postId]);
    return !!row;
}

async function markRedditPostProcessed(postId, subreddit) {
    await runQuery(`INSERT OR IGNORE INTO reddit_processed_posts (post_id, subreddit) VALUES (?, ?)`, [postId, subreddit]);
    
    // Cleanup old records to prevent bloat (keep last 2000)
    await runQuery(`DELETE FROM reddit_processed_posts WHERE post_id NOT IN (SELECT post_id FROM reddit_processed_posts ORDER BY timestamp DESC LIMIT 2000)`);
}

async function isRedgifsPostProcessed(postId) {
    const row = await getQuery(`SELECT 1 FROM redgifs_processed_posts WHERE post_id = ?`, [postId]);
    return !!row;
}

async function markRedgifsPostProcessed(postId, searchTerm) {
    await runQuery(`INSERT OR IGNORE INTO redgifs_processed_posts (post_id, search_term) VALUES (?, ?)`, [postId, searchTerm]);
    await runQuery(`DELETE FROM redgifs_processed_posts WHERE post_id NOT IN (SELECT post_id FROM redgifs_processed_posts ORDER BY timestamp DESC LIMIT 2000)`);
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

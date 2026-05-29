const db = require('../db/database');

let redgifsToken = null;

async function getRedgifsToken() {
    if (redgifsToken) return redgifsToken;
    try {
        const res = await fetch('https://api.redgifs.com/v2/auth/temporary');
        if (res.ok) {
            const data = await res.json();
            redgifsToken = data.token;
            return redgifsToken;
        }
    } catch (err) {
        db.addLog('error', `[Redgifs] Failed to get temporary token: ${err.message}`);
    }
    return null;
}

async function processSingleFeed(feedConfig, client, isRunningFunc) {
    if (isRunningFunc && !isRunningFunc()) return;

    if (!feedConfig.active || !feedConfig.searchTerm || !feedConfig.channelId) {
        return;
    }

    const channel = client.channels.cache.get(feedConfig.channelId);
    if (!channel) {
        db.addLog('error', `[Redgifs] Could not find Discord channel ${feedConfig.channelId}`);
        return;
    }

    const token = await getRedgifsToken();
    if (!token) return;

    db.addLog('info', `[Redgifs] Searching for '${feedConfig.searchTerm}'...`);

    try {
        const order = feedConfig.sort || 'recent'; // recent, top, trending
        const feedUrl = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(feedConfig.searchTerm)}&count=50&order=${order}`;
        
        const response = await fetch(feedUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                redgifsToken = null; // Token expired, reset it
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        
        let newPostsCount = 0;
        const gifs = (json.gifs || []).reverse(); // Process oldest first

        for (const gif of gifs) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = gif.id;
            
            const alreadyProcessed = await db.isRedgifsPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            const mediaUrl = gif.urls?.hd || gif.urls?.sd;
            if (!mediaUrl) {
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                continue;
            }

            try {
                await channel.send({ content: `[Watch Video](${mediaUrl})` });
                await db.markRedgifsPostProcessed(postId, feedConfig.searchTerm);
                newPostsCount++;
                
                const delayMs = (feedConfig.postDelay || 2.5) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (discordErr) {
                db.addLog('error', `[Redgifs] Discord post failed: ${discordErr.message}`);
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Redgifs] Found and posted ${newPostsCount} new items for '${feedConfig.searchTerm}'`);
        }
    } catch (feedErr) {
        db.addLog('error', `[Redgifs] API Error for '${feedConfig.searchTerm}': ${feedErr.message}`);
    }
}

async function checkRedgifsFeed(client, isRunningFunc) {
    try {
        const config = await db.getConfig('redgifs_settings');
        if (!config || !config.feeds || config.feeds.length === 0) {
            return;
        }
        
        const promises = config.feeds.map(feedConfig => processSingleFeed(feedConfig, client, isRunningFunc));
        await Promise.allSettled(promises);
    } catch (err) {
        db.addLog('error', `[Redgifs Job] Error: ${err.message}`);
    }
}

module.exports = {
    checkRedgifsFeed
};

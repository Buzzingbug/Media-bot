const db = require('../db/database');
const crypto = require('crypto');

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

function isImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
}

function isVideo(filename) {
    return /\.(mp4|webm|mov|mkv)$/i.test(filename);
}

async function runJob(client, settings, progress, signal) {
    const { sourceChannel, destChannel, limit, mediaTypes } = settings;
    
    // Fetch channels
    let srcChan, dstChan;
    try {
        srcChan = await client.channels.fetch(sourceChannel);
        dstChan = await client.channels.fetch(destChannel);
    } catch (err) {
        throw new Error(`Could not fetch channels. Make sure bot has access. Details: ${err.message}`);
    }

    if (!srcChan.isTextBased() || !dstChan.isTextBased()) {
        throw new Error("Source and destination must be text channels.");
    }

    db.addLog('info', `Fetching up to ${limit} messages from source channel...`);
    
    // Fetch messages (Discord API limits fetch to 100 at a time, we'll implement simple pagination if limit > 100)
    let allMessages = [];
    let lastId;
    
    while (allMessages.length < limit) {
        if (signal.aborted) throw new Error("AbortError");
        
        const fetchLimit = Math.min(100, limit - allMessages.length);
        const options = { limit: fetchLimit };
        if (lastId) options.before = lastId;
        
        const msgs = await srcChan.messages.fetch(options);
        if (msgs.size === 0) break; // no more messages
        
        msgs.forEach(m => allMessages.push(m));
        lastId = msgs.last().id;
    }

    db.addLog('info', `Found ${allMessages.length} messages. Processing attachments...`);
    progress.total = allMessages.length;

    // Process messages from oldest to newest if we want to preserve order, but fetch gets newest first.
    // Let's reverse them to post in chronological order
    allMessages.reverse();

    for (const message of allMessages) {
        if (signal.aborted) {
            const err = new Error("AbortError");
            err.name = "AbortError";
            throw err;
        }
        
        if (settings.ignoreBots && message.author.bot) {
            continue;
        }

        let postedSomething = false;

        // Check attachments
        if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                const url = attachment.url;
                const filename = attachment.name;
                
                const isImg = isImage(filename);
                const isVid = isVideo(filename);
                
                if (!isImg && !isVid) {
                    continue; // Skip non-media
                }
                
                if (isImg && !mediaTypes.images) continue;
                if (isVid && !mediaTypes.videos) continue;
                
                const hash = getUrlHash(url);
                const alreadyPosted = await db.isFilePosted(hash);
                
                if (alreadyPosted) {
                    db.addLog('info', `Skipped duplicate file: ${filename}`);
                    progress.skipped++;
                    continue;
                }
                
                const textType = isImg ? 'Image' : 'Video';
                const content = `[${textType}](${url})`;
                
                try {
                    if (settings.dryRun) {
                        db.addLog('info', `[DRY RUN] Would post: ${filename}`);
                        progress.processed++;
                    } else {
                        await dstChan.send(content);
                        await db.markFilePosted(hash, url);
                        progress.processed++;
                        postedSomething = true;
                        db.addLog('info', `Successfully posted: ${filename}`);
                        
                        const delayMs = settings.postDelay ? (settings.postDelay * 1000) : 2500;
                        await delay(delayMs);
                    }
                } catch (sendErr) {
                    db.addLog('error', `Failed to post ${filename}: ${sendErr.message}`);
                    progress.errors++;
                }
            }
        }
        
        if (postedSomething && settings.deleteAfterSync && !settings.dryRun) {
            try {
                await message.delete();
                db.addLog('info', `Deleted original message from source channel.`);
            } catch (delErr) {
                db.addLog('warning', `Could not delete source message: ${delErr.message}`);
            }
        }
    }
}

module.exports = {
    runJob
};

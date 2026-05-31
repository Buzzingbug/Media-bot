const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const crypto = require('crypto');

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'DiscordBot:favbot-media-fetcher:v1.0.0 (by DiscordMediaBot)'
    }
};

const Parser = require('rss-parser');
const parser = new Parser();

function getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

async function processSingleFeed(feedConfig, client, isRunningFunc, guildId) {
    if (isRunningFunc && !isRunningFunc()) return;

    if (!feedConfig.active || !feedConfig.subreddit || !feedConfig.channelId) {
        return;
    }

    const cleanSubreddit = feedConfig.subreddit.trim().replace(/^(r\/|\/r\/)/i, '').trim();

    const channel = client.channels.cache.get(feedConfig.channelId);
    if (!channel) {
        db.addLog('error', `[Reddit] Could not find Discord channel ${feedConfig.channelId} for r/${cleanSubreddit}`, guildId);
        return;
    }

    db.addLog('info', `[Reddit] Polling r/${cleanSubreddit} via RSS API...`, guildId);
    
    try {
        const sort = feedConfig.sort || 'new';
        const timeFilter = feedConfig.timeFilter || 'all';
        let feedUrl = `https://www.reddit.com/r/${cleanSubreddit}/${sort}.rss?limit=100`;
        if (sort === 'top' || sort === 'controversial') {
            feedUrl += `&t=${timeFilter}`;
        }

        const response = await fetch(feedUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const xml = await response.text();
        const feed = await parser.parseString(xml);
        
        let newPostsCount = 0;
        const posts = feed.items.reverse();

        for (const post of posts) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = post.id;
            
            const alreadyProcessed = await db.isRedditPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            // Extract media URL from RSS content
            let mediaUrl = null;
            const linkMatch = post.content ? post.content.match(/<span><a href="([^"]+)">\[link\]<\/a><\/span>/) : null;
            
            if (linkMatch && linkMatch[1]) {
                mediaUrl = linkMatch[1];
            } else {
                mediaUrl = post.link;
            }

            // Duplicate Media URL Prevention Check
            const mediaHash = getUrlHash(mediaUrl);
            const alreadyPosted = await db.isFilePosted(mediaHash);
            if (alreadyPosted) {
                await db.markRedditPostProcessed(postId, cleanSubreddit);
                continue;
            }

            let isImage = false;
            let isVideo = false;
            
            if (mediaUrl.match(/\.(mp4|gifv|webm)$/i) || mediaUrl.includes('streamable.com') || mediaUrl.includes('redgifs.com') || mediaUrl.includes('tiktok.com') || mediaUrl.includes('vimeo.com') || mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
                isVideo = true;
            } else if (mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i) || mediaUrl.includes('imgur.com') || mediaUrl.includes('i.redd.it')) {
                isImage = true;
            }

            // Apply Media filters
            if (isImage && feedConfig.mediaTypes && !feedConfig.mediaTypes.images) continue;
            if (isVideo && feedConfig.mediaTypes && !feedConfig.mediaTypes.videos) continue;
            
            if (!isImage && !isVideo && feedConfig.mediaTypes && (feedConfig.mediaTypes.images || feedConfig.mediaTypes.videos)) {
                 await db.markRedditPostProcessed(postId, cleanSubreddit);
                 continue;
            }

            // Discord native video playback fix using vxreddit proxy
            let discordPlaybackUrl = mediaUrl;
            if (isVideo && mediaUrl.includes('v.redd.it')) {
                discordPlaybackUrl = mediaUrl.replace('v.redd.it', 'vxreddit.com');
            } else if (isVideo && mediaUrl.includes('reddit.com')) {
                discordPlaybackUrl = mediaUrl.replace('www.reddit.com', 'vxreddit.com').replace('old.reddit.com', 'vxreddit.com');
            }

            try {
                if (feedConfig.embedMode) {
                    const embed = new EmbedBuilder()
                        .setTitle((post.title || '').substring(0, 256))
                        .setURL(post.link)
                        .setColor(0xFF4500)
                        .setAuthor({ name: `r/${cleanSubreddit}` })
                        .setTimestamp(new Date(post.isoDate || Date.now()));
                    
                    if (isImage) {
                        embed.setImage(discordPlaybackUrl);
                        await channel.send({ embeds: [embed] });
                    } else {
                        await channel.send({ embeds: [embed], content: `[Watch Video](${discordPlaybackUrl})` });
                    }
                } else {
                    const icon = isVideo ? 'Watch Video' : 'View Media';
                    await channel.send({ content: `[${icon}](${discordPlaybackUrl})` });
                }

                await db.markRedditPostProcessed(postId, cleanSubreddit);
                await db.markFilePosted(mediaHash, mediaUrl);
                newPostsCount++;
                
                const delayMs = (feedConfig.postDelay || 2.5) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (discordErr) {
                db.addLog('error', `[Reddit] Discord post failed: ${discordErr.message}`, guildId);
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Reddit] Found and posted ${newPostsCount} new items from r/${cleanSubreddit}`, guildId);
        }
    } catch (feedErr) {
        db.addLog('error', `[Reddit] RSS Error for r/${cleanSubreddit}: ${feedErr.message}`, guildId);
    }
}

async function checkRedditFeed(client, isRunningFunc, guildId) {
    try {
        const config = guildId
            ? await db.getGuildConfig(guildId, 'reddit_settings')
            : await db.getConfig('reddit_settings');

        if (!config || !config.feeds || config.feeds.length === 0) {
            return;
        }
        
        const promises = config.feeds.map(async (feedConfig, index) => {
            if (index > 0) {
                await new Promise(r => setTimeout(r, index * 2000));
            }
            return processSingleFeed(feedConfig, client, isRunningFunc, guildId);
        });
        await Promise.allSettled(promises);
    } catch (err) {
        db.addLog('error', `[Reddit Job] Error: ${err.message}`, guildId);
    }
}

module.exports = {
    checkRedditFeed
};

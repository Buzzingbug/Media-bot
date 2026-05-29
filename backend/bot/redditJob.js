const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'DiscordBot:favbot-media-fetcher:v1.0.0 (by DiscordMediaBot)'
    }
};

const Parser = require('rss-parser');
const parser = new Parser();

async function processSingleFeed(feedConfig, client, isRunningFunc) {
    if (isRunningFunc && !isRunningFunc()) return;

    if (!feedConfig.active || !feedConfig.subreddit || !feedConfig.channelId) {
        return;
    }

    const cleanSubreddit = feedConfig.subreddit.trim().replace(/^(r\/|\/r\/)/i, '').trim();

    const channel = client.channels.cache.get(feedConfig.channelId);
    if (!channel) {
        db.addLog('error', `[Reddit] Could not find Discord channel ${feedConfig.channelId} for r/${cleanSubreddit}`);
        return;
    }

    db.addLog('info', `[Reddit] Polling r/${cleanSubreddit} via RSS API...`);
    
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
        // Extract items and process oldest first
        const posts = feed.items.reverse();

        for (const post of posts) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = post.id; // typically t3_xxxxxx
            
            const alreadyProcessed = await db.isRedditPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            // Extract media URL from RSS content
            let mediaUrl = null;
            const linkMatch = post.content ? post.content.match(/<span><a href="([^"]+)">\[link\]<\/a><\/span>/) : null;
            
            if (linkMatch && linkMatch[1]) {
                mediaUrl = linkMatch[1];
            } else {
                mediaUrl = post.link; // Fallback to permalink
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
            
            // For the user requirement: "only media link" -> If no media found, skip.
            if (!isImage && !isVideo && feedConfig.mediaTypes && (feedConfig.mediaTypes.images || feedConfig.mediaTypes.videos)) {
                 // It's just a text post or link that isn't recognized media
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
                    // Rich Embed
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
                        // Discord cannot embed videos inside Rich Embeds. Send raw link alongside embed.
                        await channel.send({ embeds: [embed], content: `[Watch Video](${discordPlaybackUrl})` });
                    }
                } else {
                    // Minimal Text
                    const icon = isVideo ? 'Watch Video' : 'View Media';
                    await channel.send({ content: `[${icon}](${discordPlaybackUrl})` });
                }

                await db.markRedditPostProcessed(postId, cleanSubreddit);
                newPostsCount++;
                
                // Use customized delay per feed (fallback to 2.5s)
                const delayMs = (feedConfig.postDelay || 2.5) * 1000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (discordErr) {
                db.addLog('error', `[Reddit] Discord post failed: ${discordErr.message}`);
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Reddit] Found and posted ${newPostsCount} new items from r/${cleanSubreddit}`);
        }
    } catch (feedErr) {
        db.addLog('error', `[Reddit] RSS Error for r/${cleanSubreddit}: ${feedErr.message}`);
    }
}

async function checkRedditFeed(client, isRunningFunc) {
    try {
        const config = await db.getConfig('reddit_settings');
        if (!config || !config.feeds || config.feeds.length === 0) {
            return; // Not fully configured
        }
        
        const promises = config.feeds.map(async (feedConfig, index) => {
            // Stagger requests by 2000ms per feed to avoid Reddit API rate limits (403/429)
            if (index > 0) {
                await new Promise(r => setTimeout(r, index * 2000));
            }
            return processSingleFeed(feedConfig, client, isRunningFunc);
        });
        await Promise.allSettled(promises);
    } catch (err) {
        db.addLog('error', `[Reddit Job] Error: ${err.message}`);
    }
}

module.exports = {
    checkRedditFeed
};

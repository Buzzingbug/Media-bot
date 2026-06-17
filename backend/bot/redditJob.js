const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const crypto = require('crypto');

const isExecuting = new Map();

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'DiscordBot:favbot-media-fetcher:v1.0.0 (by DiscordMediaBot)'
    }
};

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

    db.addLog('info', `[Reddit] Polling r/${cleanSubreddit} via PullPush API...`, guildId);
    
    try {
        const sortType = feedConfig.sort === 'top' ? 'score' : 'created_utc';
        const feedUrl = `https://api.pullpush.io/reddit/search/submission/?subreddit=${cleanSubreddit}&sort=desc&sort_type=${sortType}&size=100`;

        const response = await fetch(feedUrl, FETCH_OPTIONS);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const json = await response.json();
        const posts = (json.data || []).reverse(); // Reverse to process oldest first
        
        let newPostsCount = 0;

        for (const post of posts) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = post.id;
            
            const alreadyProcessed = await db.isRedditPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            // Extract media URL from PullPush JSON
            let mediaUrl = post.url || post.url_overridden_by_dest;
            
            if (!mediaUrl) {
                await db.markRedditPostProcessed(postId, cleanSubreddit);
                continue;
            }

            // Filter out Imgur albums/galleries and Reddit ad tracking links
            if (
                mediaUrl.includes('imgur.com/a/') || 
                mediaUrl.includes('imgur.com/gallery/') || 
                mediaUrl.includes('alb.reddit.com') || 
                mediaUrl.includes('out.reddit.com')
            ) {
                await db.markRedditPostProcessed(postId, cleanSubreddit);
                continue;
            }

            // Convert generic imgur page links to direct image links
            if (mediaUrl.match(/^https?:\/\/(www\.)?imgur\.com\/[a-zA-Z0-9]+$/)) {
                mediaUrl = mediaUrl.replace('imgur.com', 'i.imgur.com') + '.jpg';
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
            } else if (post.post_hint === 'image') {
                isImage = true;
            } else if (post.is_video) {
                isVideo = true;
                mediaUrl = post.media?.reddit_video?.fallback_url || mediaUrl;
            }

            // Apply Media filters
            if (isImage && feedConfig.mediaTypes && !feedConfig.mediaTypes.images) continue;
            if (isVideo && feedConfig.mediaTypes && !feedConfig.mediaTypes.videos) continue;
            
            if (!isImage && !isVideo && feedConfig.mediaTypes && (feedConfig.mediaTypes.images || feedConfig.mediaTypes.videos)) {
                 await db.markRedditPostProcessed(postId, cleanSubreddit);
                 continue;
            }

            // Dead Link Checker
            try {
                const headRes = await fetch(mediaUrl, { method: 'HEAD', ...FETCH_OPTIONS });
                if (headRes.status === 404 || headRes.status === 403 || headRes.status === 410) {
                    db.addLog('warning', `[Reddit] Skipping deleted media link for post ${postId}: ${mediaUrl}`, guildId);
                    await db.markRedditPostProcessed(postId, cleanSubreddit);
                    continue;
                }
            } catch (headErr) {
                // Ignore HEAD fetch errors and try to post anyway
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
                        .setURL(`https://www.reddit.com${post.permalink}`)
                        .setColor(0xFF4500)
                        .setAuthor({ name: `r/${cleanSubreddit}` })
                        .setTimestamp(new Date(post.created_utc * 1000));
                    
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
        } else {
            db.addLog('info', `[Reddit] No new items found in r/${cleanSubreddit}`, guildId);
        }
    } catch (feedErr) {
        db.addLog('error', `[Reddit] API Error for r/${cleanSubreddit}: ${feedErr.message}`, guildId);
    }
}

async function checkRedditFeed(client, isRunningFunc, guildId) {
    if (isExecuting.get(guildId)) {
        db.addLog('warning', `[Reddit Job] Overlap prevented: Previous poll is still running for server.`, guildId);
        return;
    }
    isExecuting.set(guildId, true);

    try {
        const config = guildId
            ? await db.getGuildConfig(guildId, 'reddit_settings')
            : await db.getConfig('reddit_settings');

        if (!config || !config.feeds || config.feeds.length === 0) {
            return;
        }
        
        for (const feedConfig of config.feeds) {
            if (isRunningFunc && !isRunningFunc()) break;
            
            try {
                await processSingleFeed(feedConfig, client, isRunningFunc, guildId);
            } catch (feedErr) {
                db.addLog('error', `[Reddit Job] Error processing feed: ${feedErr.message}`, guildId);
            }
            
            // Wait 30 seconds between processing each feed to avoid PullPush rate limits
            await new Promise(r => setTimeout(r, 30000));
        }
    } catch (err) {
        db.addLog('error', `[Reddit Job] Error: ${err.message}`, guildId);
    } finally {
        isExecuting.set(guildId, false);
    }
}

module.exports = {
    checkRedditFeed
};

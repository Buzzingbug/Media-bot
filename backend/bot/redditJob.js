const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const crypto = require('crypto');
const cheerio = require('cheerio');

const FETCH_OPTIONS = {
    headers: {
        'User-Agent': 'windows:favbot-media-fetcher:v1.0.0 (by /u/vibe)'
    }
};

function getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

let isGlobalExecuting = false;

async function checkRedditFeed(client, isRunningFunc) {
    if (isGlobalExecuting) {
        db.addLog('warning', `[Reddit Job] Overlap prevented: Previous global poll is still running.`);
        return;
    }
    isGlobalExecuting = true;

    try {
        const allConfigs = await db.getAllGuildConfigs('reddit_settings');
        const subredditMap = new Map();
        
        for (const guildData of allConfigs) {
            const guildId = guildData.guildId;
            const config = guildData.value;
            
            if (!config || !config.feeds || config.feeds.length === 0) continue;
            
            for (const feedConfig of config.feeds) {
                if (!feedConfig.active || !feedConfig.subreddit || !feedConfig.channelId) continue;
                
                const cleanSubreddit = feedConfig.subreddit.trim().replace(/^(r\/|\/r\/)/i, '').trim();
                const channel = client.channels.cache.get(feedConfig.channelId);
                
                if (!channel) {
                    db.addLog('error', `[Reddit] Could not find Discord channel ${feedConfig.channelId} for r/${cleanSubreddit}`, guildId);
                    continue;
                }
                
                if (!subredditMap.has(cleanSubreddit)) {
                    subredditMap.set(cleanSubreddit, []);
                }
                subredditMap.get(cleanSubreddit).push({ guildId, feedConfig, channel });
            }
        }
        
        for (const [cleanSubreddit, subscribers] of subredditMap.entries()) {
            if (isRunningFunc && !isRunningFunc()) break;
            
            try {
                const sortType = subscribers[0].feedConfig.sort === 'top' ? 'top' : 'new';
                await processSingleGlobalFeed(cleanSubreddit, sortType, subscribers, client, isRunningFunc);
            } catch (feedErr) {
                db.addLog('error', `[Reddit Job] Error processing feed r/${cleanSubreddit}: ${feedErr.message}`);
            }
            
            // Wait 30 seconds between processing each unique subreddit to avoid Reddit API rate limits
            await new Promise(r => setTimeout(r, 30000));
        }
    } catch (err) {
        db.addLog('error', `[Reddit Job] Global Error: ${err.message}`);
    } finally {
        isGlobalExecuting = false;
    }
}

async function processSingleGlobalFeed(cleanSubreddit, sortType, subscribers, client, isRunningFunc) {
    db.addLog('info', `[Reddit] Global Polling r/${cleanSubreddit} for ${subscribers.length} servers...`);
    
    try {
        let feedUrl = `https://www.reddit.com/r/${cleanSubreddit}/${sortType}/.rss?limit=100`;
        if (sortType === 'top') {
            feedUrl += '&t=day';
        }

        const response = await fetch(feedUrl, FETCH_OPTIONS);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        
        const posts = [];
        $('entry').each((i, el) => {
            const id = $(el).find('id').text();
            const title = $(el).find('title').text();
            const author = $(el).find('author name').text();
            const permalink = $(el).find('link').attr('href');
            const updated = $(el).find('updated').text();
            
            const contentHtml = $(el).find('content').text();
            const $c = cheerio.load(contentHtml);
            
            let url = permalink; // fallback
            $c('a').each((_, a) => {
                const href = $c(a).attr('href');
                if (href && (href.match(/\.(jpg|jpeg|png|gif|mp4)$/i) || href.includes('i.redd.it') || href.includes('v.redd.it') || href.includes('imgur.com'))) {
                    url = href;
                }
            });

            posts.push({ id, title, author, permalink, url, updated, is_video: url.includes('v.redd.it') || url.includes('.mp4') });
        });
        
        posts.reverse(); // Process oldest first
        
        let newPostsCount = 0;

        for (const post of posts) {
            if (isRunningFunc && !isRunningFunc()) return;

            const postId = post.id;
            
            const alreadyProcessed = await db.isRedditPostProcessed(postId);
            if (alreadyProcessed) continue;
            
            let mediaUrl = post.url;
            if (!mediaUrl) {
                await db.markRedditPostProcessed(postId, cleanSubreddit);
                continue;
            }

            mediaUrl = mediaUrl.split('?')[0];

            if (mediaUrl.includes('imgur.com') || mediaUrl.includes('alb.reddit.com') || mediaUrl.includes('out.reddit.com')) {
                await db.markRedditPostProcessed(postId, cleanSubreddit);
                continue;
            }

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
            } else if (mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i) || mediaUrl.includes('i.redd.it')) {
                isImage = true;
            } else if (post.is_video && mediaUrl.includes('v.redd.it')) {
                isVideo = true;
                mediaUrl = post.permalink;
            }

            // Apply global skip if media doesn't fit generic filter requirements
            if (!isImage && !isVideo) {
                 await db.markRedditPostProcessed(postId, cleanSubreddit);
                 continue;
            }

            try {
                const headRes = await fetch(mediaUrl, { method: 'HEAD', ...FETCH_OPTIONS });
                if (headRes.status === 404 || headRes.status === 403 || headRes.status === 410) {
                    await db.markRedditPostProcessed(postId, cleanSubreddit);
                    continue;
                }
            } catch (headErr) {
                // Ignore HEAD fetch errors
            }

            let discordPlaybackUrl = mediaUrl;
            if (isVideo && mediaUrl.includes('v.redd.it')) {
                discordPlaybackUrl = mediaUrl.replace('v.redd.it', 'vxreddit.com');
            } else if (isVideo && mediaUrl.includes('reddit.com')) {
                discordPlaybackUrl = mediaUrl.replace('www.reddit.com', 'vxreddit.com').replace('old.reddit.com', 'vxreddit.com');
            }

            // Parallel Server Drain
            let sentToAtLeastOne = false;
            const promises = subscribers.map(async (sub) => {
                const { feedConfig, channel, guildId } = sub;
                
                if (isImage && feedConfig.mediaTypes && !feedConfig.mediaTypes.images) return;
                if (isVideo && feedConfig.mediaTypes && !feedConfig.mediaTypes.videos) return;

                try {
                    if (feedConfig.embedMode) {
                        const embed = new EmbedBuilder()
                            .setTitle((post.title || '').substring(0, 256))
                            .setURL(post.permalink || 'https://www.reddit.com')
                            .setColor(0xFF4500)
                            .setAuthor({ name: `r/${cleanSubreddit}` })
                            .setTimestamp(post.updated ? new Date(post.updated) : new Date());
                        
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
                    sentToAtLeastOne = true;
                } catch (discordErr) {
                    db.addLog('error', `[Reddit] Discord post failed: ${discordErr.message}`, guildId);
                }
            });

            await Promise.all(promises);

            await db.markRedditPostProcessed(postId, cleanSubreddit);
            await db.markFilePosted(mediaHash, mediaUrl);
            newPostsCount++;
            
            // Global 10 second delay between posts (per user request)
            if (sentToAtLeastOne) {
                await new Promise(r => setTimeout(r, 10000));
            }
        }
        
        if (newPostsCount > 0) {
            db.addLog('info', `[Reddit] Found and posted ${newPostsCount} new items from r/${cleanSubreddit}`);
        } else {
            // Uncomment to log empty polls, but it gets spammy
            // db.addLog('info', `[Reddit] No new items found in r/${cleanSubreddit}`);
        }
    } catch (feedErr) {
        throw feedErr;
    }
}

module.exports = {
    checkRedditFeed
};

# Reddit to Discord Feed Integration

## Overview
This skill provides the architecture, best practices, and implementation patterns for integrating Reddit feeds into Discord bots without triggering Reddit's bot detection or violating rate limits.

## When to Use This Skill
- Building a Discord bot that monitors and posts Reddit content
- Adding subreddit feed monitoring to existing bots
- Implementing Reddit post notifications in Discord servers
- Creating multi-subreddit aggregation features

## Core Principles

### 1. Official API Usage (CRITICAL)
**Never scrape Reddit HTML** - always use Reddit's official API with proper OAuth2 authentication.

**Why This Matters:**
- HTML scraping triggers bot detection immediately
- API usage is sanctioned and rate-limited fairly
- OAuth provides reliable, long-term access

### 2. Rate Limit Compliance
Reddit enforces strict rate limits:
- **60 requests per minute** per OAuth client
- **10 requests per second** burst limit
- **1 request per 2 seconds** recommended for safety

## Architecture Patterns

### Pattern 1: Centralized Poller (Recommended for Multiple Servers)
```
┌──────────────────┐
│   Reddit API     │
│   (OAuth2)       │
└────────┬─────────┘
         │ Poll every 5-10 min
         ▼
┌──────────────────┐
│  Poller Service  │
│  - Rate limiter  │
│  - Cache layer   │
│  - Deduplication │
└────────┬─────────┘
         │ Fan-out
         ▼
┌──────────────────┐
│  Discord API     │
│  Multiple servers│
└──────────────────┘
```

**Benefits:**
- Single rate limit pool shared across all servers
- Efficient API usage
- Centralized caching and deduplication

### Pattern 2: Per-Server Poller (Simpler for Single Server)
```
┌──────────────────┐
│   Reddit API     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Bot Instance    │
│  - Local cache   │
│  - Timer/Cron    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Single Discord  │
│  Server          │
└──────────────────┘
```

**Benefits:**
- Simpler implementation
- Good for single-server bots
- Easier debugging

## Implementation Components

### 1. Reddit API Client Setup

#### Required Credentials
1. Navigate to: `https://www.reddit.com/prefs/apps`
2. Create app (type: "script" for personal use, "web app" for hosted)
3. Obtain:
   - `client_id` (under app name)
   - `client_secret` (secret field)
   - `user_agent` (format below)

#### User-Agent Format (CRITICAL)
```
platform:app_name:version (by /u/reddit_username)
```

**Example:**
```
discord:my_feed_bot:v1.0.0 (by /u/myusername)
```

**Wrong formats that get flagged:**
- Generic: `python:requests:2.28`
- Missing username: `discord:bot:1.0`
- No version: `mybot (by /u/user)`

### 2. Core Data Structures

#### Feed Configuration
```json
{
  "guild_id": "123456789",
  "channel_id": "987654321",
  "subreddit": "python",
  "filters": {
    "min_upvotes": 10,
    "flair": ["Tutorial", "News"],
    "exclude_nsfw": true
  },
  "interval_minutes": 10,
  "last_post_id": "t3_abc123"
}
```

#### Post Cache Entry
```json
{
  "post_id": "t3_abc123",
  "subreddit": "python",
  "timestamp": 1234567890,
  "posted_to": ["channel_id_1", "channel_id_2"]
}
```

### 3. Rate Limiting Strategy

#### Token Bucket Implementation
```
Rate Limit: 60 requests/minute
Bucket Capacity: 60 tokens
Refill Rate: 1 token/second

Before each request:
1. Check if bucket has ≥1 token
2. If yes: consume 1 token, make request
3. If no: wait until token available
4. Add exponential backoff on 429 responses
```

#### Backoff Strategy
```
Initial delay: 1 second
Max delay: 300 seconds (5 minutes)
Multiplier: 2x on each 429

On 429 response:
1. Use Reddit's 'X-Ratelimit-Reset' header if available
2. Otherwise: current_delay = min(current_delay * 2, max_delay)
3. Wait current_delay seconds
4. Retry request
```

### 4. Caching and Deduplication

#### What to Cache
1. **Post IDs**: Last 1000 post IDs per subreddit (prevent duplicates)
2. **API Responses**: Subreddit listings for 2-5 minutes (reduce API calls)
3. **Posted Content**: Track which posts sent to which channels

#### Cache Storage Options
- **Redis**: Best for distributed systems, TTL support
- **SQLite**: Good for single-instance bots
- **PostgreSQL**: Production-grade, handles high volume
- **In-Memory**: Development only (lost on restart)

#### Deduplication Logic
```
For each new post from API:
1. Check if post_id in cache
2. If yes: skip (already processed)
3. If no: 
   - Add to cache
   - Check filters
   - Post to Discord
   - Update last_post_id
```

### 5. Polling Strategy

#### Recommended Intervals
- **High-activity subs** (>100 posts/day): 5 minutes
- **Medium-activity**: 10 minutes
- **Low-activity**: 15-30 minutes
- **Archive/slow subs**: 60 minutes

#### Fetching Strategy
```
For each poll cycle:
1. Fetch subreddit.new(limit=25)
2. Filter posts newer than last_post_id
3. Apply user filters (upvotes, flair, NSFW)
4. Reverse order (oldest first)
5. Post to Discord in order
6. Update last_post_id to newest post
```

## Technology Stack Recommendations

### Python Stack
```yaml
Core Library: PRAW (Python Reddit API Wrapper)
Discord: discord.py
Cache: redis-py or sqlalchemy
Scheduler: APScheduler or asyncio tasks
HTTP: requests (via PRAW)
```

**Minimal Requirements:**
```
praw>=7.7.0
discord.py>=2.0.0
redis>=4.5.0  # or sqlite3 (built-in)
python-dotenv>=1.0.0
```

### Node.js Stack
```yaml
Core Library: Snoowrap
Discord: discord.js
Cache: ioredis or better-sqlite3
Scheduler: node-cron or setInterval
HTTP: axios (via Snoowrap)
```

**Minimal Requirements:**
```
snoowrap>=1.23.0
discord.js>=14.0.0
ioredis>=5.3.0  # or better-sqlite3
dotenv>=16.0.0
```

## Code Templates

### Python Example (PRAW + discord.py)

```python
import praw
import discord
from discord.ext import tasks
import os
from datetime import datetime

# Reddit Setup
reddit = praw.Reddit(
    client_id=os.getenv('REDDIT_CLIENT_ID'),
    client_secret=os.getenv('REDDIT_CLIENT_SECRET'),
    user_agent='discord:feedbot:v1.0.0 (by /u/yourusername)'
)

# Discord Setup
intents = discord.Intents.default()
client = discord.Client(intents=intents)

# Cache (simple dict - use Redis in production)
processed_posts = set()

@tasks.loop(minutes=10)
async def check_reddit_feed():
    """Poll Reddit and post new content to Discord"""
    subreddit = reddit.subreddit('python')
    channel = client.get_channel(YOUR_CHANNEL_ID)
    
    try:
        # Fetch new posts
        for post in subreddit.new(limit=25):
            post_id = post.id
            
            # Skip if already processed
            if post_id in processed_posts:
                continue
            
            # Apply filters
            if post.score < 10:  # Min upvotes
                continue
            if post.over_18:  # NSFW filter
                continue
            
            # Create Discord embed
            embed = discord.Embed(
                title=post.title[:256],  # Discord limit
                url=f"https://reddit.com{post.permalink}",
                description=post.selftext[:4096] if post.selftext else "",
                color=0xFF4500,  # Reddit orange
                timestamp=datetime.fromtimestamp(post.created_utc)
            )
            embed.set_author(name=f"r/{post.subreddit.display_name}")
            embed.add_field(name="Upvotes", value=post.score, inline=True)
            embed.add_field(name="Comments", value=post.num_comments, inline=True)
            
            if post.url and any(post.url.endswith(ext) for ext in ['.jpg', '.png', '.gif']):
                embed.set_image(url=post.url)
            
            # Post to Discord
            await channel.send(embed=embed)
            
            # Mark as processed
            processed_posts.add(post_id)
            
            # Prevent cache bloat
            if len(processed_posts) > 1000:
                processed_posts.clear()
    
    except praw.exceptions.PRAWException as e:
        print(f"Reddit API error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

@client.event
async def on_ready():
    print(f'Bot connected as {client.user}')
    check_reddit_feed.start()

client.run(os.getenv('DISCORD_TOKEN'))
```

### Node.js Example (Snoowrap + discord.js)

```javascript
const Snoowrap = require('snoowrap');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

// Reddit Setup
const reddit = new Snoowrap({
    userAgent: 'discord:feedbot:v1.0.0 (by /u/yourusername)',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    refreshToken: process.env.REDDIT_REFRESH_TOKEN
});

// Discord Setup
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

// Cache
const processedPosts = new Set();

async function checkRedditFeed() {
    const subreddit = reddit.getSubreddit('python');
    const channel = client.channels.cache.get(process.env.CHANNEL_ID);
    
    try {
        const posts = await subreddit.getNew({ limit: 25 });
        
        for (const post of posts) {
            // Skip if already processed
            if (processedPosts.has(post.id)) continue;
            
            // Apply filters
            if (post.score < 10) continue;
            if (post.over_18) continue;
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(post.title.slice(0, 256))
                .setURL(`https://reddit.com${post.permalink}`)
                .setDescription(post.selftext.slice(0, 4096) || '')
                .setColor(0xFF4500)
                .setAuthor({ name: `r/${post.subreddit.display_name}` })
                .addFields(
                    { name: 'Upvotes', value: post.score.toString(), inline: true },
                    { name: 'Comments', value: post.num_comments.toString(), inline: true }
                )
                .setTimestamp(post.created_utc * 1000);
            
            if (post.url && /\.(jpg|png|gif)$/i.test(post.url)) {
                embed.setImage(post.url);
            }
            
            // Post to Discord
            await channel.send({ embeds: [embed] });
            
            // Mark as processed
            processedPosts.add(post.id);
            
            // Prevent memory bloat
            if (processedPosts.size > 1000) {
                processedPosts.clear();
            }
        }
    } catch (error) {
        console.error('Error fetching Reddit posts:', error);
    }
}

client.once('ready', () => {
    console.log(`Bot connected as ${client.user.tag}`);
    
    // Poll every 10 minutes
    setInterval(checkRedditFeed, 10 * 60 * 1000);
    checkRedditFeed(); // Initial check
});

client.login(process.env.DISCORD_TOKEN);
```

## Production Considerations

### 1. Error Handling

#### Reddit API Errors
- **503/504**: Reddit servers down → Retry with exponential backoff
- **429**: Rate limited → Use X-Ratelimit-Reset header
- **403**: OAuth token invalid → Refresh token
- **404**: Subreddit not found → Log and disable feed

#### Discord API Errors
- **429**: Rate limited → Use Discord's retry-after header
- **403**: Missing permissions → Check channel permissions
- **404**: Channel deleted → Remove from configuration

### 2. Monitoring and Logging

**Essential Metrics:**
- API calls per minute (should be <60)
- Posts processed per poll cycle
- Error rate (API failures)
- Cache hit rate
- Average post latency (Reddit post time → Discord post time)

**Logging Strategy:**
```
INFO:  Successful posts, poll cycles
WARN:  Rate limit approaches (>50 requests/min), API slowness
ERROR: API failures, authentication issues
DEBUG: Each API call, cache operations (dev only)
```

### 3. Scalability

#### Handling Multiple Subreddits
```
Single subreddit: 1 API call per poll
10 subreddits: 10 API calls per poll

At 10-minute intervals:
- 10 calls/10 minutes = 1 call/minute (safe)

At 5-minute intervals:
- 10 calls/5 minutes = 2 calls/minute (safe)

At 1-minute intervals:
- 10 calls/1 minute = 10 calls/minute (approaching limits)
```

#### Optimization Techniques
1. **Multireddit**: Combine subreddits into one call
   ```python
   subreddit = reddit.subreddit('python+learnpython+django')
   ```
   
2. **Batch Processing**: Group multiple channels for same subreddit

3. **Priority Queue**: Check high-activity subs more frequently

4. **Lazy Loading**: Only poll feeds when Discord channel is active

### 4. Configuration Management

#### Environment Variables (.env)
```bash
# Reddit API
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_secret
REDDIT_USER_AGENT=discord:feedbot:v1.0.0 (by /u/username)

# Discord
DISCORD_TOKEN=your_bot_token

# Redis (optional)
REDIS_URL=redis://localhost:6379/0

# Settings
POLL_INTERVAL_MINUTES=10
MAX_POSTS_PER_POLL=25
MIN_UPVOTES=10
```

#### Database Schema (PostgreSQL/SQLite)

```sql
CREATE TABLE reddit_feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    subreddit TEXT NOT NULL,
    min_upvotes INTEGER DEFAULT 0,
    exclude_nsfw BOOLEAN DEFAULT 1,
    interval_minutes INTEGER DEFAULT 10,
    last_post_id TEXT,
    last_check TIMESTAMP,
    active BOOLEAN DEFAULT 1,
    UNIQUE(channel_id, subreddit)
);

CREATE TABLE processed_posts (
    post_id TEXT PRIMARY KEY,
    subreddit TEXT NOT NULL,
    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    channel_ids TEXT  -- JSON array
);

CREATE INDEX idx_subreddit ON processed_posts(subreddit);
CREATE INDEX idx_posted_at ON processed_posts(posted_at);
```

## Testing Strategy

### Unit Tests
- Rate limiter token bucket logic
- Cache hit/miss scenarios
- Filter application (upvotes, NSFW, flair)
- Deduplication logic

### Integration Tests
- Reddit API authentication
- Successful post fetching
- Discord embed creation and sending
- Database persistence

### Mock Data
```python
# Mock Reddit post for testing
mock_post = {
    'id': 'abc123',
    'title': 'Test Post',
    'subreddit': 'python',
    'score': 100,
    'num_comments': 25,
    'created_utc': 1234567890,
    'over_18': False,
    'selftext': 'Test content',
    'url': 'https://reddit.com/r/python/comments/abc123',
    'permalink': '/r/python/comments/abc123/test_post/'
}
```

## Common Pitfalls

### ❌ Don't Do This
1. **Scraping HTML** instead of using API
2. **Polling every minute** without rate limit checks
3. **Missing User-Agent** or using generic one
4. **No caching** → duplicate posts
5. **Hardcoded credentials** in source code
6. **Ignoring 429 responses** → IP bans
7. **No error logging** → silent failures

### ✅ Do This
1. **Use official API** with proper OAuth
2. **Respect rate limits** with token bucket
3. **Proper User-Agent** with your username
4. **Cache post IDs** for deduplication
5. **Environment variables** for credentials
6. **Exponential backoff** on rate limits
7. **Comprehensive logging** with levels

## Deployment Checklist

- [ ] Reddit app registered, credentials obtained
- [ ] User-Agent string follows format: `platform:app:version (by /u/username)`
- [ ] Rate limiting implemented (60 req/min max)
- [ ] Post deduplication working (cache/database)
- [ ] Error handling for 429, 503, 403 responses
- [ ] Environment variables configured
- [ ] Logging system in place
- [ ] Discord embed tested and rendering correctly
- [ ] Poll interval appropriate for subreddit activity
- [ ] NSFW/upvote/flair filters working
- [ ] Database backups configured (if using persistence)
- [ ] Monitoring/alerts for API failures

## Resources

### Documentation
- Reddit API: https://www.reddit.com/dev/api
- PRAW (Python): https://praw.readthedocs.io
- Snoowrap (Node.js): https://not-an-aardvark.github.io/snoowrap/
- Discord.py: https://discordpy.readthedocs.io
- Discord.js: https://discord.js.org

### Rate Limit Headers
```
X-Ratelimit-Used: 45
X-Ratelimit-Remaining: 15
X-Ratelimit-Reset: 1234567890
```

### Useful Endpoints
- New posts: `/r/{subreddit}/new`
- Hot posts: `/r/{subreddit}/hot`
- Rising posts: `/r/{subreddit}/rising`
- Top posts: `/r/{subreddit}/top?t={hour|day|week|month|year|all}`

## License Compliance

Reddit API Terms: https://www.redditinc.com/policies/data-api-terms
- Must use OAuth
- Cannot circumvent rate limits
- Must respect user privacy
- Cannot create spam

Discord ToS: https://discord.com/terms
- Follow rate limits
- No spam or abuse
- Respect server rules

---

**Version:** 1.0.0  
**Last Updated:** 2024  
**Maintainer:** AI Skill Library

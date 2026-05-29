const { checkRedditFeed } = require('./bot/redditJob');
const db = require('./db/database');

// Mock configuration to avoid needing a real Discord server setup
db.getConfig = async (key) => {
    if (key === 'reddit_settings') {
        return {
            feeds: [{
                active: true,
                subreddit: 'videos', // testing with a video-heavy subreddit
                channelId: 'mock_channel_123',
                excludeNsfw: false,
                embedMode: true,
                mediaTypes: { images: true, videos: true },
                postDelay: 0.1 // very fast for testing
            }]
        };
    }
    return null;
};

// Mock the processing logic so we actually test the scraping
db.isRedditPostProcessed = async () => false;
db.markRedditPostProcessed = async () => true;

// Mock the logger to see output
db.addLog = (type, msg) => console.log(`[LOG - ${type.toUpperCase()}] ${msg}`);

// Mock Discord Client
const mockClient = {
    channels: {
        cache: {
            get: (id) => {
                if (id === 'mock_channel_123') {
                    return {
                        send: async (msg) => {
                            console.log('\n=============================================');
                            console.log('🚀 MOCK DISCORD SEND');
                            if (msg.embeds) {
                                console.log('Embed Title:', msg.embeds[0].data.title);
                                console.log('Embed URL:', msg.embeds[0].data.url);
                                if (msg.embeds[0].data.image) {
                                    console.log('Embed Image:', msg.embeds[0].data.image.url);
                                }
                            }
                            if (msg.content) {
                                console.log('Message Content:', msg.content);
                            }
                            console.log('=============================================\n');
                        }
                    };
                }
                return null;
            }
        }
    }
};

(async () => {
    console.log("Starting Reddit JSON API Test (r/videos)...");
    await checkRedditFeed(mockClient, () => true);
    console.log("Test completed successfully!");
    process.exit(0);
})();

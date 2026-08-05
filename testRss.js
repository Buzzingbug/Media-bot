const cheerio = require('cheerio');

fetch('https://www.reddit.com/r/aww/new/.rss', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
})
.then(r => r.text())
.then(xml => {
    const $ = cheerio.load(xml, { xmlMode: true });
    const posts = [];
    
    $('entry').each((i, el) => {
        const id = $(el).find('id').text();
        const content = $(el).find('content').text();
        
        // Find image link in content HTML
        const html$ = cheerio.load(content);
        const mediaUrl = html$('a').first().attr('href'); // This might just be the post link, or an image link
        
        posts.push({ id, mediaUrl });
    });
    
    console.log(posts.slice(0, 3));
});

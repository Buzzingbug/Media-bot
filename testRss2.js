const cheerio = require('cheerio');

fetch('https://www.reddit.com/r/aww/new/.rss', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
})
.then(r => r.text())
.then(xml => {
    const $ = cheerio.load(xml, { xmlMode: true });
    const content = $('entry').first().find('content').text();
    console.log(content);
});

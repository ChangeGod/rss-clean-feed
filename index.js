const fs = require('fs-extra');
const Parser = require('rss-parser');
const { XMLBuilder } = require('fast-xml-parser');
const parser = new Parser();

async function fetchAndCache(sourceUrl, cacheFile) {
  const feed = await parser.parseURL(sourceUrl);
  const existingItems = fs.existsSync(cacheFile)
    ? await parser.parseString(fs.readFileSync(cacheFile, 'utf8'))
    : { rss: { channel: { item: [] } } };

  const oldItems = existingItems.rss?.channel?.item || [];
  const oldGuids = new Set(oldItems.map(item => item.guid || item.link));

  const newItems = feed.items.filter(item => !oldGuids.has(item.guid || item.link));
  if (newItems.length === 0) {
    console.log(`ℹ️ No new items for ${cacheFile}`);
    return;
  }

  const combinedItems = [...newItems, ...oldItems].slice(0, 100);
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
  });

  const output = builder.build({
    rss: {
      '@_version': '2.0',
      channel: {
        title: `Cached Feed from ${sourceUrl}`,
        link: sourceUrl,
        description: 'FIFO cached RSS feed',
        item: combinedItems,
      },
    },
  });

  fs.writeFileSync(cacheFile, output, 'utf8');
  console.log(`✅ Updated ${cacheFile} with ${newItems.length} new items`);
}

(async () => {
  const urlDir = './url';
  const files = fs.readdirSync(urlDir).filter(f => f.startsWith('source_') && f.endsWith('.txt'));

  for (const file of files) {
    const sourceUrl = fs.readFileSync(`${urlDir}/${file}`, 'utf8').trim();
    const number = file.match(/\d+/)?.[0] || '1';
    const cacheFile = `cacheluu_${number}.xml`;

    try {
      await fetchAndCache(sourceUrl, cacheFile);
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }
})();

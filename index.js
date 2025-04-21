import fs from 'fs-extra';
import Parser from 'rss-parser';
import { XMLBuilder } from 'fast-xml-parser';

const parser = new Parser();

async function fetchAndCache(sourceUrl, cacheFile) {
  const feed = await parser.parseURL(sourceUrl);
  const existingContent = await fs.pathExists(cacheFile)
    ? await parser.parseString(await fs.readFile(cacheFile, 'utf8'))
    : { rss: { channel: { item: [] } } };

  const oldItems = existingContent.rss?.channel?.item || [];
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
        '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/', // 👈 thêm dòng này
        link: sourceUrl,
        description: 'FIFO cached RSS feed',
        item: combinedItems,
      },
    },
  });

  await fs.writeFile(cacheFile, output, 'utf8');
  console.log(`✅ Updated ${cacheFile} with ${newItems.length} new items`);
}

const urlDir = './url';
const files = await fs.readdir(urlDir);
for (const file of files.filter(f => f.startsWith('source_') && f.endsWith('.txt'))) {
  const sourceUrl = (await fs.readFile(`${urlDir}/${file}`, 'utf8')).trim();
  const number = file.match(/\d+/)?.[0] || '1';
  const cacheFile = `cacheluu_${number}.xml`;

  try {
    await fetchAndCache(sourceUrl, cacheFile);
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err.message);
  }
}

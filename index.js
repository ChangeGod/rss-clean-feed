import fs from 'fs-extra';
import Parser from 'rss-parser';
import { XMLBuilder } from 'fast-xml-parser';

const parser = new Parser();

async function fetchAndCache(sourceUrl, cacheFile) {
  const feed = await parser.parseURL(sourceUrl);
  const hasCache = await fs.pathExists(cacheFile);
  const cacheContent = hasCache ? await fs.readFile(cacheFile, 'utf8') : null;
  const existingItems = hasCache ? await parser.parseString(cacheContent) : { rss: { channel: { item: [] } } };

  const oldItems = existingItems.rss?.channel?.item || [];
  const oldGuids = new Set(oldItems.map(item => item.guid || item.link));
  const newItems = feed.items.filter(item => !oldGuids.has(item.guid || item.link));

  if (newItems.length === 0) {
    console.log(`ℹ️ No new items for ${cacheFile}`);
    return;
  }

  const combinedItems = [...newItems, ...oldItems].slice(0, 100);

  // 📦 Ghi XML RSS
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
  });

  const rssOutput = builder.build({
    rss: {
      '@_version': '2.0',
      '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      channel: {
        title: `Cached Feed from ${sourceUrl}`,
        link: sourceUrl,
        description: 'FIFO cached RSS feed',
        item: combinedItems,
      },
    },
  });

  await fs.writeFile(cacheFile, rssOutput, 'utf8');
  console.log(`✅ Updated ${cacheFile} with ${newItems.length} new items`);

  // 📄 Tạo HTML để đọc
  const htmlOutput = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RSS View - ${sourceUrl}</title>
  <style>
    body { font-family: sans-serif; padding: 2em; background: #f9f9f9; }
    h1 { font-size: 1.5em; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5em 0; padding: 0.5em; background: white; border: 1px solid #ccc; border-radius: 8px; }
    a { text-decoration: none; color: #3366cc; }
    time { font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <h1>RSS Feed from ${sourceUrl}</h1>
  <ul>
    ${combinedItems.map(item => `
      <li>
        <a href="${item.link}" target="_blank">${item.title}</a><br/>
        <time>${item.pubDate || ''}</time>
      </li>
    `).join('')}
  </ul>
</body>
</html>
`;

  await fs.writeFile(cacheFile.replace('.xml', '.html'), htmlOutput, 'utf8');
}

async function run() {
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
}

run();

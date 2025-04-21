import fs from 'fs-extra';
import Parser from 'rss-parser';
import { XMLBuilder } from 'fast-xml-parser';

const parser = new Parser();

async function fetchAndCache(sourceUrl, cacheFile) {
  try {
    // Fetch the source feed
    const feed = await parser.parseURL(sourceUrl);
    const hasCache = await fs.pathExists(cacheFile);
    const cacheContent = hasCache ? await fs.readFile(cacheFile, 'utf8') : null;
    const existingItems = hasCache ? await parser.parseString(cacheContent) : { items: [] };

    const oldItems = existingItems.items || [];
    const oldGuids = new Set(oldItems.map(item => item.guid || item.link));
    const newItems = feed.items.filter(item => !oldGuids.has(item.guid || item.link));

    if (newItems.length === 0) {
      console.log(`ℹ️ No new items for ${cacheFile}`);
      return;
    }

    // Combine and sort items by pubDate (newest first)
    const combinedItems = [...newItems, ...oldItems]
      .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
      .slice(0, 100); // Keep only the top 100 items (FIFO)

    // Build RSS XML
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

    // Generate HTML for viewing
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
    ${combinedItems
      .map(
        item => `
      <li>
        <a href="${item.link}" target="_blank">${item.title}</a><br/>
        <time>${item.pubDate || ''}</time>
      </li>
    `
      )
      .join('')}
  </ul>
</body>
</html>
`;

    await fs.writeFile(cacheFile.replace('.xml', '.html'), htmlOutput, 'utf8');
  } catch (err) {
    console.error(`❌ Error processing ${sourceUrl}:`, err.message);
  }
}

async function run() {
  const urlDir = './url';
  await fs.ensureDir(urlDir);
  await fs.ensureDir('./output'); // Create output directory for cache files

  const files = await fs.readdir(urlDir);
  const tasks = files
    .filter(f => f.startsWith('source_') && f.endsWith('.txt'))
    .map(async file => {
      const sourceUrl = (await fs.readFile(`${urlDir}/${file}`, 'utf8')).trim();
      const number = file.match(/\d+/)?.[0] || '1';
      const cacheFile = `./output/cacheluu_${number}.xml`;

      await fetchAndCache(sourceUrl, cacheFile);
    });

  await Promise.all(tasks); // Run tasks in parallel
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

import fs from 'fs-extra';
import Parser from 'rss-parser';
import { XMLBuilder } from 'fast-xml-parser';
import fetch from 'node-fetch';

const parser = new Parser();

async function fetchAndCache(sourceUrl, cacheFile, htmlFile, remoteCacheUrl) {
  try {
    // Fetch the source feed
    const feed = await parser.parseURL(sourceUrl);

    // Standardize pubDate to GMT for new items
    const newItemsWithGMT = feed.items.map(item => ({
      ...item,
      pubDate: item.pubDate ? new Date(item.pubDate).toUTCString() : item.pubDate,
    }));

    // Fetch the remote cache XML
    let existingItems = { rss: { channel: { item: [] } } };
    try {
      const response = await fetch(remoteCacheUrl);
      if (response.ok) {
        const cacheContent = await response.text();
        existingItems = await parser.parseString(cacheContent);
      } else {
        console.log(`ℹ️ Remote cache ${remoteCacheUrl} not found, starting fresh`);
      }
    } catch (err) {
      console.log(`ℹ️ Error fetching remote cache ${remoteCacheUrl}: ${err.message}, starting fresh`);
    }

    // Extract existing items and their GUIDs/links
    const oldItems = existingItems.rss?.channel?.item || [];
    const oldGuids = new Set(oldItems.map(item => item.guid || item.link));

    // Filter out new items that aren't already in the cache
    const newItems = newItemsWithGMT.filter(item => !oldGuids.has(item.guid || item.link));

    if (newItems.length === 0) {
      console.log(`ℹ️ No new items for ${cacheFile}`);
      return;
    }

    // Combine items and sort by pubDate (newest first)
    const combinedItems = [...newItems, ...oldItems]
      .sort((a, b) => {
        const dateA = a.pubDate ? new Date(a.pubDate) : new Date(0);
        const dateB = b.pubDate ? new Date(b.pubDate) : new Date(0);
        return dateB - dateA; // Descending order
      })
      .slice(0, 100); // Limit to 100 items (FIFO)

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

    // Write RSS to cache file
    await fs.outputFile(cacheFile, rssOutput, 'utf8');
    console.log(`✅ Updated ${cacheFile} with ${newItems.length} new items`);

    // Generate HTML output
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

    // Write HTML to file
    await fs.outputFile(htmlFile, htmlOutput, 'utf8');
    console.log(`✅ Generated ${htmlFile}`);
  } catch (err) {
    console.error(`❌ Error processing ${sourceUrl}:`, err.message);
  }
}

async function run() {
  // Ensure directories exist
  await fs.ensureDir('./url');
  await fs.ensureDir('./public');

  // Read source files
  const urlDir = './url';
  const files = await fs.readdir(urlDir);

  // Process each source file
  for (const file of files.filter(f => f.startsWith('source_') && f.endsWith('.txt'))) {
    const sourceUrl = (await fs.readFile(`${urlDir}/${file}`, 'utf8')).trim();
    const number = file.match(/\d+/)?.[0] || '1';
    const cacheFile = `./public/cacheluu_${number}.xml`;
    const htmlFile = `./public/cacheluu_${number}.html`;
    const remoteCacheUrl = `https://changegod.github.io/rss-clean-feed/cacheluu_${number}.xml`;

    await fetchAndCache(sourceUrl, cacheFile, htmlFile, remoteCacheUrl);
  }
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

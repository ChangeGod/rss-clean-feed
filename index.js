
// index.js
import fs from 'fs';
import Parser from 'rss-parser';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const parser = new Parser();
const xmlParser = new XMLParser({ ignoreAttributes: false });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false });

const SOURCES = [1, 2, 3];

async function readFeedUrls(sourceIndex) {
  const content = fs.readFileSync(`feeds/source_${sourceIndex}.txt`, 'utf-8');
  return content.split('\n').filter(Boolean);
}

async function fetchFeeds(urls) {
  let items = [];
  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      if (feed.items?.length) {
        items.push(...feed.items);
      }
    } catch (e) {
      console.error(`Failed to fetch ${url}:`, e.message);
    }
  }
  return items;
}

function loadCacheI(index) {
  const path = `cacheluu_I_${index}.xml`;
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, 'utf-8');
  const parsed = xmlParser.parse(raw);
  return parsed.rss?.channel?.item || [];
}

function saveCacheI(index, items) {
  const channel = {
    title: `Cache I ${index}`,
    link: `https://example.com/cacheluu_I_${index}.xml`,
    description: `FIFO cache for source_${index}`,
    item: items
  };
  const rss = xmlBuilder.build({ rss: { channel } });
  fs.writeFileSync(`cacheluu_I_${index}.xml`, rss);
}

function saveCacheII(index, items) {
  const channel = {
    title: `Cache II ${index}`,
    link: `https://example.com/cacheluu_II_${index}.xml`,
    description: `Merged cache for source_${index}`,
    item: items
  };
  const rss = xmlBuilder.build({ rss: { channel } });
  fs.writeFileSync(`cacheluu_II_${index}.xml`, rss);
}

function dedupItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item.guid || item.link || item.title;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sortItemsByDate(items) {
  return items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
}

async function processSource(index) {
  const urls = await readFeedUrls(index);
  const feedItems = await fetchFeeds(urls);

  const cacheI = loadCacheI(index);
  const feedLinks = new Set(feedItems.map(i => i.link));

  // Step 1: Create cache I: keep 100 newest, remove items that are currently in source feed
  let newCacheI = [...cacheI, ...feedItems.filter(i => !feedLinks.has(i.link))];
  newCacheI = dedupItems(newCacheI);
  newCacheI = sortItemsByDate(newCacheI).slice(0, 100);
  saveCacheI(index, newCacheI);

  // Step 2: Merge cache I with current feed into cache II
  let merged = dedupItems([...feedItems, ...newCacheI]);
  merged = sortItemsByDate(merged);
  saveCacheII(index, merged);
}

(async () => {
  for (const i of SOURCES) {
    await processSource(i);
  }
})();

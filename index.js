import fs from 'fs-extra';
import Parser from 'rss-parser';
import { XMLBuilder } from 'fast-xml-parser';

// ------------------------------------------------------------
// ⚙️  Configuration
// ------------------------------------------------------------
const REMOTE_BASE = 'https://changegod.github.io/Website-Widget/vungdem';
const URL_DIR = './url';          // folder chứa các file source_*.txt
const MAX_ITEMS = 100;            // số item tối đa lưu lại trong cache FIFO

const parser = new Parser();

/* -----------------------------------------------------------
 * 🛰️ Lấy nội dung cache XML từ GitHub Pages (nếu có)
 * Trả về null nếu 404 hoặc gặp lỗi mạng
 * ---------------------------------------------------------*/
async function fetchRemoteCache(cacheFile) {
  const remoteUrl = `${REMOTE_BASE}/${cacheFile}`;
  try {
    const res = await fetch(remoteUrl, { redirect: 'follow' });
    if (res.ok) {
      return await res.text();
    }
    if (res.status === 404) {
      console.log(`ℹ️ Remote cache not found (404): ${remoteUrl}`);
      return null;
    }
    console.warn(`⚠️ Remote cache ${remoteUrl} responded ${res.status}`);
  } catch (err) {
    console.warn(`⚠️ Could not fetch remote cache ${remoteUrl}:`, err.message);
  }
  return null;
}

/* -----------------------------------------------------------
 * 📦 Ghi RSS và HTML ra ổ đĩa
 * ---------------------------------------------------------*/
async function writeOutputs(sourceUrl, cacheFile, combinedItems) {
  // 1️⃣ Ghi file RSS XML
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });

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
  console.log(`✅ Saved RSS → ${cacheFile}`);

  // 2️⃣ Ghi file HTML đơn giản để xem nhanh
  const htmlOutput = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>RSS View - ${sourceUrl}</title>
  <style>
    body { font-family: sans-serif; padding: 2em; background: #f9f9f9; }
    h1   { font-size: 1.4em; }
    ul   { list-style: none; padding: 0; }
    li   { margin: 0.5em 0; padding: 0.6em; background: #fff; border: 1px solid #ccc; border-radius: 8px; }
    a    { text-decoration: none; color: #3366cc; }
    time { font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <h1>RSS Feed from ${sourceUrl}</h1>
  <ul>
    ${combinedItems
      .map(
        (item) => `<li><a href="${item.link}" target="_blank">${item.title}</a><br/><time>${
          item.pubDate || ''
        }</time></li>`
      )
      .join('\n    ')}
  </ul>
</body>
</html>`;

  await fs.writeFile(cacheFile.replace('.xml', '.html'), htmlOutput, 'utf8');
  console.log(`✅ Saved HTML → ${cacheFile.replace('.xml', '.html')}`);
}

/* -----------------------------------------------------------
 * 🏗️ Hàm chính xử lý từng nguồn feed
 * ---------------------------------------------------------*/
async function fetchAndCache(sourceUrl, cacheFile) {
  // 1️⃣ Phân tích RSS gốc
  const feed = await parser.parseURL(sourceUrl);

  // 2️⃣ Lấy cache hiện có (ưu tiên remote → local)
  const remoteCacheContent = await fetchRemoteCache(cacheFile);
  let cacheContent = remoteCacheContent;

  if (!cacheContent && (await fs.pathExists(cacheFile))) {
    cacheContent = await fs.readFile(cacheFile, 'utf8');
  }

  const existingItemsObj = cacheContent
    ? await parser.parseString(cacheContent)
    : { rss: { channel: { item: [] } } };

  const oldItems = existingItemsObj.rss?.channel?.item || [];
  const oldGuids = new Set(oldItems.map((item) => item.guid || item.link));

  // 3️⃣ Lọc item mới
  const newItems = feed.items.filter((item) => !oldGuids.has(item.guid || item.link));
  if (newItems.length === 0) {
    console.log(`ℹ️ No new items for ${cacheFile}`);
    return;
  }

  // 4️⃣ Kết hợp & cắt bớt về ${MAX_ITEMS}
  const combinedItems = [...newItems, ...oldItems].slice(0, MAX_ITEMS);

  // 5️⃣ Ghi output
  await writeOutputs(sourceUrl, cacheFile, combinedItems);
  console.log(`✅ Updated ${cacheFile} with ${newItems.length} new items\n`);
}

/* -----------------------------------------------------------
 * 🚀 Chạy cho toàn bộ source_*.txt trong thư mục ./url
 * ---------------------------------------------------------*/
async function run() {
  const files = await fs.readdir(URL_DIR);

  for (const file of files.filter((f) => f.startsWith('source_') && f.endsWith('.txt'))) {
    const sourceUrl = (await fs.readFile(`${URL_DIR}/${file}`, 'utf8')).trim();
    const number = file.match(/\d+/)?.[0] || '1';
    const cacheFile = `cacheluu_${number}.xml`;

    try {
      await fetchAndCache(sourceUrl, cacheFile);
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }
}

// ----------------------------------------------------------------
// 🏁 Khởi chạy
// ----------------------------------------------------------------
run();

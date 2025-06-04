import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import csv from 'csv-parser';
import ExcelJS from 'exceljs';
import type { Page, Browser } from 'puppeteer';
import { group } from 'console';
import path from 'path';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { exec } from 'child_process';
import readline from 'readline';
dayjs.extend(customParseFormat);
import * as os from 'os';


puppeteer.use(StealthPlugin());

async function randomDelay(min = 1500, max = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}


async function analyzePage(page: Page, url: string, onProgress?: (msg: string) => void) {
    console.log(`🔍 Analyzing: ${url}`);
    try {
        let aboutUrl = url.endsWith('/about') ? url : `${url.replace(/\/$/, '')}/about`;


        await page.goto(aboutUrl, { waitUntil: 'networkidle0', timeout: 100000 });
        

        // Try to close login dialog if it appears
        try {
            const closeButtonSelector = 'div[role="dialog"] div[aria-label="Close"]';
            await page.waitForSelector(closeButtonSelector, { timeout: 5000 });
            await page.click(closeButtonSelector);
        } catch (e) {
            // Dialog didn't appear, ignore
        }

        await randomDelay();


// ========== Extract Group Name ==========

let groupName: string = 'N/A';

try {
  if (!page || page.isClosed()) {
    throw new Error('Page is not available or has been closed.');
  }

  // A list of known non-group headings to ignore
  const invalidNames = ['chats', 'notifications', 'calls', 'photos', 'videos', 'media', 'links', 'files'];

  // Evaluate and filter group name
  groupName = await page.$$eval('h1.html-h1', els => {
    return els
      .map(el => el.textContent?.trim() || '')                  // Trim text content
      .find(text => text && !['chats', 'notifications', 'calls', 'photos', 'videos', 'media', 'links', 'files']
        .includes(text.toLowerCase())) || 'N/A';                // Find first valid name or fallback
  });

  // Optional: You can log when fallback is used
  if (groupName === 'N/A') {
    console.warn(`⚠️ No valid group name found on: ${page.url()}`);
  }

} catch (error: any) {
  console.error(`❌ Failed to extract group name from ${page?.url?.() || 'unknown URL'}:`, error.message || error);
  groupName = 'N/A';
}



        // ========== Classification ==========
        let classification = 'N/A';
        try {
            await page.waitForSelector('body');
            classification = await page.evaluate(() => {
                const xpath = "//*[contains(text(), 'Public group') or contains(text(), 'Private group')]";
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const node = result.singleNodeValue;
                return node?.textContent?.trim() || 'N/A';
            });
        } catch {
            console.warn(`⚠️ Classification not found for: ${url}`);
        }

 // Declare global variable at the top of your file or outer scope
let growthPercent: number | null = null;

// ========== Member Count ==========
let memberCount: number | null = null;
try {
  await page.waitForSelector('body');
  memberCount = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('div, span, li'));
    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      if (/total members/i.test(text)) {
        const match = text.match(/([\d,]+)\s+total members/i);
        if (match) {
          return parseInt(match[1].replace(/,/g, ''), 10);
        }
      }
    }
    return null;
  });
} catch {
  console.warn(`⚠️ Member count not found for: ${url}`);
}

let newMembersThisWeek: number | null = null;
try {
  await page.waitForSelector('body');

  newMembersThisWeek = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('div.xu06os2.x1ok221b'));
    for (const container of containers) {
      const spans = container.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim() ?? '';
        if (/^\+\s?[\d,]+\s+in the last week$/i.test(text)) {
          const match = text.match(/[\d,]+/);
          if (match) {
            return parseInt(match[0].replace(/,/g, ''), 10);
          }
        }
      }
    }
    return null;
  });
} catch (error) {
  console.warn('⚠️ Unable to extract new members count:', error);
}

// Calculate growth percentage safely and assign global variable
if (
  memberCount !== null &&
  newMembersThisWeek !== null &&
  memberCount > newMembersThisWeek &&
  newMembersThisWeek > 0
) {
  const baseMembers = memberCount - newMembersThisWeek;
  growthPercent = (newMembersThisWeek / baseMembers) * 100;
} else {
  growthPercent = null;
}





        // ========== Posts in Last Month ==========
        let postsLastMonth: number | null = 0;
        try {
            await page.waitForSelector('body');
            postsLastMonth = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('div, span, li'));
                for (const el of elements) {
                    const text = el.textContent?.trim() || '';
                    if (/in the last month/i.test(text)) {
                        const match = text.match(/([\d,]+)\s+in the last month/i);
                        if (match) {
                            return parseInt(match[1].replace(/,/g, ''), 10);
                        }
                    }
                }
                return null;
            });
        } catch {
            console.warn(`⚠️ Could not find post count in the last month for: ${url}`);
        }

        // ========== Group Location & Creation Date ==========
        let groupLocation: string | null = "\u200B"; // Invisible character
        let groupCreationDate: string | null = "\u200B"; // Invisible character
        try {
            await page.waitForSelector('body');
            const groupInfo = await page.evaluate(() => {
          const data = {
              location: null as unknown as string | "\u200B", // Invisible character
              createdOn: null as string | null,
              nameChangedOn: null as string | null,
          };
          const elements = Array.from(document.querySelectorAll('div, span, li'));
          for (const el of elements) {
              const text = el.textContent?.trim() || '';
              if (/group created on/i.test(text)) {
            const match = text.match(/Group created on (.+?)(?:\.|$)/i);
            if (match) data.createdOn = match[1];
              }
              if (/^[A-Z][a-z]+(?:,?\s+[A-Z][a-z]+)*$/.test(text) && /philippines/i.test(text)) {
            data.location = text;
              }
          }
          return data;
            });
            groupLocation = groupInfo.location || "\u200B"; // Invisible character if empty
            groupCreationDate = groupInfo.createdOn || "\u200B"; // Invisible character if empty
        } catch {
            console.warn(`⚠️ Could not extract group location or history for: ${url}`);
        }

        // ========== Email Extraction ==========
        let email = '';
        try {
            const pageText = await page.evaluate(() => (document.body as HTMLElement).innerText);
            const emailMatch = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            email = emailMatch ? emailMatch[0] : '';
        } catch {
            email = '';
        }

        // ========== Username ==========
        let username = '';
        try {
            const pageUrl = page.url();
            const urlMatch = pageUrl.match(/facebook\.com\/([^/?&]+)/i);
            if (urlMatch && urlMatch[1]) {
                username = urlMatch[1];
            } else {
                const html = await page.content();
                const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.facebook\.com\/([^/?&"]+)/);
                if (canonicalMatch && canonicalMatch[1]) {
                    username = canonicalMatch[1];
                }
            }
            username = username.replace(/\/$/, '');
        } catch {
            console.warn('⚠️ Could not extract real username');
        }

        // ========== Contact Number ==========
        let contactNumber = 'N/A';
        try {
            const pageText = await page.evaluate(() => (document.body as HTMLElement).innerText);
            const phoneMatch = pageText.match(/(\+?\d{1,3}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);
            contactNumber = phoneMatch ? phoneMatch[0].trim() : 'N/A';
        } catch {
            console.warn(`⚠️ Contact number not found for: ${url}`);
        }




        
// ========== Total Reactions and Comments in Last 20 Posts ==========
let totalReactionsLast20Posts = 0;
let totalCommentsLast20Posts = 0;

const reactionCounts: number[] = [];
const commentCounts: number[] = [];
const postDates: string[] = [];
      let averageReactions = 0;
      let averageComments = 0;

try {
  const postsSelector = 'div[role="feed"] > div';
  const sanitizedUrl = url.replace(/\/about\/?$/, '');
  await page.goto(sanitizedUrl, { waitUntil: 'networkidle0', timeout: 200000 });
  await randomDelay();

  let postsLoaded = 0;
  while (postsLoaded < 27) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await randomDelay();
    postsLoaded = await page.evaluate(selector => document.querySelectorAll(selector).length, postsSelector);
  }

  const postElements = await page.$$(postsSelector);
  const first20Posts = postElements.slice(1, 22);

  const safeFolderName = url.replace(/https?:\/\//, '').replace(/[\/:?&=]+/g, '_');
  const screenshotDir = path.join('screenshots', safeFolderName);
  fs.mkdirSync(screenshotDir, { recursive: true });

for (let i = 1; i < first20Posts.length; i++) {  // Start from second post (index 1)
  const post = first20Posts[i];
  const adjustedIndex = i; // post 2 becomes Post 1, post 3 becomes Post 2, etc.

  const screenshotPath = path.join(screenshotDir, `post_${adjustedIndex}.png`);
  await post.screenshot({ path: screenshotPath });

  const { reactionCount, commentCount, postDate } = await post.evaluate(postEl => {
    const reactionSpan = postEl.querySelector('span.xt0b8zv.x1e558r4');
    const reactionText = reactionSpan?.textContent?.replace(/,/g, '') || '0';
    const reactionCount = parseInt(reactionText, 10);

    // Improved comment extraction
    let commentCount = 0;
    const commentEl = Array.from(postEl.querySelectorAll('a, span'))
      .find(el => /comment/i.test(el.textContent || '') && /\d/.test(el.textContent || ''));
    if (commentEl) {
      const commentText = commentEl.textContent?.replace(/[^\d]/g, '') || '0';
      const parsed = parseInt(commentText, 10);
      // Sanity check: ignore absurdly large numbers
      commentCount = (parsed > 0 && parsed < 1_000_000) ? parsed : 0;
    }

    let postDate = 'Unknown';
    const allElements = Array.from(postEl.querySelectorAll('*'));

    const timestampRegexes = [
      /^[0-9]+[smhdw]$/,                             // e.g., 3m, 1h, 4d
      /^Yesterday at [0-9]{1,2}:[0-9]{2} ?[AP]M$/i,  // e.g., Yesterday at 9:30 PM
      /^[A-Z][a-z]{2,8} \d{1,2} at \d{1,2}:\d{2} ?[AP]M$/i, // e.g., May 17 at 6:25 PM
    ];

    const match = allElements.find(el =>
      timestampRegexes.some(re => re.test(el.textContent?.trim() || ''))
    );

    if (match) {
      postDate = match.textContent?.trim() || 'Unknown';
    }

    return {
      reactionCount: isNaN(reactionCount) ? 0 : reactionCount,
      commentCount,
      postDate,
    };
  });

  const formattedDate = cleanAndConvertDate(postDate);

  reactionCounts.push(reactionCount);
  commentCounts.push(commentCount);
  postDates.push(formattedDate);

  totalReactionsLast20Posts += reactionCount;
  totalCommentsLast20Posts += commentCount;

  console.log(`📸 Post ${adjustedIndex}: ${reactionCount} 👍 | ${commentCount} 💬 | 🗓️ ${formattedDate}`);
}

const numberOfPosts = 20;

averageReactions = totalReactionsLast20Posts / numberOfPosts;
averageComments = totalCommentsLast20Posts / numberOfPosts;

console.log(`✅ TOTAL (20 posts): Reactions = ${totalReactionsLast20Posts}, Comments = ${totalCommentsLast20Posts}`);
console.log(`📊 AVERAGE per post: Reactions = ${averageReactions.toFixed(2)}, Comments = ${averageComments.toFixed(2)}`);


} catch (e) {

}




        console.log(`✅ Done analyzing: ${url}`);
        
const data: any = {
  LINK: url,
  USERNAME: username,
  GROUP_NAME: groupName,
  MEMBER: memberCount,
  NEW_MEMBER: newMembersThisWeek,
  MEMBER_GROWTH: growthPercent,
  CLASSIFICATION: classification,
  POST_LAST_MONTH: postsLastMonth,
  LOCATION: groupLocation,
  DATE_JOINED: groupCreationDate,
  EMAIL_URL: email,
  CONTACT_NUMBER: contactNumber,
  TOTAL_REACTIONS_20_POSTS: totalReactionsLast20Posts,
  TOTAL_COMMENTS_20_POSTS: totalCommentsLast20Posts,
  AVERAGE_REACTIONS: averageReactions, 
  AVERAGE_COMMENTS: averageComments,
  POST_REACTIONS: reactionCounts,
  POST_COMMENTS: commentCounts,
  POST_DATE: postDates
};
// Add POST_1 to POST_20 with separate fields: date, reactions, comments
for (let i = 0; i < 20; i++) {
  const postNumber = i + 1;
  data[`POST_${postNumber}_reaction`] = reactionCounts[i] || 0;
  data[`POST_${postNumber}_comment`] = commentCounts[i] || 0;
  data[`POST_${postNumber}_date`] = postDates[i] || 'N/A';
}

data.PAGE_ACTIVITY = 'N/A'; // Default value
return data;
        

    } catch (err) {
        console.error(`❌ Failed to analyze ${url}:`, err);
        return {
            LINK: url,
            PAGE_NAME: 'Error',
            FOLLOWERS: 'Error',
            PAGEDETAILS: 'Error',
            LAST_POSTED: 'Error',
            PAGE_STATUS: 'Error'
        };
    }
}
function cleanAndConvertDate(rawText: string): string {
  if (!rawText || rawText === 'Unknown') return 'Unknown';

  // Remove labels like "Admin ·", "Top Contributor ·", etc.
  const parts = rawText.split('·').map(p => p.trim());
  const dateCandidate = parts.find(p =>
    /(\d{1,2}[:.]\d{2})|([A-Za-z]+\s\d{1,2})|(Yesterday|Today|Just now|\d+[mdhw])|\d{4}/.test(p)
  ) || rawText;

  const now = dayjs();

  // 1. Handle relative formats
  if (/^\d+[mdhw]$/.test(dateCandidate)) {
    const amount = parseInt(dateCandidate);
    if (dateCandidate.endsWith('m')) return now.subtract(amount, 'minute').format('YYYY-MM-DD HH:mm');
    if (dateCandidate.endsWith('h')) return now.subtract(amount, 'hour').format('YYYY-MM-DD HH:mm');
    if (dateCandidate.endsWith('d')) return now.subtract(amount, 'day').format('YYYY-MM-DD HH:mm');
    if (dateCandidate.endsWith('w')) return now.subtract(amount * 7, 'day').format('YYYY-MM-DD HH:mm');
  }

  // 2. Handle "Just now"
  if (/Just now/i.test(dateCandidate)) {
    return now.format('YYYY-MM-DD HH:mm');
  }

  // 3. Handle "Today at 9:30 PM"
  if (/^Today at/.test(dateCandidate)) {
    const time = dateCandidate.replace('Today at', '').trim();
    const dt = dayjs(`${now.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD h:mm A');
    return dt.isValid() ? dt.format('YYYY-MM-DD HH:mm') : 'Unknown';
  }

  // 4. Handle "Yesterday at 9:30 PM"
  if (/^Yesterday at/.test(dateCandidate)) {
    const time = dateCandidate.replace('Yesterday at', '').trim();
    const dt = dayjs(`${now.subtract(1, 'day').format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD h:mm A');
    return dt.isValid() ? dt.format('YYYY-MM-DD HH:mm') : 'Unknown';
  }

  // 5. Handle "May 17 at 6:30 PM" or "17 May at 6:30 PM"
  if (/^[A-Za-z]+ \d{1,2} at/.test(dateCandidate)) {
    const dt = dayjs(dateCandidate, 'MMMM D [at] h:mm A');
    if (dt.isValid()) return dt.format('YYYY-MM-DD HH:mm');
  }
  if (/^\d{1,2} [A-Za-z]+ at/.test(dateCandidate)) {
    const dt = dayjs(dateCandidate, 'D MMMM [at] h:mm A');
    if (dt.isValid()) return dt.format('YYYY-MM-DD HH:mm');
  }

  // 6. Handle "April 2024"
  if (/^[A-Za-z]+ \d{4}$/.test(dateCandidate)) {
    const dt = dayjs(dateCandidate, 'MMMM YYYY');
    if (dt.isValid()) return dt.format('YYYY-MM');
  }

  // 7. Handle year only
  if (/^\d{4}$/.test(dateCandidate)) {
    return dateCandidate;
  }

  return dateCandidate || 'Unknown';
}


function isPostRecent(postsLastMonth: number): boolean {
    if (postsLastMonth === 0) {
        return false; // No posts, group is not active
    }
    return true; // Posts present, group is active
}

function formatNumber(value: any): string | number {
  if (typeof value === 'number') {
    if (!isFinite(value)) return value.toString();
    if (value > 1e6) return value.toExponential(2); // e.g., 1.23e+8
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return value;
}

export async function runScraper(links: string[], inputFileName: string, onProgress?: (msg: string) => void) {
  const downloadsFolder = path.join(os.homedir(), 'Downloads');
  const outputDir = path.join(downloadsFolder, 'output');
  const screenshotsDir = path.join(downloadsFolder, 'screenshots');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    onProgress?.(`[${dayjs().format('HH:mm:ss')}] Output folder created at: ${outputDir}`);
  } else {
    onProgress?.(`[${dayjs().format('HH:mm:ss')}] Output folder already exists at: ${outputDir}`);
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    onProgress?.(`[${dayjs().format('HH:mm:ss')}] Screenshots folder created at: ${screenshotsDir}`);
  } else {
    onProgress?.(`[${dayjs().format('HH:mm:ss')}] Screenshots folder already exists at: ${screenshotsDir}`);
  }

  const browser: Browser = await puppeteer.launch({
    headless: false,
    userDataDir: './facebook-profile',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=800,1200',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setJavaScriptEnabled(true);
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  onProgress?.(`[${dayjs().format('HH:mm:ss')}] Starting analysis on all pages...`);
  const results: any[] = [];
  const failedLinks: string[] = [];

  for (const [index, link] of links.entries()) {
    onProgress?.(`[${dayjs().format('HH:mm:ss')}] Processing ${index + 1}/${links.length}: ${link}`);
    try {
      const data = await analyzePage(page, link, onProgress); // Pass onProgress to analyzePage
      results.push(data);

      if (data.PAGE_NAME === 'Error') {
        onProgress?.(`[${dayjs().format('HH:mm:ss')}] Error scraping: ${link}`);
        failedLinks.push(link);
      } else {
        onProgress?.(`[${dayjs().format('HH:mm:ss')}] Success: Scraped "${data.GROUP_NAME}" \n`);
      }
    } catch (error) {
      onProgress?.(`[${dayjs().format('HH:mm:ss')}] ❌ Failed to process ${link}: ${error}`);
      failedLinks.push(link);
    }
  }

  await browser.close();
  console.log('🛑 Browser closed.');

  // Step 3: Export to Excel
  console.log('📊 Exporting data to Excel...');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Facebook Groups');

  // Define columns
  const baseColumns = [
    { header: 'GROUP NAME', key: 'GROUP_NAME', width: 40 },
    { header: 'LINK', key: 'LINK', width: 50 },
    { header: 'TOTAL MEMBERS', key: 'MEMBER', width: 20 },
    { header: 'NEW MEMBER (IN THE LAST WEEK)', key: 'NEW_MEMBER', width: 20 },
    { header: 'GROWTH (IN THE LAST WEEK)', key: 'MEMBER_GROWTH', width: 20 },
    { header: 'CLASSIFICATION', key: 'CLASSIFICATION', width: 30 },
    { header: 'LOCATION', key: 'LOCATION', width: 40 },
    { header: 'DATE JOINED', key: 'DATE_JOINED', width: 40 },
    { header: 'POST LAST MONTH', key: 'POST_LAST_MONTH', width: 25 },
    { header: 'TOTAL REACTIONS (LAST 20 POSTS)', key: 'TOTAL_REACTIONS_20_POSTS', width: 30 },
    { header: 'TOTAL COMMENTS (LAST 20 POSTS)', key: 'TOTAL_COMMENTS_20_POSTS', width: 30 },
    { header: 'AVERAGE REACTIONS (LAST 20 POSTS)', key: 'AVERAGE_REACTIONS', width: 30 },
    { header: 'AVERAGE COMMENTS (LAST 20 POSTS)', key: 'AVERAGE_COMMENTS', width: 30 }
  ];

  const postColumns = Array.from({ length: 20 }, (_, i) => {
    const postNumber = i + 1;
    return [
      {
        header: `POST ${postNumber} REACTION`,
        key: `POST_${postNumber}_reaction`,
        width: 20,
      },
      {
        header: `POST ${postNumber} COMMENT`,
        key: `POST_${postNumber}_comment`,
        width: 20,
      }
    ];
  }).flat();

  const cleanedPostColumns = postColumns.filter(col => col.key !== 'POST_0');
  const insertIndex = baseColumns.findIndex(col => col.key === 'TOTAL_REACTIONS_20_POSTS');
  const finalColumns = [
    ...baseColumns.slice(0, insertIndex),
    ...cleanedPostColumns,
    ...baseColumns.slice(insertIndex),
  ];

  finalColumns.push({
    header: 'PAGE ACTIVITY',
    key: 'PAGE_ACTIVITY',
    width: 20,
  });

  sheet.columns = finalColumns;

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thick' },
      left: { style: 'thick' },
      bottom: { style: 'thick' },
      right: { style: 'thick' },
    };
  });

  results.forEach((rowData, rowIndex) => {
    [
      'MEMBER', 'NEW_MEMBER', 'MEMBER_GROWTH', 'POST_LAST_MONTH',
      'TOTAL_REACTIONS_20_POSTS', 'TOTAL_COMMENTS_20_POSTS',
      'AVERAGE_REACTIONS', 'AVERAGE_COMMENTS',
      ...Array.from({ length: 20 }, (_, i) => `POST_${i + 1}_reaction`),
      ...Array.from({ length: 20 }, (_, i) => `POST_${i + 1}_comment`)
    ].forEach(key => {
      if (rowData[key] !== undefined) {
        rowData[key] = formatNumber(rowData[key]);
      }
    });

    let postsRaw = rowData.POST_LAST_MONTH;
    let posts = 0;
    if (typeof postsRaw === 'string') {
      posts = Number(postsRaw.replace(/,/g, ''));
    } else if (typeof postsRaw === 'number') {
      posts = postsRaw;
    } else {
      posts = 0;
    }
    if (isNaN(posts)) posts = 0;

    let activity = 'N/A';
    let bgColor = 'FFD9D9D9';

    if (posts > 1000) {
      activity = 'VERY HIGH';
      bgColor = 'FFFF0000';
    } else if (posts >= 150 && posts <= 1000) {
      activity = 'HIGH';
      bgColor = 'FFFFC7CE';
    } else if (posts >= 61 && posts <= 149) {
      activity = 'MID';
      bgColor = 'FF00B050';
    } else if (posts >= 1 && posts <= 60) {
      activity = 'LOW';
      bgColor = 'FFC6EFCE';
    } else if (posts === 0) {
      activity = 'NO ACTIVITY';
      bgColor = 'FFD9D9D9';
    }

    rowData.PAGE_ACTIVITY = activity;

    const row = sheet.addRow(rowData);
    const isEven = rowIndex % 2 === 0;

    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 12 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      };
    });
  });

  const now = new Date();
  const timestamp = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).replace(/[/,: ]+/g, '-');

  const fileNameExcel = path.join(outputDir, `${inputFileName}_Monitored-Groups---${timestamp}.xlsx`);
  await workbook.xlsx.writeFile(fileNameExcel);
  console.log(`✅ Excel file saved as: ${fileNameExcel}`);
  onProgress?.(`✅ Excel file saved as: ${path.resolve(fileNameExcel)}`);

  if (failedLinks.length > 0) {
    const failedLinksDir = path.join(outputDir, 'failed Links');
    if (!fs.existsSync(failedLinksDir)) {
        fs.mkdirSync(failedLinksDir, { recursive: true });
    }
    const failedLinksFile = path.join(failedLinksDir, `failed_links_${timestamp}.txt`);
    console.log(`⚠️ ${failedLinks.length} pages failed. Saving to ${failedLinksFile}`);
    fs.writeFileSync(failedLinksFile, failedLinks.join('\n'), 'utf-8');
  } else {
    console.log('🎉 All pages processed successfully.');
  }

  onProgress?.(`[${dayjs().format('HH:mm:ss')}] Done.`);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}
 

function main() {
  throw new Error('Function not implemented.');
}

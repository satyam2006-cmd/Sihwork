import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteerExtra.use(StealthPlugin());

const TEXTAREA_SELECTOR = '#prompt-textarea, #mobile-composer-prompt, textarea[placeholder*="ChatGPT"], textarea[aria-label*="ChatGPT"], textarea[placeholder*="Ask"]';
const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label*="Send"], button[aria-label*="Submit"]';

async function run() {
  console.log('Starting test browser...');
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

    console.log('Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log('Typing test message...');
    await page.focus(TEXTAREA_SELECTOR);
    await page.keyboard.type('Hello, reply with only the word "SUCCESS"');
    await new Promise(r => setTimeout(r, 1000));

    console.log('Clicking send button...');
    await page.click(SEND_BUTTON_SELECTOR);
    console.log('Clicked. Waiting 10 seconds for response...');
    await new Promise(r => setTimeout(r, 10000));

    console.log('Dumping HTML after response...');
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    fs.writeFileSync('scratch/chatgpt_response_body.html', bodyHTML);
    console.log('HTML saved to scratch/chatgpt_response_body.html');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();

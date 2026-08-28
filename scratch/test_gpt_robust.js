import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

const TEXTAREA_SELECTOR = '#prompt-textarea, #mobile-composer-prompt, textarea[placeholder*="ChatGPT"], textarea[aria-label*="ChatGPT"], [data-mobile-composer-prompt], textarea[class*="textarea"]';
const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label*="Send"], [data-composer-submit]';
const ASSISTANT_MESSAGE_SELECTOR = '[class*="assistantMessage"], div[data-message-author-role="assistant"], div.agent-turn, div.markdown, div.prose';

async function run() {
  console.log('Starting browser...');
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

    console.log('Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log('Typing message...');
    await page.focus(TEXTAREA_SELECTOR);
    await page.keyboard.type('Hello, reply with only the word "SUCCESS"');
    await new Promise(r => setTimeout(r, 1000));

    console.log('Clicking send...');
    await page.click(SEND_BUTTON_SELECTOR);
    console.log('Clicked. Waiting for generation...');

    let isGenerating = true;
    let counter = 0;
    while (isGenerating && counter < 20) {
      await new Promise(r => setTimeout(r, 1000));
      counter++;
      const stopButton = await page.$('button[aria-label="Stop generating"], button[aria-label*="Stop"], [class*="stopIcon"]');
      if (!stopButton) {
        isGenerating = false;
      }
    }

    console.log('Finished. Inspecting DOM elements for selector:', ASSISTANT_MESSAGE_SELECTOR);
    const data = await page.evaluate((selector) => {
      const els = document.querySelectorAll(selector);
      return Array.from(els).map(el => ({
        tagName: el.tagName,
        className: el.className,
        innerText: el.innerText,
        htmlSnippet: el.outerHTML.substring(0, 300)
      }));
    }, ASSISTANT_MESSAGE_SELECTOR);

    console.log('Data of matched elements:', JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

const TEXTAREA_SELECTOR = '#prompt-textarea, #mobile-composer-prompt, textarea[placeholder*="ChatGPT"], textarea[aria-label*="ChatGPT"], textarea[placeholder*="Ask"]';
const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"], button[aria-label="Send message"], button[aria-label*="Send"], button[aria-label*="Submit"]';
const ASSISTANT_MESSAGE_SELECTOR = 'div[data-message-author-role="assistant"], div.agent-turn, div.markdown, div.prose, [data-testid*="assistant"]';

async function run() {
  console.log('Starting test browser...');
  const browser = await puppeteerExtra.launch({
    headless: true, // Run headless for testing
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

    console.log('Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log('Page title:', await page.title());
    
    // Check if textarea exists
    const textareaExists = await page.evaluate((selector) => {
      return !!document.querySelector(selector);
    }, TEXTAREA_SELECTOR);
    console.log('Textarea exists:', textareaExists);

    if (textareaExists) {
      const placeholder = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return el ? el.placeholder || el.getAttribute('aria-label') : '';
      }, TEXTAREA_SELECTOR);
      console.log('Textarea placeholder/label:', placeholder);

      console.log('Typing test message...');
      await page.focus(TEXTAREA_SELECTOR);
      await page.keyboard.type('Hello, reply with only the word "SUCCESS"');
      await new Promise(r => setTimeout(r, 1000));

      const sendButtonExists = await page.evaluate((selector) => {
        return !!document.querySelector(selector);
      }, SEND_BUTTON_SELECTOR);
      console.log('Send button exists:', sendButtonExists);

      if (sendButtonExists) {
        const isSendDisabled = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          return el ? el.disabled : false;
        }, SEND_BUTTON_SELECTOR);
        console.log('Is send button disabled:', isSendDisabled);

        console.log('Clicking send button...');
        await page.click(SEND_BUTTON_SELECTOR);
        console.log('Clicked. Waiting for generation...');

        let isGenerating = true;
        let counter = 0;
        while (isGenerating && counter < 30) {
          await new Promise(r => setTimeout(r, 1000));
          counter++;
          const stopButton = await page.$('button[aria-label="Stop generating"], button[aria-label*="Stop"]');
          if (!stopButton) {
            isGenerating = false;
          }
        }
        console.log('Done waiting. Checking for responses...');

        const responsesExist = await page.evaluate((selector) => {
          return document.querySelectorAll(selector).length;
        }, ASSISTANT_MESSAGE_SELECTOR);
        console.log('Number of assistant responses:', responsesExist);

        if (responsesExist > 0) {
          const lastResponseText = await page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector);
            const last = elements[elements.length - 1];
            const prose = last.querySelector('.prose') || last;
            return prose ? prose.innerText : '';
          }, ASSISTANT_MESSAGE_SELECTOR);
          console.log('Response text:', lastResponseText);
        }
      }
    } else {
      console.log('Dumping DOM HTML for debugging:');
      const html = await page.content();
      console.log(html.substring(0, 2000));
    }
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

run();

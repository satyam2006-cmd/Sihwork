import { config } from 'dotenv';
config({ path: '.env.local' });

import { chromium, Page } from 'playwright';

const PATIENT_URL = 'http://localhost:3000';
const DOCTOR_URL = 'http://localhost:3002';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/screenshots/${name}.png`, fullPage: true });
  console.log(`   >> ${name}.png`);
}

async function createDoctorAccount() {
  // Create auth user
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'testdoctor@example.com',
      password: 'testpassword123',
      email_confirm: true,
    }),
  });

  let userId: string;
  if (authRes.ok) {
    userId = (await authRes.json()).id;
    console.log(`   Created doctor user: ${userId}`);
  } else {
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    });
    const users = await listRes.json();
    const existing = users.users?.find((u: any) => u.email === 'testdoctor@example.com');
    if (existing) {
      userId = existing.id;
      console.log(`   Doctor user exists: ${userId}`);
    } else {
      console.log(`   Failed: ${await authRes.text()}`);
      return;
    }
  }

  // Create doctor record (ignore if exists)
  await fetch(`${SUPABASE_URL}/rest/v1/doctors`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      full_name: 'Dr. Test Doctor',
      specialization: 'General Medicine',
    }),
  });
  console.log('   Doctor record ready');
}

async function main() {
  const { mkdirSync } = await import('fs');
  mkdirSync('/tmp/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // ===== PATIENT APP =====
  console.log('\n=== PATIENT APP ===\n');
  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await pCtx.newPage();

  // Capture console errors
  const consoleErrors: string[] = [];
  p.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  p.on('response', res => {
    if (res.status() >= 400) {
      console.log(`   [HTTP ${res.status()}] ${res.url()}`);
    }
  });

  // 1. Login
  console.log('1. Login...');
  await p.goto(`${PATIENT_URL}/login`);
  await p.waitForLoadState('networkidle');
  await p.fill('input[type="email"]', 'testpatient@example.com');
  await p.fill('input[type="password"]', 'testpassword123');
  await p.click('button:has-text("Sign In")');
  await p.waitForURL('**/dashboard**', { timeout: 10000 });
  console.log(`   ✓ Dashboard: ${p.url()}`);
  await ss(p, 'p01-dashboard');

  // 2. Go to consultation
  console.log('\n2. Consultation page...');
  await p.click('text=Consultation');
  await p.waitForLoadState('networkidle');

  // 3. Click Start Text Chat and capture what happens
  console.log('\n3. Start Text Chat...');
  consoleErrors.length = 0;

  // Listen for navigation
  const [response] = await Promise.all([
    p.waitForResponse(res => res.url().includes('/api/session'), { timeout: 10000 }).catch(() => null),
    p.click('button:has-text("Start Text Chat")'),
  ]);

  if (response) {
    console.log(`   API response: ${response.status()} ${response.url()}`);
    if (response.status() === 200) {
      const data = await response.json();
      console.log(`   Session created: ${JSON.stringify(data).substring(0, 100)}`);
    } else {
      const text = await response.text();
      console.log(`   API error: ${text}`);
    }
  } else {
    console.log('   ⚠ No API call detected');
  }

  // Wait for navigation
  await p.waitForTimeout(3000);
  console.log(`   Current URL: ${p.url()}`);
  await ss(p, 'p02-after-start');

  if (consoleErrors.length > 0) {
    console.log(`   Console errors: ${consoleErrors.join('\n   ')}`);
  }

  // 4. Check if we're on a session page
  console.log('\n4. Session page...');
  if (p.url().includes('/session/')) {
    await p.waitForTimeout(5000); // Wait for greeting to load
    await ss(p, 'p03-session-page');

    // Find chat input
    const chatInput = p.locator('textarea, input[placeholder*="message" i], input[placeholder*="type" i]');
    const inputCount = await chatInput.count();
    console.log(`   Chat inputs found: ${inputCount}`);

    if (inputCount > 0) {
      // Send a message
      console.log('\n5. Sending message...');
      await chatInput.first().fill('I have been having headaches for the past few days.');

      // Try submit
      const sendBtn = p.locator('button[type="submit"], button:has-text("Send")');
      if (await sendBtn.count() > 0) {
        await sendBtn.first().click();
      } else {
        await chatInput.first().press('Enter');
      }

      console.log('   Message sent, waiting for response...');
      await p.waitForTimeout(15000);
      await ss(p, 'p04-after-message');

      // Send follow-up
      console.log('\n6. Follow-up...');
      await chatInput.first().fill('The pain is moderate, on the right side. I also feel dizzy.');
      if (await sendBtn.count() > 0) {
        await sendBtn.first().click();
      } else {
        await chatInput.first().press('Enter');
      }
      await p.waitForTimeout(15000);
      await ss(p, 'p05-follow-up');

      // End session
      console.log('\n7. End session...');
      const endBtn = p.locator('button:has-text("End")');
      if (await endBtn.count() > 0) {
        await endBtn.first().click();
        await p.waitForTimeout(2000);
        // Confirm if dialog
        const confirmBtn = p.locator('button:has-text("End Session"), button:has-text("Confirm"), button:has-text("Yes")');
        if (await confirmBtn.count() > 0) {
          await confirmBtn.first().click();
        }
        await p.waitForTimeout(15000); // Wait for post-session
        await ss(p, 'p06-session-ended');
        console.log(`   ✓ Session ended. URL: ${p.url()}`);
      } else {
        console.log('   No end button');
        const btns = await p.locator('button').allTextContents();
        console.log(`   Buttons: ${btns.filter(t => t.trim()).join(', ')}`);
      }
    }
  } else {
    console.log(`   ⚠ Not on session page, still at: ${p.url()}`);
    // Debug the page
    const bodyText = await p.textContent('body');
    console.log(`   Page text snippet: ${bodyText?.substring(0, 200)}`);
  }

  // Dashboard overview
  console.log('\n8. Dashboard check...');
  await p.goto(`${PATIENT_URL}/dashboard`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(2000);
  await ss(p, 'p07-dashboard-final');
  console.log('   ✓ Dashboard loaded');

  // Documents page
  console.log('\n9. Documents page...');
  await p.click('text=Documents');
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1000);
  await ss(p, 'p08-documents');
  console.log('   ✓ Documents loaded');

  await pCtx.close();
  console.log('\n✅ Patient app done\n');

  // ===== DOCTOR APP =====
  console.log('=== DOCTOR APP ===\n');
  console.log('0. Creating doctor account...');
  await createDoctorAccount();

  const dCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await dCtx.newPage();
  d.on('console', msg => {
    if (msg.type() === 'error') console.log(`   [console.error] ${msg.text()}`);
  });

  // 1. Login
  console.log('\n1. Login...');
  await d.goto(`${DOCTOR_URL}/login`);
  await d.waitForLoadState('networkidle');
  await d.fill('input[type="email"]', 'testdoctor@example.com');
  await d.fill('input[type="password"]', 'testpassword123');
  await d.click('button:has-text("Sign In")');

  try {
    await d.waitForURL('**/dashboard**', { timeout: 10000 });
    console.log(`   ✓ Logged in: ${d.url()}`);
  } catch {
    console.log(`   ⚠ Still at: ${d.url()}`);
    await ss(d, 'd01-login-issue');
    const alert = d.locator('[role="alert"], [class*="error"], .text-red');
    if (await alert.count() > 0) {
      console.log(`   Error: ${await alert.first().textContent()}`);
    }
  }

  await ss(d, 'd01-dashboard');
  await d.waitForTimeout(3000);
  await ss(d, 'd02-dashboard-loaded');

  // 2. Patients
  console.log('\n2. Patients...');
  await d.click('a:has-text("Patients")');
  await d.waitForLoadState('networkidle');
  await d.waitForTimeout(2000);
  await ss(d, 'd03-patients');
  console.log(`   ✓ ${d.url()}`);

  // Click patient
  const patientLink = d.locator('a:has-text("Test Patient"), tr:has-text("Test Patient")');
  if (await patientLink.count() > 0) {
    await patientLink.first().click();
    await d.waitForLoadState('networkidle');
    await d.waitForTimeout(2000);
    await ss(d, 'd04-patient-detail');
    console.log(`   ✓ Patient detail: ${d.url()}`);
  }

  // 3. Sessions
  console.log('\n3. Sessions...');
  await d.click('a:has-text("Sessions")');
  await d.waitForLoadState('networkidle');
  await d.waitForTimeout(2000);
  await ss(d, 'd05-sessions');
  console.log(`   ✓ ${d.url()}`);

  // Click session
  const sessionLink = d.locator('a[href*="session"], tr:has-text("Test Patient")').first();
  if (await sessionLink.count() > 0) {
    await sessionLink.click();
    await d.waitForLoadState('networkidle');
    await d.waitForTimeout(2000);
    await ss(d, 'd06-session-detail');
    console.log(`   ✓ Session detail: ${d.url()}`);

    // Scroll down to see full content
    await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await d.waitForTimeout(500);
    await ss(d, 'd07-session-detail-bottom');
  }

  await dCtx.close();
  await browser.close();

  console.log('\n✅ Doctor app done');
  console.log('\n=== ALL TESTS COMPLETE ===');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});

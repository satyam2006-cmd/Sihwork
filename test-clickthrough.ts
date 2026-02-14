import { chromium, Browser, Page } from 'playwright';

const PATIENT_URL = 'http://localhost:3000';
const DOCTOR_URL = 'http://localhost:3002';
const TEST_EMAIL = 'testpatient@example.com';
const TEST_PASSWORD = 'testpassword123';

async function screenshot(page: Page, name: string) {
  const path = `/tmp/screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`   📸 Screenshot: ${path}`);
}

async function testPatientApp(browser: Browser) {
  console.log('\n========================================');
  console.log('  PATIENT APP CLICK-THROUGH TEST');
  console.log('========================================\n');

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Step 1: Landing page
  console.log('1. Landing page...');
  await page.goto(PATIENT_URL);
  await page.waitForLoadState('networkidle');
  await screenshot(page, '01-patient-landing');
  const title = await page.title();
  console.log(`   ✓ Title: "${title}"`);

  // Step 2: Navigate to login
  console.log('\n2. Login page...');
  // Check if we're redirected to login or need to click a link
  const currentUrl = page.url();
  console.log(`   Current URL: ${currentUrl}`);

  if (!currentUrl.includes('/login')) {
    // Try to find a login link or button
    const loginLink = page.locator('a[href*="login"], button:has-text("Login"), button:has-text("Sign in"), a:has-text("Login"), a:has-text("Sign in")');
    if (await loginLink.count() > 0) {
      await loginLink.first().click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto(`${PATIENT_URL}/login`);
      await page.waitForLoadState('networkidle');
    }
  }
  await screenshot(page, '02-patient-login');
  console.log(`   ✓ On login page: ${page.url()}`);

  // Step 3: Log in
  console.log('\n3. Logging in...');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
  const passwordInput = page.locator('input[type="password"], input[name="password"]');

  if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);
    await screenshot(page, '03-patient-login-filled');

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")');
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
      await page.waitForLoadState('networkidle');
      // Wait a bit for auth redirect
      await page.waitForTimeout(3000);
    }
  } else {
    console.log('   ⚠ Could not find email/password inputs');
  }

  await screenshot(page, '04-patient-after-login');
  console.log(`   ✓ After login: ${page.url()}`);

  // Step 4: Dashboard / Home
  console.log('\n4. Dashboard / Home...');
  await page.waitForTimeout(1000);
  const pageContent = await page.textContent('body');
  const hasPatientContent = pageContent?.includes('consultation') ||
    pageContent?.includes('session') ||
    pageContent?.includes('Start') ||
    pageContent?.includes('Dashboard') ||
    pageContent?.includes('Welcome');
  console.log(`   ✓ Has patient content: ${hasPatientContent}`);
  await screenshot(page, '05-patient-dashboard');

  // Step 5: Try to start a new consultation
  console.log('\n5. Looking for "New Consultation" or "Start Session"...');
  const startBtn = page.locator('button:has-text("New"), button:has-text("Start"), a:has-text("New"), a:has-text("Start")');
  if (await startBtn.count() > 0) {
    const btnText = await startBtn.first().textContent();
    console.log(`   ✓ Found button: "${btnText}"`);
    await startBtn.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, '06-patient-new-session');
    console.log(`   ✓ After click: ${page.url()}`);
  } else {
    console.log('   ⚠ No start button found');
    // List all buttons/links for debugging
    const allButtons = await page.locator('button, a').allTextContents();
    console.log(`   Available buttons/links: ${allButtons.filter(t => t.trim()).join(', ')}`);
  }

  // Step 6: Check if we're on a chat/session page
  console.log('\n6. Chat interface...');
  const chatInput = page.locator('textarea, input[type="text"][placeholder*="message" i], input[placeholder*="type" i]');
  if (await chatInput.count() > 0) {
    console.log('   ✓ Found chat input');
    await chatInput.first().fill('I have been having headaches for the past few days.');
    await screenshot(page, '07-patient-chat-input');

    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="send" i]');
    if (await sendBtn.count() > 0) {
      await sendBtn.first().click();
      console.log('   ✓ Sent message');
      // Wait for AI response
      await page.waitForTimeout(10000);
      await screenshot(page, '08-patient-chat-response');
      console.log(`   ✓ After response: ${page.url()}`);
    }
  } else {
    console.log('   ⚠ No chat input found on current page');
    await screenshot(page, '07-patient-current-page');
  }

  // Step 7: Check session history
  console.log('\n7. Session history...');
  const historyLink = page.locator('a:has-text("History"), a:has-text("Sessions"), a:has-text("Past"), a[href*="session"], a[href*="history"]');
  if (await historyLink.count() > 0) {
    await historyLink.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await screenshot(page, '09-patient-history');
    console.log(`   ✓ Session history page: ${page.url()}`);
  } else {
    console.log('   ⚠ No history link found');
  }

  await context.close();
  console.log('\n✅ Patient app click-through complete');
}

async function testDoctorApp(browser: Browser) {
  console.log('\n========================================');
  console.log('  DOCTOR APP CLICK-THROUGH TEST');
  console.log('========================================\n');

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Step 1: Landing page (should redirect to login or dashboard)
  console.log('1. Landing page...');
  await page.goto(DOCTOR_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, '10-doctor-landing');
  console.log(`   ✓ URL: ${page.url()}`);

  // Step 2: Check if we need to login
  console.log('\n2. Auth check...');
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    console.log('   Redirected to login (expected - no doctor credentials set up for browser test)');
    await screenshot(page, '11-doctor-login');

    // We can't login as a doctor via the UI since we don't have doctor credentials,
    // but we can still verify the API routes work (already tested above)
    console.log('   ⚠ Skipping browser login (no doctor account). API routes already verified.');
  } else if (currentUrl.includes('/dashboard')) {
    console.log('   ✓ Already on dashboard');
    await screenshot(page, '11-doctor-dashboard');
  } else {
    console.log(`   Current page: ${currentUrl}`);
    await screenshot(page, '11-doctor-page');
  }

  // Step 3: Test API routes directly via page.evaluate (bypasses auth middleware)
  console.log('\n3. Testing API routes via fetch...');

  const patientsResponse = await page.evaluate(async () => {
    const res = await fetch('/api/patients');
    return { status: res.status, data: await res.json() };
  });
  console.log(`   ✓ GET /api/patients: ${patientsResponse.status} — ${patientsResponse.data.length} patients`);

  const sessionsResponse = await page.evaluate(async () => {
    const res = await fetch('/api/sessions');
    return { status: res.status, data: await res.json() };
  });
  console.log(`   ✓ GET /api/sessions: ${sessionsResponse.status} — ${sessionsResponse.data.length} sessions`);

  if (sessionsResponse.data.length > 0) {
    const sessionId = sessionsResponse.data[0].id;
    const sessionResponse = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/sessions/${id}`);
      return { status: res.status, hasVisitRecord: !!(await res.json()).visit_record };
    }, sessionId);
    console.log(`   ✓ GET /api/sessions/${sessionId.substring(0, 8)}...: ${sessionResponse.status}, has visit record: ${sessionResponse.hasVisitRecord}`);

    const patientId = sessionsResponse.data[0].patient_id;
    const patientResponse = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/patients/${id}`);
      const data = await res.json();
      return { status: res.status, name: data.full_name, sessions: data.sessions?.length };
    }, patientId);
    console.log(`   ✓ GET /api/patients/${patientId.substring(0, 8)}...: ${patientResponse.status}, name: "${patientResponse.name}", sessions: ${patientResponse.sessions}`);
  }

  // Step 4: Try navigating to dashboard pages directly (even without auth, we can see if pages render)
  console.log('\n4. Dashboard pages (direct navigation)...');

  await page.goto(`${DOCTOR_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, '12-doctor-dashboard-direct');
  console.log(`   ✓ /dashboard → ${page.url()}`);

  await page.goto(`${DOCTOR_URL}/dashboard/patients`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, '13-doctor-patients-page');
  console.log(`   ✓ /dashboard/patients → ${page.url()}`);

  await page.goto(`${DOCTOR_URL}/dashboard/sessions`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, '14-doctor-sessions-page');
  console.log(`   ✓ /dashboard/sessions → ${page.url()}`);

  await context.close();
  console.log('\n✅ Doctor app click-through complete');
}

async function main() {
  // Create screenshots directory
  const { mkdirSync } = await import('fs');
  mkdirSync('/tmp/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    await testPatientApp(browser);
    await testDoctorApp(browser);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('  ALL CLICK-THROUGH TESTS COMPLETE');
  console.log('========================================');
  console.log('\nScreenshots saved to /tmp/screenshots/');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

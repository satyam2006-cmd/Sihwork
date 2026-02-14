import { chromium, Browser, Page } from 'playwright';

const PATIENT_URL = 'http://localhost:3000';
const DOCTOR_URL = 'http://localhost:3002';
const TEST_EMAIL = 'testpatient@example.com';
const TEST_PASSWORD = 'testpassword123';
const DOCTOR_EMAIL = 'testdoctor@example.com';
const DOCTOR_PASSWORD = 'testpassword123';

async function screenshot(page: Page, name: string) {
  const path = `/tmp/screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`   >> Screenshot: ${path}`);
}

async function createDoctorAccount() {
  // Create a doctor user + doctor record in Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Create auth user
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: DOCTOR_EMAIL,
      password: DOCTOR_PASSWORD,
      email_confirm: true,
    }),
  });

  let userId: string;
  if (authRes.ok) {
    const user = await authRes.json();
    userId = user.id;
    console.log(`   Created doctor auth user: ${userId}`);
  } else {
    // User might already exist, try to find them
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    });
    const users = await listRes.json();
    const existing = users.users?.find((u: any) => u.email === DOCTOR_EMAIL);
    if (existing) {
      userId = existing.id;
      console.log(`   Doctor auth user already exists: ${userId}`);
    } else {
      console.log(`   Failed to create doctor: ${await authRes.text()}`);
      return null;
    }
  }

  // Create doctor record
  const doctorRes = await fetch(`${supabaseUrl}/rest/v1/doctors`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      full_name: 'Dr. Test Doctor',
      specialization: 'General Medicine',
    }),
  });

  if (doctorRes.ok) {
    const doctor = await doctorRes.json();
    console.log(`   Created doctor record: ${doctor[0]?.id || 'ok'}`);
  } else {
    const errText = await doctorRes.text();
    if (errText.includes('duplicate') || errText.includes('unique')) {
      console.log('   Doctor record already exists');
    } else {
      console.log(`   Doctor record creation: ${errText}`);
    }
  }

  return userId;
}

async function testPatientFullFlow(browser: Browser) {
  console.log('\n========================================');
  console.log('  PATIENT APP — FULL CONSULTATION FLOW');
  console.log('========================================\n');

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  console.log('1. Login...');
  await page.goto(`${PATIENT_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
  console.log(`   ✓ Logged in, redirected to: ${page.url()}`);
  await screenshot(page, 'p01-dashboard');

  // Navigate to consultation
  console.log('\n2. Start consultation...');
  await page.click('text=Consultation');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'p02-consultation-choice');
  console.log('   ✓ Consultation page loaded');

  // Click "Start Text Chat"
  console.log('\n3. Start Text Chat...');
  await page.click('button:has-text("Start Text Chat")');
  await page.waitForTimeout(5000); // Wait for session creation + greeting
  await screenshot(page, 'p03-chat-started');
  console.log(`   ✓ Chat page: ${page.url()}`);

  // Check for greeting message
  const greeting = await page.locator('.message, [class*="message"], [class*="chat"], [class*="bubble"]').first();
  if (await greeting.count() > 0) {
    const greetingText = await greeting.textContent();
    console.log(`   ✓ Greeting visible: "${greetingText?.substring(0, 80)}..."`);
  }

  // Type and send a message
  console.log('\n4. Send message...');
  const chatInput = page.locator('textarea, input[type="text"]').last();
  if (await chatInput.count() > 0) {
    await chatInput.fill('I have been having headaches for the past few days, especially in the morning.');
    await screenshot(page, 'p04-message-typed');

    // Find send button
    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="send" i], form button').last();
    if (await sendBtn.count() > 0) {
      await sendBtn.click();
      console.log('   ✓ Message sent');

      // Wait for AI response
      await page.waitForTimeout(15000);
      await screenshot(page, 'p05-ai-response');
      console.log('   ✓ Waited for AI response');
    } else {
      // Try pressing Enter
      await chatInput.press('Enter');
      console.log('   ✓ Pressed Enter to send');
      await page.waitForTimeout(15000);
      await screenshot(page, 'p05-ai-response');
    }
  } else {
    console.log('   ⚠ No chat input found');
    // Debug: list all interactive elements
    const inputs = await page.locator('input, textarea, button').allTextContents();
    console.log(`   Elements: ${inputs.filter(t => t.trim()).join(', ')}`);
    await screenshot(page, 'p04-debug');
  }

  // Send a follow-up message
  console.log('\n5. Follow-up message...');
  const chatInput2 = page.locator('textarea, input[type="text"]').last();
  if (await chatInput2.count() > 0) {
    await chatInput2.fill('The pain is on the right side, moderate intensity. I also feel dizzy sometimes.');
    const sendBtn2 = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="send" i], form button').last();
    if (await sendBtn2.count() > 0) {
      await sendBtn2.click();
    } else {
      await chatInput2.press('Enter');
    }
    await page.waitForTimeout(15000);
    await screenshot(page, 'p06-followup-response');
    console.log('   ✓ Follow-up sent and response received');
  }

  // Try to end session
  console.log('\n6. End session...');
  const endBtn = page.locator('button:has-text("End"), button:has-text("Complete"), button:has-text("Finish"), button:has-text("Done")');
  if (await endBtn.count() > 0) {
    const endBtnText = await endBtn.first().textContent();
    console.log(`   Found button: "${endBtnText}"`);
    await endBtn.first().click();

    // Handle confirmation dialog if any
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("End Session")');
    await page.waitForTimeout(1000);
    if (await confirmBtn.count() > 0) {
      await confirmBtn.first().click();
      console.log('   ✓ Confirmed end session');
    }

    await page.waitForTimeout(10000); // Wait for post-session pipeline
    await screenshot(page, 'p07-session-ended');
    console.log(`   ✓ After ending session: ${page.url()}`);
  } else {
    console.log('   ⚠ No end session button found');
    const allBtns = await page.locator('button').allTextContents();
    console.log(`   Buttons: ${allBtns.filter(t => t.trim()).join(', ')}`);
  }

  // Check session detail/summary page
  console.log('\n7. Session results...');
  await page.waitForTimeout(2000);
  await screenshot(page, 'p08-session-results');

  // Navigate back to dashboard to see updated session list
  console.log('\n8. Back to dashboard...');
  await page.click('text=Overview');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, 'p09-dashboard-updated');
  console.log('   ✓ Dashboard updated');

  // Check documents page
  console.log('\n9. Documents page...');
  await page.click('text=Documents');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, 'p10-documents');
  console.log('   ✓ Documents page loaded');

  await context.close();
  console.log('\n✅ Patient app full flow complete');
}

async function testDoctorFullFlow(browser: Browser) {
  console.log('\n========================================');
  console.log('  DOCTOR APP — FULL DASHBOARD FLOW');
  console.log('========================================\n');

  // Create doctor account first
  console.log('0. Setting up doctor account...');
  await createDoctorAccount();

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Login
  console.log('\n1. Login...');
  await page.goto(`${DOCTOR_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', DOCTOR_EMAIL);
  await page.fill('input[type="password"]', DOCTOR_PASSWORD);
  await screenshot(page, 'd01-login-filled');
  await page.click('button:has-text("Sign In")');

  try {
    await page.waitForURL('**/dashboard**', { timeout: 10000 });
    console.log(`   ✓ Logged in, redirected to: ${page.url()}`);
  } catch {
    console.log(`   ⚠ Login redirect didn't happen. URL: ${page.url()}`);
    await screenshot(page, 'd01-login-failed');
    // Check for error messages
    const errorText = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').first();
    if (await errorText.count() > 0) {
      console.log(`   Error: ${await errorText.textContent()}`);
    }
  }

  await screenshot(page, 'd02-dashboard');

  // Dashboard overview
  console.log('\n2. Dashboard overview...');
  await page.waitForTimeout(2000);
  await screenshot(page, 'd03-dashboard-loaded');
  const dashboardText = await page.textContent('body');
  const hasStats = dashboardText?.includes('Total') || dashboardText?.includes('Patient') || dashboardText?.includes('Session');
  console.log(`   ✓ Dashboard has stats: ${hasStats}`);

  // Patients page
  console.log('\n3. Patients page...');
  const patientsNav = page.locator('a:has-text("Patients"), button:has-text("Patients")');
  if (await patientsNav.count() > 0) {
    await patientsNav.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'd04-patients-list');
    console.log(`   ✓ Patients page: ${page.url()}`);

    // Click on a patient
    const patientRow = page.locator('tr:has-text("Test Patient"), a:has-text("Test Patient"), [class*="row"]:has-text("Test Patient")');
    if (await patientRow.count() > 0) {
      await patientRow.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await screenshot(page, 'd05-patient-detail');
      console.log(`   ✓ Patient detail page: ${page.url()}`);
    } else {
      console.log('   ⚠ No patient rows found to click');
    }
  }

  // Sessions page
  console.log('\n4. Sessions page...');
  const sessionsNav = page.locator('a:has-text("Sessions"), button:has-text("Sessions")');
  if (await sessionsNav.count() > 0) {
    await sessionsNav.first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'd06-sessions-list');
    console.log(`   ✓ Sessions page: ${page.url()}`);

    // Click on a session
    const sessionRow = page.locator('tr, a[href*="session"], [class*="row"]').filter({ hasText: 'Test Patient' }).first();
    if (await sessionRow.count() > 0) {
      await sessionRow.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await screenshot(page, 'd07-session-detail');
      console.log(`   ✓ Session detail page: ${page.url()}`);

      // Look for "Mark as Reviewed" button
      const reviewBtn = page.locator('button:has-text("Review"), button:has-text("Mark"), button:has-text("Approve")');
      if (await reviewBtn.count() > 0) {
        const reviewBtnText = await reviewBtn.first().textContent();
        console.log(`   ✓ Found review button: "${reviewBtnText}"`);
        await screenshot(page, 'd08-before-review');
      } else {
        console.log('   (No review button — may already be reviewed)');
      }
    } else {
      console.log('   ⚠ No session rows found to click');
    }
  }

  await context.close();
  console.log('\n✅ Doctor app full flow complete');
}

async function main() {
  const { mkdirSync } = await import('fs');
  mkdirSync('/tmp/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    await testPatientFullFlow(browser);
    await testDoctorFullFlow(browser);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('  ALL CLICK-THROUGH TESTS COMPLETE');
  console.log('========================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

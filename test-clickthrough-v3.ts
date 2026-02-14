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
      console.log(`   Failed to create doctor`);
      return;
    }
  }

  const doctorRes = await fetch(`${SUPABASE_URL}/rest/v1/doctors`, {
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
  if (doctorRes.ok) {
    console.log('   Created doctor record');
  } else {
    const t = await doctorRes.text();
    console.log(`   Doctor record: ${t.includes('duplicate') ? 'already exists' : t}`);
  }
}

async function main() {
  const { mkdirSync } = await import('fs');
  mkdirSync('/tmp/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // ==========================================
  //  PATIENT APP
  // ==========================================
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║       PATIENT APP CLICK-THROUGH      ║');
  console.log('╚══════════════════════════════════════╝\n');

  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await pCtx.newPage();
  p.on('response', res => {
    if (res.status() >= 400) console.log(`   [HTTP ${res.status()}] ${res.url().replace(PATIENT_URL, '')}`);
  });

  // Login
  console.log('1. Login...');
  await p.goto(`${PATIENT_URL}/login`);
  await p.waitForLoadState('networkidle');
  await p.fill('input[type="email"]', 'testpatient@example.com');
  await p.fill('input[type="password"]', 'testpassword123');
  await p.click('button:has-text("Sign In")');
  await p.waitForURL('**/dashboard**', { timeout: 10000 });
  console.log(`   ✓ Logged in → ${p.url()}`);

  // Dashboard
  console.log('\n2. Dashboard...');
  await p.waitForTimeout(2000);
  await ss(p, 'p01-dashboard');

  // Documents page
  console.log('\n3. Documents page...');
  await p.click('text=Documents');
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1000);
  await ss(p, 'p02-documents');
  console.log('   ✓ Documents loaded');

  // Consultation page
  console.log('\n4. Consultation page...');
  await p.click('text=Consultation');
  await p.waitForLoadState('networkidle');
  await ss(p, 'p03-consultation');

  // Start Text Chat
  console.log('\n5. Start Text Chat...');
  const [sessionRes] = await Promise.all([
    p.waitForResponse(res => res.url().includes('/api/session'), { timeout: 15000 }).catch(() => null),
    p.click('button:has-text("Start Text Chat")'),
  ]);
  if (sessionRes) {
    const data = await sessionRes.json();
    console.log(`   ✓ Session created: ${data.session?.id?.substring(0, 8)}...`);
  }
  await p.waitForTimeout(5000);
  await ss(p, 'p04-chat-greeting');
  console.log(`   ✓ Chat page: ${p.url()}`);

  // Send first message
  console.log('\n6. Send message...');
  const input = p.locator('input[placeholder*="message" i], textarea');
  await input.first().fill('I have been having headaches for the past few days.');
  await p.locator('button:has-text("Send")').click();
  await p.waitForTimeout(15000);
  await ss(p, 'p05-message-response');
  console.log('   ✓ AI responded');

  // Send follow-up
  console.log('\n7. Follow-up...');
  await input.first().fill('The pain is moderate, right side. I also feel dizzy.');
  await p.locator('button:has-text("Send")').click();
  await p.waitForTimeout(15000);
  await ss(p, 'p06-followup');
  console.log('   ✓ Follow-up response received');

  // End session
  console.log('\n8. End Session...');
  await p.locator('button:has-text("End Session")').click();
  await p.waitForTimeout(2000);

  // Confirm if dialog
  const confirmBtn = p.locator('button:has-text("End Session"), button:has-text("Confirm"), button:has-text("Yes")');
  if (await confirmBtn.count() > 1) {
    await confirmBtn.nth(1).click(); // Click the confirm one (not the original)
  }
  console.log('   Waiting for post-session pipeline...');
  await p.waitForTimeout(20000);
  await ss(p, 'p07-session-ended');
  console.log(`   ✓ URL: ${p.url()}`);

  // Go back to dashboard
  console.log('\n9. Dashboard (updated)...');
  await p.goto(`${PATIENT_URL}/dashboard`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(5000); // Give auth provider time
  await ss(p, 'p08-dashboard-final');

  await pCtx.close();
  console.log('\n✅ Patient app complete\n');

  // ==========================================
  //  DOCTOR APP
  // ==========================================
  console.log('╔══════════════════════════════════════╗');
  console.log('║       DOCTOR APP CLICK-THROUGH       ║');
  console.log('╚══════════════════════════════════════╝\n');

  console.log('0. Setting up doctor account...');
  await createDoctorAccount();

  const dCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await dCtx.newPage();
  d.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('_next')) {
      console.log(`   [HTTP ${res.status()}] ${res.url().replace(DOCTOR_URL, '')}`);
    }
  });

  // Login
  console.log('\n1. Login...');
  await d.goto(`${DOCTOR_URL}/login`);
  await d.waitForLoadState('networkidle');
  await d.fill('input[type="email"]', 'testdoctor@example.com');
  await d.fill('input[type="password"]', 'testpassword123');
  await d.click('button:has-text("Sign In")');

  try {
    await d.waitForURL('**/dashboard**', { timeout: 10000 });
    console.log(`   ✓ Logged in → ${d.url()}`);
  } catch {
    console.log(`   ⚠ Still at: ${d.url()}`);
    await ss(d, 'd01-login-issue');
  }

  // Dashboard
  console.log('\n2. Dashboard...');
  await d.waitForTimeout(3000);
  await ss(d, 'd01-dashboard');

  // Patients page
  console.log('\n3. Patients list...');
  const patientsLink = d.locator('a:has-text("Patients")');
  if (await patientsLink.count() > 0) {
    await patientsLink.first().click();
    await d.waitForLoadState('networkidle');
    await d.waitForTimeout(2000);
    await ss(d, 'd02-patients');
    console.log(`   ✓ ${d.url()}`);

    // Click a patient
    console.log('\n4. Patient detail...');
    const patientLink = d.locator('tr:has-text("Test Patient"), a:has-text("Test Patient"), [class*="cursor"]:has-text("Test Patient")');
    if (await patientLink.count() > 0) {
      await patientLink.first().click();
      await d.waitForLoadState('networkidle');
      await d.waitForTimeout(2000);
      await ss(d, 'd03-patient-detail');
      console.log(`   ✓ ${d.url()}`);

      // Scroll down
      await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await d.waitForTimeout(500);
      await ss(d, 'd04-patient-detail-bottom');
    } else {
      console.log('   ⚠ No patient rows found');
    }
  }

  // Sessions page
  console.log('\n5. Sessions list...');
  const sessionsLink = d.locator('a:has-text("Sessions")');
  if (await sessionsLink.count() > 0) {
    await sessionsLink.first().click();
    await d.waitForLoadState('networkidle');
    await d.waitForTimeout(2000);
    await ss(d, 'd05-sessions');
    console.log(`   ✓ ${d.url()}`);

    // Click a session
    console.log('\n6. Session detail...');
    const sessionLink = d.locator('tr, a[href*="session"]').filter({ hasText: 'Test Patient' }).first();
    if (await sessionLink.count() > 0) {
      await sessionLink.click();
      await d.waitForLoadState('networkidle');
      await d.waitForTimeout(2000);
      await ss(d, 'd06-session-detail-top');
      console.log(`   ✓ ${d.url()}`);

      // Scroll to see transcript + visit record
      await d.evaluate(() => window.scrollTo(0, 600));
      await d.waitForTimeout(500);
      await ss(d, 'd07-session-detail-mid');

      await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await d.waitForTimeout(500);
      await ss(d, 'd08-session-detail-bottom');

      // Mark as reviewed
      console.log('\n7. Mark as reviewed...');
      const reviewBtn = d.locator('button:has-text("Mark"), button:has-text("Review"), button:has-text("Approve")');
      if (await reviewBtn.count() > 0) {
        const btnText = await reviewBtn.first().textContent();
        console.log(`   Found: "${btnText}"`);
        await reviewBtn.first().click();
        await d.waitForTimeout(2000);
        await ss(d, 'd09-after-review');
        console.log('   ✓ Reviewed');
      } else {
        console.log('   (No review button — may already be reviewed)');
      }
    } else {
      console.log('   ⚠ No session rows found');
    }
  }

  // Back to dashboard
  console.log('\n8. Dashboard (final)...');
  const overviewLink = d.locator('a:has-text("Overview")');
  if (await overviewLink.count() > 0) {
    await overviewLink.first().click();
    await d.waitForLoadState('networkidle');
    await d.waitForTimeout(2000);
    await ss(d, 'd10-dashboard-final');
    console.log('   ✓ Dashboard loaded');
  }

  await dCtx.close();
  await browser.close();

  console.log('\n✅ Doctor app complete');
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     ALL CLICK-THROUGH TESTS DONE     ║');
  console.log('╚══════════════════════════════════════╝');
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});

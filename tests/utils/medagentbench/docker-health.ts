import { execSync } from 'child_process';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 30_000;

/**
 * Verify the MedAgentBench FHIR server is running and healthy.
 * Checks: Docker running → container exists → FHIR metadata endpoint responds.
 * Prints actionable error messages at each step.
 */
export async function ensureFHIRServer(fhirBaseUrl: string): Promise<void> {
  // 1. Check Docker is running
  try {
    execSync('docker info', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'Docker is not running.\n' +
      'Start Docker Desktop or run `dockerd`, then retry.\n' +
      'The MedAgentBench FHIR server requires Docker.',
    );
  }

  // 2. Check if a medagentbench container exists
  let containerId: string | null = null;
  try {
    const out = execSync(
      'docker ps -q --filter ancestor=jyxsu6/medagentbench:latest',
      { stdio: 'pipe', encoding: 'utf-8' },
    ).trim();
    containerId = out || null;
  } catch {
    // docker ps failed — unusual but proceed to check endpoint
  }

  if (!containerId) {
    throw new Error(
      'No running MedAgentBench FHIR container found.\n' +
      'Start it with:\n' +
      '  docker pull jyxsu6/medagentbench:latest\n' +
      '  docker run -d -p 8080:8080 jyxsu6/medagentbench:latest\n' +
      'Then retry.',
    );
  }

  // 3. Poll the FHIR metadata endpoint until it responds
  const metadataUrl = fhirBaseUrl.replace(/\/$/, '') + '/metadata';
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_MS) {
    try {
      const resp = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        console.log(`  FHIR server healthy at ${fhirBaseUrl}`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `FHIR server at ${metadataUrl} did not respond within ${MAX_POLL_MS / 1000}s.\n` +
    'Check container logs with: docker logs $(docker ps -q --filter ancestor=jyxsu6/medagentbench:latest)',
  );
}

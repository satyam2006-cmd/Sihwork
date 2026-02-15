/**
 * Thin HTTP client for FHIR R4 operations.
 * Used by tool handlers to execute searches and creates against the FHIR server.
 */

export class FHIRClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Ensure trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '') + '/';
  }

  /** Search a FHIR resource type with query parameters. */
  async search(resourceType: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(resourceType, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }

    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/fhir+json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { error: `FHIR ${resp.status}: ${body.slice(0, 500)}` };
    }

    return resp.json();
  }

  /** Create a FHIR resource. Returns the created resource or error. */
  async create(resourceType: string, resource: Record<string, unknown>): Promise<unknown> {
    const url = new URL(resourceType, this.baseUrl);

    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        Accept: 'application/fhir+json',
      },
      body: JSON.stringify(resource),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { error: `FHIR ${resp.status}: ${body.slice(0, 500)}` };
    }

    return resp.json();
  }

  /** Read a specific FHIR resource by ID. */
  async read(resourceType: string, id: string): Promise<unknown> {
    const url = new URL(`${resourceType}/${id}`, this.baseUrl);

    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/fhir+json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { error: `FHIR ${resp.status}: ${body.slice(0, 500)}` };
    }

    return resp.json();
  }
}

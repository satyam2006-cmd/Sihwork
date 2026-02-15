import type Anthropic from '@anthropic-ai/sdk';
import { FHIRClient } from './fhir-client';
import type { FHIRToolDefinition, FHIRToolHandler } from './types';

/**
 * Build 9 Claude tool_use definitions matching MedAgentBench's FHIR endpoints.
 * Each tool has a definition (for Claude) and a handler (executes against the FHIR server).
 *
 * Search tools: search_patient, search_observation, search_condition, search_medication_request, search_procedure
 * Create tools: create_observation, create_medication_request, create_service_request
 * Control: finish_task
 */
export function buildFHIRTools(client: FHIRClient): {
  tools: Anthropic.Tool[];
  handlers: Record<string, FHIRToolHandler>;
} {
  const definitions: FHIRToolDefinition[] = [
    // -----------------------------------------------------------------------
    // Search tools
    // -----------------------------------------------------------------------
    {
      tool: {
        name: 'search_patient',
        description: 'Search for patients by name, identifier, or other demographics. Returns a FHIR Bundle of matching Patient resources.',
        input_schema: {
          type: 'object' as const,
          properties: {
            name: { type: 'string', description: 'Patient name (partial match supported)' },
            family: { type: 'string', description: 'Family/last name' },
            given: { type: 'string', description: 'Given/first name' },
            identifier: { type: 'string', description: 'Patient identifier (MRN, etc.)' },
            birthdate: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
            gender: { type: 'string', description: 'Gender (male, female, other, unknown)' },
            _id: { type: 'string', description: 'FHIR resource ID' },
            _count: { type: 'string', description: 'Maximum number of results to return' },
          },
          required: [],
        },
      },
      handler: async (input) => client.search('Patient', input as Record<string, string>),
    },

    {
      tool: {
        name: 'search_observation',
        description: 'Search for observations (lab results, vitals, etc.) by patient, code, date, or category. Returns a FHIR Bundle of matching Observation resources.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'LOINC or other code (e.g., "8867-4" for heart rate)' },
            category: { type: 'string', description: 'Category (vital-signs, laboratory, etc.)' },
            date: { type: 'string', description: 'Date or date range (e.g., "ge2024-01-01")' },
            _sort: { type: 'string', description: 'Sort parameter (e.g., "-date" for most recent first)' },
            _count: { type: 'string', description: 'Maximum number of results' },
          },
          required: [],
        },
      },
      handler: async (input) => client.search('Observation', input as Record<string, string>),
    },

    {
      tool: {
        name: 'search_condition',
        description: 'Search for conditions/diagnoses by patient or code. Returns a FHIR Bundle of matching Condition resources.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'Condition code (ICD-10, SNOMED, etc.)' },
            'clinical-status': { type: 'string', description: 'Clinical status (active, recurrence, relapse, inactive, remission, resolved)' },
            category: { type: 'string', description: 'Condition category' },
            _count: { type: 'string', description: 'Maximum number of results' },
          },
          required: [],
        },
      },
      handler: async (input) => client.search('Condition', input as Record<string, string>),
    },

    {
      tool: {
        name: 'search_medication_request',
        description: 'Search for medication prescriptions/orders by patient or medication code. Returns a FHIR Bundle of matching MedicationRequest resources.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'Medication code (RxNorm, etc.)' },
            status: { type: 'string', description: 'Status (active, on-hold, cancelled, completed, stopped, draft)' },
            intent: { type: 'string', description: 'Intent (proposal, plan, order, original-order, reflex-order, filler-order, instance-order, option)' },
            _count: { type: 'string', description: 'Maximum number of results' },
            _sort: { type: 'string', description: 'Sort parameter' },
          },
          required: [],
        },
      },
      handler: async (input) => client.search('MedicationRequest', input as Record<string, string>),
    },

    {
      tool: {
        name: 'search_procedure',
        description: 'Search for procedures by patient or code. Returns a FHIR Bundle of matching Procedure resources.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'Procedure code (CPT, SNOMED, etc.)' },
            date: { type: 'string', description: 'Date or date range' },
            status: { type: 'string', description: 'Status (preparation, in-progress, not-done, on-hold, stopped, completed)' },
            _count: { type: 'string', description: 'Maximum number of results' },
          },
          required: [],
        },
      },
      handler: async (input) => client.search('Procedure', input as Record<string, string>),
    },

    // -----------------------------------------------------------------------
    // Create tools
    // -----------------------------------------------------------------------
    {
      tool: {
        name: 'create_observation',
        description: 'Create a new Observation resource (e.g., recording a vital sign or lab result). The tool constructs the full FHIR resource body from the provided parameters.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient_id: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'LOINC code for the observation' },
            code_display: { type: 'string', description: 'Human-readable name for the code' },
            value: { type: 'number', description: 'Numeric value of the observation' },
            value_string: { type: 'string', description: 'String value (use instead of numeric value when appropriate)' },
            unit: { type: 'string', description: 'Unit of measurement (e.g., "mmHg", "mg/dL")' },
            unit_code: { type: 'string', description: 'UCUM unit code' },
            category: { type: 'string', description: 'Category: "vital-signs" or "laboratory"' },
            effective_date: { type: 'string', description: 'Effective date/time (ISO 8601). Defaults to now.' },
            status: { type: 'string', description: 'Status: "final", "preliminary", "amended". Defaults to "final".' },
            component: {
              type: 'array',
              description: 'Components for multi-part observations (e.g., systolic/diastolic BP)',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', description: 'LOINC code' },
                  code_display: { type: 'string', description: 'Display name' },
                  value: { type: 'number', description: 'Numeric value' },
                  unit: { type: 'string', description: 'Unit' },
                  unit_code: { type: 'string', description: 'UCUM unit code' },
                },
              },
            },
          },
          required: ['patient_id', 'code', 'code_display'],
        },
      },
      handler: async (input) => {
        const resource: Record<string, unknown> = {
          resourceType: 'Observation',
          status: (input.status as string) || 'final',
          category: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: (input.category as string) || 'vital-signs',
              display: (input.category as string) === 'laboratory' ? 'Laboratory' : 'Vital Signs',
            }],
          }],
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: input.code,
              display: input.code_display,
            }],
            text: input.code_display,
          },
          subject: { reference: `Patient/${input.patient_id}` },
          effectiveDateTime: (input.effective_date as string) || new Date().toISOString(),
        };

        // Handle components (e.g., blood pressure with systolic/diastolic)
        if (input.component && Array.isArray(input.component)) {
          resource.component = (input.component as Array<Record<string, unknown>>).map(c => ({
            code: {
              coding: [{ system: 'http://loinc.org', code: c.code, display: c.code_display }],
            },
            valueQuantity: {
              value: c.value,
              unit: c.unit,
              system: 'http://unitsofmeasure.org',
              code: c.unit_code || c.unit,
            },
          }));
        } else if (input.value !== undefined) {
          resource.valueQuantity = {
            value: input.value,
            unit: input.unit,
            system: 'http://unitsofmeasure.org',
            code: input.unit_code || input.unit,
          };
        } else if (input.value_string !== undefined) {
          resource.valueString = input.value_string;
        }

        return client.create('Observation', resource);
      },
    },

    {
      tool: {
        name: 'create_medication_request',
        description: 'Create a new MedicationRequest (medication order/prescription). The tool constructs the full FHIR resource body from the provided parameters.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient_id: { type: 'string', description: 'Patient FHIR ID' },
            medication_code: { type: 'string', description: 'RxNorm or other medication code' },
            medication_display: { type: 'string', description: 'Human-readable medication name' },
            dose_value: { type: 'number', description: 'Dose amount' },
            dose_unit: { type: 'string', description: 'Dose unit (e.g., "mg", "mL")' },
            frequency: { type: 'string', description: 'Dosing frequency description (e.g., "once daily", "twice daily")' },
            route: { type: 'string', description: 'Route of administration (e.g., "oral", "intravenous")' },
            reason: { type: 'string', description: 'Reason for the medication' },
            status: { type: 'string', description: 'Status: "active", "draft". Defaults to "active".' },
            intent: { type: 'string', description: 'Intent: "order", "plan", "proposal". Defaults to "order".' },
            note: { type: 'string', description: 'Additional notes or instructions' },
          },
          required: ['patient_id', 'medication_display'],
        },
      },
      handler: async (input) => {
        const resource: Record<string, unknown> = {
          resourceType: 'MedicationRequest',
          status: (input.status as string) || 'active',
          intent: (input.intent as string) || 'order',
          medicationCodeableConcept: {
            coding: input.medication_code ? [{
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: input.medication_code,
              display: input.medication_display,
            }] : [],
            text: input.medication_display,
          },
          subject: { reference: `Patient/${input.patient_id}` },
          authoredOn: new Date().toISOString(),
        };

        if (input.dose_value || input.dose_unit || input.frequency || input.route) {
          const dosageInstruction: Record<string, unknown> = {};
          if (input.frequency) {
            dosageInstruction.text = `${input.dose_value || ''} ${input.dose_unit || ''} ${input.frequency}`.trim();
          }
          if (input.dose_value && input.dose_unit) {
            dosageInstruction.doseAndRate = [{
              doseQuantity: {
                value: input.dose_value,
                unit: input.dose_unit,
                system: 'http://unitsofmeasure.org',
                code: input.dose_unit,
              },
            }];
          }
          if (input.route) {
            dosageInstruction.route = {
              text: input.route,
            };
          }
          resource.dosageInstruction = [dosageInstruction];
        }

        if (input.reason) {
          resource.reasonCode = [{ text: input.reason }];
        }

        if (input.note) {
          resource.note = [{ text: input.note }];
        }

        return client.create('MedicationRequest', resource);
      },
    },

    {
      tool: {
        name: 'create_service_request',
        description: 'Create a new ServiceRequest (referral, lab order, imaging order, etc.). The tool constructs the full FHIR resource body from the provided parameters.',
        input_schema: {
          type: 'object' as const,
          properties: {
            patient_id: { type: 'string', description: 'Patient FHIR ID' },
            code: { type: 'string', description: 'Service/procedure code (SNOMED, LOINC, CPT)' },
            code_display: { type: 'string', description: 'Human-readable description of the service' },
            code_system: { type: 'string', description: 'Code system URI. Defaults to SNOMED CT.' },
            category: { type: 'string', description: 'Category of request (e.g., "Laboratory procedure", "Referral")' },
            intent: { type: 'string', description: 'Intent: "order", "plan", "proposal". Defaults to "order".' },
            priority: { type: 'string', description: 'Priority: "routine", "urgent", "asap", "stat"' },
            reason: { type: 'string', description: 'Clinical reason for the request' },
            note: { type: 'string', description: 'Additional instructions or notes' },
            status: { type: 'string', description: 'Status: "active", "draft". Defaults to "active".' },
          },
          required: ['patient_id', 'code_display'],
        },
      },
      handler: async (input) => {
        const resource: Record<string, unknown> = {
          resourceType: 'ServiceRequest',
          status: (input.status as string) || 'active',
          intent: (input.intent as string) || 'order',
          subject: { reference: `Patient/${input.patient_id}` },
          authoredOn: new Date().toISOString(),
        };

        const codeSystem = (input.code_system as string) || 'http://snomed.info/sct';
        resource.code = {
          coding: input.code ? [{
            system: codeSystem,
            code: input.code,
            display: input.code_display,
          }] : [],
          text: input.code_display,
        };

        if (input.category) {
          resource.category = [{
            coding: [{
              system: 'http://snomed.info/sct',
              display: input.category,
            }],
            text: input.category,
          }];
        }

        if (input.priority) {
          resource.priority = input.priority;
        }

        if (input.reason) {
          resource.reasonCode = [{ text: input.reason }];
        }

        if (input.note) {
          resource.note = [{ text: input.note }];
        }

        return client.create('ServiceRequest', resource);
      },
    },

    // -----------------------------------------------------------------------
    // Control tool
    // -----------------------------------------------------------------------
    {
      tool: {
        name: 'finish_task',
        description: 'Call this when you have completed the task. Provide your final answer. For retrieval tasks, provide the exact value. For write tasks, confirm what was created. For conditional tasks where no action is needed, provide an empty string.',
        input_schema: {
          type: 'object' as const,
          properties: {
            answer: { type: 'string', description: 'Your final answer to the task. Use empty string if no action was needed.' },
          },
          required: ['answer'],
        },
      },
      handler: async (input) => ({ status: 'finished', answer: input.answer }),
    },
  ];

  const tools: Anthropic.Tool[] = definitions.map(d => d.tool);
  const handlers: Record<string, FHIRToolHandler> = {};
  for (const d of definitions) {
    handlers[d.tool.name] = d.handler;
  }

  return { tools, handlers };
}

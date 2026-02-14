import {
  getPatient, getPatientDefinition,
  updatePatient, updatePatientDefinition,
  createSession, createSessionDefinition,
  getSession, getSessionDefinition,
  updateSession, updateSessionDefinition,
  listSessions, listSessionsDefinition,
  writeVisitRecord, writeVisitRecordDefinition,
  writeSessionSummary, writeSessionSummaryDefinition,
  reviewVisitRecord, reviewVisitRecordDefinition,
  manageDocument, manageDocumentDefinition,
} from './tools/index';

export interface ToolEntry {
  definition: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export const toolRegistry: ToolEntry[] = [
  { definition: getPatientDefinition, handler: getPatient as unknown as ToolEntry['handler'] },
  { definition: updatePatientDefinition, handler: updatePatient as unknown as ToolEntry['handler'] },
  { definition: createSessionDefinition, handler: createSession as unknown as ToolEntry['handler'] },
  { definition: getSessionDefinition, handler: getSession as unknown as ToolEntry['handler'] },
  { definition: updateSessionDefinition, handler: updateSession as unknown as ToolEntry['handler'] },
  { definition: listSessionsDefinition, handler: listSessions as unknown as ToolEntry['handler'] },
  { definition: writeVisitRecordDefinition, handler: writeVisitRecord as unknown as ToolEntry['handler'] },
  { definition: writeSessionSummaryDefinition, handler: writeSessionSummary as unknown as ToolEntry['handler'] },
  { definition: reviewVisitRecordDefinition, handler: reviewVisitRecord as unknown as ToolEntry['handler'] },
  { definition: manageDocumentDefinition, handler: manageDocument as unknown as ToolEntry['handler'] },
];

// Map for quick lookup by name
export const toolMap = new Map<string, ToolEntry>(
  toolRegistry.map(entry => [entry.definition.name, entry])
);

// Get all tool definitions (for MCP server or Claude tool_use)
export function getToolDefinitions() {
  return toolRegistry.map(entry => entry.definition);
}

// Execute a tool by name
export async function executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  const entry = toolMap.get(name);
  if (!entry) throw new Error(`Unknown tool: ${name}`);
  return entry.handler(params);
}

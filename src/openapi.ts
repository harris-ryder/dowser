import { z } from 'zod';
import { BASE_URL, BRAND, CONTACT_EMAIL, DISCLAIMER, TAGLINE, VERSION } from './config.js';
import { TOOL_DEFS } from './tools/index.js';

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  description?: string;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  additionalProperties?: unknown;
  required?: string[];
}

function parameterFor(name: string, schema: JsonSchema, required: boolean) {
  const base: Record<string, unknown> = { name, in: 'query', required, description: schema.description ?? '' };
  if (schema.type === 'array') {
    return { ...base, style: 'form', explode: false, schema: { type: 'array', items: schema.items ?? { type: 'string' } }, description: `${schema.description ?? ''} Comma-separated.`.trim() };
  }
  if (schema.type === 'object') {
    return { ...base, schema: { type: 'string' }, description: `${schema.description ?? ''} Pass as a JSON object string.`.trim() };
  }
  const { description: _d, ...rest } = schema;
  return { ...base, schema: rest };
}

export function buildOpenApi() {
  const paths: Record<string, unknown> = {};
  for (const def of TOOL_DEFS) {
    const json = z.toJSONSchema(z.object(def.shape)) as JsonSchema;
    const required = new Set(json.required ?? []);
    const parameters = Object.entries(json.properties ?? {}).map(([k, v]) => parameterFor(k, v, required.has(k)));
    paths[def.restPath] = {
      get: {
        operationId: def.name,
        summary: def.title,
        description: def.description,
        parameters,
        responses: {
          '200': { description: 'JSON result. Same shape as the MCP tool of the same name.', content: { 'application/json': { schema: { type: 'object' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { type: 'object' } } } },
          '429': { description: 'Rate limited' }
        }
      }
    };
  }
  paths['/health'] = { get: { operationId: 'health', summary: 'Service and data freshness', responses: { '200': { description: 'OK' } } } };

  return {
    openapi: '3.1.0',
    info: {
      title: `${BRAND} API`,
      version: VERSION,
      summary: TAGLINE,
      description: `REST mirror of the ${BRAND} MCP tools. Every endpoint is read-only and returns JSON. MCP endpoint: ${BASE_URL}/mcp. ${DISCLAIMER}`,
      contact: { email: CONTACT_EMAIL, url: `${BASE_URL}/support` },
      termsOfService: `${BASE_URL}/terms`
    },
    servers: [{ url: BASE_URL }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'Only required when the operator has enabled API keys.' }
      }
    },
    paths
  };
}

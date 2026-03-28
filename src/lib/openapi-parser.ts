import yaml from 'js-yaml';

/**
 * Parsed endpoint representation
 */
export interface ParsedEndpoint {
  path: string;
  method: string;
  name?: string;
  description?: string;
  responses: {
    statusCode: number;
    body?: any;
  }[];
}

/**
 * Result of OpenAPI parsing operation
 */
export interface OpenAPIParseResult {
  endpoints: ParsedEndpoint[];
  errors: string[];
}

/**
 * HTTP methods to extract from OpenAPI paths
 */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const;

/**
 * T2: Parse OpenAPI file content (YAML or JSON)
 * @param content - File content as string
 * @param format - Format type: 'yaml' or 'json'
 * @returns Parsed OpenAPI document object
 */
export function parseOpenAPIFile(content: string, format: 'yaml' | 'json'): any {
  try {
    if (format === 'yaml') {
      return yaml.load(content);
    } else {
      return JSON.parse(content);
    }
  } catch (error) {
    throw new Error(`Failed to parse ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * T5: Resolve all $ref references in the document
 * Recursively finds and resolves JSON References like #/components/schemas/Xxx
 * @param doc - OpenAPI document object
 * @returns Document with all references resolved
 */
export function resolveRefs(doc: any): any {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  // Handle arrays
  if (Array.isArray(doc)) {
    return doc.map(item => resolveRefs(item));
  }

  // Handle $ref
  if ('$ref' in doc) {
    const refPath = doc.$ref;
    if (typeof refPath === 'string' && refPath.startsWith('#/')) {
      return resolveRefPointer(doc, refPath);
    }
    return doc;
  }

  // Recursively resolve refs in object properties
  const result: any = {};
  for (const [key, value] of Object.entries(doc)) {
    result[key] = resolveRefs(value);
  }
  return result;
}

/**
 * Resolve a JSON Pointer reference (e.g., #/components/schemas/User)
 */
function resolveRefPointer(rootDoc: any, pointer: string): any {
  // Remove leading # and split by /
  const parts = pointer.substring(1).split('/').filter(Boolean);

  let current: any = rootDoc;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Reference not found, return original
      return { $ref: pointer };
    }
  }

  // Recursively resolve refs in the referenced value
  return resolveRefs(current);
}

/**
 * T3: Extract API endpoints from OpenAPI paths
 * @param doc - Parsed OpenAPI document
 * @returns Array of parsed endpoints
 */
export function extractPaths(doc: any): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  if (!doc?.paths || typeof doc.paths !== 'object') {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of HTTP_METHODS) {
      if (method in pathItem) {
        const operation = pathItem[method as keyof typeof pathItem];
        if (operation && typeof operation === 'object') {
          endpoints.push(extractEndpoint(path, method.toUpperCase(), operation));
        }
      }
    }
  }

  return endpoints;
}

/**
 * Extract a single endpoint from an operation object
 */
function extractEndpoint(path: string, method: string, operation: any): ParsedEndpoint {
  const responses: ParsedEndpoint['responses'] = [];

  if (operation.responses && typeof operation.responses === 'object') {
    for (const [status, response] of Object.entries(operation.responses)) {
      const statusCode = status === 'default' ? 200 : parseInt(status, 10);
      const body = extractResponseBody(response as any);
      responses.push({ statusCode, body });
    }
  }

  return {
    path,
    method,
    name: operation.summary || operation.operationId,
    description: operation.description,
    responses,
  };
}

/**
 * Extract response body from response object
 */
function extractResponseBody(response: any): any {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const content = response.content;
  if (content && typeof content === 'object') {
    // Try to get application/json first
    const jsonContent = content['application/json'];
    if (jsonContent?.schema) {
      return jsonContent.schema;
    }
    // Fallback to first content type
    const firstContent = Object.values(content)[0] as any;
    if (firstContent?.schema) {
      return firstContent.schema;
    }
  }

  return response.schema;
}

/**
 * T7: Main parsing pipeline
 * Combines all parsing steps with comprehensive error handling
 * @param content - OpenAPI file content
 * @param format - Format type: 'yaml' or 'json'
 * @returns Parse result with endpoints and any errors
 */
export function parseAndExtract(content: string, format: 'yaml' | 'json'): OpenAPIParseResult {
  const errors: string[] = [];
  const result: OpenAPIParseResult = {
    endpoints: [],
    errors,
  };

  // Step 1: Parse file content
  let doc: any;
  try {
    doc = parseOpenAPIFile(content, format);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  // Validate basic structure
  if (!doc || typeof doc !== 'object') {
    errors.push('Invalid OpenAPI document: not an object');
    return result;
  }

  // Step 2: Resolve all $ref references
  try {
    doc = resolveRefs(doc);
  } catch (error) {
    errors.push(`Reference resolution failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 3: Extract endpoints (continue even if ref resolution had issues)
  try {
    result.endpoints = extractPaths(doc);
  } catch (error) {
    errors.push(`Endpoint extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Auto-detect format from content
 */
export function detectFormat(content: string): 'yaml' | 'json' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  return 'yaml';
}

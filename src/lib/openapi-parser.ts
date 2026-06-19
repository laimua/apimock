import yaml from 'js-yaml';

/**
 * JSON 值类型（递归）——OpenAPI 文档本质是 JSON 树
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

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
    body?: JsonValue;
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
export function parseOpenAPIFile(content: string, format: 'yaml' | 'json'): JsonValue {
  try {
    if (format === 'yaml') {
      return yaml.load(content) as JsonValue;
    } else {
      return JSON.parse(content) as JsonValue;
    }
  } catch (error) {
    throw new Error(`Failed to parse ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * T5: Resolve all $ref references in the document
 * Recursively finds and resolves JSON References like #/components/schemas/Xxx
 * @param doc - OpenAPI document node
 * @returns Node with all references resolved
 */
export function resolveRefs(doc: JsonValue): JsonValue {
  if (doc === null || typeof doc !== 'object') {
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
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(doc)) {
    result[key] = resolveRefs(value);
  }
  return result;
}

/**
 * Resolve a JSON Pointer reference (e.g., #/components/schemas/User)
 */
function resolveRefPointer(rootDoc: JsonValue, pointer: string): JsonValue {
  // Remove leading # and split by /
  const parts = pointer.substring(1).split('/').filter(Boolean);

  let current: JsonValue = rootDoc;
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current) && part in current) {
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
export function extractPaths(doc: JsonValue): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return endpoints;
  }
  const paths = (doc as JsonObject).paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) continue;
    const pathObj = pathItem as JsonObject;

    for (const method of HTTP_METHODS) {
      if (method in pathObj) {
        const operation = pathObj[method];
        if (operation && typeof operation === 'object' && !Array.isArray(operation)) {
          endpoints.push(extractEndpoint(path, method.toUpperCase(), operation as JsonObject));
        }
      }
    }
  }

  return endpoints;
}

/**
 * Extract a single endpoint from an operation object
 */
function extractEndpoint(path: string, method: string, operation: JsonObject): ParsedEndpoint {
  const responses: ParsedEndpoint['responses'] = [];

  const opResponses = operation.responses;
  if (opResponses && typeof opResponses === 'object' && !Array.isArray(opResponses)) {
    for (const [status, response] of Object.entries(opResponses as JsonObject)) {
      const statusCode = status === 'default' ? 200 : parseInt(status, 10);
      const body = extractResponseBody(response);
      responses.push({ statusCode, body });
    }
  }

  const summary = operation.summary;
  const operationId = operation.operationId;
  const description = operation.description;

  return {
    path,
    method,
    name: typeof summary === 'string' ? summary : (typeof operationId === 'string' ? operationId : undefined),
    description: typeof description === 'string' ? description : undefined,
    responses,
  };
}

/**
 * Extract response body from response object
 */
function extractResponseBody(response: JsonValue): JsonValue | undefined {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }
  const responseObj = response as JsonObject;

  const content = responseObj.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const contentObj = content as JsonObject;
    // Try to get application/json first
    const jsonContent = contentObj['application/json'] as JsonObject | undefined;
    if (jsonContent?.schema !== undefined) {
      return jsonContent.schema;
    }
    // Fallback to first content type
    const firstContent = Object.values(contentObj)[0] as JsonObject | undefined;
    if (firstContent?.schema !== undefined) {
      return firstContent.schema;
    }
  }

  return responseObj.schema;
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
  let doc: JsonValue;
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

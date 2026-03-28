// Test resolveRefs behavior
const { resolveRefs } = require('./src/lib/openapi-parser.ts');

const doc = {
  components: {
    schemas: {
      Item: { type: 'string' },
    },
  },
  data: [{ $ref: '#/components/schemas/Item' }],
};

const result = resolveRefs(doc);
console.log('Result:', JSON.stringify(result, null, 2));

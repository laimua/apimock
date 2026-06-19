// Provide a fixed ENCRYPTION_KEY so encryption.ts works without .env config.
// Must run before any test imports code that calls encrypt/decrypt.
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-fixed-do-not-use-in-prod';

import '@testing-library/jest-dom';

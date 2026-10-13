import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Remove each test's rendered output so tests cannot see one another's markup.
afterEach(cleanup);

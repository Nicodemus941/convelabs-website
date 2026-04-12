
// Jest Setup file
import '@testing-library/jest-dom';

// Mock timers
jest.useFakeTimers();

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key]),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock console.error and console.warn to fail tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = function(message) {
  // Don't fail on React Testing Library warnings
  if (message && (
    message.includes('Warning: ReactDOM.render') || 
    message.includes('Warning: React.createFactory') ||
    message.includes('Warning: React has detected a change in the order of Hooks') ||
    message.includes('Warning: An update to') ||
    message.includes('Warning: Cannot update a component')
  )) {
    originalConsoleError(message);
    return;
  }
  originalConsoleError(message);
  // Uncomment below to make console.error cause test failures
  // throw new Error(message);
};

console.warn = function(message) {
  originalConsoleWarn(message);
  // Uncomment below to make console.warn cause test failures
  // throw new Error(message);
};

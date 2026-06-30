// React 19 + react-test-renderer (jest-expo) logs "The current testing
// environment is not configured to support act(...)" for state updates that
// settle in microtasks AFTER an awaited fireEvent/waitFor — e.g. async data
// fetches in a screen's mount effect. Those tests are correct and pass; this is
// a known test-environment artifact, not a test defect. Filter ONLY that exact
// message so genuine console.error output (including "not wrapped in act(...)"
// — a real signal) still surfaces.
const realError = globalThis.console.error;
globalThis.console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('not configured to support act')) return;
  realError(...args);
};

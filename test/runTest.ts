// gramatr VS Code Extension — Test Runner Bootstrap
// This file bootstraps the VS Code test runner for integration tests.
// For unit tests, vitest is used directly (no VS Code host needed).
//
// To run integration tests that require the VS Code host:
//   npx @vscode/test-electron --extensionDevelopmentPath=. --extensionTestsPath=./dist/test/suite
//
// For now, Phase 1 uses vitest for unit tests with mocked vscode module.


export function run(): Promise<void> {
  // Placeholder for VS Code integration test runner.
  // Phase 2 will implement full integration test bootstrap.
  console.log('Test runner bootstrap — use `pnpm test` for vitest unit tests');
  return Promise.resolve();
}

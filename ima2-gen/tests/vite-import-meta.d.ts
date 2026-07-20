// Test-scope shim: ui/src modules read Vite's `import.meta.env`; the tests
// tsconfig has no vite/client types, so declare the property shape here.
interface ImportMeta {
  readonly env?: Record<string, string | boolean | undefined>;
}

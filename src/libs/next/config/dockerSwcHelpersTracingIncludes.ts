/**
 * Next.js file tracing under pnpm often keeps only a handful of `@swc/helpers`
 * `.cjs` files. At runtime Next resolves `esm/_interop_require_default.js`, so
 * Docker standalone images crash with MODULE_NOT_FOUND unless the full package
 * is force-included.
 */
export const dockerSwcHelpersTracingIncludes = [
  'node_modules/@swc/helpers/**/*',
  'node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*',
];

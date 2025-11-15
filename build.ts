const shared = {
  entrypoints: ['index.ts'],
  sourcemap: 'inline' as const,
  minify: false,
};

await Promise.all([
  Bun.build({
    ...shared,
    outdir: 'dist/esm',
    format: 'esm',
    target: 'browser',
    naming: '[name].js',
  }),
  
  // CommonJS build for Node
  Bun.build({
    ...shared,
    outdir: 'dist/cjs',
    format: 'cjs',
    target: 'node',
    naming: '[name].cjs',
  }),
]);

export { };

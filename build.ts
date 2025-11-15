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
    naming: {
      entry: '[name].js',
      chunk: '[name].js',
      asset: '[name].[ext]',
    },
  }),
  Bun.build({
    ...shared,
    outdir: 'dist/cjs',
    format: 'cjs',
    target: 'node',
    naming: {
      entry: '[name].cjs',
      chunk: '[name].cjs',
      asset: '[name].[ext]',
    },
  }),
]);

export {};
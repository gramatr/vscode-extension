import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  // bun:sqlite is runtime-only for Bun-compiled MCP binaries and must not be
  // resolved by the VS Code Node bundler.
  external: ['vscode', 'bun:sqlite'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: false,
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[gramatr] watching for changes...');
} else {
  await esbuild.build(config);
  console.log('[gramatr] build complete');
}

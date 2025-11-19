import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    // VCP插件核心模块
    { input: 'src/lib/httpCrawler.ts', outDir: 'dist/lib' },
    { input: 'src/converter/htmlToMarkdown.ts', outDir: 'dist/converter' },
    { input: 'src/utils/resolveRepoFetch.ts', outDir: 'dist/utils' },
    { input: 'src/utils/extractKeyword.ts', outDir: 'dist/utils' },
    { input: 'src/schemas/deepwiki.ts', outDir: 'dist/schemas' },
    { input: 'src/lib/linkRewrite.ts', outDir: 'dist/lib' },
    { input: 'src/lib/sanitizeSchema.ts', outDir: 'dist/lib' },
    // 保持原有入口点以便向后兼容
    { input: 'src/index.ts' },
  ],
  clean: true,
  rollup: {
    inlineDependencies: false, // VCP插件需要外部依赖
    esbuild: {
      target: 'node18',
      minify: false, // 保持可读性便于调试
    },
  },
  externals: [
    // 保持这些依赖作为外部模块
    'linkedom',
    'unified',
    'rehype-parse',
    'rehype-remark',
    'rehype-sanitize',
    'remark-gfm',
    'remark-stringify',
    'undici',
    'p-queue',
    'robots-parser',
    'wink-nlp',
    'wink-eng-lite-web-model',
    'zod'
  ],
})

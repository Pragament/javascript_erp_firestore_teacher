import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { minify as terserMinify } from 'terser';

const root = process.cwd();
const distRoot = join(root, 'dist');
const devDir = join(distRoot, 'dev');
const prodDir = join(distRoot, 'prod');
const command = process.argv[2] || 'dev';

const HTML_FILES = ['index.html', 'analytics.html', 'report.html', 'test-results.html'];
const CSS_FILES = ['style.css'];
const JS_FILES = ['utils.js', 'app.js', 'analytics.js', 'report.js', 'test-results.js'];
const PAGE_JS_ENTRIES = {
  'index.html': ['utils.js', 'app.js'],
  'analytics.html': ['utils.js', 'analytics.js'],
  'report.html': ['utils.js', 'report.js'],
  'test-results.html': ['utils.js', 'test-results.js']
};

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

async function ensureDirFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

function getContentHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 10);
}

function getProdAssetName(logicalName, content) {
  const extensionIndex = logicalName.lastIndexOf('.');
  const baseName = logicalName.slice(0, extensionIndex);
  const extension = logicalName.slice(extensionIndex + 1);
  return `${baseName}.${getContentHash(content)}.${extension}`;
}

function replaceLocalAsset(html, assetType, originalPath, nextPath) {
  const attributeName = assetType === 'script' ? 'src' : 'href';
  const matcher = new RegExp(`(${attributeName}=["'])${originalPath}(["'])`, 'g');
  return html.replace(matcher, `$1${nextPath}$2`);
}

function replaceLocalScriptsWithBundle(html, sourceFiles, bundlePath) {
  const lines = html.split('\n');
  const filteredLines = lines.filter((line) => !sourceFiles.some((sourceFile) => line.includes(`src="${sourceFile}"`) || line.includes(`src='${sourceFile}'`)));
  const bundleTag = `    <script src="${bundlePath}"></script>`;
  const bodyCloseIndex = filteredLines.findIndex((line) => line.includes('</body>'));

  if (bodyCloseIndex === -1) {
    filteredLines.push(bundleTag);
    return filteredLines.join('\n');
  }

  filteredLines.splice(bodyCloseIndex, 0, bundleTag);
  return filteredLines.join('\n');
}

async function copySourceFile(fileName, targetDir) {
  const srcPath = join(root, fileName);
  const destPath = join(targetDir, fileName);
  await ensureDirFor(destPath);
  await copyFile(srcPath, destPath);
}

async function processHtmlFile(fileName, assetsByPage) {
  const srcPath = join(root, fileName);
  const destPath = join(prodDir, fileName);
  const html = await readFile(srcPath, 'utf8');
  const pageAssets = assetsByPage[fileName];
  let rewrittenHtml = html;

  if (pageAssets?.cssPath) {
    rewrittenHtml = replaceLocalAsset(rewrittenHtml, 'style', 'style.css', pageAssets.cssPath);
  }

  if (pageAssets?.jsPath) {
    rewrittenHtml = replaceLocalScriptsWithBundle(rewrittenHtml, PAGE_JS_ENTRIES[fileName] || [], pageAssets.jsPath);
  }

  const minified = await minifyHtml(rewrittenHtml, {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    minifyCSS: true,
    minifyJS: false,
    removeComments: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true
  });

  await ensureDirFor(destPath);
  await writeFile(destPath, minified, 'utf8');
}

async function processCssFile(fileName) {
  const srcPath = join(root, fileName);
  const css = await readFile(srcPath, 'utf8');
  const result = new CleanCSS({ level: 2 }).minify(css);

  if (result.errors.length > 0) {
    throw new Error(`CSS minify failed for ${fileName}: ${result.errors.join('; ')}`);
  }

  const hashedName = getProdAssetName(fileName, result.styles);
  const destPath = join(prodDir, 'assets', hashedName);
  await ensureDirFor(destPath);
  await writeFile(destPath, result.styles, 'utf8');
  return `assets/${hashedName}`;
}

async function buildPageBundle(fileName) {
  const sources = PAGE_JS_ENTRIES[fileName] || [];
  const chunks = await Promise.all(
    sources.map(async (sourceFile) => {
      const code = await readFile(join(root, sourceFile), 'utf8');
      return `/* ${sourceFile} */\n${code.trim()}`;
    })
  );
  return `(function(){'use strict';\n${chunks.join('\n\n')}\n})();`;
}

async function processJsBundle(fileName) {
  const code = await buildPageBundle(fileName);
  const terserResult = await terserMinify(code, {
    compress: {
      drop_console: true,
      passes: 2
    },
    format: {
      comments: false
    },
    mangle: true,
    sourceMap: false
  });

  if (!terserResult.code) {
    throw new Error(`JS minify failed for bundle ${fileName}`);
  }

  const obfuscated = JavaScriptObfuscator.obfuscate(terserResult.code, obfuscatorOptions).getObfuscatedCode();
  const bundleName = fileName.replace(/\.html$/, '.js');
  const hashedName = getProdAssetName(bundleName, obfuscated);
  const destPath = join(prodDir, 'assets', hashedName);

  await ensureDirFor(destPath);
  await writeFile(destPath, obfuscated, 'utf8');
  return `assets/${hashedName}`;
}

async function runBuildDev() {
  await rm(devDir, { force: true, recursive: true });
  await mkdir(devDir, { recursive: true });

  for (const fileName of HTML_FILES) {
    await copySourceFile(fileName, devDir);
  }

  for (const fileName of CSS_FILES) {
    await copySourceFile(fileName, devDir);
  }

  for (const fileName of JS_FILES) {
    await copySourceFile(fileName, devDir);
  }

  console.log(`Built readable development output in ${devDir}`);
}

async function runBuildProd() {
  await rm(prodDir, { force: true, recursive: true });
  await mkdir(prodDir, { recursive: true });

  const cssPath = await processCssFile('style.css');
  const assetsByPage = {};

  for (const fileName of HTML_FILES) {
    assetsByPage[fileName] = {
      cssPath,
      jsPath: await processJsBundle(fileName)
    };
  }

  for (const fileName of HTML_FILES) {
    await processHtmlFile(fileName, assetsByPage);
  }

  console.log(`Built hardened release output in ${prodDir}`);
}

async function runClean() {
  await rm(distRoot, { force: true, recursive: true });
  console.log(`Cleaned ${distRoot}`);
}

if (command === 'clean') {
  await runClean();
} else if (command === 'dev') {
  await runBuildDev();
} else if (command === 'prod') {
  await runBuildProd();
} else {
  throw new Error(`Unsupported command: ${command}. Use "dev", "prod", or "clean".`);
}

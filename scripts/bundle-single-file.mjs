/**
 * Standalone Single-File Offline HTML Bundler
 * Inlines all CSS, JS, pdf.js, pdf.worker, and pdf-lib into a single zero-dependency index.html
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const vendorDir = path.join(rootDir, 'vendor');
const outputDir = path.join(rootDir, 'dist_offline');

async function bundleSingleFile() {
  console.log('📦 Starting Single-File Offline Bundle creation...');

  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ directory not found. Please run "npm run build" first.');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Read vendor libraries (from vendor/ or node_modules/)
  let pdfJsCode = '';
  let pdfWorkerCode = '';
  let pdfLibCode = '';

  const pdfJsPath = path.join(vendorDir, 'pdf.min.js');
  const pdfWorkerPath = path.join(vendorDir, 'pdf.worker.min.js');
  const pdfLibPath = path.join(vendorDir, 'pdf-lib.min.js');

  const nmPdfJs = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js');
  const nmPdfWorker = path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js');
  const nmPdfLib = path.join(rootDir, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js');

  if (fs.existsSync(pdfJsPath)) {
    pdfJsCode = fs.readFileSync(pdfJsPath, 'utf8');
    console.log('✓ Found vendor/pdf.min.js');
  } else if (fs.existsSync(nmPdfJs)) {
    pdfJsCode = fs.readFileSync(nmPdfJs, 'utf8');
    console.log('✓ Found node_modules/pdfjs-dist/build/pdf.min.js');
  } else {
    console.warn('⚠️ Warning: pdf.min.js not found in vendor/ or node_modules/');
  }

  if (fs.existsSync(pdfWorkerPath)) {
    pdfWorkerCode = fs.readFileSync(pdfWorkerPath, 'utf8');
    console.log('✓ Found vendor/pdf.worker.min.js');
  } else if (fs.existsSync(nmPdfWorker)) {
    pdfWorkerCode = fs.readFileSync(nmPdfWorker, 'utf8');
    console.log('✓ Found node_modules/pdfjs-dist/build/pdf.worker.min.js');
  } else {
    console.warn('⚠️ Warning: pdf.worker.min.js not found in vendor/ or node_modules/');
  }

  if (fs.existsSync(pdfLibPath)) {
    pdfLibCode = fs.readFileSync(pdfLibPath, 'utf8');
    console.log('✓ Found vendor/pdf-lib.min.js');
  } else if (fs.existsSync(nmPdfLib)) {
    pdfLibCode = fs.readFileSync(nmPdfLib, 'utf8');
    console.log('✓ Found node_modules/pdf-lib/dist/pdf-lib.min.js');
  } else {
    console.warn('⚠️ Warning: pdf-lib.min.js not found in vendor/ or node_modules/');
  }

  // 2. Locate built assets in dist/assets
  const assetsDir = path.join(distDir, 'assets');
  let appJsCode = '';
  let appCssCode = '';

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    for (const f of files) {
      if (f.endsWith('.js')) {
        appJsCode += '\n' + fs.readFileSync(path.join(assetsDir, f), 'utf8');
      } else if (f.endsWith('.css')) {
        appCssCode += '\n' + fs.readFileSync(path.join(assetsDir, f), 'utf8');
      }
    }
  }

  // 3. Worker Blob inline injector for offline file:// compatibility
  let workerInlineScript = '';
  if (pdfWorkerCode) {
    workerInlineScript = `
    <script>
      (function() {
        try {
          var workerBlob = new Blob([${JSON.stringify(pdfWorkerCode)}], { type: 'application/javascript' });
          var workerUrl = URL.createObjectURL(workerBlob);
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
          }
        } catch(e) {
          console.warn('Worker blob setup warning:', e);
        }
      })();
    </script>
    `;
  }

  // 4. Assemble the single self-contained HTML file
  const singleHtmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Editor - Offline Single File</title>
    <meta name="description" content="Offline zero-dependency web PDF editor" />
    <style>
      ${appCssCode}
    </style>
  </head>
  <body class="bg-slate-950 text-slate-100 overflow-hidden m-0 p-0 select-none">
    <div id="root"></div>

    <!-- Vendor: PDF.js & pdf-lib (Offline Inlined) -->
    ${pdfJsCode ? `<script>\n${pdfJsCode}\n</script>` : ''}
    ${workerInlineScript}
    ${pdfLibCode ? `<script>\n${pdfLibCode}\n</script>` : ''}

    <!-- Application Compiled Logic (Offline Inlined) -->
    <script type="module">
      ${appJsCode}
    </script>
  </body>
</html>`;

  const outputPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(outputPath, singleHtmlContent, 'utf8');

  console.log(`\n🎉 Success! Standalone single-file HTML generated:`);
  console.log(`   --> ${outputPath}`);
  console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  console.log(`   You can open this file directly in any browser using file:// protocol!\n`);
}

bundleSingleFile().catch((err) => {
  console.error('Single-file bundling error:', err);
  process.exit(1);
});

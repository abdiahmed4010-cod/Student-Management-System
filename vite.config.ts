import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const VIRTUAL_ARCHIVE_ID = 'virtual:alimaama-project-files';
const RESOLVED_VIRTUAL_ARCHIVE_ID = '\0' + VIRTUAL_ARCHIVE_ID;

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.aistudio',
  '.vite',
  '.cache',
  'tmp'
]);

const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip']);

function isSensitiveOrExcludedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  const lower = normalized.toLowerCase();

  if (baseName === '.env.example') return false;
  if (baseName === '.env' || baseName.startsWith('.env.')) return true;
  if (baseName === '.DS_Store' || baseName === 'bun.lock') return true;
  if (lower.endsWith('.log') || lower.endsWith('.tmp') || lower.endsWith('.zip')) return true;
  if (lower.endsWith('.pem') || lower.endsWith('.key') || lower.endsWith('.p12') || lower.endsWith('.pfx')) return true;
  if (lower.includes('firebase-applet-config') || lower.includes('service-account') || lower.includes('credentials')) return true;
  if (normalized === 'public/assets/aistudio/Image_7_783225c4.markdown') return true;
  return false;
}

function collectProjectArchiveFiles(rootDir: string) {
  const textFiles: Record<string, string> = {};
  const binaryAssetUrls: Array<{archivePath: string; fetchUrl: string}> = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, {withFileTypes: true});
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (isSensitiveOrExcludedFile(relPath)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTS.has(ext)) {
          if (relPath.startsWith('public/')) {
            binaryAssetUrls.push({
              archivePath: relPath,
              fetchUrl: '/' + relPath.slice('public/'.length),
            });
          }
        } else {
          textFiles[relPath] = fs.readFileSync(fullPath, 'utf8');
        }
      }
    }
  }

  walk(rootDir);
  return {
    generatedAt: new Date().toISOString(),
    textFiles,
    binaryAssetUrls,
  };
}

function alimaamaProjectZipPlugin(): Plugin {
  const rootDir = path.resolve(__dirname);

  return {
    name: 'alimaama-project-zip-plugin',
    resolveId(id) {
      if (id === VIRTUAL_ARCHIVE_ID) {
        return RESOLVED_VIRTUAL_ARCHIVE_ID;
      }
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ARCHIVE_ID) {
        const payload = collectProjectArchiveFiles(rootDir);
        return `export default ${JSON.stringify(payload)};`;
      }
    },
    configureServer(server) {
      server.middlewares.use('/AL-IMAAMA-Complete-Project.zip', (_req, res, next) => {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="AL-IMAAMA-Complete-Project.zip"');
        res.setHeader('Cache-Control', 'no-store');
        next();
      });

      server.middlewares.use('/__api/project-archive-files.json', (_req, res) => {
        try {
          const payload = collectProjectArchiveFiles(rootDir);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(payload));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({error: err instanceof Error ? err.message : 'Failed to package project files'}));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), alimaamaProjectZipPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});


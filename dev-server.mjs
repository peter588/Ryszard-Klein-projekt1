import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

function loadLocalEnv() {
  const candidateFiles = ['.env.local', '.env'];

  for (const filename of candidateFiles) {
    const envPath = path.join(rootDir, filename);
    if (!existsSync(envPath)) continue;

    const source = readFileSyncSafe(envPath);
    for (const line of source.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readFileSyncSafe(filePath) {
  return readFileSync(filePath, 'utf8');
}

loadLocalEnv();

const port = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.heic': 'image/heic',
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function createResponseHelpers(nodeRes) {
  return {
    status(code) {
      nodeRes.statusCode = code;
      return this;
    },
    json(payload) {
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.end(JSON.stringify(payload));
    },
    setHeader(name, value) {
      nodeRes.setHeader(name, value);
    },
    end(value) {
      nodeRes.end(value);
    },
  };
}

async function parseBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  const rawBody = Buffer.concat(chunks).toString('utf8');
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new Error('Niepoprawny JSON w żądaniu.');
    }
  }

  return { rawBody };
}

async function handleApi(req, res, pathname) {
  const apiRelativePath = pathname.replace(/^\/+/, '');
  const apiFilePath = path.join(rootDir, `${apiRelativePath}.js`);

  try {
    await stat(apiFilePath);
  } catch {
    sendJson(res, 404, { error: 'API route not found' });
    return;
  }

  try {
    req.body = await parseBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  try {
    const moduleUrl = `${pathToFileURL(apiFilePath).href}?t=${Date.now()}`;
    const apiModule = await import(moduleUrl);
    const handler = apiModule.default;

    if (typeof handler !== 'function') {
      sendJson(res, 500, { error: 'Nieprawidłowy handler API.' });
      return;
    }

    await handler(req, createResponseHelpers(res));
  } catch (error) {
    console.error('Local API error:', error);
    sendJson(res, 500, { error: error.message || 'Błąd lokalnego serwera API.' });
  }
}

async function handleStatic(req, res, pathname) {
  let requestPath = decodeURIComponent(pathname);

  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  let finalPath = filePath;

  try {
    const fileStat = await stat(finalPath);
    if (fileStat.isDirectory()) {
      finalPath = path.join(finalPath, 'index.html');
    }
  } catch {
    if (!path.extname(finalPath)) {
      finalPath = `${finalPath}.html`;
    }
  }

  try {
    const fileContents = await readFile(finalPath);
    const ext = path.extname(finalPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(fileContents);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname);
    return;
  }

  await handleStatic(req, res, pathname);
});

server.listen(port, () => {
  console.log(`Ryszard Klein local server running at http://localhost:${port}`);
});

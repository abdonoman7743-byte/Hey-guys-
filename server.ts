import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { adminAuth } from './server/firebaseAdmin';
import { buildRtcConfig } from './server/rtcConfig';
import { attachSignalingServer } from './server/signaling';
import { notifyUserByPush, type UserPushNotifier } from './server/pushService';

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string;
}

export function createAppServer(options?: {
  verifyToken?: (token: string) => Promise<{ uid: string; email?: string }>;
  pushNotifier?: UserPushNotifier;
}) {
  const app = express();
  const httpServer = http.createServer(app);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  const verifyFn =
    options?.verifyToken ||
    (async (token: string) => {
      const decoded = await adminAuth.verifyIdToken(token);
      return { uid: decoded.uid, email: decoded.email };
    });

  const requireAuth = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: missing Bearer token' });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: empty token' });
    }
    try {
      const decoded = await verifyFn(token);
      req.uid = decoded.uid;
      req.email = decoded.email;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/rtc-config', requireAuth, (_req, res) => {
    res.json(buildRtcConfig());
  });

  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  attachSignalingServer(io, verifyFn, options?.pushNotifier || notifyUserByPush);

  return { app, httpServer, io };
}

async function startServer() {
  const { app, httpServer } = createAppServer();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // HMR is intentionally disabled in this environment; serve a clean no-socket /@vite/client
    // so Vite CSS/module runtime helpers work without opening failing HMR WebSockets.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript');
      res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Nidaa server listening on http://0.0.0.0:${port}`);
  });
}

// Start only when invoked as entrypoint (so unit tests can import createAppServer cleanly)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.mjs'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

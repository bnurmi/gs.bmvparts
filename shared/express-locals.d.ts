// Type augmentation for Express's app.locals so dev-only middleware can
// safely consume the Vite dev server we attach in server/vite.ts.
//
// Per-request Locals (res.locals) intentionally not extended here.

import type { ViteDevServer } from "vite";

declare global {
  namespace Express {
    interface Locals {
      vite?: ViteDevServer;
    }
  }
}

export {};

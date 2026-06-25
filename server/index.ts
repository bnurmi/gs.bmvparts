import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth } from "./auth";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "bmvparts", uptime: process.uptime() });
});

app.get("/ready", (_req, res) => {
  res.status(200).json({ status: "ready", service: "bmvparts" });
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "100mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

declare global {
  namespace Express {
    interface Request {
      bmvVinHost?: boolean;
    }
  }
}

function isBmvVinHostname(hostHeader: string | undefined): boolean {
  const hostname = (hostHeader || "").split(":")[0]?.toLowerCase() || "";
  return hostname === "bmv.vin" || hostname === "www.bmv.vin" || hostname.endsWith(".bmv.vin");
}

// Tag vanity-host traffic before registering routes. The bmv.vin SEO/router
// layer depends on this to keep the VIN surface separate from bmv.parts.
app.use((req, _res, next) => {
  const forwardedHost = req.header("x-forwarded-host");
  req.bmvVinHost = isBmvVinHostname(forwardedHost || req.header("host"));
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse !== undefined) {
        if (Array.isArray(capturedJsonResponse)) {
          logLine += ` :: array(length=${capturedJsonResponse.length})`;
        } else if (capturedJsonResponse && typeof capturedJsonResponse === "object") {
          const keys = Object.keys(capturedJsonResponse as Record<string, unknown>).slice(0, 8).join(",");
          logLine += ` :: object(keys=${keys})`;
        } else {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  setupAuth(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

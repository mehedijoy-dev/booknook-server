import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getAuthUrl(): string {
  const url = process.env.AUTH_URL;
  if (!url) {
    throw new Error("AUTH_URL is not set in environment variables");
  }
  return url.replace(/\/$/, "");
}

// Created on first use, because dotenv loads after the imports run
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${getAuthUrl()}/api/auth/jwks`));
  }
  return jwks;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Please log in to continue" });
    return;
  }

  try {
    const authUrl = getAuthUrl();
    const { payload } = await jwtVerify(header.slice(7), getJwks(), {
      issuer: authUrl,
      audience: authUrl,
    });

    const id = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const name = typeof payload.name === "string" ? payload.name : "";

    if (!id || !email) {
      res.status(401).json({ message: "Invalid login token" });
      return;
    }

    req.user = { id, email, name: name || email };
    next();
  } catch (error) {
    console.error(
      "JWT verification failed:",
      error instanceof Error ? error.message : error,
    );
    res
      .status(401)
      .json({ message: "Your session has expired. Please log in again." });
  }
}

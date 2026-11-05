import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getDb } from "./db";
import booksRouter from "./routes/books";
import borrowsRouter from "./routes/borrows";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CLIENT_URL can hold more than one address, separated by commas
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "BookNook server is running" });
});

app.use("/books", booksRouter);
app.use("/borrows", borrowsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

// On Vercel the platform runs the app, locally we start it ourselves
if (!process.env.VERCEL) {
  getDb()
    .then(() => {
      app.listen(port, () => {
        console.log(`BookNook server listening on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error);
      process.exit(1);
    });
}

export default app;

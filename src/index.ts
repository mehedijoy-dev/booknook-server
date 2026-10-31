import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getDb } from "./db";
import booksRouter from "./routes/books";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "BookNook server is running" });
});

app.use("/books", booksRouter);

async function start() {
  try {
    await getDb();
    app.listen(port, () => {
      console.log(`BookNook server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();

export default app;

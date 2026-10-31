import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db";
import { Book } from "../types";

const router = Router();

// GET /books?limit=6  (newest first)
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 100);

    let cursor = db.collection<Book>("books").find().sort({ createdAt: -1 });
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const books = await cursor.toArray();
    res.json(books);
  } catch (error) {
    console.error("GET /books failed:", error);
    res.status(500).json({ message: "Could not load books" });
  }
});

// GET /books/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const db = await getDb();
    const book = await db
      .collection<Book>("books")
      .findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json(book);
  } catch (error) {
    console.error("GET /books/:id failed:", error);
    res.status(500).json({ message: "Could not load the book" });
  }
});

export default router;

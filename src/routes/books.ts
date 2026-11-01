import { Filter, ObjectId } from "mongodb";
import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { AuthUser, requireAuth } from "../middleware/auth";
import { Book, CATEGORIES, Category } from "../types";

const router = Router();

// GET /books?limit=6  (public, newest first)
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 100);

    const addedBy = String(req.query.addedBy ?? "").trim();
    const filter: Filter<Book> = addedBy ? { "addedBy.email": addedBy } : {};

    let cursor = db
      .collection<Book>("books")
      .find(filter)
      .sort({ createdAt: -1 });
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

// GET /books/:id (public)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid book id" });
      return;
    }

    const db = await getDb();
    const book = await db
      .collection<Book>("books")
      .findOne({ _id: new ObjectId(id) });

    if (!book) {
      res.status(404).json({ message: "Book not found" });
      return;
    }

    res.json(book);
  } catch (error) {
    console.error("GET /books/:id failed:", error);
    res.status(500).json({ message: "Could not load the book" });
  }
});

// POST /books (JWT)
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { title, author, category, image, description, totalCopies } =
      req.body ?? {};

    const copies = Number(totalCopies);

    if (typeof title !== "string" || !title.trim()) {
      res.status(400).json({ message: "Book title is required" });
      return;
    }
    if (typeof author !== "string" || !author.trim()) {
      res.status(400).json({ message: "Author name is required" });
      return;
    }
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      res.status(400).json({ message: "Please choose a valid category" });
      return;
    }
    if (typeof image !== "string" || !image.trim()) {
      res.status(400).json({ message: "Book image is required" });
      return;
    }
    if (typeof description !== "string" || !description.trim()) {
      res.status(400).json({ message: "Short description is required" });
      return;
    }
    if (!Number.isInteger(copies) || copies < 1) {
      res
        .status(400)
        .json({ message: "Total copies must be a whole number of 1 or more" });
      return;
    }

    const book: Book = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      totalCopies: copies,
      availableCopies: copies,
      addedBy: { name: user.name, email: user.email },
      createdAt: new Date(),
    };

    const db = await getDb();
    const result = await db.collection<Book>("books").insertOne(book);

    res.status(201).json({ ...book, _id: result.insertedId });
  } catch (error) {
    console.error("POST /books failed:", error);
    res.status(500).json({ message: "Could not add the book" });
  }
});

// PATCH /books/:id (JWT, owner only)
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid book id" });
      return;
    }
    const objectId = new ObjectId(id);

    const { title, author, category, image, description, totalCopies } =
      req.body ?? {};

    const db = await getDb();
    const books = db.collection<Book>("books");
    const book = await books.findOne({ _id: objectId });

    if (!book) {
      res.status(404).json({ message: "Book not found" });
      return;
    }
    if (book.addedBy.email !== user.email) {
      res.status(403).json({ message: "You can only edit your own books" });
      return;
    }

    const updates: Partial<Book> = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        res.status(400).json({ message: "Book title cannot be empty" });
        return;
      }
      updates.title = title.trim();
    }
    if (author !== undefined) {
      if (typeof author !== "string" || !author.trim()) {
        res.status(400).json({ message: "Author name cannot be empty" });
        return;
      }
      updates.author = author.trim();
    }
    if (category !== undefined) {
      if (!(CATEGORIES as readonly string[]).includes(category)) {
        res.status(400).json({ message: "Please choose a valid category" });
        return;
      }
      updates.category = category as Category;
    }
    if (image !== undefined) {
      if (typeof image !== "string" || !image.trim()) {
        res.status(400).json({ message: "Book image cannot be empty" });
        return;
      }
      updates.image = image.trim();
    }
    if (description !== undefined) {
      if (typeof description !== "string" || !description.trim()) {
        res.status(400).json({ message: "Description cannot be empty" });
        return;
      }
      updates.description = description.trim();
    }
    if (totalCopies !== undefined) {
      const copies = Number(totalCopies);
      if (!Number.isInteger(copies) || copies < 1) {
        res.status(400).json({
          message: "Total copies must be a whole number of 1 or more",
        });
        return;
      }
      // Copies that are currently borrowed must stay covered
      const borrowed = book.totalCopies - book.availableCopies;
      if (copies < borrowed) {
        res.status(400).json({
          message: `${borrowed} copies are currently borrowed, so total copies cannot be less than ${borrowed}`,
        });
        return;
      }
      updates.totalCopies = copies;
      updates.availableCopies = copies - borrowed;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: "Nothing to update" });
      return;
    }

    await books.updateOne({ _id: objectId }, { $set: updates });
    const updated = await books.findOne({ _id: objectId });

    res.json(updated);
  } catch (error) {
    console.error("PATCH /books/:id failed:", error);
    res.status(500).json({ message: "Could not update the book" });
  }
});

// DELETE /books/:id (JWT, owner only)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid book id" });
      return;
    }
    const objectId = new ObjectId(id);

    const db = await getDb();
    const books = db.collection<Book>("books");
    const book = await books.findOne({ _id: objectId });

    if (!book) {
      res.status(404).json({ message: "Book not found" });
      return;
    }
    if (book.addedBy.email !== user.email) {
      res.status(403).json({ message: "You can only delete your own books" });
      return;
    }

    await books.deleteOne({ _id: objectId });
    // Remove borrow records of this book so no orphan rows remain
    await db.collection("borrows").deleteMany({ bookId: id });

    res.json({ message: "Book deleted", deletedId: id });
  } catch (error) {
    console.error("DELETE /books/:id failed:", error);
    res.status(500).json({ message: "Could not delete the book" });
  }
});

export default router;

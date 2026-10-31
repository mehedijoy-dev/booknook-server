import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db";
import { Book, CATEGORIES, Category } from "../types";

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

// POST /books
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
      addedBy,
    } = req.body ?? {};

    const copies = Number(totalCopies);

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Book title is required" });
    }
    if (typeof author !== "string" || !author.trim()) {
      return res.status(400).json({ message: "Author name is required" });
    }
    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return res
        .status(400)
        .json({ message: "Please choose a valid category" });
    }
    if (typeof image !== "string" || !image.trim()) {
      return res.status(400).json({ message: "Book image is required" });
    }
    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ message: "Short description is required" });
    }
    if (!Number.isInteger(copies) || copies < 1) {
      return res
        .status(400)
        .json({ message: "Total copies must be a whole number of 1 or more" });
    }
    if (!addedBy?.name || !addedBy?.email) {
      return res
        .status(400)
        .json({ message: "Owner name and email are required" });
    }

    const book: Book = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      totalCopies: copies,
      availableCopies: copies,
      addedBy: { name: addedBy.name, email: addedBy.email },
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

// PATCH /books/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }
    const objectId = new ObjectId(id);

    const {
      requesterEmail,
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body ?? {};

    const db = await getDb();
    const books = db.collection<Book>("books");
    const book = await books.findOne({ _id: objectId });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    if (!requesterEmail || book.addedBy.email !== requesterEmail) {
      return res
        .status(403)
        .json({ message: "You can only edit your own books" });
    }

    const updates: Partial<Book> = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Book title cannot be empty" });
      }
      updates.title = title.trim();
    }
    if (author !== undefined) {
      if (typeof author !== "string" || !author.trim()) {
        return res.status(400).json({ message: "Author name cannot be empty" });
      }
      updates.author = author.trim();
    }
    if (category !== undefined) {
      if (!(CATEGORIES as readonly string[]).includes(category)) {
        return res
          .status(400)
          .json({ message: "Please choose a valid category" });
      }
      updates.category = category as Category;
    }
    if (image !== undefined) {
      if (typeof image !== "string" || !image.trim()) {
        return res.status(400).json({ message: "Book image cannot be empty" });
      }
      updates.image = image.trim();
    }
    if (description !== undefined) {
      if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ message: "Description cannot be empty" });
      }
      updates.description = description.trim();
    }
    if (totalCopies !== undefined) {
      const copies = Number(totalCopies);
      if (!Number.isInteger(copies) || copies < 1) {
        return res.status(400).json({
          message: "Total copies must be a whole number of 1 or more",
        });
      }
      // Copies that are currently borrowed must stay covered
      const borrowed = book.totalCopies - book.availableCopies;
      if (copies < borrowed) {
        return res.status(400).json({
          message: `${borrowed} copies are currently borrowed, so total copies cannot be less than ${borrowed}`,
        });
      }
      updates.totalCopies = copies;
      updates.availableCopies = copies - borrowed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    await books.updateOne({ _id: objectId }, { $set: updates });
    const updated = await books.findOne({ _id: objectId });

    res.json(updated);
  } catch (error) {
    console.error("PATCH /books/:id failed:", error);
    res.status(500).json({ message: "Could not update the book" });
  }
});

// DELETE /books/:id?email=owner@example.com
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book id" });
    }
    const objectId = new ObjectId(id);

    const requesterEmail = String(req.query.email ?? "");

    const db = await getDb();
    const books = db.collection<Book>("books");
    const book = await books.findOne({ _id: objectId });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    if (!requesterEmail || book.addedBy.email !== requesterEmail) {
      return res
        .status(403)
        .json({ message: "You can only delete your own books" });
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

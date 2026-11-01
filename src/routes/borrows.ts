import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db";
import { AuthUser, requireAuth } from "../middleware/auth";
import { Book, Borrow } from "../types";

const router = Router();

const BORROW_DAYS = 7;

// POST /borrows (JWT)
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const { bookId } = req.body ?? {};

    if (typeof bookId !== "string" || !ObjectId.isValid(bookId)) {
      res.status(400).json({ message: "A valid book id is required" });
      return;
    }

    const db = await getDb();
    const books = db.collection<Book>("books");
    const borrows = db.collection<Borrow>("borrows");
    const bookObjectId = new ObjectId(bookId);

    const book = await books.findOne({ _id: bookObjectId });
    if (!book) {
      res.status(404).json({ message: "Book not found" });
      return;
    }
    if (book.availableCopies < 1) {
      res.status(409).json({ message: "This book is not available right now" });
      return;
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setDate(returnDate.getDate() + BORROW_DAYS);

    const borrow: Borrow = {
      bookId,
      bookTitle: book.title,
      bookImage: book.image,
      userName: user.name,
      userEmail: user.email,
      borrowDate,
      returnDate,
    };

    // Unique index on (bookId, userEmail) blocks a double borrow
    let insertedId: ObjectId;
    try {
      const result = await borrows.insertOne(borrow);
      insertedId = result.insertedId;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) {
        res
          .status(409)
          .json({ message: "You have already borrowed this book" });
        return;
      }
      throw error;
    }

    // Take one copy, only if one is still left
    const updated = await books.findOneAndUpdate(
      { _id: bookObjectId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: "after" },
    );

    if (!updated) {
      // Someone took the last copy a moment ago, undo our borrow record
      await borrows.deleteOne({ _id: insertedId });
      res.status(409).json({ message: "This book is not available right now" });
      return;
    }

    res.status(201).json({ ...borrow, _id: insertedId });
  } catch (error) {
    console.error("POST /borrows failed:", error);
    res.status(500).json({ message: "Could not borrow the book" });
  }
});

// GET /borrows (JWT, only the logged in user's borrows, newest first)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;

    const db = await getDb();
    const list = await db
      .collection<Borrow>("borrows")
      .find({ userEmail: user.email })
      .sort({ borrowDate: -1 })
      .toArray();

    res.json(list);
  } catch (error) {
    console.error("GET /borrows failed:", error);
    res.status(500).json({ message: "Could not load your borrows" });
  }
});

// DELETE /borrows/:id (JWT, return a book)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthUser;
    const id = String(req.params.id);
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid borrow id" });
      return;
    }

    const db = await getDb();
    const borrows = db.collection<Borrow>("borrows");
    const borrow = await borrows.findOne({ _id: new ObjectId(id) });

    if (!borrow) {
      res.status(404).json({ message: "Borrow record not found" });
      return;
    }
    if (borrow.userEmail !== user.email) {
      res
        .status(403)
        .json({ message: "You can only return books you borrowed" });
      return;
    }

    await borrows.deleteOne({ _id: borrow._id });

    // Give the copy back (no error if the book was deleted meanwhile)
    if (ObjectId.isValid(borrow.bookId)) {
      await db
        .collection<Book>("books")
        .updateOne(
          { _id: new ObjectId(borrow.bookId) },
          { $inc: { availableCopies: 1 } },
        );
    }

    res.json({ message: "Book returned", returnedId: id });
  } catch (error) {
    console.error("DELETE /borrows/:id failed:", error);
    res.status(500).json({ message: "Could not return the book" });
  }
});

export default router;

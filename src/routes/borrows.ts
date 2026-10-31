import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db";
import { Book, Borrow } from "../types";

const router = Router();

const BORROW_DAYS = 7;

// POST /borrows
router.post("/", async (req: Request, res: Response) => {
  try {
    const { bookId, userName, userEmail } = req.body ?? {};

    if (typeof bookId !== "string" || !ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "A valid book id is required" });
    }
    if (!userName || !userEmail) {
      return res
        .status(400)
        .json({ message: "User name and email are required" });
    }

    const db = await getDb();
    const books = db.collection<Book>("books");
    const borrows = db.collection<Borrow>("borrows");
    const bookObjectId = new ObjectId(bookId);

    const book = await books.findOne({ _id: bookObjectId });
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    if (book.availableCopies < 1) {
      return res
        .status(409)
        .json({ message: "This book is not available right now" });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setDate(returnDate.getDate() + BORROW_DAYS);

    const borrow: Borrow = {
      bookId,
      bookTitle: book.title,
      bookImage: book.image,
      userName,
      userEmail,
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
        return res
          .status(409)
          .json({ message: "You have already borrowed this book" });
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
      return res
        .status(409)
        .json({ message: "This book is not available right now" });
    }

    res.status(201).json({ ...borrow, _id: insertedId });
  } catch (error) {
    console.error("POST /borrows failed:", error);
    res.status(500).json({ message: "Could not borrow the book" });
  }
});

export default router;

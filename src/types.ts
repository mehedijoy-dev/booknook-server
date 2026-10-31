import { ObjectId } from "mongodb";

export const CATEGORIES = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Book {
  _id?: ObjectId;
  title: string;
  author: string;
  category: Category;
  image: string;
  description: string;
  totalCopies: number;
  availableCopies: number;
  addedBy: {
    name: string;
    email: string;
  };
  createdAt: Date;
}

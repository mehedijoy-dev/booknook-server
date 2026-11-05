# BookNook Server

REST API for [BookNook](https://booknook-client-gilt.vercel.app), a small online library.

**Live API:** https://booknook-server-seven-indol.vercel.app

## Features

- Express and TypeScript API on MongoDB Atlas
- JWT validation with the public keys (JWKS) published by Better Auth
- Newest first book list with an optional limit, and a filter by owner email
- Atomic copy counting with `$inc` when a book is borrowed or returned
- A unique index that blocks borrowing the same book twice

## API routes

| Method | Route          | Access                |
| ------ | -------------- | --------------------- |
| GET    | `/books`       | Public                |
| GET    | `/books/:id`   | Public                |
| POST   | `/books`       | JWT                   |
| PATCH  | `/books/:id`   | JWT, owner only       |
| DELETE | `/books/:id`   | JWT, owner only       |
| POST   | `/borrows`     | JWT                   |
| GET    | `/borrows`     | JWT, your own borrows |
| DELETE | `/borrows/:id` | JWT, returns the book |

## Run locally

```bash
git clone https://github.com/mehedijoy-dev/booknook-server.git
cd booknook-server
npm install
npm run dev
```

Create a `.env` file with these variables:

```
PORT=5000
MONGODB_URI=
DB_NAME=booknook
CLIENT_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
```

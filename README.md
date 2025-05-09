# NeDBoose

A minimal Mongoose-like wrapper for `@seald-io/nedb` in vanilla Node.js.

## Dependencies

```bash
@seald-io/nedb
```

## Features

* **Schema validation**: required fields (`required`), default values (`default`), type checking (String, Number, Array, etc.).
* **Indexing & Unique**: fields with the `index` or `unique` flag are automatically indexed.
* **TTL index**: expire documents via `ttl` in seconds.
* **CRUD**: `create`, `find`, `findOne`, `update`, `delete`.
* **Populate**: resolve references to other models (`ref`), including batch fetching (avoiding N+1).
* **Query options**: `sort()`, `skip()`, `limit()`.
* **Autocompaction**: automatic database compaction.
* **In-memory**: optional via `inMemoryOnly`.

## Usage

### Defining Models

```js
const { model } = require('nedboose');

// Author
const Author = model('Author', {
  name:   { type: String, required: true, unique: true, index: true },
  books:  { type: Array,  ref: 'Book', default: [] },
});

// Book
const Book = model('Book', {
  title:       { type: String, required: true, index: true },
  publishedAt: { type: Date,   default: () => new Date(), ttl: 60 * 60 * 24 * 30 }, // 30 days
  author:      { type: String, ref: 'Author', required: true },
});
```

### Creating Documents

```js
(async () => {
  const author = await Author.create({ name: 'Franz Kafka' });
  const book1  = await Book.create({ title: 'Der Process', author: author._id });
  const book2  = await Book.create({ title: 'Die Verwandlung', author: author._id });
})();
```

### Resolving References (Populate)

```js
(async () => {
  // Single query with populate
  const book = await Book
    .findOne({ title: 'Der Process' })
    .populate('author')
    .exec();
  console.log(book.author.name); // 'Franz Kafka'

  // Many-to-One
  const authors = await Author
    .find({})
    .populate('books')
    .sort({ name: 1 })
    .limit(10)
    .exec();
  authors.forEach(a => {
    console.log(a.name, a.books.map(b => b.title));
  });
})();
```

## Options

When creating a model you can pass a third `options` object:

```js
const Session = model('Session', { /* schema */ }, {
  inMemoryOnly: true,
  autocompactionInterval: 60000, // every minute
});
```

* `inMemoryOnly` (boolean): keep the database in RAM (no file).
* `autocompactionInterval` (ms): interval for autocompaction.

---

> **Note**: This package is intentionally minimal. For advanced functionality (middleware, hooks), consider using Mongoose or other ORMs.

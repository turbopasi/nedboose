# NeDBoose

Ein minimalistischer Mongoose-ähnlicher Wrapper für `@seald-io/nedb` in Vanilla Node.js.

## Dependencies

```bash
@seald-io/nedb
```

## Features

* **Schema-Validierung**: Pflichtfelder (`required`), Standardwerte (`default`), Typprüfung (String, Number, Array, etc.).
* **Indexierung & Unique**: Felder mit `index` oder `unique`-Flag werden automatisch als Index angelegt.
* **TTL-Index**: Ablaufen von Dokumenten via `ttl` in Sekunden.
* **CRUD**: `create`, `find`, `findOne`, `update`, `delete`.
* **Populate**: Referenzen auf andere Models auflösen (`ref`), inklusive Batch-Fetch (Vermeidung von N+1).
* **Query-Optionen**: `sort()`, `skip()`, `limit()`.
* **Autocompaction**: Automatische Datenbankverdichtung.
* **In-Memory**: Optional über `inMemoryOnly`.

## Usage

### Models definieren

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
  publishedAt: { type: Date,   default: () => new Date(), ttl: 60 * 60 * 24 * 30 }, // 30 Tage
  author:      { type: String, ref: 'Author', required: true },
});
```

### Dokumente anlegen

```js
(async () => {
  const author = await Author.create({ name: 'Franz Kafka' });
  const book1  = await Book.create({ title: 'Der Process', author: author._id });
  const book2  = await Book.create({ title: 'Die Verwandlung', author: author._id });
})();
```

### Referenzen auflösen (Populate)

```js
(async () => {
  // Einzel-Abfrage mit Populate
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

## Optionen

Beim Erstellen eines Models kann ein drittes `options`-Objekt übergeben werden:

```js
const Session = model('Session', { /* schema */ }, {
  inMemoryOnly: true,
  autocompactionInterval: 60000, // jede Minute
});
```

* `inMemoryOnly` (boolean): Datenbank nur im RAM (kein File).
* `autocompactionInterval` (ms): Intervall für autocompaction.

---

> **Hinweis**: Dieses Package ist bewusst minimal gehalten. Für erweiterte Funktionalität (Middleware, Hooks) empfiehlt sich Mongoose oder andere ORMs.

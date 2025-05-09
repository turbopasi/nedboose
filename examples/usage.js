const { model } = require('../src/index');

// Author-Model
const Author = model('Author', {
  name: { type: String, required: true },
  books : { type: Array, ref: 'Book', default: [] },
});

// Book-Model mit Referenz auf Author
const Book = model('Book', {
  title:  { type: String, required: true },
});

// Erzeugung und Populate
(async () => {

  const book1 = await Book.create({ title: 'Die Verwandlung' });
  const book2 = await Book.create({ title: 'Die Ausschabung' });
  const book3 = await Book.create({ title: 'Der Beweis' });

  const author = await Author.create({
    name : "Pascal Lamers",
    books : [book1._id, book2._id, book3._id]
  })
  // Mit populate
  const authors = await Author.find({}).populate('books').exec();
  console.log(authors);
  // -> [{ _id: '...', title: 'Die Verwandlung', author: { _id: '...', name: 'Kafka' } }]
})();
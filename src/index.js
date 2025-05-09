const path = require('path');
const fs = require('fs');
const Datastore = require('@seald-io/nedb');

// Registry to keep track of models for populate
const modelRegistry = new Map();

/**
 * Schema class to validate, apply defaults, enforce indexes & TTL
 */
class Schema {
  constructor(definition) {
    this.definition = definition;
  }

  validate(doc) {
    const result = {};
    for (const key in this.definition) {
      const field = this.definition[key];
      let value = doc[key];

      // Apply default if missing
      if ((value === undefined || value === null) && field.default !== undefined) {
        value = typeof field.default === 'function' ? field.default() : field.default;
      }

      // Required check
      if (field.required && (value === undefined || value === null)) {
        throw new Error(`Field '${key}' is required`);
      }

      // Type check (arrays allowed if type is Array)
      if (value != null && !(value.constructor === field.type)) {
        throw new Error(`Field '${key}' should be of type ${field.type.name}`);
      }

      if (value !== undefined) {
        result[key] = value;
      }
    }
    return Object.assign({}, doc, result);
  }
}

/**
 * Query class to support chaining: populate, sort, skip, limit
 */
class Query {
  constructor(model, query = {}, single = false) {
    this.model = model;
    this.query = query;
    this.single = single;
    this.populateFields = [];
    this.sortObj = null;
    this.skipCount = null;
    this.limitCount = null;
  }

  populate(field) {
    if (!this.populateFields.includes(field)) this.populateFields.push(field);
    return this;
  }

  sort(sortObj) {
    this.sortObj = sortObj;
    return this;
  }

  skip(n) {
    this.skipCount = n;
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  exec() {
    return this.single ? this._execOne() : this._execMany();
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  async _execMany() {
    const cursor = this._buildCursor();
    const docs = await new Promise((res, rej) => cursor.exec((err, docs) => err ? rej(err) : res(docs)));
    await this._populate(docs);
    return docs;
  }

  async _execOne() {
    if (this.sortObj || this.skipCount != null) {
      // emulate findOne with sort & skip
      const docs = await this._execMany();
      return docs[0] || null;
    }
    const doc = await this.model._findOneRaw(this.query);
    if (!doc) return null;
    await this._populate([doc]);
    return doc;
  }

  _buildCursor() {
    let cursor = this.model.db.find(this.query);
    if (this.sortObj)   cursor = cursor.sort(this.sortObj);
    if (this.skipCount != null) cursor = cursor.skip(this.skipCount);
    if (this.limitCount != null) cursor = cursor.limit(this.limitCount);
    return cursor;
  }

  async _populate(docs) {
    for (const field of this.populateFields) {
      const def = this.model.schema.definition[field];
      if (!def?.ref) throw new Error(`Field '${field}' must have a ref property`);
      const refModel = modelRegistry.get(def.ref);
      if (!refModel) throw new Error(`Model '${def.ref}' not found`);

      // gather IDs
      const ids = [];
      for (const doc of docs) {
        const val = doc[field];
        if (Array.isArray(val)) ids.push(...val);
        else if (val != null) ids.push(val);
      }
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) continue;

      // batch fetch
      const fetched = await refModel.find({ _id: { $in: uniqueIds } }).exec();
      const map = new Map(fetched.map(d => [d._id, d]));

      // assign populated
      for (const doc of docs) {
        const val = doc[field];
        if (Array.isArray(val)) doc[field] = val.map(id => map.get(id)).filter(x => x);
        else doc[field] = map.get(val) || null;
      }
    }
  }
}

/**
 * Model class to interact with NeDB collections
 */
class Model {
  /**
   * @param {string} name
   * @param {object} schemaDef
   * @param {object} [options]
   */
  constructor(name, schemaDef, options = {}) {
    this.name = name;
    this.schema = new Schema(schemaDef);
    modelRegistry.set(name, this);

    // ensure data directory
    const dataDir = options.filename ? path.dirname(options.filename) : path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // init datastore
    const dsOpts = { filename: options.filename || path.resolve(dataDir, `${name}.db`), inMemoryOnly: options.inMemoryOnly };
    this.db = new Datastore(dsOpts);
    this.db.loadDatabase(err => { if (err) throw err; });

    // autocompaction
    if (options.autocompactionInterval && this.db.persistence) {
      this.db.persistence.setAutocompactionInterval(options.autocompactionInterval);
    }

    // ensure indexes & TTL
    for (const [key, field] of Object.entries(schemaDef)) {
      const idx = { fieldName: key };
      if (field.unique) idx.unique = true;
      if (field.index) idx.index = true;
      if (field.ttl != null) idx.expireAfterSeconds = field.ttl;
      if (field.unique || field.index || field.ttl != null) {
        this.db.ensureIndex(idx, err => { if (err) throw err; });
      }
    }
  }

  _findRaw(query = {}) {
    return new Promise((res, rej) => this.db.find(query, (e, d) => e ? rej(e) : res(d)));
  }

  _findOneRaw(query) {
    return new Promise((res, rej) => this.db.findOne(query, (e, d) => e ? rej(e) : res(d)));
  }

  create(doc) {
    const validated = this.schema.validate(doc);
    return new Promise((res, rej) => this.db.insert(validated, (e, d) => e ? rej(e) : res(d)));
  }

  find(query = {}) {
    return new Query(this, query, false);
  }

  findOne(query) {
    return new Query(this, query, true);
  }

  update(query, update, options = {}) {
    return new Promise((res, rej) => this.db.update(query, { $set: update }, options, (e, n) => e ? rej(e) : res(n)));
  }

  delete(query, options = {}) {
    return new Promise((res, rej) => this.db.remove(query, options, (e, n) => e ? rej(e) : res(n)));
  }
}

function model(name, schemaDef, options) {
  return modelRegistry.has(name) ? modelRegistry.get(name) : new Model(name, schemaDef, options);
}

module.exports = { Schema, Model, model };

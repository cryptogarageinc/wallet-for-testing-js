/* eslint-disable require-jsdoc */
const loki = require('lokijs');

module.exports = class LokijsWrapper {
  constructor(name = 'db', tableName = 'all', dirPath = './', inMemoryOnly = true) {
    this.dbName = name;
    this.tableName = tableName;
    const filepath = `${dirPath}/${name}.db`;
    // LokiConstructorOptions, ThrottledSaveDrainOptions, LokiConfigOptions
    const autosave = !inMemoryOnly;
    const autosaveInterval = (inMemoryOnly) ? 0 : 1;
    const option = {
      verbose: !inMemoryOnly,
      autosave,
      autosaveInterval,
      throttledSaves: true,
    };
    this.db = new loki(filepath, option);
    this.datastore = this.db.addCollection(tableName);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createIndex(keyName, unique = true) {
    // regenerate file
    // return await this.datastore.ensureIndex(
    //    {fieldName: keyName, unique: unique});
    return new Promise((resolve) => {
      this.datastore.ensureIndex(keyName, true);
      resolve();
    });
  }

  async insert(data, query = {}) {
    return new Promise((resolve) => {
      try {
        if (Object.keys(query).length > 0) {
          const num = this.datastore.count(query);
          if (num > 0) {
            resolve(false);
            return;
          }
        }
        resolve(this.datastore.insert(data));
      } catch (e) {
        console.log(e);
        resolve(false);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(query, data, options = {}) {
    return new Promise((resolve) => {
      const datas = this.datastore.find(query);
      const list = [];
      datas.forEach((currentData) => list.push({...currentData, ...data}));
      this.datastore.update(list);

      if (!list) {
        resolve(false);
      } else if (list.length == 1) {
        resolve(list[0]);
      } else {
        resolve(list);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(query = {}, options = {}) {
    return new Promise((resolve) => {
      if (!Object.keys(query).length) {
        this.datastore.removeDataOnly();
      } else {
        this.datastore.removeWhere(query);
      }
      resolve(true);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findOne(query = {}, projection = {}) {
    return new Promise((resolve) => {
      resolve(this.datastore.findOne(query));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async find(query = {}, projection = {}) {
    return new Promise((resolve) => {
      resolve(this.datastore.find(query));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async find(query = {}, page = 1, perPage = 100, projection = {}) {
    return new Promise((resolve) => {
      let list;
      if (page <= 1) {
        if (!Object.keys(query).length) {
          list = this.datastore.chain().limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query)
              .limit(perPage).data();
        }
      } else {
        const skipNum = (page - 1) * perPage;
        if (!Object.keys(query).length) {
          list = this.datastore.chain().offset(skipNum)
              .limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query)
              .offset(skipNum).limit(perPage).data();
        }
      }
      resolve(list);
    });
  }

  async findSorted(query = {}, page = 1, perPage = 10,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      projection = {}, sortFunction = {}, secondQuery = {}) {
    return new Promise((resolve) => {
      let list;
      if (page <= 1) {
        if (!Object.keys(query).length) {
          list = this.datastore.chain().limit(perPage).data();
        } else if (Object.keys(secondQuery).length > 0) {
          list = this.datastore.chain().find(query).find(secondQuery)
              .sort(sortFunction).limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query).sort(sortFunction)
              .limit(perPage).data();
        }
      } else {
        const skipNum = (page - 1) * perPage;
        if (!Object.keys(query).length) {
          list = this.datastore.chain().offset(skipNum)
              .limit(perPage).data();
        } else if (Object.keys(secondQuery).length > 0) {
          list = this.datastore.chain().find(query).find(secondQuery)
              .offset(skipNum).limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query)
              .offset(skipNum).limit(perPage).data();
        }
      }
      resolve(list);
    });
  }

  async findByFilter(query = {}, filterFunction = {}, page = 1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      perPage = 10, projection = {}, secondQuery = {}) {
    return new Promise((resolve) => {
      let list;
      if (page <= 1) {
        if (!Object.keys(query).length) {
          list = this.datastore.chain().where(filterFunction)
              .limit(perPage).data();
        } else if (Object.keys(secondQuery).length > 0) {
          list = this.datastore.chain().find(query).find(secondQuery)
              .where(filterFunction).limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query).where(filterFunction)
              .limit(perPage).data();
        }
      } else {
        const skipNum = (page - 1) * perPage;
        if (!Object.keys(query).length) {
          list = this.datastore.chain().where(filterFunction)
              .offset(skipNum).limit(perPage).data();
        } else if (Object.keys(secondQuery).length > 0) {
          list = this.datastore.chain().find(query).find(secondQuery)
              .where(filterFunction).offset(skipNum).limit(perPage).data();
        } else {
          list = this.datastore.chain().find(query)
              .where(filterFunction).offset(skipNum).limit(perPage).data();
        }
      }
      resolve(list);
    });
  }

  async count(query = {}) {
    return new Promise((resolve) => {
      resolve(this.datastore.count(query));
    });
  }

  getDbName() {
    return this.dbName;
  }

  getTableName() {
    return this.tableName;
  }
};

/* eslint-disable require-jsdoc */
const Datastore = require('nedb-promises');

// https://hajipy.net/2018/08/nedb-basic/
module.exports = class NedbWrapper {
  constructor(name = 'db', dirPath = './', inMemoryOnly = true) {
    this.dbName = name;
    const filepath = dirPath + `/${name}.db`;
    this.datastore = Datastore.create({
      filename: filepath,
      inMemoryOnly: inMemoryOnly,
      timestampData: (inMemoryOnly) ? false : true,
    });
  };

  async createIndex(keyName, unique = true) {
    // regenerate file
    return await this.datastore.ensureIndex(
        {fieldName: keyName, unique: unique});
  };

  async insert(data, query = {}) {
    try {
      if (Object.keys(query).length > 0) {
        const num = await this.datastore.count(query);
        if (num > 0) {
          return false;
        }
      }
      return await this.datastore.insert(data);
    } catch (e) {
      console.log(e);
      return false;
    }
  };

  async update(query, data, options = {}) {
    return await this.datastore.update(query, data, options);
  };

  async delete(query = {}, options = {}) {
    return await this.datastore.remove(query, options);
  };

  async find(query = {}, projection = {}) {
    return await this.datastore.find(query, projection);
  };

  async findOne(query = {}, projection = {}, sortQuery = {}) {
    return await this.datastore.findOne(query, projection).sort(sortQuery);
  };

  async findSorted(query = {}, page = 1, perPage = 10,
      projection = {}, sortQuery = {}, secondQuery = {}) {
    if (page <= 1) {
      if (Object.keys(secondQuery).length > 0) {
        return await this.datastore.find(query, projection).find(secondQuery)
            .sort(sortQuery).limit(perPage);
      } else {
        return await this.datastore.find(query, projection).sort(sortQuery)
            .limit(perPage);
      }
    } else {
      const skipNum = (page - 1) * perPage;
      if (Object.keys(secondQuery).length > 0) {
        return await this.datastore.find(query, projection).find(secondQuery)
            .limit(perPage).skip(skipNum);
      } else {
        return await this.datastore.find(query, projection)
            .limit(perPage).skip(skipNum);
      }
    }
  };

  async count(query = {}) {
    return await this.datastore.count(query);
  };

  getDbName() {
    return dbName;
  };
};

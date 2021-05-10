/* eslint-disable require-jsdoc */
const DbWrapper = require('./dbWrapper.js');

module.exports = class ConfidentialKeyTable {
  constructor(name = 'db', dirPath = './', inMemoryOnly = true) {
    this.database = new DbWrapper(name, 'blindkey', dirPath, inMemoryOnly);
  }

  async initialize() {
    await this.database.createIndex('address');
    return true;
  }

  async addConfidentialKey(pubkey, hdkeyPath, address) {
    return await this.database.insert(
        {pubkey: pubkey, path: hdkeyPath, address: address});
  }

  // disable update

  async deleteAll() {
    return await this.database.delete({}, {multi: true});
  }

  async deleteFromPubkey(pubkey) {
    return await this.database.delete({pubkey: pubkey}, {multi: true});
  }
  async deleteFromAddress(address) {
    return await this.database.delete({address: address}, {multi: true});
  }
  async delete(address, pubkey) {
    return await this.database.delete({address: address, pubkey: pubkey});
  }

  async getConfidentialKeyPath(pubkey) {
    return await this.database.findOne({pubkey: pubkey});
  }

  async getConfidentialKeyByPath(hdkeyPath) {
    return await this.database.findOne({path: hdkeyPath});
  }

  async getConfidentialKeyByAddress(address) {
    return await this.database.findOne({address: address});
  }

  async getConfidentialKeysByAddress(address, page = 1, perPage = 100) {
    return await this.database.find({address: address}, page, perPage);
  }

  async getAddressByKey(pubkey, page = 1, perPage = 100) {
    return await this.database.find({pubkey: pubkey}, page, perPage);
  }

  async getAddressByPath(hdkeyPath, page = 1, perPage = 100) {
    return await this.database.find({path: hdkeyPath}, page, perPage);
  }
};

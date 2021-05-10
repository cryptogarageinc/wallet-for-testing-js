/* eslint-disable require-jsdoc */
const DbWrapper = require('./dbWrapper.js');
const KeyNetworkType = 'network';
const KeyBip32Count = 'bip32Count';
const KeyBip32FeeCount = 'bip32FeeCount';
const KeyBlindCount = 'blindCount';
const KeyTipBlockHeight = 'tipBlockHeight';
const KeyAssetMap = 'assetMap';

module.exports = class ConfigTable {
  constructor(name = 'db', dirPath = './', inMemoryOnly = true) {
    this.database = new DbWrapper(name, 'config', dirPath, inMemoryOnly);
  }

  async initialize(networkType = 'regtest') {
    await this.database.createIndex('key');
    const nw = await this.getNetworkType();
    if (nw === networkType) {
      return true;
    }

    let ret = await this.database.insert(
        {key: KeyNetworkType, value: networkType},
        {key: KeyNetworkType});
    if (ret === false) {
      return false;
    }
    // check wallet key?
    ret = await this.database.insert(
        {key: KeyBip32Count, value: 0}, {key: KeyBip32Count});
    if (ret === false) {
      return false;
    }
    ret = await this.database.insert(
        {key: KeyBip32FeeCount, value: 0}, {key: KeyBip32FeeCount});
    if (ret === false) {
      return false;
    }
    ret = await this.database.insert(
        {key: KeyBlindCount, value: 0}, {key: KeyBlindCount});
    if (ret === false) {
      return false;
    }
    ret = await this.database.insert(
        {key: KeyTipBlockHeight, value: 0}, {key: KeyTipBlockHeight});
    if (ret === false) {
      return false;
    }
    ret = await this.database.insert(
        {key: KeyAssetMap, value: {}}, {key: KeyAssetMap});
    if (ret === false) {
      return false;
    }
    return true;
  }

  // disable Add, Delete

  async updateBip32Count(count) {
    if (count === undefined) {
      return false;
    }
    return await this.database.update(
        {key: KeyBip32Count}, {value: count});
  };

  async updateBip32FeeCount(count) {
    if (count === undefined) {
      return false;
    }
    return await this.database.update(
        {key: KeyBip32FeeCount}, {value: count});
  };

  async updateBlindingKeyCount(count) {
    if (count === undefined) {
      return false;
    }
    return await this.database.update(
        {key: KeyBlindCount}, {value: count});
  };

  async updateTipBlockHeight(count) {
    if (count === undefined) {
      console.trace();
      return false;
    }
    return await this.database.update(
        {key: KeyTipBlockHeight}, {value: count});
  };

  async updateAssetMap(assetMap) {
    if (assetMap === undefined) {
      console.trace();
      return false;
    }
    return await this.database.update(
        {key: KeyAssetMap}, {value: assetMap});
  };


  async getNetworkType() {
    const ret = await this.database.findOne({key: KeyNetworkType});
    if (!ret) {
      return false;
    }
    return ret.value;
  };

  async getBip32Count() {
    const ret = await this.database.findOne({key: KeyBip32Count});
    if (!ret) {
      return false;
    }
    return ret.value;
  };

  async getBip32FeeCount() {
    const ret = await this.database.findOne({key: KeyBip32FeeCount});
    if (!ret) {
      return false;
    }
    return ret.value;
  };

  async getBlindingKeyCount() {
    const ret = await this.database.findOne({key: KeyBlindCount});
    if (!ret) {
      return false;
    }
    return ret.value;
  };

  async getTipBlockHeight() {
    const ret = await this.database.findOne({key: KeyTipBlockHeight});
    if (!ret) {
      return false;
    }
    return ret.value;
  };

  async getAssetMap() {
    const ret = await this.database.findOne({key: KeyAssetMap});
    if (!ret) {
      return false;
    }
    return ret.value;
  };
};

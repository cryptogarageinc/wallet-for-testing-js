const NedbWrapper = require('./nedbWrapper.js');

module.exports = class UtxoTable {
  constructor(name = 'db', dirPath = './', inMemoryOnly = true) {
    this.database = new NedbWrapper(`${name}_utxo`, dirPath, inMemoryOnly);
  };

  async initialize() {
    await this.database.createIndex('outpoint');
    return true;
  };

  async addUtxo(txid, vout, amount, address, descriptor, lockingScript,
      solvable, blockHash = '', blockHeight = -1, coinbase = false, asset = '',
      confidentialKey = '', assetBlinder = '', amountBlinder = '',
      extend = {}) {
    let mapData = {};
    const outpoint = `${txid},${vout}`;
    if (asset === '') {
      mapData = {
        outpoint: outpoint, txid: txid, vout: vout,
        amount: amount, address: address, descriptor: descriptor,
        lockingScript: lockingScript, blockHash: blockHash,
        blockHeight: blockHeight, coinbase: coinbase,
        spent: false, solvable: solvable, extend: extend};
    } else {
      mapData = {
        outpoint: outpoint, txid: txid, vout: vout,
        amount: amount, address: address, descriptor: descriptor,
        lockingScript: lockingScript, blockHash: blockHash,
        blockHeight: blockHeight, asset: asset,
        confidentialKey: confidentialKey,
        assetBlinder: assetBlinder,
        amountBlinder: amountBlinder,
        spent: false, solvable: solvable, coinbase: coinbase, extend: extend};
    }
    return await this.database.insert(mapData, {outpoint: outpoint});
  };

  async updateBlockInfo(txid, blockHash, blockHeight) {
    return await this.database.update(
        {txid: txid}, {$set: {
          blockHash: blockHash,
          blockHeight: blockHeight,
        }},
        {multi: true});
  };

  async updateSpendable(txid, vout, spent = true) {
    const outpoint = `${txid},${vout}`;
    return await this.database.update(
        {outpoint: outpoint}, {$set: {
          spent: spent,
        }});
  };

  async updateOutBlockByBlock(blockHash) {
    return await this.database.update(
        {blockHash: blockHash, coinbase: false}, {$set: {
          blockHash: '',
          blockHeight: -1,
        }},
        {multi: true});
  };

  async updateOutBlockByBlockHeight(blockHeight) {
    return await this.database.update(
        {blockHeight: blockHeight, coinbase: false}, {$set: {
          blockHash: '',
          blockHeight: -1,
        }},
        {multi: true});
  };

  async deleteAll() {
    return await this.database.delete({}, {multi: true});
  };

  async deleteByOutpoint(outpoint) {
    return await this.database.delete({outpoint: outpoint}, {multi: true});
  };

  async deleteByBlock(blockHash) {
    return await this.database.delete({blockHash: blockHash}, {multi: true});
  };

  async deleteCoinbaseByBlock(blockHash) {
    return await this.database.delete(
        {blockHash: blockHash, coinbase: true}, {multi: true});
  };

  async deleteCoinbaseByBlockHeight(blockHeight) {
    return await this.database.delete(
        {blockHeight: blockHeight, coinbase: true}, {multi: true});
  };

  async getUtxoCount() {
    return await this.database.count({});
  };

  async existUtxoByOutpoint(outpoint) {
    const ret = await this.database.findOne({outpoint: outpoint});
    if (!ret || !('address' in ret)) {
      return false;
    }
    return true;
  };

  async getUtxoCountInBlock(blockHash) {
    return await this.database.count({blockHash: blockHash});
  };

  async getUtxoCountByTxid(txid) {
    return await this.database.count({txid: txid});
  };

  async getUtxoCountOutsideBlock() {
    return await this.database.count({blockHash: ''});
  };

  async getUtxoByOutpoint(outpoint) {
    return await this.database.findOne({outpoint: outpoint});
  };

  async getUtxos(page = 1, perPage = 100) {
    return await this.database.findSorted({}, page, perPage);
  };

  async getUtxosByBlock(blockHash = '', page = 1, perPage = 100) {
    return await this.database.findSorted(
        {blockHash: blockHash}, page, perPage);
  };

  async getUtxoByBlockHeight(blockHeight = 0, page = 1, perPage = 100) {
    return await this.database.findSorted(
        {blockHeight: blockHeight}, page, perPage);
  };

  async getUtxosByAddress(address, page = 1, perPage = 100) {
    return await this.database.findSorted({address: address}, page, perPage);
  };

  async getUtxosByAsset(asset, page = 1, perPage = 100) {
    return await this.database.findSorted({asset: asset}, page, perPage);
  };

  async getUtxosSpentable(page = 1, perPage = 100) {
    return await this.database.findSorted({spent: true}, page, perPage);
  };

  async getUtxosSpentableConfirmation(conf = 100, page = 1, perPage = 100) {
    return await this.database.findSorted(
        {spent: true, blockHeight: {$lte: conf}}, page, perPage);
  };

  async getUtxosBlockHeightSpendable(maxBlockHeight = 9223372036854775807,
      minimumConf = 6, page = 1, perPage = 100) {
    return await this.database.findSorted({$where: function() {
      const height = bestBlockHeight - this.blockHeight;
      if (this.coinbase && (height < 100)) {
        return true;
      }
      return ((this.spent) &&
              ((this.blockHeight === -1) ||
               ((height >= 0) && (height < minimumConf))));
    }}, page, perPage);
  };

  async getUtxosBlockHeightSolvedUnspentable(
      bestBlockHeight = 9223372036854775807,
      minimumConf = 6, maximumConf = 9223372036854775807,
      page = 1, perPage = 10000) {
    return await this.database.findSorted({$where: function() {
      const height = bestBlockHeight - this.blockHeight + 1;
      if (!this.solvable) return false; // script utxo
      if (this.coinbase && (height < 100)) {
        return false;
      }
      if ((minimumConf !== 0) && (this.blockHeight === -1)) {
        return false;
      }
      return ((!this.spent) &&
              (height >= 0) &&
              (height >= minimumConf) &&
              (height <= maximumConf));
    }}, page, perPage);
  };

  async getUtxosBlockHeightUnspentable(bestBlockHeight = 9223372036854775807,
      minimumConf = 6, maximumConf = 9223372036854775807,
      page = 1, perPage = 10000) {
    return await this.database.findSorted({$where: function() {
      const height = bestBlockHeight - this.blockHeight + 1;
      if (this.coinbase && (height < 100)) {
        return false;
      }
      if ((minimumConf !== 0) && (this.blockHeight === -1)) {
        return false;
      }
      return ((!this.spent) &&
              (height >= 0) &&
              (height >= minimumConf) &&
              (height <= maximumConf));
    }}, page, perPage);
  };

  // elements only
  async getUtxosBlindUnspentable(bestBlockHeight = 9223372036854775807,
      confTarget = 6, page = 1, perPage = 100) {
    return await this.database.findSorted(
        {$where: function() {
          if (this.confidentialKey.length > 0) {
            return false;
          }
          const height = bestBlockHeight - this.blockHeight + 1;
          if (this.coinbase && (height < 100)) {
            return false;
          }
          if ((minimumConf !== 0) && (this.blockHeight === -1)) {
            return false;
          }
          return ((!this.spent) &&
                  (height >= 0) &&
                  (height >= minimumConf) &&
                  (height <= maximumConf));
        }}, page, perPage);
  };

  async getUtxosUnblindUnspentable(bestBlockHeight = 9223372036854775807,
      confTarget = 6, page = 1, perPage = 100) {
    return await this.database.findSorted(
        {$where: function() {
          if (this.confidentialKey.length === 0) {
            return false;
          }
          const height = bestBlockHeight - this.blockHeight + 1;
          if (this.coinbase && (height < 100)) {
            return false;
          }
          if ((minimumConf !== 0) && (this.blockHeight === -1)) {
            return false;
          }
          return ((!this.spent) &&
                  (height >= 0) &&
                  (height >= minimumConf) &&
                  (height <= maximumConf));
        }}, page, perPage);
  };
};

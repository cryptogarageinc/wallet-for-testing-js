/* eslint-disable require-jsdoc */
const ConfigTable = require('./db/configTable.js');
const AddressTable = require('./db/addressTable.js');
const ConfidentialKeyTable = require('./db/confidentialKeyTable.js');
const UtxoTable = require('./db/utxoTable.js');
const fs = require('fs');

module.exports = class DatabaseService {
  constructor(name = 'db', dirPath = './', inMemoryOnly = true) {
    // initialize db dir
    try {
      fs.statSync(dirPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      fs.mkdirSync(dirPath);
    }
    this.cfgTbl = new ConfigTable(name, dirPath, inMemoryOnly);
    this.addrTbl = new AddressTable(name, dirPath, inMemoryOnly);
    this.cfdKeyTbl = new ConfidentialKeyTable(name, dirPath, inMemoryOnly);
    this.utxoTbl = new UtxoTable(name, dirPath, inMemoryOnly);
  }

  async initialize(network) {
    await this.addrTbl.initialize();
    await this.cfdKeyTbl.initialize();
    await this.utxoTbl.initialize();
    return await this.cfgTbl.initialize(network);
  }

  getConfigTable() {
    return this.cfgTbl;
  }

  getAddressTable() {
    return this.addrTbl;
  }

  getConfidentialKeyTable() {
    return this.cfdKeyTbl;
  }

  getUtxoTable() {
    return this.utxoTbl;
  }
};

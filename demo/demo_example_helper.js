'use strict';
const path = require('path');
const fs = require('fs');
const ini = require('ini');
const jsonrpcClientLib = require('./jsonrpc-cli-lib');

/**
 * example helper class for demo code.
 */
class DemoExampleHelper {
  /**
   * constructor
   * @param {string} path configure file path. (ref connection.conf.org)
   */
  constructor(path) {
    const connConf = this.loadConfigFile_(path);
    const {bitcoin, elements} = connConf;
    this.bitcoinCli_ = new jsonrpcClientLib.BitcoinCli(
        jsonrpcClientLib.createConnection(
            bitcoin.host, bitcoin.port, bitcoin.user, bitcoin.pass));
    this.elementsCli_ = new jsonrpcClientLib.ElementsCli(
        jsonrpcClientLib.createConnection(
            elements.host, elements.port, elements.user, elements.pass));
    this.cfdjs_ = require(`cfd-js`);
    // this.cfdjsModule_ = require('../cfdjs_module');
    this.cfdjsModule_ = require(`cfd-js`);
  }

  /**
   * [private] Load config file and extract config data.
   * @param {string} path path for configure file
   * @return {object} rpc connection data object.
   */
  loadConfigFile_(path) {
    let config = {};
    try {
      fs.statSync(path);
      config = ini.parse(fs.readFileSync(path, 'utf-8'));
    } catch (err) {
      // unknown file
      throw Error('rpc client config file error: err=', err);
    }
    const result = {
      bitcoin: {
        host: ('mainchainrpchost' in config) ?
          config.mainchainrpchost : '127.0.0.1',
        port: ('mainchainrpcport' in config) ?
          config.mainchainrpcport : 18443,
        user: ('mainchainrpcuser' in config) ?
          config.mainchainrpcuser : 'bitcoinrpc',
        pass: ('mainchainrpcpassword' in config) ?
          config.mainchainrpcpassword : 'bitcoinrpc',
      },
      elements: {
        host: ('rpcbind' in config) ? config.rpcbind : '127.0.0.1',
        port: ('rpcport' in config) ? config.rpcport : 8443,
        user: ('rpcuser' in config) ? config.rpcuser : 'bitcoinrpc',
        pass: ('rpcpassword' in config) ? config.rpcpassword : 'bitcoinrpc',
      },
    };
    return result;
  }

  /**
   * Get bitcoin rpc client.
   * @return {jsonrpcClientLib.BitcoinCli} bitcoin rpc client
   */
  getBitcoinCli() {
    if (!this.bitcoinCli_) {
      throw Error('bitcoinCli is not initialized.');
    }
    return this.bitcoinCli_;
  }

  /**
   * Get elements rpc client.
   * @return {jsonrpcClientLib.ElementsCli} elements rpc client
   */
  getElementsCli() {
    if (!this.elementsCli_) {
      throw Error('elementsCli is not initialized.');
    }
    return this.elementsCli_;
  }

  /**
   * Get cfd-js binary module.
   * @return {object} cfd-js binary module
   */
  getCfdJs() {
    return this.cfdjs_;
  }

  /*
   * Get cfd-test binary module. (depricated)
   * @return {object} cfd-test binary module
   */
  // getCfdTest() {
  //   return this.cfdtest_;
  // }

  /**
   * Get cfd-js wrapped module.
   * @return {object} cfd-js wrapped module
   */
  getCfdJsModule() {
    return this.cfdjsModule_;
  }
}

module.exports = DemoExampleHelper;

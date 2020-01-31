const Wallet = require('./libs/walletService.js');
const RpcClient = require('./libs/rpc-client/jsonrpcClient.js');
const cfd = require('cfd-js');
const path = require('path');
const fs = require('fs');
const ini = require('ini');


// --------------------------------------------------------------------------------------
// private
// --------------------------------------------------------------------------------------
const analyzeConfigureFile = function(file, network) {
  const filename = path.basename(file);
  if (filename === 'elements.conf') {
    return analyzeElementsConfigureFile(file, network);
  } else {
    return analyzeBitcoinConfigureFile(file, network);
  }
};

const analyzeBitcoinConfigureFile = function(file, network) {
  let textdata = fs.readFileSync(file, 'utf-8');
  // replace option (testnet and regtest)
  textdata = textdata.replace(`${network}=1`, '');
  const config = ini.parse(textdata);
  const data = {
    bitcoin: {
      host: ('rpcbind' in config) ? config.rpcbind : 'localhost',
      port: ('rpcport' in config) ? config.rpcport : 18443,
      user: ('rpcuser' in config) ? config.rpcuser : 'bitcoinrpc',
      pass: ('rpcpassword' in config) ? config.rpcpassword : 'password',
    },
  };
  if (network in config) {
    const nwConfig = config[network];
    if ('rpcbind' in nwConfig) data.bitcoin.host = nwConfig.rpcbind;
    if ('rpcport' in nwConfig) data.bitcoin.port = nwConfig.rpcport;
    if ('rpcuser' in nwConfig) data.bitcoin.user = nwConfig.rpcuser;
    if ('rpcpassword' in nwConfig) data.bitcoin.pass = nwConfig.rpcpassword;
  }
  return data;
};

const analyzeElementsConfigureFile = function(file, network) {
  const config = ini.parse(fs.readFileSync(file, 'utf-8'));
  const data = {
    bitcoin: {
      host: ('mainchainrpchost' in config) ? config.mainchainrpchost : 'localhost',
      port: ('mainchainrpcport' in config) ? config.mainchainrpcport : 18443,
      user: ('mainchainrpcuser' in config) ? config.mainchainrpcuser : 'bitcoinrpc',
      pass: ('mainchainrpcpassword' in config) ? config.mainchainrpcpassword : 'password',
    },
    elements: {
      host: ('rpcbind' in config) ? config.rpcbind : 'localhost',
      port: ('rpcport' in config) ? config.rpcport : 8443,
      user: ('rpcuser' in config) ? config.rpcuser : 'bitcoinrpc',
      pass: ('rpcpassword' in config) ? config.rpcpassword : 'password',
    },
  };
  if (network in config) {
    const nwConfig = config[network];
    if ('mainchainrpchost' in nwConfig) data.bitcoin.host = nwConfig.mainchainrpchost;
    if ('mainchainrpcport' in nwConfig) data.bitcoin.port = nwConfig.mainchainrpcport;
    if ('mainchainrpcuser' in nwConfig) data.bitcoin.user = nwConfig.mainchainrpcuser;
    if ('mainchainrpcpassword' in nwConfig) {
      data.bitcoin.pass = nwConfig.mainchainrpcpassword;
    }
    if ('rpcbind' in nwConfig) data.elements.host = nwConfig.rpcbind;
    if ('rpcport' in nwConfig) data.elements.port = nwConfig.rpcport;
    if ('rpcuser' in nwConfig) data.elements.user = nwConfig.rpcuser;
    if ('rpcpassword' in nwConfig) data.elements.pass = nwConfig.rpcpassword;
  }
  return data;
};

module.exports = class WalletManager {
  constructor(nodeConfigFile, dirPath = './', network = 'regtest',
      seed = '', masterXprivkey = '', englishMnemonic = '', passphrase = '', domainIndex = -1) {
    this.dirName = dirPath;
    this.walletList = {};
    this.masterXprivkey = masterXprivkey;
    this.network = network;
    this.xprivkey = masterXprivkey; // conv to m/44'/(nettype)
    this.seed = seed;
    this.nodeConfigMap = analyzeConfigureFile(nodeConfigFile, network);
    // console.log('configmap = ', this.nodeConfigMap);
    let keyNetwork = network;
    if ((network === 'mainnet') || (network === 'testnet') || (network === 'regtest')) {
      this.btcClient = new RpcClient.BitcoinCli(
          RpcClient.createConnection(this.nodeConfigMap.bitcoin.host,
              this.nodeConfigMap.bitcoin.port, this.nodeConfigMap.bitcoin.user,
              this.nodeConfigMap.bitcoin.pass, this.dbName));
      this.elmClient = undefined;
    } else {
      this.btcClient = new RpcClient.BitcoinCli(
          RpcClient.createConnection(this.nodeConfigMap.bitcoin.host,
              this.nodeConfigMap.bitcoin.port, this.nodeConfigMap.bitcoin.user,
              this.nodeConfigMap.bitcoin.pass, this.dbName));
      this.elmClient = new RpcClient.ElementsCli(
          RpcClient.createConnection(this.nodeConfigMap.elements.host,
              this.nodeConfigMap.elements.port,
              this.nodeConfigMap.elements.user,
              this.nodeConfigMap.elements.pass, this.dbName));
      if (keyNetwork === 'liquidv1') {
        keyNetwork = 'mainnet';
      } else {
        keyNetwork = 'regtest';
      }
    }
    if (this.seed === '' && englishMnemonic !== '') {
      this.seed = cfd.ConvertMnemonicToSeed({
        mnemonic: englishMnemonic.mnemonic,
        language: 'en',
        passphrase: passphrase,
      }).seed;
    }
    if (this.xprivkey === '') {
      this.xprivkey = cfd.CreateExtkeyFromSeed({
        seed: seed,
        network: keyNetwork,
        extkeyType: 'extPrivkey',
      }).extkey;
    }
    let nettypeIndex = 0;
    if (domainIndex !== -1) {
      nettypeIndex = domainIndex;
    } else {
      if (keyNetwork === 'mainnet') {
        nettypeIndex = 0;
      } else if (keyNetwork === 'regtest') {
        nettypeIndex = 2;
      } else { // testnet
        nettypeIndex = 1;
      }
    }
    const extPath = `44h/${nettypeIndex}h`;
    // console.log(`bip44 = ${bip44}, nettypeIndex = ${nettypeIndexStr}`);
    const childExtkey = cfd.CreateExtkeyFromParentPath({
      extkey: this.xprivkey,
      network: keyNetwork,
      extkeyType: 'extPrivkey',
      path: extPath,
    });
    this.xprivkey = childExtkey.extkey;
    this.bitcoinTipHeightCache = -1;
    this.elementsTipHeightCache = -1;
    this.isShutdown = false;
    // console.log(`xprivkey = ${this.xprivkey}`);
  };

  async initialize(targetNodeType = 'bitcoin') {
    let result = '';
    try {
      if (targetNodeType === 'bitcoin') {
        result = await this.btcClient.getblockcount();
        setTimeout(async () => {
          await this.checkUpdateBitcoinBlock();
        }, 2000);
      } else {
        result = await this.elmClient.getblockcount();
        setTimeout(async () => {
          await this.checkUpdateElementsBlock();
        }, 2000);
      }
    } catch (err) {
      console.log('checkConnection err.', err);
    } finally {
      if (isNaN(result)) return true;
      if ((result === undefined) || (result.length === 0)) {
        return false;
      }
      return true;
    }
  };

  shutdown() {
    this.isShutdown = true;
  };

  async createWallet(userIndex, userNamePrefix = 'user', targetNodeType = 'bitcoin') {
    // wallet is btc or elements support.
    // (multi support is exist pubkey management risk.)
    const userName = `${targetNodeType}-${userNamePrefix}${userIndex}`;
    if ((targetNodeType in this.walletList) &&
        (userName in this.walletList[targetNodeType])) {
      return this.walletList[targetNodeType][userName];
    }
    const walletObj = new Wallet(userNamePrefix, userIndex,
        this.dirName, this.network, this.xprivkey,
        this.nodeConfigMap[targetNodeType], this);
    await walletObj.initialize();
    if (!(targetNodeType in this.walletList)) {
      this.walletList[targetNodeType] = {};
    }
    this.walletList[targetNodeType][userName] = walletObj;
    return walletObj;
  };

  getWallet(userIndex, userNamePrefix, targetNodeType) {
    const userName = `${targetNodeType}-${userNamePrefix}${userIndex}`;
    return this.walletList[targetNodeType][userName];
  };

  async checkUpdateBitcoinBlock() {
    await this.checkUpdateBlock('bitcoin');
    if (!this.isShutdown) {
      setTimeout(async () => {
        await this.checkUpdateBitcoinBlock();
      }, 2000);
    }
  }

  async checkUpdateElementsBlock() {
    await this.checkUpdateBlock('elements');
    if (!this.isShutdown) {
      setTimeout(async () => {
        await this.checkUpdateElementsBlock();
      }, 2000);
    }
  }

  // use interval function
  // https://nodejs.org/ja/docs/guides/timers-in-node/
  async checkUpdateBlock(targetNodeType) {
    if (this.isShutdown) {
      return false;
    }
    try {
      let tipHeightCache;
      let chaintips = undefined;
      let client;
      if (!(targetNodeType in this.walletList)) {
        // do nothing
        console.log('[WM] checkUpdateBlock walletList empty.');
      } else if (targetNodeType === 'bitcoin') {
        chaintips = await this.btcClient.getchaintips();
        if (this.bitcoinTipHeightCache === -1) {
          this.bitcoinTipHeightCache = chaintips[0].height;
        }
        tipHeightCache = this.bitcoinTipHeightCache;
        client = this.btcClient;
      } else {
        // elements
        // FIXME not implements.
        // console.log(`[WM] checkUpdateBlock targetNodeType: ${targetNodeType}`);
      }
      if (chaintips === undefined) {
        console.log('[WM] checkUpdateBlock undef chaintips.');
        return false;
      }

      const tipHeight = chaintips[0].height;
      let prevBlockHash = chaintips[0].hash;
      if (tipHeightCache === tipHeight) {
        // console.log(`[WM] checkUpdateBlock tipHeight cached: ${tipHeight}`);
        return false;
      }
      let blockHashList = [];
      const blockTxMap = {};
      const maximum = tipHeight;
      let low;
      if (tipHeightCache > tipHeight) {
        // illegal route.
        low = tipHeight;
      } else {
        // normal route.
        low = tipHeightCache + 1;
      }

      // blockTxMap = {blockHeight: 0, tx:[txid: "", vout:{}]}
      for (let k = maximum; k >= low; k--) {
        const blockHeight = k;
        const blockHash = prevBlockHash;
        const block = await client.getblock(blockHash, 2);
        const blockData = {blockHeight: blockHeight, tx: []};
        for (let i = 0; i < block.tx.length; i++) {
          const txid = block.tx[i].txid;
          const txVinData = ('txid' in block.tx[i].vin[0]) ? block.tx[i].vin : undefined;
          const txVout = block.tx[i].vout;
          blockData.tx.push({txid: txid, vin: txVinData, vout: txVout});
        }
        blockHashList.push(blockHash);
        blockTxMap[blockHash] = blockData;
        prevBlockHash = block.previousblockhash;
      }
      blockHashList = blockHashList.reverse();
      for (const key in this.walletList[targetNodeType]) {
        if (this.walletList[targetNodeType][key]) {
          await this.walletList[targetNodeType][key].callbackUpdateBlock(
              tipHeight, blockHashList, blockTxMap);
        }
      }
      this.bitcoinTipHeightCache = tipHeight;
    } catch (err) {
      console.log('[WalletManager] update error: ', err);
    }
  }

  async getTransaction(targetNodeType, tx) {
    // TODO priority is low.
  };

  async getRawTransaction(targetNodeType, tx) {
    // TODO priority is low.
  };

  async getTxOut(targetNodeType, tx) {
    // TODO priority is low.
  };

  async getBlockCount(targetNodeType) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblockcount();
    } else {
      return await this.elmClient.getblockcount();
    }
  };

  async getBlock(targetNodeType, blockHash) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblock(blockHash);
    } else {
      return await this.elmClient.getblock(blockHash);
    }
  };

  async getBlockHash(targetNodeType, count) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblockhash(count);
    } else {
      return await this.elmClient.getblockhash(count);
    }
  };

  async getMemPoolInfo(targetNodeType) {
    // TODO priority is low.
  };

  async getRawMemPool(targetNodeType) {
    // TODO priority is low.
  };

  async sendRawTransaction(targetNodeType, tx) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.sendrawtransaction(tx);
    } else {
      return await this.elmClient.sendrawtransaction(tx);
    }
  };

  async stop(targetNodeType) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.stop();
    } else {
      return await this.elmClient.stop();
    }
  };

  async callRpcDirect(targetNodeType, command, parameters = []) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.directExecute(command, parameters);
    } else {
      return await this.elmClient.directExecute(command, parameters);
    }
  };
};

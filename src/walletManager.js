const Wallet = require('./libs/walletService.js');
const RpcClient = require('./libs/rpc-client/jsonrpcClient.js');
const path = require('path');
const fs = require('fs');
const ini = require('ini');


// --------------------------------------------------------------------------------------
// private
// --------------------------------------------------------------------------------------
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

const analyzeConfigureFile = function(file, network) {
  const filename = path.basename(file);
  if (filename === 'elements.conf') {
    return analyzeElementsConfigureFile(file, network);
  } else {
    return analyzeBitcoinConfigureFile(file, network);
  }
};


// --------------------------------------------------------------------------------------
// public
// --------------------------------------------------------------------------------------

const targetNodeDefine = {
  Bitcoin: 'bitcoin',
  Elements: 'elements',
};

const networkTypeDefine = {
  Mainnet: 'mainnet',
  Testnet: 'testnet',
  Regtest: 'regtest',
  LiquidV1: 'liquidv1',
  LiquidRegtest: 'liquidregtest',
};

const addressKindDefine = {
  Legacy: 'legacy',
  P2shSegwit: 'p2sh-segwit',
  Bech32: 'bech32',
};

const addressTypeDefine = {
  P2wpkh: 'p2wpkh',
  P2pkh: 'p2pkh',
  P2shP2wpkh: 'p2sh-p2wpkh',
  P2wsh: 'p2wsh',
  P2sh: 'p2sh',
  P2shP2wsh: 'p2sh-p2wsh',
};

const walletManager = class WalletManager {
  /**
   * constructor.
   * @param {string} nodeConfigFile node configration file path.
   * @param {string} dirPath directory path.
   * @param {NetworkType} network network type.
   * @param {string} seed master seed.
   * @param {string} masterXprivkey master xprivkey (ignore seed).
   * @param {string} englishMnemonic mnemonic by english.
   * @param {string} passphrase passphrase.
   * @param {number} domainIndex domain index no.
   * @param {cfdjs} cfdObject cfd-js object.
   */
  constructor(nodeConfigFile, dirPath = './', network = 'regtest',
      seed = '', masterXprivkey = '', englishMnemonic = '', passphrase = '',
      domainIndex = -1, cfdObject = undefined) {
    this.cfd = (!cfdObject) ? require('cfd-js') : cfdObject;
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
      this.seed = this.cfd.ConvertMnemonicToSeed({
        mnemonic: englishMnemonic.mnemonic,
        language: 'en',
        passphrase: passphrase,
      }).seed;
    }
    if (this.xprivkey === '') {
      this.xprivkey = this.cfd.CreateExtkeyFromSeed({
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
    const childExtkey = this.cfd.CreateExtkeyFromParentPath({
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

  /**
   * constructor.
   * @return {cfdjs} cfd object.
   */
  getCfd() {
    return this.cfd;
  }

  /**
   * initialize function.
   * @param {string} targetNodeType target node type.
   * @return {Promise<boolean>} success or fail.
   */
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

  /**
   * shutdown.
   */
  shutdown() {
    this.isShutdown = true;
  };

  /**
   * create wallet.
   * @param {number} userIndex user index value.
   * @param {string} userNamePrefix username prefix string.
   * @param {string} targetNodeType target node type.
   * @param {boolean} inMemoryDatabase uses in-memory database.
   * @return {Promise<Wallet>} wallet object.
   */
  async createWallet(userIndex, userNamePrefix = 'user',
      targetNodeType = 'bitcoin', inMemoryDatabase = true) {
    // wallet is btc or elements support.
    // (multi support is exist pubkey management risk.)
    const userName = `${targetNodeType}-${userNamePrefix}${userIndex}`;
    if ((targetNodeType in this.walletList) &&
        (userName in this.walletList[targetNodeType])) {
      return this.walletList[targetNodeType][userName];
    }
    const walletObj = new Wallet(userNamePrefix, userIndex,
        this.dirName, this.network, this.xprivkey,
        this.nodeConfigMap[targetNodeType], this, inMemoryDatabase);
    await walletObj.initialize();
    if (!(targetNodeType in this.walletList)) {
      this.walletList[targetNodeType] = {};
    }
    this.walletList[targetNodeType][userName] = walletObj;
    return walletObj;
  };

  /**
   * get wallet.
   * @param {number} userIndex user index value.
   * @param {string} userNamePrefix username prefix string.
   * @param {string} targetNodeType target node type.
   * @return {Wallet} wallet object.
   */
  getWallet(userIndex, userNamePrefix, targetNodeType) {
    const userName = `${targetNodeType}-${userNamePrefix}${userIndex}`;
    return this.walletList[targetNodeType][userName];
  };

  /**
   * check update target bitcoin block.
   * @return {Promise<void>} async.
   */
  async checkUpdateBitcoinBlock() {
    await this.checkUpdateBlock('bitcoin');
    if (!this.isShutdown) {
      setTimeout(async () => {
        await this.checkUpdateBitcoinBlock();
      }, 1000);
    }
  }

  /**
   * check update target elements block.
   * @return {Promise<void>} async.
   */
  async checkUpdateElementsBlock() {
    await this.checkUpdateBlock('elements');
    if (!this.isShutdown) {
      setTimeout(async () => {
        await this.checkUpdateElementsBlock();
      }, 1000);
    }
  }

  // use interval function
  // https://nodejs.org/ja/docs/guides/timers-in-node/
  /**
   * check update block.
   * @param {string} targetNodeType target node type.
   * @return {Promise<boolean>} success or fail.
   */
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
      } else if (targetNodeType === 'elements') {
        // elements
        chaintips = await this.elmClient.getchaintips();
        if (this.elementsTipHeightCache === -1) {
          this.elementsTipHeightCache = chaintips[0].height;
        }
        tipHeightCache = this.elementsTipHeightCache;
        client = this.elmClient;
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
          const hex = block.tx[i].hex;
          const txVinData = ('txid' in block.tx[i].vin[0]) ? block.tx[i].vin : undefined;
          const txVout = block.tx[i].vout;
          blockData.tx.push({
            txid: txid, vin: txVinData, vout: txVout, hex: hex});
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
      return true;
    } catch (err) {
      console.log('[WalletManager] update error: ', err);
      return false;
    }
  }

  /**
   * get block count.
   * @param {string} targetNodeType target node type.
   * @return {Promise<number>} block count.
   */
  async getBlockCount(targetNodeType) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblockcount();
    } else {
      return await this.elmClient.getblockcount();
    }
  };

  /**
   * get block.
   * @param {string} targetNodeType target node type.
   * @param {string} blockHash block hash.
   * @return {Promise<*>} block data.
   */
  async getBlock(targetNodeType, blockHash) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblock(blockHash);
    } else {
      return await this.elmClient.getblock(blockHash);
    }
  };

  /**
   * get block hash.
   * @param {string} targetNodeType target node type.
   * @param {number} count block count
   * @return {Promise<string>} block hash
   */
  async getBlockHash(targetNodeType, count) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.getblockhash(count);
    } else {
      return await this.elmClient.getblockhash(count);
    }
  };

  /**
   * get transaction hex.
   * @param {string} targetNodeType target node type
   * @param {string} txid transaction id
   * @param {string | null} blockHash block hash
   * @return {Promise<string>} transaction hex.
   */
  async getRawTransactionHex(targetNodeType, txid, blockHash = null) {
    let tx;
    if (targetNodeType === 'bitcoin') {
      tx = await this.btcClient.getrawtransaction(txid, false, blockHash);
    } else {
      tx = await this.elmClient.getrawtransaction(txid, false, blockHash);
    }
    if (typeof tx == 'string') {
      return tx;
    } else {
      throw new Error('invalid data format.');
    }
  };

  /**
   * get txout proof.
   * @param {string} targetNodeType target node type
   * @param {string[]} txids transaction id list
   * @param {string | null} blockHash block hash
   * @return {Promise<string>} transaction proof.
   */
  async getTxOutProof(targetNodeType, txids, blockHash = null) {
    let txProof;
    if (targetNodeType === 'bitcoin') {
      txProof = await this.btcClient.gettxoutproof(txids, blockHash);
    } else {
      txProof = await this.elmClient.gettxoutproof(txids, blockHash);
    }
    if (typeof txProof == 'string') {
      return txProof;
    } else {
      throw new Error('invalid data format.');
    }
  };

  /**
   * stop target node.
   * @param {string} targetNodeType targete node type.
   * @return {Promise<*>} response.
   */
  async stop(targetNodeType) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.stop();
    } else {
      return await this.elmClient.stop();
    }
  };

  /**
   * stop target node.
   * @param {string} targetNodeType targete node type.
   * @return {Promise<*>} response.
   */
  async stop(targetNodeType) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.stop();
    } else {
      return await this.elmClient.stop();
    }
  };

  /**
   * call RPC command directly.
   * @param {string} targetNodeType target node type.
   * @param {string} command RPC command.
   * @param {string[]} parameters parameter list.
   * @return {Promise<*>} response info.
   */
  async callRpcDirect(targetNodeType, command, parameters = []) {
    if (targetNodeType === 'bitcoin') {
      return await this.btcClient.directExecute(command, parameters);
    } else {
      return await this.elmClient.directExecute(command, parameters);
    }
  };
};

// export
module.exports = walletManager;
module.exports.WalletManager = walletManager;
module.exports.TargetNode = targetNodeDefine;
module.exports.TargetNode.Bitcoin = targetNodeDefine.Bitcoin;
module.exports.TargetNode.Elements = targetNodeDefine.Elements;
module.exports.NetworkType = networkTypeDefine;
module.exports.NetworkType.Mainnet = networkTypeDefine.Mainnet;
module.exports.NetworkType.Testnet = networkTypeDefine.Testnet;
module.exports.NetworkType.Regtest = networkTypeDefine.Regtest;
module.exports.NetworkType.LiquidV1 = networkTypeDefine.LiquidV1;
module.exports.NetworkType.LiquidRegtest = networkTypeDefine.LiquidRegtest;
module.exports.AddressKind = addressKindDefine;
module.exports.AddressKind.Legacy = addressKindDefine.Legacy;
module.exports.AddressKind.P2shSegwit = addressKindDefine.P2shSegwit;
module.exports.AddressKind.Bech32 = addressKindDefine.Bech32;
module.exports.AddressType = addressTypeDefine;
module.exports.AddressType.P2wpkh = addressTypeDefine.P2wpkh;
module.exports.AddressType.P2pkh = addressTypeDefine.P2pkh;
module.exports.AddressType.P2shP2wpkh = addressTypeDefine.P2shP2wpkh;
module.exports.AddressType.P2wsh = addressTypeDefine.P2wsh;
module.exports.AddressType.P2sh = addressTypeDefine.P2sh;
module.exports.AddressType.P2shP2wsh = addressTypeDefine.P2shP2wsh;

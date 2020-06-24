const DbService = require('./databaseService.js');
const AddressService = require('./addressService.js');
const UtxoService = require('./utxoService.js');
const RpcClient = require('./rpc-client/jsonrpcClient.js');
const define = require('./definition');

const emptyBlinder = define.emptyBlinder;

module.exports = class Wallet {
  /**
   * constructor.
   * @param {string} userNamePrefix user name prefix.
   * @param {number} userIndex user index.
   * @param {string} dirPath directory path.
   * @param {string} network network type.
   * @param {string} masterXprivkey master xprivkey.
   * @param {NodeConfigurationData} nodeConfig node config.
   * @param {WalletManager} manager wallet manager.
   * @param {boolean} inMemoryDatabase use in-memory database.
   */
  constructor(userNamePrefix, userIndex, dirPath, network,
      masterXprivkey, nodeConfig, manager, inMemoryDatabase = true) {
    if (isNaN(userIndex)) {
      throw new Error('Wallet userIndex is number only.');
    }
    this.dirName = dirPath;
    this.dbName = `${userNamePrefix}${userIndex}_${network}`;
    this.userIndex = userIndex;
    this.network = network;
    this.nodeConfig = nodeConfig;
    this.masterXprivkey = masterXprivkey; // xpriv(m/44'/(nettype)')
    this.manager = manager;
    this.cfd = this.manager.getCfd();

    const conn = RpcClient.createConnection(nodeConfig.host,
        nodeConfig.port, nodeConfig.user, nodeConfig.pass, this.dbName);
    if ((network === 'mainnet') || (network === 'testnet') || (network === 'regtest')) {
      this.client = new RpcClient.BitcoinCli(conn);
      this.isElements = false;
    } else {
      this.client = new RpcClient.ElementsCli(conn);
      this.isElements = true;
    }

    let keyNetwork = network;
    if ((network === 'mainnet') || (network === 'testnet') || (network === 'regtest')) {
      // do nothing
    } else {
      if (keyNetwork === 'liquidv1') {
        keyNetwork = 'mainnet';
      } else {
        keyNetwork = 'regtest';
      }
    }
    const extPath = `${userIndex}h`;
    // console.log(`bip44 = ${bip44}, nettypeIndex = ${nettypeIndexStr}`);
    const childExtkey = this.cfd.CreateExtkeyFromParentPath({
      extkey: masterXprivkey,
      network: keyNetwork,
      extkeyType: 'extPrivkey',
      path: extPath,
    });
    this.masterXprivkey = childExtkey.extkey;
    this.mainchainNetwork = keyNetwork;

    this.dbService = new DbService(this.dbName, dirPath, inMemoryDatabase);
    this.addrService = new AddressService(this.dbService, this.cfd);
    this.utxoService = new UtxoService(
        this.dbService, this.addrService, this.client, this);
    this.estimateMode = 'CONSERVATIVE';
    this.minimumFeeRate = 2.0;
    this.minimumFee = 1000;
    this.targetConf = (this.isElements) ? 1 : 6;
    this.gapLimit = 20;
    this.addressType = 'p2wpkh';
    this.masterBlindingKey = '';
    this.sidechaininfo = {};
    this.assetLbtc = '';
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
   * @return {Promise<boolean>} success or fail.
   */
  async initialize() {
    const dbBaseName = (this.isElements) ? 'edb' : 'db';
    let ret = await this.dbService.initialize(dbBaseName);
    if (ret === false) {
      console.log('[wallet] databaseService initialize failed.');
      throw Error('[wallet] databaseService initialize failed.');
      // return false;
    }
    ret = await this.addrService.initialize(this.network, this.masterXprivkey);
    if (ret === false) {
      console.log('[wallet] addressService initialize failed.');
      throw Error('[wallet] addressService initialize failed.');
      // return false;
    }
    ret = await this.utxoService.initialize(this.network, this.masterXprivkey);
    if (ret === false) {
      console.log('[wallet] utxoService initialize failed.');
      throw Error('[wallet] utxoService initialize failed.');
      // return false;
    }
    // RPC connection check
    const isConnect = await this.checkConnection();
    if (isConnect === false) {
      console.log('[wallet] RPC connect failed.');
      throw Error('[wallet] RPC connect failed.');
    }
    await this.forceUpdateUtxoData();
    if (this.isElements) {
      // FIXME get master blinding key
      this.masterBlindingKey = await this.client.dumpmasterblindingkey();
      this.sidechaininfo = await this.client.getsidechaininfo();
      this.assetLbtc = this.sidechaininfo.pegged_asset;
      await this.appendAsset(this.assetLbtc, 'bitcoin');
    }
    return true;
  };

  /**
   * get current target.
   * @return {string} node type.
   */
  getTarget() {
    return (!this.isElements) ? 'bitcoin' : 'elements';
  };

  /**
   * check connection.
   * @return {Promise<boolean>} connection success or fail;
   */
  async checkConnection() {
    let result = '';
    try {
      result = await this.client.getblockcount();
    } catch (err) {
      console.log('checkConnection err.', err);
    } finally {
      if (isNaN(result)) return true;
      if ((result === undefined) || (result.length === 0)) {
        return false;
      }
      return true;
    }
  }

  /**
   * callback update block.
   * @param {*} tipBlockCount block count.
   * @param {*} blockHashList block hash list.
   * @param {*} blockTxMap block transaction map.
   * @return {Promise<boolean>} success or fail.
   */
  async callbackUpdateBlock(tipBlockCount, blockHashList, blockTxMap) {
    const configTbl = this.dbService.getConfigTable();
    const ret = await this.utxoService.changeState(blockHashList, blockTxMap);
    await configTbl.updateTipBlockHeight(tipBlockCount);
    return ret;
  }

  /**
   * force update utxo.
   * @return {Promise<boolean>} success or fail.
   */
  async forceUpdateUtxoData() {
    const configTbl = this.dbService.getConfigTable();
    const tipHeightCache = await configTbl.getTipBlockHeight();
    const chaintips = await this.client.getchaintips();
    const tipHeight = chaintips[0].height;
    let prevBlockHash = chaintips[0].hash;
    if (tipHeightCache === tipHeight) {
      return false;
    } else {
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
        const block = await this.client.getblock(blockHash, 2);
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
      return await this.callbackUpdateBlock(
          tipHeight, blockHashList, blockTxMap);
    }
  }

  // async lock
  // https://gist.github.com/yujin02/1a69f5b20d9fc9873281

  /**
   * call generate block.
   * @param {number} count execute count.
   * @param {string} address send address.
   * @param {boolean} nowait nowait flag.
   * @return {Promise<*>} generate response data.
   */
  async generate(count, address = '', nowait = false) {
    await this.forceUpdateUtxoData();
    const configTbl = this.dbService.getConfigTable();
    const tipHeightCache = await configTbl.getTipBlockHeight();

    let addr = address;
    if (addr === '') {
      const addrInfo = await this.addrService.getFeeAddress(
          'p2wpkh', '', -1, this.gapLimit);
      addr = addrInfo.address;
    }

    try {
      const generateInfo = await this.utxoService.generate(addr, count);
      if (!nowait) {
        const sleep = (msec) => new Promise(
            (resolve) => setTimeout(resolve, msec));
        let tipHeightAfter = await configTbl.getTipBlockHeight();
        let loop = 0;
        while (tipHeightCache == tipHeightAfter) {
          await sleep(500);
          tipHeightAfter = await configTbl.getTipBlockHeight();
          ++loop;
          if (loop > 20) {
            break;
          }
        }
      }
      return generateInfo;
    } catch (e) {
      console.log('exception: addr=', addr);
      throw e;
    }
  };

  /**
   * generate fund.
   * @param {bigint | number} satoshiAmount satoshi amount.
   * @param {boolean} nowait nowait flag.
   * @return {Promise<bigint | number>} generate amount.
   */
  async generateFund(satoshiAmount, nowait = false) {
    if (isNaN(satoshiAmount)) {
      throw new Error('Wallet satoshiAmount is number only.');
    }
    await this.forceUpdateUtxoData();
    let total = 0;
    while (true) {
      const ret = await this.generate(1, '', nowait);
      if (ret === false) {
        console.log('[generateFund] generate error.');
        break;
      }
      total += ret.amount;
      if (total >= satoshiAmount) {
        // console.log('[generateFund] collect done: ', satoshiAmount);
        break;
      }
    }
    return total;
  }

  // estimateMode: UNSET or CONSERVATIVE or ECONOMICAL
  /**
   * send to address.
   * @param {string} address bitcoin address.
   * @param {bigint | number} satoshiAmount satoshi amount.
   * @param {string} asset asset id.
   * @param {string} estimateMode estimate mode.
   * @param {number} feeRateForUnset unset fee rate.
   * @param {number} targetConf target confirmation
   * @return {Promise<*>} send tx info.
   */
  async sendToAddress(address, satoshiAmount, asset = '',
      estimateMode = 'CONSERVATIVE', feeRateForUnset = 20.0, targetConf = 6) {
    if (isNaN(satoshiAmount)) {
      throw new Error('Wallet satoshiAmount is number only.');
    }
    if (isNaN(feeRateForUnset)) {
      throw new Error('Wallet feeRateForUnset is number only.');
    }
    let feeRate = feeRateForUnset;
    if (this.isElements) {
      feeRate = 0.15;
    } else if (this.network === 'testnet') {
      feeRate = 1;
    } else if (estimateMode === 'CONSERVATIVE') {
      feeRate = 20.0;
    } else if (estimateMode === 'ECONOMICAL') {
      feeRate = this.minimumFeeRate;
    }

    if (this.isElements && (!asset)) {
      throw new Error('Please set asset info by elements mode.');
    }
    // FIXME save l-btc asset to configTable?
    const feeAsset = (this.isElements) ? this.assetLbtc : '';
    let tx = this.createRawTransaction(2, 0, [], [{
      'address': address,
      'amount': satoshiAmount,
      'asset': asset,
    }], {asset: feeAsset, amount: 0});
    tx = await this.fundRawTransactionInternal(
        tx.hex, feeRate, feeAsset, targetConf);
    if (this.isElements && tx.isConfidential) {
      const utxos = tx.utxos;
      const inputList = [];
      for (const utxo of utxos) {
        inputList.push({
          txid: utxo.txid,
          vout: utxo.vout,
          asset: utxo.asset,
          amount: utxo.amount,
          blindFactor: utxo.amoutnBlinder,
          assetBlindFactor: utxot.assetBlinder,
        });
      }
      tx = this.cfd.BlindRawTransaction({
        tx: tx.hex,
        txins: inputList,
      });
    }
    tx = await this.signRawTransactionWithWallet(tx.hex, false);
    const txid = await this.sendRawTransaction(tx.hex);
    return {txid: txid, vout: 0, hex: tx.hex};
  }

  /**
   * send to address.
   * @param {*} addresses address amount info list.
   * @param {string} estimateMode estimate mode.
   * @param {number} feeRateForUnset unset fee rate.
   * @param {number} targetConf target confirmation
   * @return {Promise<*>} send tx info.
   */
  async sendToAddresses(addresses, estimateMode, feeRateForUnset,
      targetConf) {
    if (isNaN(feeRateForUnset)) {
      throw new Error('Wallet feeRateForUnset is number only.');
    }
    let feeRate = feeRateForUnset;
    if (this.isElements) {
      feeRate = 0.15;
    } else if (this.network === 'testnet') {
      feeRate = 1;
    } else if (estimateMode === 'CONSERVATIVE') {
      feeRate = 20.0;
    } else if (estimateMode === 'ECONOMICAL') {
      feeRate = this.minimumFeeRate;
    }

    // FIXME save l-btc asset to configTable?
    const feeAsset = (this.isElements) ? this.assetLbtc : '';
    const txouts = [];
    for (const input of addresses) {
      txouts.push({
        address: input.address,
        amount: input.amount,
        asset: input.asset,
      });
      if (this.isElements && (!input.asset)) {
        throw new Error('Please set asset info by elements mode.');
      }
    }
    let tx = this.createRawTransaction(2, 0, [], txouts,
        {asset: feeAsset, amount: 0});
    tx = await this.fundRawTransactionInternal(
        tx.hex, feeRate, feeAsset, targetConf);
    if (this.isElements && tx.isConfidential) {
      const utxos = tx.utxos;
      const inputList = [];
      for (const utxo of utxos) {
        inputList.push({
          txid: utxo.txid,
          vout: utxo.vout,
          asset: utxo.asset,
          amount: utxo.amount,
          blindFactor: utxo.amountBlinder,
          assetBlindFactor: utxo.assetBlinder,
        });
      }
      // console.log('blind utxo:', inputList);
      tx = this.cfd.BlindRawTransaction({
        tx: tx.hex,
        txins: inputList,
      });
    }
    tx = await this.signRawTransactionWithWallet(tx.hex, false);
    const txid = await this.sendRawTransaction(tx.hex);
    return {txid: txid, vout: 0, hex: tx.hex};
  }

  /**
   * create transaction.
   * @param {number} version tx version
   * @param {number} locktime locktime
   * @param {*} txin tx inputs
   * @param {*} txout tx outputs
   * @param {*} fee fee info.
   * @return {*} tx info.
   */
  createRawTransaction(version = 2, locktime = 0, txin = [],
      txout = [], fee = {asset: '', amount: 0}) {
    let tx;
    if (this.isElements) {
      tx = this.cfd.ElementsCreateRawTransaction({
        'version': 2,
        'locktime': 0,
        'txins': txin,
        'txouts': txout,
        'fee': fee,
      });
    } else {
      tx = this.cfd.CreateRawTransaction({
        version: version,
        locktime: locktime,
        txins: txin,
        txouts: txout,
      });
    }
    return tx;
  }

  /**
   * get new address.
   * @param {string} addressType address type.
   * @param {string} label label name.
   * @param {number} targetIndex target index.
   * @param {boolean} hasFeeAddress use fee addresss.
   * @return {Promise<*>} address info.
   */
  async getNewAddress(addressType = '', label = '', targetIndex = -1,
      hasFeeAddress = false) {
    let addrType = (addressType === '') ? this.addressType : addressType;
    addrType = this.convertAddressType(addrType);
    if (hasFeeAddress) {
      return await this.addrService.getFeeAddress(
          addrType, label, targetIndex, this.gapLimit);
    } else {
      return await this.addrService.getReceiveAddress(
          addrType, label, targetIndex, this.gapLimit);
    }
  }

  /**
   * get confidential address.
   * @param {string} address unblinded address
   * @return {string} confidential address
   */
  getConfidentialAddress(address) {
    const keyPair = this.getBlindingKey(address);
    const ctAddr = this.cfd.GetConfidentialAddress({
      unblindedAddress: address,
      key: keyPair.pubkey,
    });
    return ctAddr.confidentialAddress;
  }

  /**
   * get blinding key.
   * @param {string} address unblinded address
   * @return {*} blinding key and confidnetial key
   */
  getBlindingKey(address) {
    const blindingKey = this.cfd.GetDefaultBlindingKey({
      masterBlindingKey: this.masterBlindingKey,
      address: address,
    });
    const confidentialKey = this.cfd.GetPubkeyFromPrivkey({
      privkey: blindingKey.blindingKey,
      isCompressed: true,
    });
    return {
      privkey: blindingKey.blindingKey,
      pubkey: confidentialKey.pubkey,
    };
  }

  /**
   * get generated address list.
   * @return {Promise<*[]>} address list.
   */
  async getAddresses() {
    return await this.addrService.getAddresses();
  }

  /**
   * get address list by label.
   * @param {string} label label name
   * @return {Promise<*[]>} address list.
   */
  async getAddressesByLabel(label) {
    return await this.addrService.getAddressesByLabel(label);
  }

  /**
   * get address info.
   * @param {string} address address
   * @return {Promise<*>} address info.
   */
  async getAddressInfo(address) {
    let ret = await this.addrService.getAddressInfo(address);
    if (!ret) {
      // empty, convert address with cfd.
      ret = this.cfd.GetAddressInfo({
        address: address,
      });
      ret['solvable'] = false;
    } else {
      ret['solvable'] = (ret.path !== '');
      try {
        if (ret.type === 'p2sh-p2wpkh') {
          const addrInfo = this.cfd.CreateAddress({
            keyData: {
              hex: ret.pubkey,
              type: 'pubkey',
            },
            network: this.network,
            hashType: 'p2wpkh',
            isElements: this.isElements,
          });
          const embedded = {
            pubkey: ret.pubkey,
            path: ret.path,
            address: addrInfo.address,
            type: 'p2wpkh',
            lockingScript: addrInfo.lockingScript,
            descriptor: `wpkh(${ret.path})`,
          };
          ret['embedded'] = embedded;
        } else if (ret.type === 'p2sh-p2wsh') {
          const addrInfo = this.cfd.CreateAddress({
            keyData: {
              hex: ret.script,
              type: 'redeem_script',
            },
            network: this.network,
            hashType: 'p2wsh',
            isElements: this.isElements,
          });
          let desc = `addr(${addrInfo.address})`;
          if (ret.multisig === true) {
            const multisigRet = this.cfd.GetAddressesFromMultisig( {
              isElements: this.isElements,
              redeemScript: ret.script,
              network: this.network,
              hashType: 'p2wpkh',
            });
            desc = this.addrService.getMultisigDescriptor(
                multisigRet.pubkeys);
          }
          const embedded = {
            script: ret.script,
            address: addrInfo.address,
            type: 'p2wsh',
            lockingScript: addrInfo.lockingScript,
            descriptor: desc,
          };
          ret['embedded'] = embedded;
        }
      } catch (err) {
        console.err(err);
      }
    }
    return ret;
  }

  /**
   * add multisig address.
   * @param {string[]} pubkeys pubkey list.
   * @param {number} requireNum multisig require number.
   * @param {string} addressType address type.
   * @param {string} label label name.
   * @return {Promise<*>} multisig address info.
   */
  async addMultisigAddress(pubkeys = [], requireNum = 1, addressType = 'p2wsh', label = '') {
    if ((!pubkeys) || (pubkeys.length <= 1)) {
      throw Error('Illegal pubkey length.');
    } else if (requireNum <= 0) {
      throw Error('Illegal requireNum.');
    }
    let addrType = (addressType === '') ? this.addressType : addressType;
    addrType = this.convertAddressType(addressType, true);
    const pubkeyList = [];
    for (let i = 0; i < pubkeys.length; ++i) {
      if (!pubkeys[i]) {
        throw Error('Illegal pubkey.');
      } else if ((pubkeys[i].length === 66) ||
          (pubkeys[i].length === 130)) {
        // normal pubkey
        pubkeyList.push(pubkeys[i]);
      } else {
        // extkey
        const keyInfo = this.cfd.GetPubkeyFromExtkey({
          extkey: pubkeys[i],
          network: this.network,
        });
        pubkeyList.push(keyInfo.pubkey);
      }
    }
    const scriptRet = this.cfd.CreateMultisig({
      nrequired: requireNum,
      keys: pubkeyList,
      network: this.network,
      hashType: addrType,
    });
    const script = ('witnessScript' in scriptRet) ?
        scriptRet.witnessScript : scriptRet.redeemScript;
    return await this.addrService.getScriptAddress(
        script, addrType, label, pubkeys);
  }

  /**
   * get script address.
   * @param {string} script redeem script.
   * @param {string} addressType address type.
   * @param {string} label label name.
   * @param {string[]} relatedPubkeys related pubkey list.
   * @return {Promise<*>} script address info.
   */
  async getScriptAddress(script, addressType = 'p2wsh', label = '', relatedPubkeys = []) {
    let addrType = (addressType === '') ? this.addressType : addressType;
    addrType = this.convertAddressType(addressType, true);
    return await this.addrService.getScriptAddress(
        script, addrType, label, relatedPubkeys);
  }

  /**
   * get privkey.
   * @param {string} address address.
   * @param {string} pubkey pubkey.
   * @return {Promise<string>} privkey.
   */
  async dumpPrivkey(address = '', pubkey = '') {
    let addrInfo;
    if (address !== '') {
      addrInfo = await this.addrService.getAddressInfo(address);
    } else if (pubkey !== '') {
      addrInfo = await this.addrService.getAddressInfoByPubkey(pubkey);
    }
    if (!addrInfo) {
      return false;
    }
    if ('script' in addrInfo) {
      return false;
    }
    const keys = addrInfo.path.split('/');
    let childPath = '';
    for (let i = 1; i < keys.length; ++i) {
      if (i === 1) {
        childPath = keys[i];
      } else {
        childPath = childPath + '/' + keys[i];
      }
    }
    const extkey = this.cfd.CreateExtkeyFromParentPath({
      extkey: this.masterXprivkey,
      network: this.mainchainNetwork,
      extkeyType: 'extPrivkey',
      path: childPath,
    });
    const privkey = this.cfd.GetPrivkeyFromExtkey({
      extkey: extkey.extkey,
      network: this.mainchainNetwork,
      wif: true,
      isCompressed: true,
    });
    return privkey.privkey;
  }

  /**
   * estimate smart fee.
   * @param {number} confTarget  confirmation target count.
   * @param {string} estimateMode estimate mode.
   * @return {void} empty
   */
  estimateSmartFee(confTarget = 6, estimateMode = 'CONSERVATIVE') {
    if (this.isElements) {
      this.estimateMode = 'ECONOMICAL';
      this.targetConf = 1;
    } else if (this.network === 'testnet') {
      this.estimateMode = 'ECONOMICAL';
      this.targetConf = 1;
    } else {
      if (estimateMode === 'CONSERVATIVE') {
        this.estimateMode = 'CONSERVATIVE';
      } else if (estimateMode === 'ECONOMICAL') {
        this.estimateMode = 'ECONOMICAL';
      } else {
        throw Error('illegal setting.');
      }
      if (confTarget > 0) {
        this.targetConf = confTarget;
      }
    }
  }

  /**
   * set gap limit.
   * @param {number} limit  gap limit.
   * @return {void} empty
   */
  setGapLimit(limit = 20) {
    this.gapLimit = limit;
  }

  /**
   * set address type.
   * @param {string} addressType address type.
   * @return {void} empty.
   */
  setAddressType(addressType = 'p2wpkh') {
    this.addressType = this.convertAddressType(addressType);
  }

  /**
   * convert address type.
   * @param {string} addressType address type.
   * @param {boolean} isScript use script address.
   * @return {string} convert address type.
   */
  convertAddressType(addressType = 'p2wpkh', isScript = false) {
    if ((!isScript) && ((addressType === 'p2wpkh') || (addressType === 'p2pkh') ||
        (addressType === 'p2sh-p2wpkh'))) {
      return addressType;
    } else if (isScript && ((addressType === 'p2wsh') || (addressType === 'p2sh') ||
        (addressType === 'p2sh-p2wsh'))) {
      return addressType;
    } else if (addressType === 'legacy') {
      return (isScript) ? 'p2sh' : 'p2pkh';
    } else if (addressType === 'p2sh-segwit') {
      return (isScript) ? 'p2sh-p2wsh' : 'p2sh-p2wpkh';
    } else if (addressType === 'bech32') {
      return (isScript) ? 'p2wsh' : 'p2wpkh';
    } else {
      throw Error('Illegal address type.');
    }
  }

  /**
   * get balance.
   * @param {number} minimumConf minimum confermation
   * @param {string} address address
   * @param {string} path bip32 path
   * @param {string} asset asset id
   * @return {Promise<*>} barance data.
   */
  async getBalance(minimumConf = 6, address = '', path = '', asset = '') {
    const list = await this.utxoService.listUnspent(
        minimumConf, 9999999999, address, asset, path, true);
    const map = {};
    if (this.isElements === false) {
      let total = 0;
      for (let i = 0; i < list.length; ++i) {
        if (list[i]) {
          total += list[i].amount;
        }
      }
      map['bitcoin'] = total;
    } else if (asset === '') {
      for (let i = 0; i < list.length; ++i) {
        if (list[i]) {
          const asset = list[i].asset;
          if (asset in map) {
            map[asset] = map[asset] + list[i].amount;
          } else {
            map[asset] = list[i].amount;
          }
        }
      }
    } else {
      for (let i = 0; i < list.length; ++i) {
        if (list[i] && (list[i].asset === asset)) {
          if (asset in map) {
            map[asset] = map[asset] + list[i].amount;
          } else {
            map[asset] = list[i].amount;
          }
        }
      }
    }
    return map;
  }

  /**
   * get unspent utxo lists.
   * @param {number} minimumConf minimum confirmation
   * @param {number} maximumConf maximum confirmation
   * @param {string} address address
   * @param {string} path bip32 path
   * @param {string} asset asset
   * @return {Promise<*>} utxo list.
   */
  async listUnspent(minimumConf = 1, maximumConf = 9999999999,
      address = '', path = '', asset = '') {
    return await this.utxoService.listUnspent(
        minimumConf, maximumConf, address, asset, path);
  }

  /**
   * get mempool utxo count.
   * @return {Promise<number>} utxo count from mempool.
   */
  async getMempoolUtxoCount() {
    return await this.utxoService.getMempoolUtxoCount();
  }

  /**
   * get utxo block id list.
   * @return {Promise<string[]>} block id list.
   */
  async getUtxoBlockIds() {
    return await this.utxoService.getUtxoBlockIds();
  }

  /**
   * set minimum fee rate.
   * @param {number} minimumFeeRate minimum fee rate.
   * @return {void} empty.
   */
  async setMinimumFeeRate(minimumFeeRate = 2.0) {
    this.minimumFeeRate = minimumFeeRate;
  }

  /**
   * decode transaction .
   * @param {string} tx transaction hex.
   * @return {*} decode transaction.
   */
  decodeRawTransaction(tx) {
    if (this.isElements) {
      let liquidNetwork = 'regtest';
      let mainchainNetwork = 'regtest';
      if (this.network === 'liquidv1') {
        mainchainNetwork = 'mainnet';
        liquidNetwork = 'liquidv1';
      }
      return this.cfd.ElementsDecodeRawTransaction({
        hex: tx,
        network: liquidNetwork,
        mainchainNetwork: mainchainNetwork,
      });
    } else {
      return this.cfd.DecodeRawTransaction({
        hex: tx,
        network: this.network,
      });
    }
  }

  /**
   * fund transaction.
   * @param {string} tx transaction hex.
   * @param {*} feeAsset fee asset
   * @param {string[]} ignoreAssets ignore target asset.
   * @return {Promise<*>} fund data.
   */
  async fundRawTransaction(tx, feeAsset = '', ignoreAssets = []) {
    let feeRate;
    if (this.isElements) {
      feeRate = 0.15;
    } else if (this.network === 'testnet') {
      feeRate = 1;
    } else if (this.estimateMode === 'CONSERVATIVE') {
      feeRate = 20.0;
    } else if (this.estimateMode === 'ECONOMICAL') {
      feeRate = this.minimumFeeRate;
    }
    return this.fundRawTransactionInternal(
        tx, feeRate, feeAsset, this.targetConf, ignoreAssets);
  }

  /**
   * fund transaction internal.
   * @param {string} tx transaction hex
   * @param {number} feeRate fee rate
   * @param {string} feeAsset fee asset
   * @param {number} targetConf target confirmation
   * @param {string[]} ignoreAssets ignore target asset.
   * @return {Promise<*>} fund data.
   */
  async fundRawTransactionInternal(tx, feeRate, feeAsset = '', targetConf = 6,
      ignoreAssets = []) {
    // Should UTXO for fishing address be given priority?
    const decTx = this.decodeRawTransaction(tx);
    let reqJson;
    let isConfidential = false;
    const responseUtxos = [];
    const selectedUtxos = [];
    let utxos;
    if (this.isElements) {
      // vout confidential check
      for (const txout of decTx.vout) {
        if (txout) {
          if (txout.scriptPubKey) {
            if (txout.scriptPubKey.type === 'fee') {
              // do nothing
            } else if (txout.commitmentnonce_fully_valid === true) {
              isConfidential = true;
            }
          }
        }
      }
      utxos = await this.utxoService.listUnspent(
          targetConf, 9999999999, '', '', '', true, !isConfidential);
      // console.log('utxos = ', utxos);
      for (let i = 0; i < decTx.vin.length; ++i) {
        if (decTx.vin[i]) {
          const txid = decTx.vin[i].txid;
          const vout = decTx.vin[i].vout;
          const utxoData = await this.utxoService.getUtxoData(`${txid},${vout}`);
          if (utxoData) {
            selectedUtxos.push({
              txid: txid,
              vout: vout,
              amount: utxoData.amount,
              asset: utxoData.asset,
              redeemScript: utxoData.lockingScript,
              descriptor: utxoData.descriptor,
              blindFactor: utxoData.amountBlinder,
              assetBlindFactor: utxoData.assetBlinder,
            });
            // responseUtxos.push(utxoData);
          }
        }
      }
      // collect asset
      const assetList = [];
      for (let i = 0; i < decTx.vout.length; ++i) {
        if (decTx.vout[i] && ('asset' in decTx.vout[i])) {
          let isFind = false;
          for (const ignoreAsset of ignoreAssets) {
            if (decTx.vout[i].asset === ignoreAsset) {
              isFind = true;
              break;
            }
          }
          if (!isFind) {
            assetList.push(decTx.vout[i].asset);
          }
        }
      }
      // create json
      const reservedAddress = await this.addrService.getFeeAddress(
          'p2wpkh', '', -1, this.gapLimit);
      const reservedCtAddr = this.getConfidentialAddress(
          reservedAddress.address);
      const reservedAddr = (isConfidential) ?
          reservedCtAddr : reservedAddress.address;
      const assetMap = {};
      assetMap[this.assetLbtc] = 1;
      reqJson = {
        utxos: utxos,
        selectUtxos: selectedUtxos,
        tx: tx,
        isElements: this.isElements,
        network: this.network,
        targets: [{
          asset: this.assetLbtc,
          amount: 0,
          reserveAddress: reservedAddr,
        }],
        feeInfo: {
          feeRate: feeRate,
          longTermFeeRate: feeRate,
          knapsackMinChange: 1,
          dustFeeRate: 3,
          feeAsset: feeAsset,
        },
      };
      for (let i = 0; i < assetList.length; ++i) {
        if (assetList[i] && !(assetList[i] in assetMap)) {
          const index = (assetList.length > this.gapLimit) ? i : -1;
          const feeAddress = await this.addrService.getFeeAddress(
              'p2wpkh', '', index, this.gapLimit);
          const chargeCtAddr = this.getConfidentialAddress(
              feeAddress.address);
          const reserveAddr = (isConfidential) ?
              chargeCtAddr : feeAddress.address;
          const data = {
            asset: assetList[i],
            reserveAddress: reserveAddr,
            amount: 0,
          };
          reqJson.targets.push(data);
          assetMap[assetList[i]] = 1;
        }
      }
    } else {
      utxos = await this.utxoService.listUnspent(
          targetConf, 9999999999, '', '', '', true);
      // console.log('utxos = ', utxos);
      const feeAddress = await this.addrService.getFeeAddress(
          'p2wpkh', '', -1, this.gapLimit);
      for (let i = 0; i < decTx.vin.length; ++i) {
        if (decTx.vin[i]) {
          const txid = decTx.vin[i].txid;
          const vout = decTx.vin[i].vout;
          const utxoData = await this.utxoService.getUtxoData(`${txid},${vout}`);
          if (utxoData) {
            selectedUtxos.push({
              txid: txid,
              vout: vout,
              amount: utxoData.amount,
              address: utxoData.address,
              redeemScript: utxoData.lockingScript,
              descriptor: utxoData.descriptor,
            });
            // responseUtxos.push(utxoData);
          }
        }
      }
      reqJson = {
        utxos: utxos,
        selectUtxos: selectedUtxos,
        tx: tx,
        isElements: this.isElements,
        network: this.network,
        targetAmount: 0,
        reserveAddress: feeAddress.address,
        feeInfo: {
          feeRate: feeRate,
          longTermFeeRate: 20.0,
          knapsackMinChange: 1,
          dustFeeRate: 3,
        },
      };
    }
    // console.log('isConfidential : ', isConfidential);
    // console.log('FundRawTransaction : ', reqJson);
    const result = this.cfd.FundRawTransaction(reqJson);
    if (result) {
      const decTx2 = this.decodeRawTransaction(result.hex);
      if (this.isElements) {
        for (let i = 0; i < decTx2.vin.length; ++i) {
          if (decTx2.vin[i]) {
            const txid = decTx2.vin[i].txid;
            const vout = decTx2.vin[i].vout;
            const utxoData = await this.utxoService.getUtxoData(`${txid},${vout}`);
            if (utxoData) {
              responseUtxos.push(utxoData);
            }
          }
        }
      }
    }
    return {hex: result.hex, fee: result.feeAmount,
      utxos: responseUtxos, isConfidential: isConfidential};
  }

  // prevtxs: {txid: '', vout: 0}
  /**
   * sign transaction with wallet.
   * @param {string} tx transaction hex
   * @param {boolean} ignoreError ignore error
   * @param {any[]} prevtxs outpoint list
   * @param {string} sighashtype sighash type
   * @return {Promise<*>} signed transaction.
   */
  async signRawTransactionWithWallet(tx, ignoreError = true, prevtxs = [], sighashtype = 'all') {
    let transaction = tx;
    const decTx = this.decodeRawTransaction(tx);
    const outpoints = [];
    for (let i = 0; i < decTx.vin.length; ++i) {
      if (decTx.vin[i]) {
        const txid = decTx.vin[i].txid;
        const vout = decTx.vin[i].vout;
        if ((prevtxs) && (prevtxs.length > 0)) {
          let exist = false;
          for (let j = 0; j < prevtxs.length; ++j) {
            if (prevtxs[j] && (prevtxs[j].txid === txid &&
                prevtxs[j].vout === vout)) {
              exist = true;
              break;
            }
          }
          if (!exist) {
            continue;
          }
        }
        const outpoint = `${txid},${vout}`;
        outpoints.push({outpoint: outpoint, txid: txid, vout: vout});
      }
    }

    const errors = [];
    let signedCount = 0;
    for (let i = 0; i < outpoints.length; ++i) {
      try {
        // vin: utxo search
        const utxo = await this.utxoService.getUtxoData(outpoints[i].outpoint);
        if (!utxo) {
          throw Error('unknown utxo.');
        }
        // get privkey list
        const addrInfo = await this.addrService.getAddressInfo(utxo.address);
        if ('script' in addrInfo) {
          // auto sign is passed. (should sign with personal key?)
          continue;
        }
        const privkey = await this.dumpPrivkey(utxo.address);
        if (!privkey) {
          console.log('unknown address. utxo: ', utxo);
          throw Error('unknown address.');
        }
        // console.log('address = ', utxo.address);
        // console.log('privkey = ', privkey);
        let amountCommitment = '';
        if (this.isElements && (utxo.amountBlinder != emptyBlinder)) {
          const commitment = this.cfd.GetCommitment({
            amount: utxo.amount,
            asset: utxo.asset,
            assetBlindFactor: utxo.assetBlinder,
            blindFactor: utxo.amountBlinder,
          });
          amountCommitment = commitment.amountCommitment;
        }
        const signRet = this.cfd.SignWithPrivkey({
          isElements: this.isElements,
          tx: transaction,
          txin: {
            txid: utxo.txid,
            vout: utxo.vout,
            privkey: privkey,
            amount: utxo.amount,
            confidentialValueCommitment: amountCommitment,
            hashType: addrInfo.type,
            sighashtype: sighashtype,
          },
        });
        transaction = signRet.hex;
        ++signedCount;
      } catch (err) {
        if (!ignoreError) throw err;
        error = true;
        const txid = outpoints[i].txid;
        const vout = outpoints[i].vout;
        errors.push({txid: txid, vout: vout, error: err.toString()});
      }
    }
    const complete = (decTx.vin.length === signedCount);
    return {hex: transaction, complete: complete, errors: errors};
  }


  // prevtxs: {txid: '', vout: 0}
  /**
   * get signature list.
   * @param {string} tx transaction hex
   * @param {boolean} ignoreError ignore error
   * @param {any[]} prevtxs outpoint list
   * @param {string} sighashtype sighash type
   * @return {Promise<*[]>} signature list.
   */
  async getSignatures(tx, ignoreError = true, prevtxs = [], sighashtype = 'all') {
    const transaction = tx;
    const decTx = this.decodeRawTransaction(tx);
    const outpoints = [];
    for (let i = 0; i < decTx.vin.length; ++i) {
      if (decTx.vin[i]) {
        const txid = decTx.vin[i].txid;
        const vout = decTx.vin[i].vout;
        if ((prevtxs) && (prevtxs.length > 0)) {
          let exist = false;
          for (let j = 0; j < prevtxs.length; ++j) {
            if (prevtxs[j] && (prevtxs[j].txid === txid &&
                prevtxs[j].vout === vout)) {
              exist = true;
              break;
            }
          }
          if (!exist) {
            continue;
          }
        }
        const outpoint = `${txid},${vout}`;
        outpoints.push({outpoint: outpoint, txid: txid, vout: vout});
      }
    }

    const errors = [];
    const signatures = [];
    let signedCount = 0;
    for (let i = 0; i < outpoints.length; ++i) {
      const txid = outpoints[i].txid;
      const vout = outpoints[i].vout;
      try {
        // vin: utxo search
        const utxo = await this.utxoService.getUtxoData(outpoints[i].outpoint);
        if (!utxo) {
          throw Error('unknown utxo.');
        }
        // get privkey list
        const addrInfo = await this.addrService.getAddressInfo(utxo.address);
        const pubkeys = [];
        let addrType = addrInfo.type;
        if (addrInfo.pubkey) {
          pubkeys.push(addrInfo.pubkey);
        } else {
          if (addrType === 'p2sh') {
            addrType = 'p2pkh';
          } else if (addrType === 'p2sh-p2wsh') {
            addrType = 'p2sh-p2wpkh';
          } else if (addrType === 'p2sh-p2sh') {
            addrType = 'p2wpkh';
          }
          const relatedPubkeys = addrInfo.pubkeyMap[''];
          for (let j = 0; j < relatedPubkeys.length; ++j) {
            const userAddr = await this.addrService.getAddressInfoByPubkey(
                relatedPubkeys[j]);
            if (!userAddr) {
              // do nothing
            } else {
              // console.log('pubkey addr = ', relatedPubkeys[j], userAddr);
              pubkeys.push(userAddr.pubkey);
            }
          }
        }
        for (let j = 0; j < pubkeys.length; ++j) {
          const pubkey = pubkeys[j];
          const privkey = await this.dumpPrivkey('', pubkey);
          if (!privkey) {
            console.log('unknown address. utxo: ', utxo);
            throw Error('unknown address.');
          }
          // console.log('address = ', utxo.address);
          // console.log('privkey = ', privkey);
          let sighashRet;
          let hashtype = (addrType === 'p2sh-p2wpkh') ?
              'p2wpkh' : addrType;
          hashtype = (addrType === 'p2sh-p2wsh') ? 'p2wsh' : addrType;
          const hexData =
              (addrInfo.pubkey) ? addrInfo.pubkey : addrInfo.script;
          const keyDataType = (addrInfo.pubkey) ? 'pubkey' : 'redeem_script';
          let amountCommitment = '';
          if (this.isElements && (utxo.amountBlinder != emptyBlinder)) {
            const commitment = this.cfd.GetCommitment({
              amount: utxo.amount,
              asset: utxo.asset,
              assetBlindFactor: utxo.assetBlinder,
              blindFactor: utxo.amountBlinder,
            });
            amountCommitment = commitment.amountCommitment;
          }
          const sighashRequest = {
            tx: transaction,
            txin: {
              txid: utxo.txid,
              vout: utxo.vout,
              keyData: {
                hex: hexData,
                type: keyDataType,
              },
              amount: utxo.amount,
              confidentialValueCommitment: amountCommitment,
              hashType: hashtype,
              sighashtype: sighashtype,
            },
          };
          // calc sighash
          if (this.isElements) {
            sighashRet = this.cfd.CreateElementsSignatureHash(sighashRequest);
          } else {
            sighashRet = this.cfd.CreateSignatureHash(sighashRequest);
          }
          // calc signature
          const signatureRet = this.cfd.CalculateEcSignature({
            sighash: sighashRet.sighash,
            privkeyData: {
              privkey: privkey,
              wif: true,
              network: this.network,
              isCompressed: true,
            },
          });
          // console.log('signatures add = ', pubkey, signatureRet.signature);
          signatures.push({
            txid: txid,
            vout: vout,
            pubkey: pubkey,
            signature: signatureRet.signature,
            sighashtype: sighashtype,
          });
          ++signedCount;
        }
      } catch (err) {
        if (!ignoreError) throw err;
        error = true;
        errors.push({txid: txid, vout: vout, error: err.toString()});
      }
    }
    const complete = (decTx.vin.length === signedCount);
    return {signatures: signatures, complete: complete, errors: errors};
  }

  /**
   * set pay tx fee amount.
   * @param {bigint | number} minimumFeeAmount minimum fee amount
   * @return {Promise<void>} empty.
   */
  async setPayTxFee(minimumFeeAmount = 0) {
    // TODO priority is low.
  }

  /**
   * set relay fee amount.
   * @param {bigint | number} relayFeeAmount relay fee amount
   * @return {Promise<void>} empty.
   */
  async setRelayFee(relayFeeAmount = 0) {
    // TODO priority is low.
  }

  /**
   * import address.
   * @param {string} address address
   * @param {string} pubkey pubkey
   * @param {string} path bip32 path
   * @param {string} privkeyWif privkey(wif)
   * @return {Promise<void>} empty
   */
  async importAddress(address = '', pubkey = '', path = '', privkeyWif = '') {
    // TODO priority is low.
  }

  // async importScriptAddress(address = '', pubkey = '', path = '', privkeyWif = '') {
  // async importDeriveAddresses(descriptor = '', pubkey = '', path = '', privkeyWif = '') {

  /**
   * send transaction.
   * @param {string} tx transaction hex
   * @return {Promise<*>} send transaction info
   */
  async sendRawTransaction(tx) {
    try {
      const txid = await this.client.sendrawtransaction(tx);
      await this.utxoService.addUtxo(tx);
      return txid;
    } catch (err) {
      const dectx = this.decodeRawTransaction(tx);
      console.log('sendtx err. tx = ', JSON.stringify(dectx, null, '  '));
      const gettx = await this.client.getrawtransaction(
          dectx.vin[0].txid, true);
      console.log('utxo[0] tx = ', JSON.stringify(gettx, null, '  '));
      throw err;
    }
  };

  /**
   * get minimum relay tx fee.
   * @return {Promise<number>} minimum relay tx fee
   */
  async getMinRelayTxFee() {
    const mempoolinfo = await this.client.getmempoolinfo();
    const minFee = (this.isElements) ? 100 : 1000;
    const minrelaytxfee = (typeof mempoolinfo.minrelaytxfee == 'number') ?
        mempoolinfo.minrelaytxfee * 100000000 : minFee;
    return minrelaytxfee;
  };

  /**
   * find asset check.
   * @param {string} asset asset id.
   * @return {Promise<boolean>} exist asset
   */
  async isFindAsset(asset) {
    const configTbl = this.dbService.getConfigTable();
    const assetMap = await configTbl.getAssetMap();
    if (asset in assetMap) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * find asset check.
   * @param {string} assetLabel asset label.
   * @return {Promise<boolean>} exist asset
   */
  async isFindAssetByLabel(assetLabel) {
    const configTbl = this.dbService.getConfigTable();
    const assetMap = await configTbl.getAssetMap();
    for (const key in assetMap) {
      if (assetMap[key].label === assetLabel) {
        return true;
      }
    }
    return false;
  }

  /**
   * get asset data.
   * @param {string} assetLabel asset label.
   * @return {Promise<*>} asset
   */
  async getAssetByLabel(assetLabel) {
    const configTbl = this.dbService.getConfigTable();
    const assetMap = await configTbl.getAssetMap();
    for (const key in assetMap) {
      if (assetMap[key].label === assetLabel) {
        return {
          id: key,
          label: assetMap[key].label,
          entropy: assetMap[key].entropy,
          isToken: assetMap[key].isToken,
        };
      }
    }
    throw new Error('asset label is empty.');
  }

  /**
   * get asset list.
   * @return {Promise<{}[]>} asset list.
   */
  async getAssetList() {
    const configTbl = this.dbService.getConfigTable();
    const assetMap = await configTbl.getAssetMap();
    const list = [];
    for (const key in assetMap) {
      if (key) {
        const label = assetMap[key].label;
        list.push({[key]: label});
      }
    }
    return list;
  }

  /**
   * append asset id.
   * @param {string} asset asset id.
   * @param {string} assetLabel asset label.
   * @param {string} entropy issuance entropy.
   * @param {boolean} isToken token flag.
   * @return {Promise<boolean>} append or not.
   */
  async appendAsset(asset, assetLabel, entropy = '', isToken = false) {
    const configTbl = this.dbService.getConfigTable();
    const assetMap = await configTbl.getAssetMap();
    if (asset in assetMap) {
      return false;
    }
    assetMap[asset] = {
      label: assetLabel,
      entropy: entropy,
      isToken: isToken,
    };
    await configTbl.updateAssetMap(assetMap);
    return true;
  }

  /**
   * get wallet transaction data.
   * @param {string} txid txid
   * @param {number} vout vout
   * @return {Promise<any>} utxo data.
   */
  async getWalletTxData(txid, vout) {
    return await this.utxoService.getUtxoData(`${txid},${vout}`);
  };

  /**
   * get network type.
   * @return {string} mainchain network type.
   */
  getNetworkType() {
    return this.network;
  }

  /**
   * get mainchain network on Elements.
   * @return {string} mainchain network type.
   */
  getMainchainNetworkType() {
    return this.mainchainNetwork;
  }

  /**
   * get pegged asset on Elements.
   * @return {string} pegged asset
   */
  getPeggedAsset() {
    return this.assetLbtc;
  }

  /**
   * get fedpeg script on Elements.
   * @return {string} fedpeg script
   */
  getFedpegScript() {
    return this.sidechaininfo.fedpegscript;
  }

  /**
   * get parent block hash on Elements.
   * @return {string} parent block hash
   */
  getParentBlockHash() {
    return this.sidechaininfo.parent_blockhash;
  }

  /**
   * get pegin confirmation depth on Elements.
   * @return {number} confirmation
   */
  getPeginConfirmationDepth() {
    return this.sidechaininfo.pegin_confirmation_depth;
  }
};

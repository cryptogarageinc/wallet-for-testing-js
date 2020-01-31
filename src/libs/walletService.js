const DbService = require('./databaseService.js');
const AddressService = require('./addressService.js');
const UtxoService = require('./utxoService.js');
const RpcClient = require('./rpc-client/jsonrpcClient.js');
const cfd = require('cfd-js');

module.exports = class Wallet {
  constructor(userNamePrefix, userIndex, dirPath, network,
      masterXprivkey, nodeConfig, manager) {
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
    const childExtkey = cfd.CreateExtkeyFromParentPath({
      extkey: masterXprivkey,
      network: keyNetwork,
      extkeyType: 'extPrivkey',
      path: extPath,
    });
    this.masterXprivkey = childExtkey.extkey;

    this.dbService = new DbService(this.dbName, dirPath, network);
    this.addrService = new AddressService(this.dbService);
    this.utxoService = new UtxoService(
        this.dbService, this.addrService, this.client, this);
    this.estimateMode = 'CONSERVATIVE';
    this.minimumFeeRate = 2.0;
    this.minimumFee = 1000;
    this.targetConf = 6;
    this.gapLimit = 20;
    this.addressType = 'p2wpkh';
  };

  async initialize() {
    let ret = await this.dbService.initialize();
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
    return true;
  };

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

  async callbackUpdateBlock(tipBlockCount, blockHashList, blockTxMap) {
    const configTbl = this.dbService.getConfigTable();
    const ret = await this.utxoService.changeState(blockHashList, blockTxMap);
    await configTbl.updateTipBlockHeight(tipBlockCount);
    return ret;
  }

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
          const txVinData = ('txid' in block.tx[i].vin[0]) ? block.tx[i].vin : undefined;
          const txVout = block.tx[i].vout;
          blockData.tx.push({txid: txid, vin: txVinData, vout: txVout});
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

  async generate(count, address = '') {
    await this.forceUpdateUtxoData();
    let addr = address;
    if (addr === '') {
      const addrInfo = await this.addrService.getFeeAddress(
          'p2wpkh', '', -1, this.gapLimit);
      addr = addrInfo.address;
    }

    return await this.utxoService.generate(addr, count);
  };

  async generateFund(satoshiAmount) {
    if (isNaN(satoshiAmount)) {
      throw new Error('Wallet satoshiAmount is number only.');
    }
    await this.forceUpdateUtxoData();
    let total = 0;
    while (true) {
      const ret = await this.generate(1);
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
  async sendToAddress(address, satoshiAmount, asset = '',
      estimateMode = 'CONSERVATIVE', feeRateForUnset = 20.0, targetConf = 6) {
    if (isNaN(satoshiAmount)) {
      throw new Error('Wallet satoshiAmount is number only.');
    }
    if (isNaN(feeRateForUnset)) {
      throw new Error('Wallet feeRateForUnset is number only.');
    }
    let feeRate = feeRateForUnset;
    if (this.isElements || (this.network === 'testnet')) {
      feeRate = 1;
    } else if (estimateMode === 'CONSERVATIVE') {
      feeRate = 20.0;
    } else if (estimateMode === 'ECONOMICAL') {
      feeRate = this.minimumFeeRate;
    }

    // FIXME save l-btc asset to configTable?
    let feeAsset = (this.isElements) ? asset : '';
    let tx = this.createRawTransaction(2, 0, [], [{
      'address': address,
      'amount': satoshiAmount,
    }], feeAsset = '');
    tx = await this.fundRawTransactionInternal(
        tx.hex, feeRate, feeAsset, targetConf);
    if (this.isElements) {
      // FIXME blinding (if address is CT)
    }
    tx = await this.signRawTransactionWithWallet(tx.hex, false);
    const txid = await this.sendRawTransaction(tx.hex);
    return {txid: txid, hex: tx.hex};
  }

  createRawTransaction(version = 2, locktime = 0, txin = [],
      txout = [], fee = {asset: '', amount: 0}) {
    let tx;
    if (this.isElements) {
      tx = cfd.ElementsCreateRawTransaction({
        'version': 2,
        'locktime': 0,
        'txins': [],
        'txouts': [
          {
            address: address,
            amount: satoshiAmount,
            asset: asset,
          },
        ],
        'fee': fee,
      });
    } else {
      tx = cfd.CreateRawTransaction({
        version: version,
        locktime: locktime,
        txins: txin,
        txouts: txout,
      });
    }
    return tx;
  }

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

  async getAddresses() {
    return await this.addrService.getAddresses();
  }

  async getAddressesByLabel(label) {
    return await this.addrService.getAddressesByLabel(label);
  }

  async getAddressInfo(address) {
    let ret = await this.addrService.getAddressInfo(address);
    if (!ret) {
      // empty, convert address with cfd.
      ret = cfd.GetAddressInfo({
        address: address,
      });
      ret['solvable'] = false;
    } else {
      ret['solvable'] = (ret.path !== '');
      try {
        if (ret.type === 'p2sh-p2wpkh') {
          const addrInfo = cfd.CreateAddress({
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
          const addrInfo = cfd.CreateAddress({
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
            const multisigRet = cfd.GetAddressesFromMultisig( {
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
        const keyInfo = cfd.GetPubkeyFromExtkey({
          extkey: pubkeys[i],
          network: this.network,
        });
        pubkeyList.push(keyInfo.pubkey);
      }
    }
    const scriptRet = cfd.CreateMultisig({
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

  async getScriptAddress(script, addressType = 'p2wsh', label = '') {
    let addrType = (addressType === '') ? this.addressType : addressType;
    addrType = this.convertAddressType(addressType, true);
    return await this.addrService.getScriptAddress(
        script, addrType, label);
  }

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
    const extkey = cfd.CreateExtkeyFromParentPath({
      extkey: this.masterXprivkey,
      network: this.network,
      extkeyType: 'extPrivkey',
      path: childPath,
    });
    const privkey = cfd.GetPrivkeyFromExtkey({
      extkey: extkey.extkey,
      network: this.network,
      wif: true,
      isCompressed: true,
    });
    return privkey.privkey;
  }

  estimateSmartFee(confTarget = 6, estimateMode = 'CONSERVATIVE') {
    if (this.isElements || (this.network === 'testnet')) {
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

  setGapLimit(limit = 20) {
    this.gapLimit = limit;
  }

  setAddressType(addressType = 'p2wpkh') {
    this.addressType = this.convertAddressType(addressType);
  }

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

  async listUnspent(minimumConf = 1, maximumConf = 9999999999,
      address = '', path = '', asset = '') {
    return await this.utxoService.listUnspent(
        minimumConf, maximumConf, address, asset, path);
  }

  async getMempoolUtxoCount() {
    return await this.utxoService.getMempoolUtxoCount();
  }

  async getUtxoBlockIds() {
    return await this.utxoService.getUtxoBlockIds();
  }

  async setMinimumFeeRate(minimumFeeRate = 2.0) {
    this.minimumFeeRate = minimumFeeRate;
  }

  decodeRawTransaction(tx) {
    if (this.isElements) {
      let mainchainNetwork = 'regtest';
      if (this.network === 'liquidv1') {
        mainchainNetwork = 'mainnet';
      }
      return cfd.ElementsDecodeRawTransaction({
        hex: tx,
        network: this.network,
        mainchainNetwork: mainchainNetwork,
      });
    } else {
      return cfd.DecodeRawTransaction({
        hex: tx,
        network: this.network,
      });
    }
  }

  async fundRawTransaction(tx, feeAsset = '') {
    let feeRate;
    if (this.isElements || (this.network === 'testnet')) {
      feeRate = 1;
    } else if (this.estimateMode === 'CONSERVATIVE') {
      feeRate = 20.0;
    } else if (this.estimateMode === 'ECONOMICAL') {
      feeRate = this.minimumFeeRate;
    }
    return this.fundRawTransactionInternal(
        tx, feeRate, feeAsset, this.targetConf);
  }

  async fundRawTransactionInternal(tx, feeRate, feeAsset = '', targetConf = 6) {
    // Should UTXO for fishing address be given priority?
    const utxos = await this.utxoService.listUnspent(
        targetConf, 9999999999, '', '', '', true);
    // console.log('utxos = ', utxos);
    const decTx = this.decodeRawTransaction(tx);
    let reqJson;
    if (this.isElements) {
      const selectedUtxos = [];
      for (let i = 0; i < decTx.vin.length; ++i) {
        if (decTx.vin[i]) {
          const txid = decTx.vin[i].txid;
          const vout = decTx.vin[i].vout;
          const utxoData = this.utxoService.getUtxoData(`${txid},${vout}`);
          if (utxoData) {
            selectedUtxos.push({
              txid: txid,
              vout: vout,
              amount: utxoData.amount,
              asset: utxoData.asset,
              redeemScript: utxoData.lockingScript,
              descriptor: utxoData.descriptor,
            });
          }
        }
      }
      // collect asset
      const assetList = [];
      for (let i = 0; i < decTx.vout.length; ++i) {
        if (decTx.vout[i] && ('asset' in decTx.vout[i])) {
          assetList.push(decTx.vout[i].asset);
        }
      }
      // create json
      reqJson = {
        utxos: utxos,
        selectUtxos: selectedUtxos,
        tx: tx,
        isElements: this.isElements,
        network: this.network,
        targetAmount: 0,
        reserveAddress: feeAddress,
        targets: [{
          asset: '',
          amount: 0,
          reserveAddress: '',
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
        if (assetList[i]) {
          const index = (assetList.length > this.gapLimit) ? i : -1;
          const feeAddress = await this.addrService.getFeeAddress(
              'p2wpkh', '', index, this.gapLimit);
          const data = {
            asset: assetList[i],
            reserveAddress: feeAddress.address,
          };
          reqJson.targets.push(data);
        }
      }
    } else {
      const feeAddress = await this.addrService.getFeeAddress(
          'p2wpkh', '', -1, this.gapLimit);
      const selectedUtxos = [];
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
              redeemScript: utxoData.lockingScript,
              descriptor: utxoData.descriptor,
            });
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
    const result = cfd.FundRawTransaction(reqJson);
    return {hex: result.hex, fee: result.feeAmount};
  }

  // prevtxs: {txid: '', vout: 0}
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
        if (this.isElements) {
          // TODO priority is low.
        } else {
          const hashtype = (addrInfo.type === 'p2sh-p2wpkh') ?
              'p2wpkh' : addrInfo.type;
          // calc sighash
          const sighashRet = cfd.CreateSignatureHash({
            tx: transaction,
            txin: {
              txid: utxo.txid,
              vout: utxo.vout,
              keyData: {
                hex: addrInfo.pubkey,
                type: 'pubkey',
              },
              amount: utxo.amount,
              hashType: hashtype,
              sighashtype: sighashtype,
            },
          });
          // calc signature
          const signatureRet = cfd.CalculateEcSignature({
            sighash: sighashRet.sighash,
            privkeyData: {
              privkey: privkey,
              wif: true,
              network: this.network,
              isCompressed: true,
            },
          });
          // add sign
          const signRet = cfd.AddSign({
            tx: transaction,
            txin: {
              txid: utxo.txid,
              vout: utxo.vout,
              signParam: [
                {
                  hex: signatureRet.signature,
                  type: 'sign',
                  derEncode: true,
                  sighashtype: sighashtype,
                },
                {
                  hex: addrInfo.pubkey,
                  type: 'pubkey',
                },
              ],
            },
          });
          transaction = signRet.hex;
          if ((addrInfo.type === 'p2sh-p2wpkh') &&
              ('unlockingScript' in addrInfo.extra)) {
            const signP2shRet = cfd.AddSign({
              tx: transaction,
              txin: {
                txid: utxo.txid,
                vout: utxo.vout,
                isWitness: false,
                signParam: [
                  {
                    hex: addrInfo.extra['unlockingScript'],
                    type: 'redeem_script',
                  },
                ],
              },
            });
            transaction = signP2shRet.hex;
          }
        }
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
  async getSignatures(tx, ignoreError = true, prevtxs = [], sighashtype = 'all') {
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

    let errors = [];
    let signatures = [];
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
        let pubkeys = [];
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
              console.log('pubkey addr = ', relatedPubkeys[j], userAddr);
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
          if (this.isElements) {
            // TODO priority is low.
          } else {
            let hashtype = (addrType === 'p2sh-p2wpkh') ?
                'p2wpkh' : addrType;
            addrType = (addrType === 'p2sh-p2wsh') ? 'p2wsh' : addrType;
            // calc sighash
            const hexData = (addrInfo.pubkey) ? addrInfo.pubkey : addrInfo.script;
            const keyDataType = (addrInfo.pubkey) ? 'pubkey' : 'redeem_script';
            const sighashRet = cfd.CreateSignatureHash({
              tx: transaction,
              txin: {
                txid: utxo.txid,
                vout: utxo.vout,
                keyData: {
                  hex: hexData,
                  type: keyDataType,
                },
                amount: utxo.amount,
                hashType: hashtype,
                sighashtype: sighashtype,
              },
            });
            // calc signature
            const signatureRet = cfd.CalculateEcSignature({
              sighash: sighashRet.sighash,
              privkeyData: {
                privkey: privkey,
                wif: true,
                network: this.network,
                isCompressed: true,
              },
            });
            console.log('signatures add = ', pubkey, signatureRet.signature);
            signatures.push({
              txid: txid,
              vout: vout, 
              pubkey: pubkey,
              signature: signatureRet.signature,
              sighashtype: sighashtype,
            });
          }
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

  async generateKey(wif = true) {
    // TODO priority is low.
  }

  async createNewAddress(addressType = 'p2wpkh') {
    // TODO priority is low.
  }

  async setPayTxFee(minimumFeeAmount = 0) {
    // TODO priority is low.
  }

  async setRelayFee(relayFeeAmount = 0) {
    // TODO priority is low.
  }

  async importAddress(address = '', pubkey = '', path = '', privkeyWif = '') {
    // TODO priority is low.
  }

  async sendRawTransaction(tx) {
    return await this.sendRawTransactionInternal(tx);
  };

  async sendRawTransactionInternal(tx, unblindTx = '') {
    try {
      const txid = await this.client.sendrawtransaction(tx);
      await this.utxoService.addUtxo(tx, unblindTx);
      return txid;
    } catch (err) {
      console.log('sendtx err. tx = ', JSON.stringify(
          this.decodeRawTransaction(tx), null, '  '));
      throw err;
    }
  };

  async getWalletTxData(txid, vout) {
    return await this.utxoService.getUtxoData(`${txid},${vout}`);
  };
};

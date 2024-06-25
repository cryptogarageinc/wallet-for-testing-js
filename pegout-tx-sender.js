/* eslint-disable require-jsdoc */
// UTF-8
'use strict';
const fs = require('fs');
// const ini = require('ini')
const readline = require('readline-sync');
const zlib = require('zlib');
const needle = require('needle');
const cfdjs = require('cfd-js-wasm');
const RpcClient = require('node-json-rpc2').Client;

let cfdjsObj;
const emptyByte = '0000000000000000000000000000000000000000000000000000000000000000';

// -----------------------------------------------------------------------------

const executeRpc = async function(client, method, params) {
  const promise = client.callPromise(method, params, 1.0);
  const res = await promise;
  if (res && ('error' in res) && (res['error'])) {
    throw Error('method: ' + res.error);
  } else return res.result;
};

const commandData = {
  gettx: {
    name: 'gettx',
    alias: undefined,
    parameter: '[txid]',
  },
  tgettx: {
    name: 'tgettx',
    alias: undefined,
    parameter: '[txid]',
  },
};

const ElementsCli = function(connection) {
  const config = {
    protocol: 'http',
    method: 'POST',
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
  };
  const client = new RpcClient(config);

  // Blockchain
  this.getblockchaininfo = function() {
    return executeRpc(client, 'getblockchaininfo', []);
  };
  this.getsidechaininfo = function() {
    return executeRpc(client, 'getsidechaininfo', []);
  };
  this.getwalletpakinfo = function() {
    return executeRpc(client, 'getwalletpakinfo', []);
  };
  this.getrawtransaction = async function(
      txid, verbose = false, blockHash = null) {
    return await executeRpc(client, 'getrawtransaction', [txid, verbose, blockHash]);
  };
  // ---- bitcoin command ----
  // Generating
  this.generatetoaddress = function(nblocks, address) {
    return executeRpc(client, 'generatetoaddress', [nblocks, address]);
  };
  // Rawtransactions
  this.sendrawtransaction = function(hexstring, allowhighfees = false) {
    return executeRpc(client, 'sendrawtransaction', [hexstring, allowhighfees]);
  };
  // Wallet
  this.dumpassetlabels = function() {
    return executeRpc(client, 'dumpassetlabels', []);
  };
  this.dumpmasterblindingkey = function() {
    return executeRpc(client, 'dumpmasterblindingkey', []);
  };
  this.estimatesmartfee = function(confTarget = 1, estimateMode = 'CONSERVATIVE') {
    return executeRpc(client, 'estimatesmartfee', [confTarget, estimateMode]);
  };
  // util
  this.directExecute = function(method, params) {
    return executeRpc(client, method, params);
  };
};

const helpDump = function(nameObj) {
  if (!nameObj.parameter) {
    console.log('  ' + nameObj.name);
  } else {
    console.log('  ' + nameObj.name + ' ' + nameObj.parameter);
  }
  if (nameObj.alias) {
    console.log('    - alias: ' + nameObj.alias);
  }
};

const help = function() {
  console.log('usage:');
  for (const key in commandData) {
    if (commandData[key]) {
      helpDump(commandData[key]);
    }
  }
};

const readLineData = function(index, message, ignoreInput = false) {
  let value;
  if (process.argv.length <= index) {
    if (!ignoreInput) {
      value = readline.question(`${message} > `);
    }
  } else {
    value = process.argv[index];
  }
  return value;
};

function doRequest(options, postData = undefined) {
  return new Promise(function(resolve, reject) {
    try {
      const func = function(error, res, body) {
        if (!error && res && res['statusCode'] && (res.statusCode === 200)) {
          const statusCode = res.statusCode;
          resolve({statusCode: statusCode, data: body, headers: res});
        } else if (!error && res && body) {
          resolve({statusCode: 299, data: body, headers: res});
        } else {
          reject(error);
        }
      };
      if (!postData) {
        needle.get(options.url, options, func);
      } else {
        needle.post(options.url, postData, options, func);
      }
    } catch (e) {
      throw e;
    }
  });
}

const callGet = async function(url, dumpName = '') {
  console.log(`url = ${url}`);
  const reqHeaders = {
  };
  const requestOptions = {
    url: url,
    method: 'GET',
    headers: reqHeaders,
    gzip: true,
  };
  // const {statusCode, data, headers}
  const {statusCode, data} = await doRequest(requestOptions);
  console.log(`status = ${statusCode}`);
  if ((statusCode >= 200) && (statusCode < 300)) {
    // console.log(`headers = ${headers}`)
    let result = data;
    try {
      result = zlib.gunzipSync(data);
      if (dumpName) {
        console.log(`${dumpName}(unzip): ${result}`);
      }
      return result;
    } catch (error) {
      // do nothing
    }
    try {
      const jsonData = JSON.parse(data);
      if (dumpName) {
        console.log(`${dumpName}:`, JSON.stringify(jsonData, null, 2));
      }
      return jsonData;
    } catch (error) {
      if (dumpName) {
        console.log(`${dumpName}:`, data);
      }
      return data;
    }
  } else {
    throw new Error(`statusCode: ${statusCode}`);
  }
};

const callPost = async function(url, formData) {
  console.log(`url = ${url}`);
  /*
  const reqHeaders = {
    'content-type': contextType,
  };
  */
  const requestOptions = {
    url: url,
    method: 'POST',
    form: formData,
  };

  const resp = await doRequest(requestOptions, formData.tx);
  try {
    // console.log(`response:`, resp)
    // const {statusCode, data, headers}
    const {statusCode, data} = resp;
    console.log(`status = ${statusCode}`);
    if ((statusCode >= 200) && (statusCode < 300)) {
      // console.log(`headers = ${headers}`)
      const result = data;
      console.log('data =', result);
      return result;
    } else {
      throw new Error(`statusCode: ${statusCode}`);
    }
  } catch (e) {
    console.log('post fail: ', e);
    throw e;
  }
};


const createUtxoDataList = async function(keyList, utxoTxHexes, utxoList,
    configData) {
  let isBlind = false;
  let utxoTotalAmount = 0;
  const addrs = [];
  const utxoDataList = [];
  for (const key of keyList) {
    const pubkeyRet = await cfdjsObj.GetPubkeyFromPrivkey({
      privkey: key.privkey,
      isCompressed: true,
    });
    const addrRet = await cfdjsObj.CreateAddress({
      isElements: true,
      keyData: {
        hex: pubkeyRet.pubkey,
        type: 'pubkey',
      },
      network: configData.network,
      hashType: 'p2wpkh',
    });

    addrs.push({
      ...key,
      pubkey: pubkeyRet.pubkey,
      address: addrRet.address,
      lockingScript: addrRet.lockingScript,
    });
  }

  for (const utxoTxHex of utxoTxHexes) {
    const decUtxoTx = await cfdjsObj.ElementsDecodeRawTransaction({
      hex: utxoTxHex,
    });

    for (const utxo of utxoList) {
      if (utxo.txid !== decUtxoTx.txid) {
        continue;
      }

      const voutData = decUtxoTx.vout[utxo.vout];
      if (voutData.scriptPubKey.type !== 'witness_v0_keyhash') {
        throw Error(`Unsupported script type, ${voutData.scriptPubKey.type}`);
      }
      const voutLockingScript = voutData.scriptPubKey.hex;
      let addrInfo;
      for (const addr of addrs) {
        if (voutLockingScript === addr.lockingScript) {
          addrInfo = addr;
          break;
        }
      }
      if (!addrInfo.privkey) {
        throw Error(`address not found, ${voutLockingScript}`);
      }

      let utxoData;
      if (!addrInfo.blindingKey || addrInfo.blindingKey == emptyByte) {
        utxoData = {
          index: utxo.vout,
          amount: voutData.value,
          asset: voutData.asset,
          blindFactor: emptyByte,
          assetBlindFactor: emptyByte,
        };
      } else {
        try {
          const unblindData = await cfdjsObj.UnblindRawTransaction({
            tx: utxoTxHex,
            txouts: [{
              index: utxo.vout,
              blindingKey: addrInfo.blindingKey,
            }],
          });
          console.log('unblind:', unblindData.outputs);
          utxoData = unblindData.outputs[0];
          isBlind = true;
        } catch (e) {
          console.log(`failed to unblind utxo:${utxo.txid}:${utxo.vout},`, utxoTxHex);
          throw e;
        }
      }
      utxoDataList.push({
        txid: utxo.txid,
        vout: utxo.vout,
        sequence: 4294967295,
        amount: utxoData.amount,
        asset: utxoData.asset,
        descriptor: `wpkh([e3c39d64/0\'/1\'/14\']${addrInfo.pubkey})`,
        blindFactor: utxoData.blindFactor,
        assetBlindFactor: utxoData.assetBlindFactor,
        privkey: addrInfo.privkey,
      });
      utxoTotalAmount += utxoData.amount;
    }
  }
  return {
    utxoDataList,
    utxoTotalAmount,
    isBlind,
  };
};

const createPegoutTx = async function(keyList, utxoTxHexes, utxoList,
    configData, feeRate) {
  const minimumBits = 36;

  const utxoCalcRet = await createUtxoDataList(keyList, utxoTxHexes, utxoList,
      configData);
  const utxoDataList = utxoCalcRet.utxoDataList;
  const utxoTotalAmount = utxoCalcRet.utxoTotalAmount;
  const isBlind = utxoCalcRet.isBlind;

  const keyPair = await cfdjsObj.CreateKeyPair({wif: false});
  const dummyNonce = keyPair.pubkey; // random privkey
  const peggedAsset = configData.peggedAsset;
  const network = configData.network;
  const mainchainNetwork = configData.mainchainNetwork;
  let txFeeAmount = 10; // temp

  const pegoutData = {
    amount: utxoTotalAmount - txFeeAmount,
    asset: peggedAsset,
    network: mainchainNetwork,
    elementsNetwork: network,
    mainchainGenesisBlockHash: configData.genesisBlockHash,
    onlinePubkey: configData.onlinePubKey,
    masterOnlineKey: configData.onlinePrivKey,
    bitcoinDescriptor: configData.offlineDescriptor,
    bip32Counter: configData.offlineIndex,
    whitelist: configData.whitelist,
  };
  const txOuts = [{
    amount: 0,
    directLockingScript: '6a',
    directNonce: dummyNonce,
    asset: peggedAsset,
  }];
  const feeTxData = await cfdjsObj.CreateRawPegout({
    version: 2,
    locktime: 0,
    txins: utxoDataList,
    txouts: txOuts,
    pegout: pegoutData,
    fee: {
      amount: txFeeAmount,
      asset: peggedAsset,
    },
  });

  const estimateFeeResult = await cfdjsObj.EstimateFee({
    selectUtxos: utxoDataList,
    feeRate: feeRate,
    tx: feeTxData.hex,
    isElements: true,
    feeAsset: peggedAsset,
    isBlind: isBlind,
    minimumBits: minimumBits,
  });
  console.log(`EstimateFee:`, estimateFeeResult);

  txFeeAmount = estimateFeeResult.feeAmount;

  pegoutData.amount = utxoTotalAmount - txFeeAmount;
  const updatedTx = await cfdjsObj.CreateRawPegout({
    version: 2,
    locktime: 0,
    txins: utxoDataList,
    txouts: txOuts,
    pegout: pegoutData,
    fee: {
      amount: txFeeAmount,
      asset: peggedAsset,
    },
  });
  let blindTxHex = updatedTx.hex;

  if (isBlind) {
    const baseTx = await cfdjsObj.ElementsDecodeRawTransaction({
      hex: blindTxHex,
      network: (configData.network == 'liquidv1') ? 'mainnet' : 'regtest',
      mainchainNetwork: configData.mainchainNetwork,
    });
    console.log(JSON.stringify(baseTx, null, 2));
    const feeBlindTx = await cfdjsObj.BlindRawTransaction({
      tx: blindTxHex,
      txins: utxoDataList,
      minimumBits: minimumBits,
    });
    blindTxHex = feeBlindTx.hex;
  }

  let signTx = blindTxHex;
  let signTxHex = blindTxHex;
  const hashType = 'p2wpkh'; // only support
  for (const utxoData of utxoDataList) {
    if (utxoData.blindFactor == emptyByte) {
      // privkey sign (calc sighash + get ecSig + add Signature)
      signTx = await cfdjsObj.SignWithPrivkey({
        tx: signTxHex,
        isElements: true,
        txin: {
          txid: utxoData.txid,
          vout: utxoData.vout,
          privkey: utxoData.privkey,
          hashType: hashType,
          sighashType: 'all',
          amount: utxoData.amount,
        },
      });
    } else {
      const commitment = await cfdjsObj.GetCommitment({
        amount: utxoData.amount,
        asset: utxoData.asset,
        assetBlindFactor: utxoData.assetBlindFactor,
        blindFactor: utxoData.blindFactor,
      });

      // privkey sign (calc sighash + get ecSig + add Signature)
      signTx = await cfdjsObj.SignWithPrivkey({
        tx: signTxHex,
        isElements: true,
        txin: {
          txid: utxoData.txid,
          vout: utxoData.vout,
          privkey: utxoData.privkey,
          hashType: hashType,
          sighashType: 'all',
          confidentialValueCommitment: commitment.amountCommitment,
        },
      });
    }
    signTxHex = signTx.hex;
  }

  // console.log(feeSignTx.hex);
  console.log(`UTXO Amount:${utxoTotalAmount}, txFeeAmount:${txFeeAmount}`);
  const decodeTx = await cfdjsObj.ElementsDecodeRawTransaction({
    hex: signTx.hex,
    network: (configData.network == 'liquidv1') ? 'mainnet' : 'regtest',
    mainchainNetwork: configData.mainchainNetwork,
  });
  console.log(`vsize:`, decodeTx.vsize);
  // console.log(`decode:`, decodeTx);
  return signTx.hex;
};

const prefix = 'liquid/api';

const getUtxoTxHex = async function(rpcInfo, utxoTxid) {
  if (rpcInfo) {
    const cli = new ElementsCli(rpcInfo);
    return await cli.getrawtransaction(utxoTxid, false);
  } else {
    const getTxHexUrl = `https://blockstream.info/${prefix}/tx/${utxoTxid}/hex`;
    return await callGet(getTxHexUrl);
  }
};

const getFeeRate = async function(rpcInfo) {
  if (rpcInfo) {
    // Since fee calculation requires the creation of a signed block, it is omitted here.
    return 1;
  } else {
    const feeUrl = `https://blockstream.info/${prefix}/fee-estimates`;
    const feeRateList = await callGet(feeUrl, 'feeRate');
    return feeRateList['1'];
  }
};

const sendTransaction = async function(rpcInfo, txHex) {
  if (rpcInfo) {
    const cli = new ElementsCli(rpcInfo);
    return await cli.sendrawtransaction(txHex);
  } else {
    const postFormData = {tx: txHex};
    const postUrl = `https://blockstream.info/${prefix}/tx`;
    return await callPost(postUrl, postFormData);
  }
};

const createAddress = async function(network) {
  const keyPair = await cfdjsObj.CreateKeyPair({
    wif: false, isCompressed: true,
  });
  const blindKeyPair = await cfdjsObj.CreateKeyPair({
    wif: false, isCompressed: true,
  });
  const addrRet = await cfdjsObj.CreateAddress({
    isElements: true,
    keyData: {
      hex: keyPair.pubkey,
      type: 'pubkey',
    },
    network: network,
    hashType: 'p2wpkh',
  });
  const blindAddrRet = await cfdjsObj.GetConfidentialAddress({
    unblindedAddress: addrRet.address,
    key: blindKeyPair.pubkey,
  });
  return {
    ...keyPair,
    blindingKey: blindKeyPair.privkey,
    blindingPubkey: blindKeyPair.pubkey,
    ...addrRet,
    ...blindAddrRet,
  };
};

const createAddresses = async function(network, count) {
  let keyPairs;
  const addresses = [];
  for (let i = 0; i < count; i++) {
    const addrData = await createAddress(network);
    addresses.push(addrData);
    const keyPair = `${addrData.privkey}:${addrData.blindingKey}`;
    keyPairs = (!keyPairs) ? keyPair : `${keyPairs},${keyPair}`;
  }
  const ret = {
    addresses,
    keyPairs,
  };
  console.log(JSON.stringify(ret, null, 2));
};

const sendPegoutTx = async function(rpcInfo, privkeyPairs, utxos,
    configJsonFile, quickly, ignoreSend) {
  const keyList = [];
  for (const privkeyPair of privkeyPairs.split(',')) {
    const keys = privkeyPair.split(':', 2);
    keyList.push({
      privkey: keys[0],
      blindingKey: (keys.length > 1) ? keys[1] : '',
    });
  }

  const utxoList = [];
  for (const utxoStr of utxos.split(',')) {
    const utxoStrList = utxoStr.split(':', 2);
    if (utxoStrList.length <= 1) {
      throw new Error('invalid utxos format.');
    }
    utxoList.push({
      txid: utxoStrList[0],
      vout: BigInt(utxoStrList[1]),
    });
  }

  const configDataStr = fs.readFileSync(configJsonFile, 'utf-8').toString();
  const configData = JSON.parse(configDataStr);
  if (!configData.peggedAsset || !configData.genesisBlockHash ||
      !configData.whitelist || !configData.offlineXpub ||
      !configData.offlineDescriptor ||
      !Number.isInteger(configData.offlineIndex) || !configData.onlinePrivKey ||
      !configData.onlinePubKey) {
    throw new Error('invalid config file data.');
  }

  const utxoTxHexes = [];
  const utxoMap = new Map();
  for (const utxo of utxoList) {
    if (utxoMap.has(utxo.txid)) {
      continue;
    }
    utxoMap.set(utxo.txid, true);
    const utxoTxHex = await getUtxoTxHex(rpcInfo, utxo.txid);
    utxoTxHexes.push(utxoTxHex);
  }

  let feeRate = 0.1;
  if (quickly) {
    feeRate = await getFeeRate(rpcInfo);
  }

  const txHex = await createPegoutTx(
      keyList, utxoTxHexes, utxoList, configData, feeRate);
  if (ignoreSend) {
    console.log('set ignoreSend=true');
    console.log(txHex);
  } else {
    const txid = await sendTransaction(rpcInfo, txHex);
    console.log('sending txid:', txid);
  }
};

// -----------------------------------------------------------------------------

const main = async () =>{
  try {
    cfdjsObj = cfdjs.getCfd();
    if (process.argv.length <= 2) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
    } else if (process.argv[2] === 'lsendtx') {
      const filePath = readLineData(3, 'txFilePath');
      const hex = fs.readFileSync(filePath, 'utf-8').toString().trim();
      if (hex == '') {
        console.log('fail tx hex.\n');
        return;
      }
      const formData = {tx: hex};
      console.log('formData =', formData);
      const prefix = 'liquid/api';
      const url = `https://blockstream.info/${prefix}/tx`;
      await callPost(url, formData, 'text/plain');
    } else if (process.argv[2] === 'lgetfee') {
      const prefix = 'liquid/api';
      const url = `https://blockstream.info/${prefix}/fee-estimates`;
      await callGet(url, 'fee-estimates');
    } else if (process.argv[2] === 'lgettxhex') {
      const txid = readLineData(3, 'txid');
      if (txid == '') {
        console.log('fail txid.\n');
        return;
      }
      const prefix = 'liquid/api';
      const url = `https://blockstream.info/${prefix}/tx/${txid}/hex`;
      await callGet(url, 'txHex');
    } else if (process.argv[2] === 'createaddresses') {
      let network = readLineData(3, 'network', true);
      if (network == '-h' || network == '--help') {
        console.log('createaddresses [<network(liquidv1(default)/elementsregtest)> [<count(default:1)>]]');
        return;
      }
      if (!network) network = 'liquidv1';
      let count = readLineData(4, 'count', true);
      if (!count) count = 1;
      await createAddresses(network, count);
    } else if (process.argv[2] === 'sendpegouttx') {
      const privkeyPairs = readLineData(3, 'privkeyPairs', true);
      if (!privkeyPairs || privkeyPairs == '-h' || privkeyPairs == '--help') {
        console.log('sendpegouttx <privkeyPairs> <utxos> <configJsonPath> [<ignoreSend> <quickly> <rpcConnectInfo>]');
        console.log('- privkeyPairs: <privkey1:blindingKey1,privkey2:blindingKey2,...>');
        console.log('- utxos: <txid1:vout1,txid2:vout2,...>');
        return;
      }
      const utxos = readLineData(4, 'utxos');
      const configJsonFile = readLineData(5, 'configJsonPath');
      const ignoreSend = readLineData(6, 'ignoreSend');
      const quickly = readLineData(7, 'quickly');
      const rpcInfoStr = readLineData(8, 'rpcConnectInfo', true);
      const rpcInfo = (!rpcInfoStr) ? undefined : JSON.parse(rpcInfoStr);

      await sendPegoutTx(rpcInfo, privkeyPairs, utxos, configJsonFile,
          (quickly === 'true'), (ignoreSend === 'true'));
    } else {
      for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i]) {
          console.log('argv[' + i + '] = ' + process.argv[i]);
        }
      }
      help();
    }
  } catch (error) {
    console.log('cause exception:', error);
    return 1;
  }
  return 0;
};
cfdjs.addInitializedListener(main);


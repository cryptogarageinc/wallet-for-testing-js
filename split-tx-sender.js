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

// -----------------------------------------------------------------------------

const executeRpc = async function(client, method, params) {
  const promise = client.callPromise(method, params, 1.0);
  const res = await promise;
  if (res && ('error' in res) && (res['error'])) {
    throw Error('method: ' + res.error);
  } else return res.result;
};

/*
const createConnection = function(host, port, id, password) {
  const config = {
    host: host,
    user: id,
    password: password,
    port: port,
    id: 'elements-rpc',
  };
  return config;
};
*/

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

const createSplitTx = async function(utxoTxHex, targetVout, ctAddrList,
    addrInfo, feeAmount, feeSplitNum, feeRate, isRegtest) {
  const minimumBits = 36;
  const decUtxoTx = await cfdjsObj.ElementsDecodeRawTransaction({
    hex: utxoTxHex,
  });
  const utxoTxid = decUtxoTx.txid;
  const utxoVout = targetVout;

  // const feeOutputNum = 49;
  const feeOutputNum = feeSplitNum - 1;
  const txFeeAmount = 140 * feeSplitNum; // fee rate: 0.148
  // const feeRate = 0.100;
  const emptyByte = '0000000000000000000000000000000000000000000000000000000000000000';

  let utxoData;
  if (!addrInfo.blindingKey || addrInfo.blindingKey == emptyByte) {
    const voutData = decUtxoTx.vout[utxoVout];
    utxoData = {
      amount: voutData.value,
      asset: voutData.asset,
      blindFactor: emptyByte,
      assetBlindFactor: emptyByte,
    };
  } else {
    const unblindData = await cfdjsObj.UnblindRawTransaction({
      tx: utxoTxHex,
      txouts: [{
        index: utxoVout,
        blindingKey: addrInfo.blindingKey,
      }],
    });
    console.log('unblind:', unblindData.outputs);
    utxoData = unblindData.outputs[0];
  }

  const feeUtxo = {
    txid: utxoTxid,
    vout: utxoVout,
    amount: utxoData.amount,
    asset: utxoData.asset,
    blindFactor: utxoData.blindFactor,
    assetBlindFactor: utxoData.assetBlindFactor,
    privkey: addrInfo.privkey,
  };
  const addr = decUtxoTx.vout[utxoVout].scriptPubKey.addresses[0];
  const inputAddrInfo = await cfdjsObj.GetAddressInfo({
    address: addr,
    isElements: true,
  });
  const hashType = (inputAddrInfo.hashType === 'p2sh') ?
    'p2sh-p2wpkh' : inputAddrInfo.hashType;

  // const feeAmount = parseInt((feeUtxo.amount - txFeeAmount) / (feeOutputNum + 1));
  const checkAmount = 10000;
  const isBlind = true;
  if (feeUtxo.amount < checkAmount) {
    throw new Error(`utxo is low. utxoAmount=${feeUtxo.amount}`);
  }
  if (feeAmount < 1000) {
    throw new Error(`feeAmount is low. feeAmount=${feeAmount}`);
  }
  if ((feeAmount > (feeUtxo.amount - checkAmount)) ||
      ((feeAmount * 2) > feeUtxo.amount)) {
    throw new Error(`feeAmount is higher. utxoAmount=${feeUtxo.amount}`);
  }
  const changeAmount = feeUtxo.amount - txFeeAmount -
      (feeAmount * feeOutputNum);
  if (changeAmount < 0) {
    throw new Error(`feeAmount is higher. splitNum=${feeOutputNum}`);
  }

  const txoutList = [];
  for (let i = 0; i <= feeOutputNum; ++i) {
    const ctAddr = ctAddrList[i].trim();
    const amount = (i === feeOutputNum) ? changeAmount : feeAmount;
    if (amount > 0) {
      txoutList.push({
        address: ctAddr,
        asset: feeUtxo.asset,
        amount: amount,
      });
    }
  }

  const feeTxData = await cfdjsObj.ElementsCreateRawTransaction({
    version: 2,
    locktime: 0,
    txins: [{
      txid: feeUtxo.txid,
      vout: feeUtxo.vout,
      sequence: 4294967295,
    }],
    txouts: txoutList,
    fee: {
      amount: txFeeAmount,
      asset: feeUtxo.asset,
    },
  });

  const pubkeyInfo = await cfdjsObj.GetPubkeyFromPrivkey({
    privkey: addrInfo.privkey,
  });
  const estimateFeeResult = await cfdjsObj.EstimateFee({
    selectUtxos: [{
      txid: feeUtxo.txid,
      vout: feeUtxo.vout,
      amount: feeUtxo.amount,
      asset: feeUtxo.asset,
      descriptor: `wpkh([e3c39d64/0\'/1\'/14\']${pubkeyInfo.pubkey})`,
    }],
    feeRate: feeRate,
    tx: feeTxData.hex,
    isElements: true,
    feeAsset: feeUtxo.asset,
    isBlind: isBlind,
    minimumBits: minimumBits,
  });
  console.log(`EstimateFee:`, estimateFeeResult);

  const changeAmount2 = BigInt(feeUtxo.amount) -
      BigInt(estimateFeeResult.feeAmount) -
      (BigInt(feeAmount) * BigInt(feeOutputNum));
  if (changeAmount2 < 200) {
    throw new Error(`changeAmount is low. changeAmount=${changeAmount}`);
  }

  const updatedTx = await cfdjsObj.UpdateTxOutAmount({
    tx: feeTxData.hex,
    isElements: true,
    txouts: [{
      index: feeOutputNum,
      amount: changeAmount2,
    }, {
      index: feeOutputNum + 1,
      amount: estimateFeeResult.feeAmount,
    }],
  });
  let blindTxHex = updatedTx.hex;

  if (isBlind) {
    const baseTx = await cfdjsObj.ElementsDecodeRawTransaction({
      hex: blindTxHex,
      network: (isRegtest) ? 'regtest' : 'liquidv1',
    });
    console.log(JSON.stringify(baseTx, null, 2));
    const feeBlindTx = await cfdjsObj.BlindRawTransaction({
      tx: blindTxHex,
      txins: [{
        txid: feeUtxo.txid,
        vout: feeUtxo.vout,
        asset: feeUtxo.asset,
        amount: feeUtxo.amount,
        blindFactor: feeUtxo.blindFactor,
        assetBlindFactor: feeUtxo.assetBlindFactor,
      }],
      txoutConfidentialAddresses: ctAddrList,
      minimumBits: minimumBits,
    });
    blindTxHex = feeBlindTx.hex;
  }

  let feeSignTx;
  if (feeUtxo.blindFactor == emptyByte) {
    // privkey sign (calc sighash + get ecSig + add Signature)
    feeSignTx = await cfdjsObj.SignWithPrivkey({
      tx: blindTxHex,
      isElements: true,
      txin: {
        txid: feeUtxo.txid,
        vout: feeUtxo.vout,
        privkey: feeUtxo.privkey,
        hashType: hashType,
        sighashType: 'all',
        amount: feeUtxo.amount,
      },
    });
  } else {
    const commitment = await cfdjsObj.GetCommitment({
      amount: feeUtxo.amount,
      asset: feeUtxo.asset,
      assetBlindFactor: feeUtxo.assetBlindFactor,
      blindFactor: feeUtxo.blindFactor,
    });

    // privkey sign (calc sighash + get ecSig + add Signature)
    feeSignTx = await cfdjsObj.SignWithPrivkey({
      tx: blindTxHex,
      isElements: true,
      txin: {
        txid: feeUtxo.txid,
        vout: feeUtxo.vout,
        privkey: feeUtxo.privkey,
        hashType: hashType,
        sighashType: 'all',
        confidentialValueCommitment: commitment.amountCommitment,
      },
    });
  }

  // console.log(feeSignTx.hex);
  console.log(`Amount:${feeAmount}, changeAmount:${changeAmount}`);
  const decodeTx = await cfdjsObj.ElementsDecodeRawTransaction({
    hex: feeSignTx.hex,
  });
  console.log(`vsize:`, decodeTx.vsize);
  // console.log(`decode:`, decodeTx);
  return feeSignTx.hex;
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

const sendSplitTx = async function(rpcInfo, utxoTxid, utxoVout,
    sendAddrListFile, privkey, blindingKey, splitAmount,
    splitNum, quickly, ignoreSend) {
  const addrInfo = {
    privkey: privkey,
    blindingKey: blindingKey,
  };

  const sendAddrList = [];
  const addrList = fs.readFileSync(sendAddrListFile, 'utf-8').toString().split('\n');
  for (const addr of addrList) {
    const address = addr.trim();
    if (address) {
      sendAddrList.push(address);
    }
  }
  if (sendAddrList.length <= 0) {
    throw new Error('empty address list.');
  }
  if (splitNum >= sendAddrList.length) {
    throw new Error('few send address num. Please reduce the split number.');
  }

  const utxoTxHex = await getUtxoTxHex(rpcInfo, utxoTxid);

  let feeRate = 0.1;
  if (quickly) {
    feeRate = await getFeeRate(rpcInfo);
  }

  const txHex = await createSplitTx(utxoTxHex, utxoVout, sendAddrList,
      addrInfo, splitAmount, splitNum, feeRate, !rpcInfo);
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
    } else if (process.argv[2] === 'sendsplittx') {
      const privkey = readLineData(3, 'privkey');
      const blindingKey = readLineData(4, 'blindingKey');
      const sendAddrListFile = readLineData(5, 'sendAddressFilePath');
      const txid = readLineData(6, 'utxoTxid');
      const vout = readLineData(7, 'utxoVout');
      const splitAmount = readLineData(8, 'splitAmount');
      const splitNum = readLineData(9, 'splitNum');
      const quickly = readLineData(10, 'quickly');
      const ignoreSend = readLineData(11, 'ignoreSend');
      const rpcInfoStr = readLineData(12, 'rpcConnectInfo', true);
      const rpcInfo = (!rpcInfoStr) ? undefined : JSON.parse(rpcInfoStr);

      await sendSplitTx(rpcInfo, txid, vout, sendAddrListFile,
          privkey, blindingKey, parseInt(splitAmount), parseInt(splitNum),
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


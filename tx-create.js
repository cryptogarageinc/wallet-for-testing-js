/* eslint-disable require-jsdoc */
// UTF-8
'use strict';
const fs = require('fs');
const readline = require('readline-sync');
const cfdjs = require('cfd-js-wasm');

// -----------------------------------------------------------------------------

const minimumBits = 36;
const defaultBitcoinFeeRate = 2.0;
const defaultLiquidFeeRate = 0.1;
const emptyByte = '0000000000000000000000000000000000000000000000000000000000000000';

// -----------------------------------------------------------------------------

let cfdjsObj;

const help = function() {
  console.log('usage: node tx-create.js <utxoFilepath> <signXpriv> <xprivPath> <sendAddress> [<feeRate>]');
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

const getNetworkTypeByAddress = async function(address) {
  try {
    const ret = await cfdjsObj.GetAddressInfo({
      address: address,
      isElements: false,
    });
    return ret.network;
  } catch (err) {
  }
  let network;
  try {
    const ctRet = await cfdjsObj.GetUnblindedAddress({
      confidentialAddress: address,
    });
    const ret = await cfdjsObj.GetAddressInfo({
      address: ctRet.unblindedAddress,
      isElements: true,
    });
    network = ret.network;
  } catch (err) {
    const ret = await cfdjsObj.GetAddressInfo({
      address: address,
      isElements: true,
    });
    network = ret.network;
  }
  if (network === 'regtest') network = 'liquidregtest';
  return network;
};

const getNetworkTypeByXpriv = async function(xpriv) {
  const ret = await cfdjsObj.GetExtkeyInfo({
    extkey: xpriv,
  });
  return ret.network;
};


const getUtxoList = async function(utxoStrList, basePath, network) {
  const isElements = network.includes('liquid');
  const outputList = [];
  for (let utxoStr of utxoStrList) {
    utxoStr = utxoStr.trim();
    if (utxoStr === '') continue;
    if (!utxoStr.includes('{')) continue;
    const pattern = /^\d+\)\s+"(.+)"$/gi; // need re-generate
    const regRet = pattern.exec(utxoStr);
    if (!regRet) {
      if (utxoStr.includes('\\')) {
        console.log('utxo pattern failed:', utxoStr);
        continue;
      }
      const pattern2 = /^{.+}$/gi; // need re-generate
      const regRet2 = pattern2.exec(utxoStr);
      if (!regRet2) {
        console.log('utxo pattern failed:', utxoStr);
        continue;
      }
      utxoStr = regRet2[0];
    } else {
      utxoStr = regRet[1];
    }

    if (utxoStr.includes('\\')) {
      utxoStr = utxoStr.replaceAll('\\', '');
    }
    const utxoObj = JSON.parse(utxoStr);
    if (!utxoObj['TxID'] || (!utxoObj['Vout'] && utxoObj.Vout !== 0)) {
      throw Error('empty outpoint.');
    }
    if (!utxoObj['Path']) {
      throw Error('empty bip32 path.');
    }
    if (!utxoObj['Descriptor']) {
      throw Error('empty descriptor.');
    }
    if (!utxoObj['Amount']) {
      throw Error('empty amount.');
    }
    if (isElements) {
      if (!utxoObj['AssetID']) {
        throw Error('empty assetID.');
      }
      if (utxoObj['AmountCommitment']) {
        if (!utxoObj['AssetBlinderFactor']) {
          throw Error('empty AssetBlinderFactor.');
        }
        if (!utxoObj['AmountBlinderFactor']) {
          throw Error('empty AmountBlinderFactor.');
        }
      }
    }

    const descRet = await cfdjsObj.ParseDescriptor({
      isElements,
      descriptor: utxoObj['Descriptor'],
      network,
    });
    if (!descRet['address']) throw Error('unsupported descriptor.');
    const address = descRet['address'];
    const hashType = descRet['hashType'];
    let bip32path = basePath + utxoObj.Path;
    if (!basePath.endsWith('/') && !utxoObj.Path.startsWith('/')) {
      bip32path = basePath + '/' + utxoObj.Path;
    }
    bip32path = bip32path.replaceAll('//', '/');

    let item = {
      txid: utxoObj['TxID'],
      vout: utxoObj['Vout'],
      address,
      hashType,
      descriptor: utxoObj['Descriptor'],
      bip32path,
      amount: utxoObj['Amount'],
      sequence: 4294967295,
    };
    if (isElements) {
      item = {
        ...item,
        asset: utxoObj['AssetID'],
      };
      if (utxoObj['AmountCommitment']) {
        item = {
          ...item,
          blindFactor: utxoObj['AmountBlinderFactor'],
          assetBlindFactor: utxoObj['AssetBlinderFactor'],
          confidentialValueCommitment: utxoObj['AmountCommitment'],
        };
      } else {
        item = {
          ...item,
          blindFactor: emptyByte,
          assetBlindFactor: emptyByte,
        };
      }
    }
    outputList.push(item);
  }
  if (!outputList) throw Error('empty utxo list.');
  if (outputList.length > 250) {
    throw Error('blinding count over. please retry with less utxo list.');
  }
  return outputList;
};

const getAsset = function(utxoList) {
  const assets = new Map();
  let lastAsset = '';
  for (const utxo of utxoList) {
    if (!utxo['asset']) throw Error('invalid state. empty asset.');
    const asset = utxo['asset'];
    if (assets.has(asset)) continue;
    assets.set(asset, true);
    lastAsset = asset;
  }
  if (assets.size > 1) throw Error('multiple asset.');
  return lastAsset;
};


const createTx = async function(
    utxoStrList, xpriv, xprivPath, sendAddress, feeRate) {
  const network = await getNetworkTypeByAddress(sendAddress);
  const networkByKey = await getNetworkTypeByXpriv(xpriv);
  if (networkByKey === 'mainnet' && (network === 'mainnet' || network === 'liquidv1')) {
    // OK
  } else if (networkByKey === 'testnet' && (network !== 'mainnet' && network !== 'liquidv1')) {
    // OK
  } else {
    throw Error('invalid address and xpriv (unmatch network type).');
  }

  const isElements = network.includes('liquid');
  if (!feeRate) {
    if (isElements) {
      feeRate = defaultLiquidFeeRate;
    } else {
      feeRate = defaultBitcoinFeeRate;
    }
  }

  const utxoList = await getUtxoList(utxoStrList, xprivPath, network);
  // console.log('utxoList:', utxoList);
  console.log('utxoList.length:', utxoList.length);
  let asset = '';
  let txHex = '';
  if (!isElements) {
    const txData = await cfdjsObj.CreateRawTransaction({
      version: 2,
      locktime: 0,
      txins: utxoList,
    });
    txHex = txData.hex;
  } else {
    asset = getAsset(utxoList);
    const txData = await cfdjsObj.ElementsCreateRawTransaction({
      version: 2,
      locktime: 0,
      txins: utxoList,
      fee: {
        amount: 0,
        asset: asset,
      },
    });
    txHex = txData.hex;
  }
  let tx = txHex;

  const fundReq = {
    utxos: utxoList,
    selectUtxos: utxoList,
    tx,
    isElements,
    network,
    // targetAmount?: bigint | number;
    reserveAddress: sendAddress,
    targets: [{
      asset,
      amount: 0,
      reserveAddress: sendAddress,
    }],
    feeInfo: {
      feeRate,
      longTermFeeRate: feeRate,
      knapsackMinChange: 0,
      dustFeeRate: feeRate,
      feeAsset: asset,
      isBlindEstimateFee: true,
      minimumBits,
    },
  };
  try {
    const fundTx = await cfdjsObj.FundRawTransaction(fundReq);
    tx = fundTx.hex;
  } catch (err) {
    console.log(fundReq);
    throw err;
  }

  if (isElements) {
    const blindTx = await cfdjsObj.BlindRawTransaction({
      tx,
      txins: utxoList,
      minimumBits,
    });
    tx = blindTx.hex;
  }

  let createKeyReq;
  try {
    for (const utxo of utxoList) {
      createKeyReq = {
        extkey: xpriv,
        network: networkByKey,
        extkeyType: 'extPrivkey',
        path: utxo.bip32path,
      };
      const extkey = await cfdjsObj.CreateExtkeyFromParentPath(createKeyReq);
      const key = await cfdjsObj.GetPrivkeyFromExtkey({
        extkey: extkey.extkey,
        network: networkByKey,
        wif: true,
        isCompressed: true,
      });
      const signTx = await cfdjsObj.SignWithPrivkey({
        isElements,
        tx,
        txin: {
          txid: utxo.txid,
          vout: utxo.vout,
          privkey: key.privkey,
          hashType: utxo.hashType,
          sighashType: 'all',
          amount: utxo.amount,
          confidentialValueCommitment: utxo.confidentialValueCommitment,
          isGrindR: true,
        },
      });
      tx = signTx.hex;
    }
  } catch (err) {
    throw err;
  }

  // VerifySign
  let isSignError = false;
  for (const utxo of utxoList) {
    const verifyTx = await cfdjsObj.VerifySign({
      tx,
      isElements,
      txins: [{
        txid: utxo.txid,
        vout: utxo.vout,
        address: utxo.address,
        amount: utxo.amount,
        confidentialValueCommitment: utxo.confidentialValueCommitment,
      }],
    });
    if (!verifyTx.success) {
      console.log(`verify error:`, verifyTx.failTxins);
      isSignError = true;
    }
  }
  if (isSignError) throw Error('sign error.');

  const decodeTx = await cfdjsObj.ElementsDecodeRawTransaction({hex: tx});
  // console.log(`vsize:`, decodeTx.vsize);
  console.log(`decode:`, decodeTx);
  console.log(`hex:`, tx);
  return;
};

// -----------------------------------------------------------------------------

const main = async () =>{
  try {
    cfdjsObj = cfdjs.getCfd();
    if (process.argv.length <= 4) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return;
    }
    const filePath = readLineData(2, 'utxoFilePath');
    const xpriv = readLineData(3, 'signXpriv');
    const xprivPath = readLineData(4, 'xprivPath');
    const sendAddress = readLineData(5, 'sendAddress');
    let feeRate = 0;
    if (process.argv.length >= 6) {
      feeRate = parseFloat(process.argv[6]);
    }
    const utxoStrList = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    if (utxoStrList.length == 0) {
      console.log('fail utxo list.\n');
      return;
    }

    await createTx(utxoStrList, xpriv, xprivPath, sendAddress, feeRate);
  } catch (error) {
    console.log('cause exception:', error);
    return 1;
  }
  return 0;
};
cfdjs.addInitializedListener(main);


'use strict';
const path = require('path');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);
const btcCli = helper.getBitcoinCli();
const elementsCli = helper.getElementsCli();
const cfdjs = helper.getCfdJsModule();

const COIN_BASE = 100000000;
const listunspentMax = 9999999;

// -----------------------------------------------------------------------------
const toSatoshiAmount = function(btcAmount) {
  return Math.round(btcAmount * COIN_BASE);
};
const toBtcAmount = function(satoshiAmount) {
  return satoshiAmount / COIN_BASE;
};
// -----------------------------------------------------------------------------

const commandData = {
  fundrawtx: {
    name: 'fundrawtx',
    alias: undefined,
    parameter: '<btc amount> <fee rate>',
  },
  cfd_coinselect: {
    name: 'cfd_coinselect',
    alias: undefined,
    parameter: '<btc amount> <fee rate> [<min change>]',
  },
  cfd_fundrawtx: {
    name: 'cfd_fundrawtx',
    alias: undefined,
    parameter: '<tx asset:amount,asset2:amount2,...> <target asset:amount,asset2:amount2,...> <fee rate> [<min change>]',
  },
  btc_fundrawtx: {
    name: 'btc_fundrawtx',
    alias: undefined,
    parameter: '<btc amount> <fee rate> [<min change>]',
  },
  btccfd_fundrawtx: {
    name: 'btccfd_fundrawtx',
    alias: undefined,
    parameter: '<tx btc amount> <search btc amount> <fee rate> [<min change>]',
  },
};

const helpDump = function(nameobj) {
  if (!nameobj.parameter) {
    console.log('  ' + nameobj.name);
  } else {
    console.log('  ' + nameobj.name + ' ' + nameobj.parameter);
  }
  if (nameobj.alias) {
    console.log('    - alias: ' + nameobj.alias);
  }
};

const help = function() {
  console.log('usage:');
  Object.keys(commandData).forEach((key) => {
    helpDump(commandData[key]);
  });
};

const checkString = function(arg, matchText, alias = undefined) {
  if (arg === matchText) {
    return true;
  } else if ((alias) && (arg === alias)) {
    return true;
  }
  return false;
};

// -----------------------------------------------------------------------------

const main = async () => {
  try {
    if (process.argv.length <= 2) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }

    const command = process.argv[2];
    if (checkString(command, 'fundrawtx')) {
      const amount = Number(process.argv[3]);
      const feeRate = Number(process.argv[4]);
      const isBlind = true;

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)

      // === create transaction ===
      // generate addresses
      const addresses = {};
      const addressInfo = {};
      // addresses.token = await getNewAddress(network)
      addresses.btc = await elementsCli.getnewaddress();
      addressInfo.btc = await elementsCli.getaddressinfo(addresses.btc);
      if (!isBlind) {
        addresses.btc = addressInfo.btc.unconfidential;
      }
      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(amount),
            'asset': assetlabels.bitcoin,
          },
        ],
        'fee': {
          'amount': 1,
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.ElementsCreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      const fundRawOpt = {'feeRate': feeRate};
      const fundRawRet = await elementsCli.fundrawtransaction(
          rawTx.hex, fundRawOpt);
      console.log('fundrawtransaction =>\n', fundRawRet);
      const fundHex = fundRawRet.hex;

      // === post process ===
      const decodeTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': fundHex,
        'network': 'regtest',
      });
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('\n\n=== fund tx decoded data === \n',
          JSON.stringify(decodeTx, null, 2));

      console.log(
          '--------------------------------------------------------------------------------');
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      let total = 0;
      for (let j = 0; j < decodeTx.vin.length; j++) {
        const targetTxid = decodeTx.vin[j].txid;
        const targetVout = decodeTx.vin[j].vout;
        const utxo = listunspentResult.find((unspent) => {
          return (unspent.txid === targetTxid) && (unspent.vout === targetVout);
        });
        console.log('## UTXO[' + j + '] -> ', utxo);
        total += utxo.amount;
      }
      // get fee
      let feeAmount = 0;
      for (let j = 0; j < decodeTx.vout.length; j++) {
        if (decodeTx.vout[j]['scriptPubKey']) {
          if (decodeTx.vout[j]['scriptPubKey']['type'] === 'fee') {
            feeAmount = decodeTx.vout[j]['value'];
            break;
          }
        }
      }
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('## select amount   = ' + amount);
      console.log('## use utxo amount = ' + total.toFixed(8));
      console.log('## use utxo count  = ' + decodeTx.vin.length);
      console.log('## difference      = ' + (total - amount - toBtcAmount(feeAmount)).toFixed(8));
      console.log('## fee             = ' + toBtcAmount(feeAmount));
      console.log(
          '--------------------------------------------------------------------------------');
    } else if (checkString(command, 'cfd_coinselect')) {
      const amount = Number(process.argv[3]);
      const feeRate = Number(process.argv[4]);
      let minChange = -1;
      if (process.argv.length >= 6) {
        minChange = Number(process.argv[5]);
      }
      const isBlind = true;

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)

      // === collect utxo ===
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      const utxos = [];
      for (let j = 0; j < listunspentResult.length; j++) {
        if (!listunspentResult[j].spendable) {
          // do nothing
        } else if (listunspentResult[j].asset === assetlabels.bitcoin) {
          const utxoData = {
            txid: listunspentResult[j].txid,
            vout: listunspentResult[j].vout,
            asset: listunspentResult[j].asset,
            amount: toSatoshiAmount(listunspentResult[j].amount),
            descriptor: listunspentResult[j].desc,
          };
          utxos.push(utxoData);
        }
      }

      // === create transaction ===
      // generate addresses
      const addresses = {};
      const addressInfo = {};
      // addresses.token = await getNewAddress(network)
      addresses.btc = await elementsCli.getnewaddress();
      addressInfo.btc = await elementsCli.getaddressinfo(addresses.btc);
      if (!isBlind) {
        addresses.btc = addressInfo.btc.unconfidential;
      }

      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(amount),
            'asset': assetlabels.bitcoin,
          },
        ],
        'fee': {
          'amount': 1,
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.ElementsCreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      // === fee estimation ===
      const FeeEstimateJson = {
        selectUtxos: [],
        feeRate: feeRate,
        tx: rawTx.hex,
        isElements: true,
        isBlind: true,
        feeAsset: assetlabels.bitcoin,
      };
      const estimateFeeResult = cfdjs.EstimateFee(FeeEstimateJson);
      console.log('EstimateFee =>\n', estimateFeeResult);

      // === select coin ===
      const SelectUtxoJson = {
        utxos: utxos,
        targetAmount: toSatoshiAmount(amount),
        isElements: true,
        feeInfo: {
          txFeeAmount: estimateFeeResult.feeAmount,
          feeAsset: assetlabels.bitcoin,
          feeRate: feeRate,
          longTermFeeRate: feeRate,
          knapsackMinChange: minChange,
        },
      };
      console.log('SelectUtxo start. utxos = ' + utxos.length);
      const coinSelectionResult = cfdjs.SelectUtxos(SelectUtxoJson);
      console.log('SelectUtxo =>\n', coinSelectionResult);

      // === post process ===
      let total = 0;
      const getUtxos = coinSelectionResult.utxos;
      for (let j = 0; j < getUtxos.length; j++) {
        total += getUtxos[j].amount;
      }
      // get fee
      const feeAmount = estimateFeeResult.feeAmount +
          coinSelectionResult.utxoFeeAmount;
      const algorithm = (coinSelectionResult['feeAmount']) ? 'BnB' : 'knapsack';
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('## select amount   = ' + amount);
      console.log('## use utxo amount = ' + toBtcAmount(total).toFixed(8));
      console.log('## use utxo count  = ' + getUtxos.length);
      console.log('## fee             = ' + toBtcAmount(feeAmount).toFixed(8));
      console.log('## difference      = ' +
          toBtcAmount(total - toSatoshiAmount(amount) - feeAmount).toFixed(8));
      console.log('## algorithm       = ' + algorithm);
      if (algorithm === 'knapsack') {
        console.log('## minChange       = ' + minChange);
      }
      console.log(
          '--------------------------------------------------------------------------------');
    } else if (checkString(command, 'cfd_fundrawtx')) {
      const assets = process.argv[3];
      const targetAssets = process.argv[4];
      const feeRate = Number(process.argv[5]);
      let minChange = -1;
      if (process.argv.length >= 7) {
        minChange = Number(process.argv[6]);
      }
      const isBlind = true;

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)

      // parse assets
      const assetArray = assets.split(',');
      const assetData = {};
      const searchAssetData = {};
      for (let i = 0; i < assetArray.length; i++) {
        const assetInfo = assetArray[i].split(':');
        const assetName = (assetInfo[0] === 'bitcoin') ?
            assetlabels.bitcoin : assetInfo[0];
        if (assetInfo.length >= 1) {
          searchAssetData[assetName] = 1;
        }
        if (assetInfo.length > 1) {
          assetData[assetName] = assetInfo[1];
        }
      }
      const assetArray2 = targetAssets.split(',');
      const targetAssetData = {};
      for (let i = 0; i < assetArray2.length; i++) {
        if (assetArray2[i] === '') continue;
        const assetInfo = assetArray2[i].split(':');
        const assetName = (assetInfo[0] === 'bitcoin') ?
            assetlabels.bitcoin : assetInfo[0];
        console.log('assetInfo = ' + assetInfo.length);
        if (assetInfo.length >= 1) {
          searchAssetData[assetName] = 1;
        }
        if (assetInfo.length == 1) {
          targetAssetData[assetName] = -1;
        } else if (assetInfo.length > 1) {
          targetAssetData[assetName] = assetInfo[1];
        }
      }

      // === collect utxo ===
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      const utxos = [];
      for (let j = 0; j < listunspentResult.length; j++) {
        if (!listunspentResult[j].spendable) {
          // do nothing
        } else if (searchAssetData[listunspentResult[j].asset]) {
          if (!targetAssetData[listunspentResult[j].asset]) {
            targetAssetData[listunspentResult[j].asset] = undefined;
          }
          const utxoData = {
            txid: listunspentResult[j].txid,
            vout: listunspentResult[j].vout,
            asset: listunspentResult[j].asset,
            amount: toSatoshiAmount(listunspentResult[j].amount),
            descriptor: listunspentResult[j].desc,
          };
          utxos.push(utxoData);
        }
      }

      // === create transaction ===
      // generate addresses
      const addresses = {};
      const addressInfo = {};
      // addresses.token = await getNewAddress(network)
      addresses.btc = await elementsCli.getnewaddress();
      addressInfo.btc = await elementsCli.getaddressinfo(addresses.btc);
      if (!isBlind) {
        addresses.btc = addressInfo.btc.unconfidential;
      }
      const txouts = [];
      for (const [asset, amount] of Object.entries(assetData)) {
        const newAddress = await elementsCli.getnewaddress();
        txouts.push({
          'address': newAddress,
          'amount': toSatoshiAmount(amount),
          'asset': asset,
        });
      }
      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txouts': txouts,
      };
      const rawTx = cfdjs.ElementsCreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      // === FundRawTransaction ===
      const targets = [];
      for (let [asset, amount] of Object.entries(targetAssetData)) {
        if (amount === undefined) continue;
        if (amount === -1) amount = 0;
        const newAddress = await elementsCli.getnewaddress();
        targets.push({
          'reserveAddress': newAddress,
          'amount': toSatoshiAmount(amount),
          'asset': asset,
        });
      }
      if (targets.length === 0) {
        const newAddress = await elementsCli.getnewaddress();
        targets.push({
          'reserveAddress': newAddress,
          'amount': 0,
          'asset': assetlabels.bitcoin,
        });
      }
      const FundTxJson = {
        utxos: utxos,
        selectUtxos: [],
        tx: rawTx.hex,
        isElements: true,
        network: 'regtest',
        targets: targets,
        feeInfo: {
          feeRate: feeRate,
          longTermFeeRate: feeRate,
          knapsackMinChange: minChange,
          feeAsset: assetlabels.bitcoin,
          isBlindEstimateFee: true,
        },
      };
      console.log('SelectUtxo start. utxos = ' + utxos.length);
      console.log('Req = ' + JSON.stringify(FundTxJson, null, 2));
      const fundRawRet = cfdjs.FundRawTransaction(FundTxJson);
      console.log('SelectUtxo =>\n', fundRawRet);
      const fundHex = fundRawRet.hex;

      // === post process ===
      const decodeTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': fundHex,
        'network': 'regtest',
      });
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('\n\n=== fund tx decoded data === \n',
          JSON.stringify(decodeTx, null, 2));

      console.log(
          '--------------------------------------------------------------------------------');
      let btcTotal = 0;
      let btcAmount = 0;
      const utxoAmounts = {};
      const utxoCounts = {};
      for (let j = 0; j < decodeTx.vin.length; j++) {
        const targetTxid = decodeTx.vin[j].txid;
        const targetVout = decodeTx.vin[j].vout;
        const utxo = listunspentResult.find((unspent) => {
          return (unspent.txid === targetTxid) && (unspent.vout === targetVout);
        });
        console.log('## UTXO[' + j + '] -> ', utxo);
        if (utxoAmounts[utxo.asset]) {
          utxoAmounts[utxo.asset] += utxo.amount;
          utxoCounts[utxo.asset] += 1;
        } else {
          utxoAmounts[utxo.asset] = utxo.amount;
          utxoCounts[utxo.asset] = 1;
        }
        if (utxo.asset === assetlabels.bitcoin) {
          btcTotal += utxo.amount;
        }
      }
      // get fee
      let feeAmount = 0;
      for (let j = 0; j < decodeTx.vout.length; j++) {
        if (decodeTx.vout[j]['scriptPubKey'] &&
            decodeTx.vout[j]['scriptPubKey']['type'] === 'fee') {
          feeAmount = decodeTx.vout[j]['value'];
        } else if (decodeTx.vout[j]['asset'] === assetlabels.bitcoin) {
          btcAmount += decodeTx.vout[j]['value'];
        }
      }
      if (targetAssetData[assetlabels.bitcoin] &&
          (targetAssetData[assetlabels.bitcoin] > 0)) {
        if (assetData[assetlabels.bitcoin]) {
          btcAmount -= toSatoshiAmount(assetData[assetlabels.bitcoin]);
        }
      }
      console.log(
          '--------------------------------------------------------------------------------');
      for (let [asset, amount] of Object.entries(targetAssetData)) {
        if (amount === undefined) continue;
        if (amount === -1) amount = 0;
        if (asset === assetlabels.bitcoin) {
          console.log('## bitcoin');
        } else {
          console.log('## ' + asset);
        }
        console.log('## - select amount   = ' + amount);
        console.log('## - use utxo amount = ' + utxoAmounts[asset].toFixed(8));
        console.log('## - use utxo count  = ' + utxoCounts[asset]);
        if (asset === assetlabels.bitcoin) {
          console.log('## - difference      = ' +
            (btcTotal - toBtcAmount(btcAmount) - toBtcAmount(feeAmount))
                .toFixed(8));
          console.log('## - fee             = ' + toBtcAmount(feeAmount).toFixed(8));
        }
      }
      console.log(
          '--------------------------------------------------------------------------------');
    } else if (checkString(command, 'btc_fundrawtx')) {
      const amount = Number(process.argv[3]);
      // const feeRate = Number(process.argv[4]);
      // const fundRawOpt = {'feeRate': feeRate, 'change_type': 'bech32'};
      const fundRawOpt = {'estimate_mode': 'ECONOMICAL', 'change_type': 'bech32'};

      // === pre process ===

      // === create transaction ===
      // generate addresses
      const addresses = {};
      // addresses.token = await getNewAddress(network)
      addresses.btc = await btcCli.getnewaddress();
      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(amount),
          },
        ],
      };
      const rawTx = cfdjs.CreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      const hex = rawTx.hex;
      console.log('fundrawtransaction start. hex=', hex);
      const isWitness = false;
      const fundRawRet = await btcCli.fundrawtransaction(
          hex, fundRawOpt, isWitness);
      console.log('fundrawtransaction =>\n', fundRawRet);
      const fundHex = fundRawRet.hex;

      // === post process ===
      const decodeTx = cfdjs.DecodeRawTransaction({
        'hex': fundHex,
        'network': 'regtest',
      });
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('\n\n=== fund tx decoded data === \n',
          JSON.stringify(decodeTx, null, 2));

      console.log(
          '--------------------------------------------------------------------------------');
      const listunspentResult = await btcCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      let total = 0;
      for (let j = 0; j < decodeTx.vin.length; j++) {
        const targetTxid = decodeTx.vin[j].txid;
        const targetVout = decodeTx.vin[j].vout;
        const utxo = listunspentResult.find((unspent) => {
          return (unspent.txid === targetTxid) && (unspent.vout === targetVout);
        });
        console.log('## UTXO[' + j + '] -> ', utxo);
        total += utxo.amount;
      }
      // get fee
      let feeAmount = total - amount;
      for (let j = 0; j < decodeTx.vout.length; j++) {
        if (decodeTx.vout[j]['scriptPubKey']) {
          if (decodeTx.vout[j]['scriptPubKey']['type'] === 'fee') {
            feeAmount = decodeTx.vout[j]['value'];
            break;
          }
        }
      }
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('## select amount   = ' + amount);
      console.log('## use utxo amount = ' + total.toFixed(8));
      console.log('## use utxo count  = ' + decodeTx.vin.length);
      console.log('## fee             = ' + feeAmount.toFixed(8));
      console.log(
          '--------------------------------------------------------------------------------');
    } else if (checkString(command, 'btccfd_fundrawtx')) {
      const amount = Number(process.argv[3]);
      const targetAmount = Number(process.argv[4]);
      const feeRate = Number(process.argv[5]);
      let minChange = -1;
      if (process.argv.length >= 7) {
        minChange = Number(process.argv[6]);
      }

      // === pre process ===

      // === collect utxo ===
      const listunspentResult = await btcCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      const utxos = [];
      for (let j = 0; j < listunspentResult.length; j++) {
        if (!listunspentResult[j].spendable) {
          // do nothing
        } else if (listunspentResult[j].amount !== 0) {
          const utxoData = {
            txid: listunspentResult[j].txid,
            vout: listunspentResult[j].vout,
            amount: toSatoshiAmount(listunspentResult[j].amount),
            descriptor: listunspentResult[j].desc,
          };
          utxos.push(utxoData);
        }
      }

      // === create transaction ===
      // generate addresses
      const addresses = {};
      // addresses.token = await getNewAddress(network)
      addresses.btc = await btcCli.getnewaddress();
      const reserveAddress = await btcCli.getnewaddress();
      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(amount),
          },
        ],
      };
      const rawTx = cfdjs.CreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      // === FundRawTransaction ===
      const FundTxJson = {
        utxos: utxos,
        selectUtxos: [],
        tx: rawTx.hex,
        isElements: false,
        network: 'regtest',
        targetAmount: toSatoshiAmount(targetAmount),
        reserveAddress: reserveAddress,
        feeInfo: {
          feeRate: feeRate,
          longTermFeeRate: feeRate,
          knapsackMinChange: minChange,
          dustFeeRate: 3,
          isBlindEstimateFee: true,
        },
      };
      console.log('FundRawTransaction start. utxos = ' + utxos.length);
      const fundRawRet = cfdjs.FundRawTransaction(FundTxJson);
      console.log('FundRawTransaction =>\n', fundRawRet);
      const fundHex = fundRawRet.hex;

      // === post process ===
      const decodeTx = cfdjs.DecodeRawTransaction({
        'hex': fundHex,
        'network': 'regtest',
      });
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('\n\n=== fund tx decoded data === \n',
          JSON.stringify(decodeTx, null, 2));

      console.log(
          '--------------------------------------------------------------------------------');
      let total = 0;
      for (let j = 0; j < decodeTx.vin.length; j++) {
        const targetTxid = decodeTx.vin[j].txid;
        const targetVout = decodeTx.vin[j].vout;
        const utxo = listunspentResult.find((unspent) => {
          return (unspent.txid === targetTxid) && (unspent.vout === targetVout);
        });
        console.log('## UTXO[' + j + '] -> ' + utxo.amount);
        total += utxo.amount;
      }
      let outAmount = 0;
      for (let j = 0; j < decodeTx.vout.length; j++) {
        outAmount += decodeTx.vout[j].value;
      }
      if (targetAmount > 0) {
        outAmount -= toSatoshiAmount(amount);
      }
      const outBtc = toBtcAmount(outAmount);
      // get fee(btc)
      const feeAmount = fundRawRet.feeAmount;
      console.log(
          '--------------------------------------------------------------------------------');
      console.log('## select amount   = ' + targetAmount);
      console.log('## output amount   = ' + outBtc.toFixed(8));
      console.log('## use utxo amount = ' + total.toFixed(8));
      console.log('## use utxo count  = ' + decodeTx.vin.length);
      console.log('## difference      = ' + (total - outBtc - toBtcAmount(feeAmount)).toFixed(8));
      console.log('## fee             = ' + toBtcAmount(feeAmount).toFixed(8));
      console.log(
          '--------------------------------------------------------------------------------');
    } else {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }
  } catch (error) {
    console.log(error);
  }
  return 0;
};

main();

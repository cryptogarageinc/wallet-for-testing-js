'use strict';
const path = require('path');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);
const elementsCli = helper.getElementsCli();
const cfdjs = helper.getCfdJsModule();

const COIN_BASE = 100000000;
const listunspentMax = 9999999;
const emptyEntropy = '0000000000000000000000000000000000000000000000000000000000000000'; // eslint-disable-line max-len

// -----------------------------------------------------------------------------
const toSatoshiAmount = function(btcAmount) {
  return Math.round(btcAmount * COIN_BASE);
};
// -----------------------------------------------------------------------------

const commandData = {
  sendissue: {
    name: 'sendissue',
    alias: undefined,
    parameter: '<asset amount> <token amount> [<is_blind> <fee>]',
  },
  sendissueLib: {
    name: 'sendissue_lib',
    alias: undefined,
    parameter: '<asset amount> <token amount> [<is_blind_iussue> <is_blind> <fee>]',
  },
  sendreissue: {
    name: 'sendreissue',
    alias: undefined,
    parameter: '<asset> <reissue amount> [<blind flag> <fee>]',
  },
  sendreissueLib: {
    name: 'sendreissue_lib',
    alias: undefined,
    parameter: '<asset> <reissue amount> [<is_blind_iussue> <blind flag> <fee>]',
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
    if (checkString(command, 'sendissue')) {
      const assetAmount = Number(process.argv[3]);
      const tokenAmount = Number(process.argv[4]);
      const isBlind = true;
      let isIssuanceBlind = true;
      let fee = 0.0001;
      if (process.argv.length >= 6) {
        isIssuanceBlind =
            !((process.argv[5] === false) || (process.argv[5] === 'false'));
      }
      if (process.argv.length >= 7) {
        fee = Number(process.argv[6]);
      }
      if (!assetAmount || !tokenAmount || !fee) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)
      // pick token info
      const issuances = {};
      issuances.before = await elementsCli.listissuances();
      // console.log("=== issuances ===\n", issuances.before)

      // === pick input utxo ===
      const utxos = {};
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      // pick btc utxo (If isBlinded is true, pick blinded utxo)
      utxos.btc = listunspentResult.find((unspent) => {
        const blinded = (unspent.amountblinder !== emptyEntropy);
        return (unspent.asset === assetlabels.bitcoin) &&
               (unspent.amount > fee) &&
               (isBlind === blinded);
      });
      if (!utxos.btc) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      // console.log("unspents >>\n", JSON.stringify(utxos, null, 2))

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
      const inputs = [
        {'txid': utxos.btc.txid, 'vout': utxos.btc.vout},
      ];
      const outputs = [
        {[addresses.btc]: Number((utxos.btc.amount - fee).toFixed(8))},
        {'fee': Number(fee.toFixed(8))},
      ];
      const rawTx = await elementsCli.createrawtransaction(
          inputs, outputs, 0, false);
      // console.log("raw transaction =>\n", rawTx)

      // === issue asset ===
      for (const type of ['asset', 'token']) {
        addresses[type] = await elementsCli.getnewaddress();
        addressInfo[type] = await elementsCli.getaddressinfo(addresses[type]);
        if (!isBlind) {
          addresses[type] = addressInfo[type].unconfidential;
        }
      }
      const issueTx = await elementsCli.rawissueasset(
          rawTx,
          [
            {
              'asset_amount': Number(assetAmount.toFixed(8)),
              'asset_address': addresses.asset,
              'token_amount': Number(tokenAmount.toFixed(8)),
              'token_address': addresses.token,
              'blind': isIssuanceBlind,
            },
          ]);
      const issueTxHex = issueTx[(issueTx.length - 1)].hex;
      console.log('issue transaction =>\n', issueTx);

      // === blind transaction ===
      let blindTx = issueTxHex;
      if (isBlind) {
        blindTx = await elementsCli.blindrawtransaction(
            blindTx, true, [utxos.btc.assetcommitment], true);
        // console.log("blind transaction =>\n", blindTx)
      }

      // === sign transaction ===
      const signTx = await elementsCli.signrawtransactionwithwallet(blindTx);
      console.log('signed issue transaction =>\n', signTx);

      // === send transaction ===
      const txid = await elementsCli.sendrawtransaction(signTx.hex);
      console.log(`\n=== issue txid === => ${txid}\n`);

      // === post process ===
      const blockNum = 2;
      addresses.generate = await elementsCli.getnewaddress();
      await elementsCli.generatetoaddress(blockNum, addresses.generate);

      const balance = await elementsCli.getbalance();
      issueTx.forEach((issuance, i) => {
        console.log(`[${i}]added asset = ${issuance.asset}` +
            ` : amount = ${balance[issuance.asset]}`);
        console.log(`[${i}]added token = ${issuance.token}` +
            ` : amount = ${balance[issuance.token]}`);
      });

      const gettransaction = await elementsCli.gettransaction(txid);
      // console.log("issue tx =>\n", gettransaction)
      const decodeIssueTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== issue tx decoded data === \n',
          JSON.stringify(decodeIssueTx, null, 2));

      if (isBlind) {
        // === unblind reissue transaction ===
        const unblindIssueTx = await elementsCli.unblindrawtransaction(
            gettransaction.hex);
        const decodeIssueTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': unblindIssueTx.hex,
          'network': 'regtest',
        });
        console.log('\n\n\n=== unblind issue tx decoded data === \n',
            JSON.stringify(decodeIssueTx, null, 2));
      }
    } else if (checkString(command, 'sendissue_lib')) {
      const assetAmount = Number(process.argv[3]);
      const tokenAmount = Number(process.argv[4]);
      let isIssuanceBlind = true;
      let isBlind = true;
      let fee = 0.0001;
      if (process.argv.length >= 6) {
        isIssuanceBlind =
            !((process.argv[5] === false) || (process.argv[5] === 'false'));
      }
      if (process.argv.length >= 7) {
        isBlind =
            !((process.argv[6] === false) || (process.argv[6] === 'false'));
      }
      if (process.argv.length >= 8) {
        fee = Number(process.argv[7]);
      }
      if (!assetAmount || !tokenAmount || !fee) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)
      // pick token info
      const issuances = {};
      issuances.before = await elementsCli.listissuances();
      // console.log("=== issuances ===\n", issuances.before)

      // === pick input utxo ===
      const utxos = {};
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      // pick btc utxo (If isBlinded is true, pick blinded utxo)
      utxos.btc = listunspentResult.find((unspent) => {
        const blinded = (unspent.amountblinder !== emptyEntropy);
        return (unspent.asset === assetlabels.bitcoin) &&
          (unspent.amount > fee) &&
          (unspent.spendable === true) &&
          (!unspent.desc.startsWith('pkh')) &&
          (isBlind === blinded);
      });
      if (!utxos.btc) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      console.log('unspents >>\n', utxos.btc);

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
        'txins': [
          {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'asset': assetlabels.bitcoin,
            'sequence': 4294967295,
          },
        ],
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(utxos.btc.amount - fee),
            'asset': assetlabels.bitcoin,
          },
        ],
        'fee': {
          'amount': toSatoshiAmount(fee),
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.ElementsCreateRawTransaction(
          CreateRawTransactionJson);
      // console.log("raw transaction =>\n", rawTx.hex)

      // === issue asset ===
      for (const type of ['asset', 'token']) {
        addresses[type] = await elementsCli.getnewaddress();
        addressInfo[type] = await elementsCli.getaddressinfo(addresses[type]);
        if (!isBlind) {
          addresses[type] = addressInfo[type].unconfidential;
        }
      }
      const contractHash = emptyEntropy;
      const issueTx = cfdjs.SetRawIssueAsset({
        'tx': rawTx.hex,
        'isRandomSortTxOut': false,
        'issuances': [
          {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'assetAmount': toSatoshiAmount(assetAmount),
            'assetAddress': addresses.asset,
            'tokenAmount': toSatoshiAmount(tokenAmount),
            'tokenAddress': addresses.token,
            'isBlind': isIssuanceBlind,
            'contractHash': contractHash,
          },
        ],
      });
      if (!issueTx.issuances || issueTx.issuances.length === 0) {
        throw Error('failed to set issue asset.');
      }

      // === blind transaction ===
      let blindTx = issueTx;
      const issuancesBlind = [];
      if (isBlind) {
        const masterBlindingKey = await elementsCli.dumpmasterblindingkey();
        const issueBlindingKey = cfdjs.GetIssuanceBlindingKey({
          'masterBlindingKey': masterBlindingKey,
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
        });
        if (isIssuanceBlind) {
          issuancesBlind.push({
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'assetBlindingKey': issueBlindingKey.blindingKey,
            'tokenBlindingKey': issueBlindingKey.blindingKey,
          });
        }
        blindTx = cfdjs.BlindRawTransaction({
          'tx': issueTx.hex,
          'txins': [
            {
              'txid': utxos.btc.txid,
              'vout': utxos.btc.vout,
              'asset': utxos.btc.asset,
              'blindFactor': utxos.btc.amountblinder,
              'assetBlindFactor': utxos.btc.assetblinder,
              'amount': toSatoshiAmount(utxos.btc.amount),
            },
          ],
          'txouts': [
            {
              'index': 0,
              'blindPubkey': addressInfo.btc.confidential_key,
            },
            {
              'index': 2,
              'blindPubkey': addressInfo.asset.confidential_key,
            },
            {
              'index': 3,
              'blindPubkey': addressInfo.token.confidential_key,
            },
          ],
          'issuances': issuancesBlind,
        });
      }

      // === sign transaction ===
      const inputAddrInfo = {};
      let signedTx = blindTx;
      // calc signature hash
      inputAddrInfo.btc = await elementsCli.getaddressinfo(utxos.btc.address);
      const btcPubkey = inputAddrInfo.btc.pubkey;
      if (inputAddrInfo.btc.pubkey.length > 66) {
        console.log('invalid address:', utxos.btc.address);
      }
      const sighashParamJson = {
        'tx': signedTx.hex,
        'txin': {
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
          'keyData': {
            'hex': btcPubkey,
            'type': 'pubkey',
          },
          'confidentialValueCommitment': utxos.btc.amountcommitment,
          'hashType': 'p2wpkh', // このスクリプト内では、p2wpkhしかサポートしていない
        },
      };
      if (!isBlind) {
        delete sighashParamJson.confidentialValueHex;
        Object.assign(sighashParamJson.txin,
            {'amount': toSatoshiAmount(utxos.btc.amount)});
      }
      const sighash = cfdjs.CreateElementsSignatureHash(sighashParamJson);


      // calc signature
      const privkey = await elementsCli.dumpprivkey(utxos.btc.address);
      // const signature = cfdtest.CalculateEcSignature(
      //     sighash.sighash, privkey, "regtest")
      let signature;
      try {
        signature = cfdjs.CalculateEcSignature({
          'sighash': sighash.sighash,
          'privkeyData': {
            'privkey': privkey,
            'network': 'regtest',
          },
        }).signature;
      } catch (e) {
        signature = cfdjs.CalculateEcSignature({
          'sighash': sighash.sighash,
          'privkeyData': {
            'privkey': privkey,
            'network': 'regtest',
            'isCompressed': false,
          },
        }).signature;
      }

      // set sign to wit
      signedTx = cfdjs.AddSign({
        'tx': signedTx.hex,
        'isElements': true,
        'txin': {
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
          'isWitness': true,
          'signParam': [
            {
              'hex': signature,
              'type': 'sign',
              'derEncode': true,
            },
            {
              'hex': btcPubkey,
              'type': 'pubkey',
            },
          ],
        },
      });

      if (utxos.btc.desc.startsWith('sh(w')) {
        signedTx = cfdjs.AddSign({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'isWitness': false,
            'signParam': [
              {
                'hex': inputAddrInfo.btc.hex,
                'type': 'redeem_script',
              },
            ],
          },
        });
      }
      // console.log("signed issue transaction =>\n", signedTx);

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n=== issue txid === => ${txid}\n`);
      } catch (sendErr) {
        const failedTxHex = signedTx.hex;
        const failedTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': failedTxHex,
          'network': 'regtest',
        });
        console.error('fail tx =>\n', JSON.stringify(failedTx, null, 2));
        throw sendErr;
      }

      // === post process ===
      const blockNum = 2;
      addresses.generate = await elementsCli.getnewaddress();
      await elementsCli.generatetoaddress(blockNum, addresses.generate);

      const balance = await elementsCli.getbalance();
      issueTx.issuances.forEach((issuance, i) => {
        console.log(`[${i}]added asset = ${issuance.asset}` +
            ` : amount = ${balance[issuance.asset]}`);
        console.log(`[${i}]added token = ${issuance.token}` +
            ` : amount = ${balance[issuance.token]}`);
      });

      const gettransaction = await elementsCli.gettransaction(txid);
      // console.log("issue tx =>\n", gettransaction)
      const decodeIssueTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== issue tx decoded data === \n',
          JSON.stringify(decodeIssueTx, null, 2));

      if (isBlind) {
        // === unblind reissue transaction ===
        const unblindBlindingKeys = {};
        for (const type of ['token', 'btc', 'asset']) {
          unblindBlindingKeys[type] =
              await elementsCli.dumpblindingkey(addressInfo[type].confidential);
        }
        // const unblindReissueTx =
        //     await elementsCli.unblindrawtransaction(gettransaction.hex)
        const unblindIssueTx = cfdjs.UnblindRawTransaction({
          'tx': gettransaction.hex,
          'txouts': [
            {
              'index': 0,
              'blindingKey': unblindBlindingKeys.btc,
            },
            {
              'index': 2,
              'blindingKey': unblindBlindingKeys.asset,
            },
            {
              'index': 3,
              'blindingKey': unblindBlindingKeys.token,
            },
          ],
          'issuances': issuancesBlind,
        });
        // console.log("unblind reissued transaction =>\n", unblindIssueTx);
        const decodeUnblindIssueTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': unblindIssueTx.hex,
          'network': 'regtest',
        });
        console.log('\n\n\n=== unblind issue tx decoded data ===\n',
            JSON.stringify(decodeUnblindIssueTx, null, 2));
      }
    } else if (command === 'sendreissue') {
      const assetId = process.argv[3];
      const reissueAmount = Number(process.argv[4]);
      let isBlind = true; // for future param
      let fee = 0.0001;
      if (process.argv.length >= 6) {
        isBlind = !((process.argv[5] === false) || process.argv[5] === 'false');
      }
      if (process.argv.length >= 7) {
        fee = Number(process.argv[6]);
      }
      if (!assetId || !reissueAmount || !fee) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)

      // pick token info
      const issuances = await elementsCli.listissuances();
      const assetInfo = issuances.find((issuance) => {
        const blinded = (issuance.assetblinds !== emptyEntropy);
        return (issuance.asset === assetId) && (issuance.token) &&
          (blinded === isBlind);
      });
      if (!assetInfo) {
        throw Error(`Asset not found.
          Wallet doesn't have reissuable asset: asset="${assetId}".`);
      }
      // console.log("asset =>\n", assetInfo)

      const beforeBalance = await elementsCli.getbalance();
      console.log('before wallet asset amount = ',
          beforeBalance[assetInfo.asset]);
      console.log('before wallet token amount = ',
          beforeBalance[assetInfo.token]);

      // === pick input utxo ===
      const utxos = {};
      const listunspentResult =
          await elementsCli.listunspent(0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      // pick token utxo
      utxos.token = listunspentResult.find((unspent) =>
        (unspent.asset === assetInfo.token));
      // console.log("token unspent >> ", utxos.token)
      // pick input utxo
      utxos.btc = listunspentResult.find((unspent) => {
        const blinded = (unspent.amountblinder !== emptyEntropy);
        return (unspent.asset === assetlabels.bitcoin) &&
               (unspent.amount > fee) &&
               (blinded === isBlind);
      });
      if (!utxos.btc || !utxos.token) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      // console.log("token unspent >>\n", utxos.token)
      // console.log("input unspent >>\n", utxos.btc)

      // === create transaction ===
      // generate addresses
      const addresses = {};
      addresses.token = await elementsCli.getnewaddress();
      addresses.btc = await elementsCli.getnewaddress();
      const inputs = [
        {'txid': utxos.token.txid, 'vout': utxos.token.vout},
        {'txid': utxos.btc.txid, 'vout': utxos.btc.vout},
      ];
      const outputs = [
        {[addresses.token]: Number((utxos.token.amount).toFixed(8))},
        {[addresses.btc]: Number((utxos.btc.amount - fee).toFixed(8))},
        {'fee': Number(fee.toFixed(8))},
      ];
      const outputAssets = {[addresses.token]: utxos.token.asset};
      const rawTx = await elementsCli.createrawtransaction(
          inputs, outputs, 0, false, outputAssets);
      // console.log("raw transaction =>\n", rawTx)

      // === reissue asset ===
      const assetAddr = await elementsCli.getnewaddress();
      const reissuances = [{
        'input_index': 0,
        'asset_amount': Number(reissueAmount.toFixed(8)),
        'asset_address': assetAddr,
        'asset_blinder': utxos.token.assetblinder,
        'entropy': assetInfo.entropy,
      }];
      const rawreissueasset = await elementsCli.rawreissueasset(
          rawTx, reissuances);
      // console.log("reissueasset =>\n", rawreissueasset)
      let reissueHex = rawreissueasset.hex;
      // const rawreissueTx = cfdjs.ElementsDecodeRawTransaction({
      //   'hex': reissueHex,
      //   'network': 'regtest',
      // });
      // console.log('rawreissue tx =>\n',
      //     JSON.stringify(rawreissueTx, null, 2));

      // === blind transaction ===
      if (isBlind) {
        // console.log("tokencommitment =>\n", utxos.token.assetcommitment)
        // console.log("assetcommitment =>\n", utxos.btc.assetcommitment)
        reissueHex = await elementsCli.blindrawtransaction(
            reissueHex,
            true,
            [utxos.token.assetcommitment, utxos.btc.assetcommitment],
            true,
        );
        // console.log("blindtx =>\n", reissueHex)
      }

      // === sign transaction ===
      const signedTx =
          await elementsCli.signrawtransactionwithwallet(reissueHex);
      console.log('\n=== signed reissue transaction ===\n', signedTx);

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n===reissue txid=== => ${txid}\n`);
      } catch (sendErr) {
        let failedTxHex = signedTx.hex;
        if (isBlind) {
          const unblindedTx = await elementsCli.directExecute(
              'unblindrawtransaction', [failedTxHex]);
          failedTxHex = unblindedTx.hex;
        }
        const failedTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': failedTxHex,
          'network': 'regtest',
        });
        console.log('fail tx =>\n', JSON.stringify(failedTx, null, 2));
        throw sendErr;
      }

      // === post process ===
      const blockNum = 2;
      const genAddr = await elementsCli.getnewaddress();
      await elementsCli.generatetoaddress(blockNum, genAddr);

      const reissuedBalance = await elementsCli.getbalance();
      console.log('wallet asset amount = ', reissuedBalance[assetInfo.asset]);
      console.log('wallet token amount = ', reissuedBalance[assetInfo.token]);

      const gettransaction = await elementsCli.gettransaction(txid);
      const decodeReissueTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== reissue tx decoded data === \n\n',
          JSON.stringify(decodeReissueTx, null, 2));
      if (isBlind) {
        const unblindTx =
            await elementsCli.unblindrawtransaction(gettransaction.hex);
        const decodeUnblindReissueTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': unblindTx.hex,
          'network': 'regtest',
        });
        console.log('\n\n\n=== reissue unblind tx decoded data ===\n',
            JSON.stringify(decodeUnblindReissueTx, null, 2));
        // const issueKey = await elementsCli.dumpissuanceblindingkey(txid, 0)
        // console.log("dumpissuanceblindingkey ->", issueKey)
      }
    } else if (command === 'sendreissue_lib') {
      const assetId = process.argv[3];
      const reissueAmount = Number(process.argv[4]);
      // for future param
      let isBlind = true; // eslint-disable-line no-unused-vars
      let isBlindIssuance = true; // eslint-disable-line no-unused-vars
      let fee = 0.0001;
      if (process.argv.length >= 6) {
        isBlindIssuance = !((process.argv[5] === false) || process.argv[5] === 'false');
      }
      if (process.argv.length >= 7) {
        isBlind = !((process.argv[6] === false) || process.argv[6] === 'false');
      }
      if (process.argv.length >= 8) {
        fee = Number(process.argv[7]);
      }
      if (!assetId || !reissueAmount || !fee) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }
      // console.log(`bitcoin asset id = ${assetlabels.bitcoin}`)
      // pick token info
      const issuances = await elementsCli.listissuances();
      const assetInfo = issuances.find((issuance) => (
        (issuance.asset === assetId) && (issuance.token)
      ));
      if (!assetInfo) {
        throw Error(`Asset not found.
          Wallet doesn't have reissuable asset: asset="${assetId}".`);
      }
      // console.log("asset =>\n", assetInfo)

      const beforeBalance = await elementsCli.getbalance();
      console.log('before wallet asset amount = ',
          beforeBalance[assetInfo.asset]);
      console.log('before wallet token amount = ',
          beforeBalance[assetInfo.token]);

      // === pick input utxo ===
      const utxos = {};
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      // pick token utxo
      utxos.token = listunspentResult.find((unspent) =>
        (unspent.asset === assetInfo.token));
      if (!utxos.token) {
        throw Error('listunspent fail. missing token utxo.');
      }
      // pick btc utxo
      utxos.btc = listunspentResult.find((unspent) => (
        (unspent.asset === assetlabels.bitcoin) && (unspent.amount > fee) &&
        (!unspent.desc.startsWith('pkh')) &&
        (unspent.amountblinder !== emptyEntropy)
      ));
      if (!utxos.btc) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      // console.log("unspents >>\n", JSON.stringify(utxos, null, 2))

      // === create transaction ===
      // generate addresses
      const addresses = {};
      // addresses.token = await getNewAddress(network)
      // addresses.token = await getNewAddress(network)
      addresses.token = await elementsCli.getnewaddress();
      addresses.btc = await elementsCli.getnewaddress();
      const CreateRawTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txins': [
          {
            'txid': utxos.token.txid,
            'vout': utxos.token.vout,
            'asset': utxos.token.asset,
            'sequence': 4294967295,
          },
          {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'asset': assetlabels.bitcoin,
            'sequence': 4294967295,
          },
        ],
        'txouts': [
          {
            'address': addresses.token,
            'amount': toSatoshiAmount(utxos.token.amount),
            'asset': utxos.token.asset,
          },
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(utxos.btc.amount - fee),
            'asset': assetlabels.bitcoin,
          },
        ],
        'fee': {
          'amount': toSatoshiAmount(fee),
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.ElementsCreateRawTransaction(
          CreateRawTransactionJson);

      // console.log("raw transaction =>\n", rawTx.hex)

      // === reissue asset ===
      addresses.asset = await elementsCli.getnewaddress();
      const reissueTx = cfdjs.SetRawReissueAsset({
        'tx': rawTx.hex,
        'issuances': [
          {
            'txid': utxos.token.txid,
            'vout': utxos.token.vout,
            'amount': toSatoshiAmount(reissueAmount),
            'address': addresses.asset,
            'assetBlindingNonce': utxos.token.assetblinder,
            'assetEntropy': assetInfo.entropy,
          },
        ],
      });
      if (!reissueTx.issuances || reissueTx.issuances.length === 0) {
        throw Error('failed to set reissue asset.');
      }
      // console.log("reissue transaction =>\n", reissueTx.hex)

      // === blind transaction ===
      const addrInfo = {};
      const blindingkeys = {};
      for (const type of ['token', 'btc', 'asset']) {
        addrInfo[type] = await elementsCli.getaddressinfo(addresses[type]);
        blindingkeys[type] = await elementsCli.dumpblindingkey(addresses[type]);
      }
      const masterBlindingKey = await elementsCli.dumpmasterblindingkey();
      const issuanceBlindingKey = cfdjs.GetIssuanceBlindingKey({
        'masterBlindingKey': masterBlindingKey,
        'txid': utxos.token.txid,
        'vout': utxos.token.vout,
      });
      const issuance = [];
      if (isBlindIssuance) {
        console.log('blinding:', isBlindIssuance);
        issuance.push({
          'txid': utxos.token.txid,
          'vout': utxos.token.vout,
          'assetBlindingKey': issuanceBlindingKey.blindingKey,
          'tokenBlindingKey': issuanceBlindingKey.blindingKey,
        });
      }
      let blindTx = reissueTx;
      if (isBlind) {
        blindTx = cfdjs.BlindRawTransaction({
          'tx': reissueTx.hex,
          'txins': [
            {
              'txid': utxos.token.txid,
              'vout': utxos.token.vout,
              'asset': utxos.token.asset,
              'blindFactor': utxos.token.amountblinder,
              'assetBlindFactor': utxos.token.assetblinder,
              'amount': toSatoshiAmount(utxos.token.amount),
            },
            {
              'txid': utxos.btc.txid,
              'vout': utxos.btc.vout,
              'asset': utxos.btc.asset,
              'blindFactor': utxos.btc.amountblinder,
              'assetBlindFactor': utxos.btc.assetblinder,
              'amount': toSatoshiAmount(utxos.btc.amount),
            },
          ],
          'txouts': [
            {
              'index': 0,
              'blindPubkey': addrInfo.token.confidential_key,
            },
            {
              'index': 1,
              'blindPubkey': addrInfo.btc.confidential_key,
            },
            {
              'index': 3,
              'blindPubkey': addrInfo.asset.confidential_key,
            },
          ],
          'issuances': issuance,
        });
        // console.log("blinded reissue tx =>\n", blindTx)
      }

      // === sign transaction ===
      const inputAddrInfo = {};
      let signedTx = blindTx;
      for (const type of ['token', 'btc']) {
        // calc signature hash
        inputAddrInfo[type] =
            await elementsCli.getaddressinfo(utxos[type].address);
        const sighash = cfdjs.CreateElementsSignatureHash({
          'tx': blindTx.hex,
          'txin': {
            'txid': utxos[type].txid,
            'vout': utxos[type].vout,
            'keyData': {
              'hex': inputAddrInfo[type].pubkey,
              'type': 'pubkey',
            },
            'confidentialValueCommitment': utxos[type].amountcommitment,
            'hashType': 'p2wpkh', // このスクリプト内では、p2wpkhしかサポートしていない
          },
        });

        // calc signature
        const privkey = await elementsCli.dumpprivkey(utxos[type].address);
        // const signature = cfdtest.CalculateEcSignature(
        //     sighash.sighash, privkey, "testnet")
        const signature = cfdjs.CalculateEcSignature({
          'sighash': sighash.sighash,
          'privkeyData': {
            'privkey': privkey,
            'network': 'testnet',
          },
        }).signature;

        // set sign to wit
        signedTx = cfdjs.AddSign({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': utxos[type].txid,
            'vout': utxos[type].vout,
            'isWitness': true,
            'signParam': [
              {
                'hex': signature,
                'type': 'sign',
                'derEncode': true,
              },
              {
                'hex': inputAddrInfo[type].pubkey,
                'type': 'pubkey',
              },
            ],
          },
        });

        if (utxos[type].desc.startsWith('sh(w')) {
          signedTx = cfdjs.AddSign({
            'tx': signedTx.hex,
            'isElements': true,
            'txin': {
              'txid': utxos[type].txid,
              'vout': utxos[type].vout,
              'isWitness': false,
              'signParam': [
                {
                  'hex': inputAddrInfo[type].hex,
                  'type': 'redeem_script',
                },
              ],
            },
          });
        }
      }
      // console.log("signed reissue transaction =>\n", signedTx);

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n===reissue txid=== => ${txid}\n`);
      } catch (sendErr) {
        const failedTxHex = signedTx.hex;
        const failedTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': failedTxHex,
          'network': 'regtest',
        });
        console.error('fail tx =>\n', JSON.stringify(failedTx, null, 2));
        throw sendErr;
      }

      // === post process ===
      const blockNum = 2;
      addresses.generate = await elementsCli.getnewaddress();
      await elementsCli.generatetoaddress(blockNum, addresses.generate);

      const reissuedBalance = await elementsCli.getbalance();
      console.log('wallet asset amount = ', reissuedBalance[assetInfo.asset]);
      console.log('wallet token amount = ', reissuedBalance[assetInfo.token]);

      const gettransaction = await elementsCli.gettransaction(txid);
      // console.log("reissue tx =>\n", gettransaction)
      const decodeReissueTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== reissue tx decoded data === \n\n',
          JSON.stringify(decodeReissueTx, null, 2));

      // === unblind reissue transaction ===
      const unblindBlindingKeys = {};
      for (const type of ['token', 'btc', 'asset']) {
        unblindBlindingKeys[type] =
            await elementsCli.dumpblindingkey(addrInfo[type].confidential);
      }
      // const unblindReissueTx =
      //     await elementsCli.unblindrawtransaction(gettransaction.hex)
      const unblindReissueTx = cfdjs.UnblindRawTransaction({
        'tx': gettransaction.hex,
        'txouts': [
          {
            'index': 0,
            'blindingKey': unblindBlindingKeys.token,
          },
          {
            'index': 1,
            'blindingKey': unblindBlindingKeys.btc,
          },
          {
            'index': 3,
            'blindingKey': unblindBlindingKeys.asset,
          },
        ],
        'issuances': issuance,
      });
      // console.log("unblind reissued transaction =>\n", unblindReissueTx);
      const decodeUnblindReissueTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': unblindReissueTx.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== reissue unblind tx decoded data ===\n',
          JSON.stringify(decodeUnblindReissueTx, null, 2));
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

'use strict';
const path = require('path');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);
const elementsCli = helper.getElementsCli();
const cfdjs = helper.getCfdJsModule();

const listunspentMax = 9999999;
const emptyEntropy = '0000000000000000000000000000000000000000000000000000000000000000'; // eslint-disable-line max-len

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const commandData = {
  destroyamount: {
    name: 'destroyamount',
    alias: undefined,
    parameter: '<amount> <asset> [<is_blind> <fee>]',
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
    if (checkString(command, 'destroyamount')) {
      const amount = Number(process.argv[3]);
      let isBlind = false;
      let fee = 0.0001;
      let asset = '';
      if (process.argv.length >= 5) {
        asset = process.argv[4];
      }
      if (process.argv.length >= 6) {
        isBlind =
            !((process.argv[5] === false) || (process.argv[5] === 'false'));
      }
      if (process.argv.length >= 7) {
        fee = Number(process.argv[6]);
      }
      if (!amount || !fee) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // get assetlabels
      const assetlabels = await elementsCli.dumpassetlabels();
      if (!assetlabels.bitcoin) {
        throw Error('bitcoin label not found.');
      }

      // === pick input utxo ===
      const utxosBitcoin = {};
      {
        // eslint-disable-next-line max-len
        const listunspentResult = await elementsCli.listunspent(0, listunspentMax);
        listunspentResult.sort((a, b) => (a.amount - b.amount));
        // pick btc utxo (If isBlinded is true, pick blinded utxo)
        utxosBitcoin.btc = listunspentResult.find((unspent) => {
          const blinded = (unspent.amountblinder !== emptyEntropy);
          return (unspent.asset === assetlabels.bitcoin) &&
            (unspent.amount > fee) &&
            (isBlind === blinded);
        });
        if (!utxosBitcoin.btc) {
          throw Error('listunspent fail. Maybe low fee.');
        }
        console.log('unspents >>\n', JSON.stringify(utxosBitcoin, null, 2));
      }

      const utxos = {};
      {
        const listunspentResult = await elementsCli.listunspent(
            0, listunspentMax);
        listunspentResult.sort((a, b) => (a.amount - b.amount));
        // pick btc utxo (If isBlinded is true, pick blinded utxo)
        utxos.btc = listunspentResult.find((unspent) => {
          const blinded = (unspent.amountblinder !== emptyEntropy);
          return (unspent.asset === asset) && (unspent.amount > amount) &&
            (isBlind === blinded);
        });
        if (!utxos.btc) {
          throw Error('listunspent fail. Maybe low amount.');
        }
        console.log('unspents >>\n', JSON.stringify(utxos, null, 2));
      }

      const preBalance = await elementsCli.getbalance();
      console.log(`  before bitcoin amount = ${preBalance.bitcoin}`);
      console.log(`  before target asset amount = ${preBalance[asset]}\n`);

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

      const addresses2 = {};
      const addressInfo2 = {};
      // addresses.token = await getNewAddress(network)
      addresses2.btc = await elementsCli.getnewaddress();
      addressInfo2.btc = await elementsCli.getaddressinfo(addresses2.btc);
      if (!isBlind) {
        addresses2.btc = addressInfo2.btc.unconfidential;
      }

      const CreateDestroyAmountTransactionJson = {
        'version': 2,
        'locktime': 0,
        'txins': [
          {
            'txid': utxosBitcoin.btc.txid,
            'vout': utxosBitcoin.btc.vout,
            'asset': assetlabels.bitcoin,
            'sequence': 4294967295,
          },
          {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'asset': asset,
            'sequence': 4294967295,
          },
        ],
        'txouts': [
          {
            'address': addresses.btc,
            'amount': toSatoshiAmount(utxosBitcoin.btc.amount - fee),
            'asset': assetlabels.bitcoin,
          },
          {
            'address': addresses2.btc,
            'amount': toSatoshiAmount(utxos.btc.amount - amount),
            'asset': asset,
          },
        ],
        'destroy': {
          'amount': toSatoshiAmount(amount),
          'asset': asset,
        },
        'fee': {
          'amount': toSatoshiAmount(fee),
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.CreateDestroyAmount(
          CreateDestroyAmountTransactionJson,
      );
      // console.log("raw transaction =>\n", rawTx)

      // === blind transaction ===
      let blindTx = rawTx;
      if (isBlind) {
        blindTx = cfdjs.BlindRawTransaction({
          'tx': rawTx.hex,
          'txins': [
            {
              'txid': utxosBitcoin.btc.txid,
              'vout': utxosBitcoin.btc.vout,
              'asset': utxosBitcoin.btc.asset,
              'blindFactor': utxosBitcoin.btc.amountblinder,
              'assetBlindFactor': utxosBitcoin.btc.assetblinder,
              'amount': toSatoshiAmount(utxosBitcoin.btc.amount),
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
              'blindPubkey': addressInfo.btc.confidential_key,
            },
            {
              'index': 1,
              'blindPubkey': addressInfo2.btc.confidential_key,
            },
            {
              'index': 2,
              'blindPubkey': '',
            },
          ],
        });
      }
      // console.log("blindTx = ", blindTx)

      // === sign transaction ===
      let signedTx = blindTx;
      // Txin1
      {
        const inputAddrInfo = {};
        // calc signature hash
        inputAddrInfo.btc =
          await elementsCli.getaddressinfo(utxosBitcoin.btc.address);
        const sighashParamJson = {
          'tx': signedTx.hex,
          'txin': {
            'txid': utxosBitcoin.btc.txid,
            'vout': utxosBitcoin.btc.vout,
            'keyData': {
              'hex': inputAddrInfo.btc.pubkey,
              'type': 'pubkey',
            },
            'confidentialValueCommitment': utxosBitcoin.btc.amountcommitment,
            'hashType': 'p2wpkh', // このスクリプト内では、p2wpkhしかサポートしていない
          },
        };
        if (!isBlind) {
          delete sighashParamJson.confidentialValueCommitment;
          Object.assign(sighashParamJson.txin,
              {'amount': toSatoshiAmount(utxosBitcoin.btc.amount)});
        }
        const sighash = cfdjs.CreateElementsSignatureHash(
            sighashParamJson,
        );
        // console.log("sighash = ", sighash)

        // calc signature
        const privkey = await elementsCli.dumpprivkey(utxosBitcoin.btc.address);
        // const signature = cfdtest.CalculateEcSignature(
        //     sighash.sighash, privkey, "regtest")
        const signature = cfdjs.CalculateEcSignature({
          'sighash': sighash.sighash,
          'privkeyData': {
            'privkey': privkey,
            'network': 'regtest',
          },
        }).signature;
        // set sign to wit
        signedTx = cfdjs.AddSign({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': utxosBitcoin.btc.txid,
            'vout': utxosBitcoin.btc.vout,
            'isWitness': true,
            'signParam': [
              {
                'hex': signature,
                'type': 'sign',
                'derEncode': true,
              },
              {
                'hex': inputAddrInfo.btc.pubkey,
                'type': 'pubkey',
              },
            ],
          },
        });

        if (inputAddrInfo.btc.isscript) {
          let redeemScript = inputAddrInfo.btc.hex;
          if (!redeemScript) {
            redeemScript = inputAddrInfo.btc.scriptPubKey;
          }
          signedTx = cfdjs.AddSign({
            'tx': signedTx.hex,
            'isElements': true,
            'txin': {
              'txid': utxosBitcoin.btc.txid,
              'vout': utxosBitcoin.btc.vout,
              'isWitness': false,
              'signParam': [
                {
                  'hex': redeemScript,
                  'type': 'redeem_script',
                },
              ],
            },
          });
          // console.log("redeem_script =>\n", inputAddrInfo.btc);
        }
      }

      // Txin2
      {
        const inputAddrInfo = {};
        // calc signature hash
        inputAddrInfo.btc = await elementsCli.getaddressinfo(utxos.btc.address);
        const sighashParamJson = {
          'tx': signedTx.hex,
          'txin': {
            'txid': utxos.btc.txid,
            'vout': utxos.btc.vout,
            'keyData': {
              'hex': inputAddrInfo.btc.pubkey,
              'type': 'pubkey',
            },
            'confidentialValueCommitment': utxos.btc.amountcommitment,
            'hashType': 'p2wpkh', // このスクリプト内では、p2wpkhしかサポートしていない
          },
        };
        if (!isBlind) {
          delete sighashParamJson.confidentialValueCommitment;
          Object.assign(sighashParamJson.txin,
              {'amount': toSatoshiAmount(utxos.btc.amount)});
        }
        const sighash = cfdjs.CreateElementsSignatureHash(
            sighashParamJson,
        );
        // console.log("sighash = ", sighash)

        // calc signature
        const privkey = await elementsCli.dumpprivkey(utxos.btc.address);
        // const signature = cfdtest.CalculateEcSignature(
        //     sighash.sighash, privkey, "regtest")
        const signature = cfdjs.CalculateEcSignature({
          'sighash': sighash.sighash,
          'privkeyData': {
            'privkey': privkey,
            'network': 'regtest',
          },
        }).signature;
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
                'hex': inputAddrInfo.btc.pubkey,
                'type': 'pubkey',
              },
            ],
          },
        });

        if (inputAddrInfo.btc.isscript) {
          let redeemScript = inputAddrInfo.btc.hex;
          if (!redeemScript) {
            redeemScript = inputAddrInfo.btc.scriptPubKey;
          }
          signedTx = cfdjs.AddSign({
            'tx': signedTx.hex,
            'isElements': true,
            'txin': {
              'txid': utxos.btc.txid,
              'vout': utxos.btc.vout,
              'isWitness': false,
              'signParam': [
                {
                  'hex': redeemScript,
                  'type': 'redeem_script',
                },
              ],
            },
          });
          // console.log("redeem_script =>\n", inputAddrInfo.btc);
        }
      }
      console.log('signed destroyamount transaction =>\n', signedTx);

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n=== destroyamount txid === => ${txid}\n`);
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

      const gettransaction = await elementsCli.gettransaction(txid);
      const decodeDestroyamountTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
      });
      console.log('\n\n\n=== destroyamount tx decoded data === \n',
          JSON.stringify(decodeDestroyamountTx, null, 2));

      const balance = await elementsCli.getbalance();
      console.log(`  after bitcoin amount = ${balance.bitcoin}`);
      console.log(`  after target asset amount = ${balance[asset]}\n`);
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

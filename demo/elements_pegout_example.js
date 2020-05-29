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
  pegout: {
    name: 'pegout',
    alias: undefined,
    parameter: '<btc amount> [<btc address(not pak)> <bip32_counter> <is_blind> <fee>]', // eslint-disable-line max-len
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
    if (checkString(command, 'pegout')) {
      const amount = Number(process.argv[3]);
      let isBlind = false;
      let fee = 0.001;
      let btcSendAddress = '';
      let counter = -1;
      if (process.argv.length >= 5) {
        btcSendAddress = process.argv[4];
      }
      if (process.argv.length >= 6) {
        counter = Number(process.argv[5]);
      }
      if (process.argv.length >= 7) {
        isBlind =
            !((process.argv[6] === false) || (process.argv[6] === 'false'));
      }
      if (process.argv.length >= 8) {
        fee = Number(process.argv[7]);
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
               (unspent.amount > (amount + fee)) &&
               ((isBlind && blinded) || (!isBlind && !blinded));
      });
      if (!utxos.btc) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      console.log('unspents >>\n', JSON.stringify(utxos, null, 2));

      const preBalance = await elementsCli.getbalance();
      console.log(`  before bitcoin amount = ${preBalance.bitcoin}\n`);

      const chainInfo = await elementsCli.getblockchaininfo();
      const sidechainInfo = await elementsCli.getsidechaininfo();
      const walletpakinfo = await elementsCli.getwalletpakinfo();

      let btcAddress = '';
      let onlinePubkey = '';
      let masterOnlineKey = '';
      let bitcoinDescriptor = '';
      let bip32Counter = 0;
      let whitelist = '';
      if (sidechainInfo.enforce_pak) {
        // pak on
        onlinePubkey = walletpakinfo.liquid_pak;
        masterOnlineKey = await elementsCli.dumpprivkey(
            walletpakinfo.liquid_pak_address);
        bitcoinDescriptor = walletpakinfo.bitcoin_descriptor;
        whitelist = chainInfo.extension_space[0];
        if (counter === -1) {
          bip32Counter = walletpakinfo.bip32_counter + 1;
        } else {
          bip32Counter = counter;
        }
      } else if (btcSendAddress === '') {
        throw Error('btc address not found.');
      } else {
        btcAddress = btcSendAddress;
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
      const CreatePegoutTransactionJson = {
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
            'amount': toSatoshiAmount(utxos.btc.amount - amount - fee),
            'asset': assetlabels.bitcoin,
          },
        ],
        'pegout': {
          'amount': toSatoshiAmount(amount),
          'asset': assetlabels.bitcoin,
          'network': 'regtest',
          'mainchainGenesisBlockHash': sidechainInfo.parent_blockhash,
          'btcAddress': btcAddress,
          'onlinePubkey': onlinePubkey,
          'masterOnlineKey': masterOnlineKey,
          'bitcoinDescriptor': bitcoinDescriptor,
          'bip32Counter': bip32Counter,
          'whitelist': whitelist,
        },
        'fee': {
          'amount': toSatoshiAmount(fee),
          'asset': assetlabels.bitcoin,
        },
      };
      const rawTx = cfdjs.CreateRawPegout(CreatePegoutTransactionJson);

      // console.log("raw transaction =>\n", rawTx)

      // === blind transaction ===
      let blindTx = rawTx;
      if (isBlind) {
        blindTx = cfdjs.BlindRawTransaction({
          'tx': rawTx.hex,
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
          ],
        });
      }
      // console.log("blindTx = ", blindTx)

      // === sign transaction ===
      const inputAddrInfo = {};
      let signedTx = blindTx;
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
      const sighash = cfdjs.CreateElementsSignatureHash(sighashParamJson);

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
      console.log('signed pegout transaction =>\n', signedTx);

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n=== pegout txid === => ${txid}\n`);
      } catch (sendErr) {
        const failedTxHex = signedTx.hex;
        const failedTx = cfdjs.ElementsDecodeRawTransaction({
          'hex': failedTxHex,
          'network': 'regtest',
          'mainchainNetwork': 'regtest',
        });
        console.error('fail tx =>\n', JSON.stringify(failedTx, null, 2));
        throw sendErr;
      }

      // === post process ===
      const blockNum = 2;
      addresses.generate = await elementsCli.getnewaddress();
      await elementsCli.generatetoaddress(blockNum, addresses.generate);

      const balance = await elementsCli.getbalance();
      console.log(`  after bitcoin amount = ${balance.bitcoin}`);

      const gettransaction = await elementsCli.gettransaction(txid);
      const decodePegoutTx = cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': 'regtest',
        'mainchainNetwork': 'regtest',
      });
      console.log('\n\n\n=== pegout tx decoded data === \n',
          JSON.stringify(decodePegoutTx, null, 2));
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

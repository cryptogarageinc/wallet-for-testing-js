'use strict';
const path = require('path');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);
const btcCli = helper.getBitcoinCli();
const elementsCli = helper.getElementsCli();
let cfdjs;

const COIN_BASE = 100000000;
const listunspentMax = 9999999;

// -----------------------------------------------------------------------------
const toSatoshiAmount = function(btcAmount) {
  return Math.round(btcAmount * COIN_BASE);
};

const btcSendToAddress = async function(amount, btcAdrType) {
  const address = await btcCli.directExecute('getnewaddress', ['', btcAdrType]);
  const txid = await btcCli.directExecute('sendtoaddress', [address, amount]);
  await btcCli.directExecute('generatetoaddress', [6, address]);
  const gettransaction = await btcCli.directExecute('gettransaction', [txid]);
  const tx = await cfdjs.DecodeRawTransaction({hex: gettransaction.hex, network: 'regtest'});
  // console.log('btcSendToAddress: ', JSON.stringify(tx, null, 2));
  let vout = 0;
  const satoshi = toSatoshiAmount(amount);
  if (Number(tx.vout[0].value) === satoshi) {
    vout = 0;
  } else if ((tx.vout.length > 1) && Number(tx.vout[1].value) === satoshi) {
    vout = 1;
  } else if ((tx.vout.length > 2) && Number(tx.vout[2].value) === satoshi) {
    vout = 2;
  } else if ((tx.vout.length > 3) && Number(tx.vout[3].value) === satoshi) {
    vout = 3;
  } else {
    console.log('decode fail. tx=', JSON.stringify(tx, null, 2));
  }
  return {txid: txid, vout: vout, address: address, amount: amount};
};

const btcCfdSendToAddress = async function(utxo, amount, address) {
  // createTx
  const newAddress = await btcCli.directExecute('getnewaddress', ['', 'bech32']);
  const txdata = await cfdjs.CreateRawTransaction({
    'version': 2,
    'locktime': 0,
    'txins': [{
      'txid': utxo.txid,
      'vout': utxo.vout,
      'sequence': 4294967295,
    }],
    'txouts': [{
      'address': address,
      'amount': toSatoshiAmount(amount),
    }, {
      'address': newAddress,
      'amount': toSatoshiAmount(utxo.amount - amount - 0.00002000),
    }],
  });
  // sign
  const signTx = await btcCli.directExecute('signrawtransactionwithwallet', [txdata.hex]);
  const txid = await btcCli.directExecute('sendrawtransaction', [signTx.hex]);
  // await elementsCli.directExecute('generatetoaddress', [6, utxoAddr]);
  console.log('txid = ' + txid);
  // const decTx = await cfdjs.DecodeRawTransaction({hex: signTx.hex, network: 'regtest'});
  // console.log('btcCfdSendToAddress: ', JSON.stringify(decTx, null, 2));
  return {txid: txid, vout: 0};
};

// -----------------------------------------------------------------------------

const commandData = {
  blindpegin: {
    name: 'blindpegin',
    alias: undefined,
    parameter: '<btc amount> [<fee>]',
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
  cfdjs = await helper.getCfdJsModule();
  try {
    if (process.argv.length <= 2) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }

    const command = process.argv[2];
    if (checkString(command, 'blindpegin')) {
      const network = 'regtest';
      const mainchainNetwork = 'regtest';

      const amount = Number(process.argv[3]);
      let isBlind = true;
      let isScript = false;
      let fee = 0.001;
      if (process.argv.length >= 5) {
        fee = Number(process.argv[4]);
      }
      if (process.argv.length >= 6) {
        isBlind = (process.argv[5] === 'true');
      }
      let targetType = 'bech32'; // 'bech32'; 'p2sh-segwit'
      if (process.argv.length >= 7) {
        targetType = process.argv[6];
      }
      if (process.argv.length >= 8) {
        isScript = (process.argv[7] === 'true');
      }
      if (!amount || !fee) {
        throw Error('Invalid parameter');
      }
      const elmAmount = 0.00200000;
      const blockNum = 101;

      const befGetbalance = await elementsCli.directExecute('getbalance', []);
      console.log(`  before bitcoin amount = ${befGetbalance.bitcoin}`);

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
      const generateAddr = await elementsCli.getnewaddress();

      const adrType = targetType;
      let adrHashType = 'p2pkh';
      if (adrType === 'bech32') {
        adrHashType = 'p2wpkh';
      } else if (adrType === 'p2sh-segwit') {
        adrHashType = 'p2sh-p2wpkh';
      }

      // liquid and elements is constant. dynafed is native segwit.
      const peginAddrType = 'p2sh-p2wsh';
      const peginHashType = 'p2wpkh';

      let elemUtxoAddress = await elementsCli.directExecute(
          'getnewaddress', ['', adrType]);
      // console.log("elemUtxoAddress =>\n", elemUtxoAddress)
      const elemUtxoAddressinfo = await elementsCli.directExecute(
          'getaddressinfo', [elemUtxoAddress]);
      console.log('elemUtxoAddressinfo =>\n', elemUtxoAddressinfo);
      if (!isBlind && ('unconfidential' in elemUtxoAddressinfo)) {
        elemUtxoAddress = elemUtxoAddressinfo.unconfidential;
        console.log('send unconfidential address: ', elemUtxoAddress);
      }
      const utxoTxid = await elementsCli.directExecute(
          'sendtoaddress', [elemUtxoAddress, elmAmount]);
      console.log('utxoTxid =>\n', utxoTxid);
      await elementsCli.generatetoaddress(1, generateAddr);

      let elemSendAddress = await elementsCli.directExecute(
          'getnewaddress', ['', adrType]);
      const elemSendAddressinfo = await elementsCli.directExecute(
          'getaddressinfo', [elemSendAddress]);
      console.log('elemSendAddressinfo =>\n', elemSendAddressinfo);
      if (!isBlind && ('unconfidential' in elemSendAddressinfo)) {
        elemSendAddress = elemSendAddressinfo.unconfidential;
        console.log('send unconfidential address: ', elemSendAddress);
      }

      // === pick input utxo ===
      const utxos = {};
      const listunspentResult = await elementsCli.listunspent(
          0, listunspentMax);
      listunspentResult.sort((a, b) => (a.amount - b.amount));
      // pick btc utxo (If isBlinded is true, pick blinded utxo)
      utxos.btc = listunspentResult.find((unspent) => {
        return (unspent.txid === utxoTxid) &&
            (Number(unspent.amount) === elmAmount);
      });
      if (!utxos.btc) {
        throw Error('listunspent fail. Maybe low fee.');
      }
      console.log('unspents >>\n', JSON.stringify(utxos, null, 2));

      const sidechainInfo = await elementsCli.getsidechaininfo();

      let elemPeginAddress = await elementsCli.directExecute(
          'getnewaddress', ['', adrType]);
      const elemPeginAddressinfo = await elementsCli.directExecute(
          'getaddressinfo', [elemPeginAddress]);
      if (!isBlind && ('unconfidential' in elemPeginAddressinfo)) {
        elemPeginAddress = elemPeginAddressinfo.unconfidential;
        console.log('pegin address: ', elemPeginAddress);
      }

      const btcAddress = await btcCli.directExecute('getnewaddress', []);
      let elemAddress = await elementsCli.directExecute(
          'getnewaddress', ['', adrType]);
      console.log('elements confidential address: ', elemAddress);
      const addressinfo = await elementsCli.directExecute(
          'getaddressinfo', [elemAddress]);
      if (!isBlind && ('unconfidential' in addressinfo)) {
        elemAddress = addressinfo.unconfidential;
        console.log('elements unconfidential address: ', elemAddress);
      }
      const pegPrivkey = await elementsCli.directExecute(
          'dumpprivkey', [elemAddress]);
      console.log('elemAddressinfo =>\n', addressinfo);

      const elemAddress2 = await elementsCli.directExecute(
          'getnewaddress', ['', adrType]);
      const addressinfo2 = await elementsCli.directExecute(
          'getaddressinfo', [elemAddress2]);
      const pegPrivkey2 = await elementsCli.directExecute(
          'dumpprivkey', [elemAddress2]);

      let paramPeginAddrJson;
      let multisigScript = '';
      if (isScript) {
        const multisig = await cfdjs.CreateMultisig({
          'nrequired': 2,
          'keys': [
            addressinfo.pubkey,
            addressinfo2.pubkey,
          ],
          'network': network,
          'hashType': 'p2sh-p2wsh',
          'isElements': true,
        });
        multisigScript = multisig.witnessScript;

        paramPeginAddrJson = {
          'fedpegscript': sidechainInfo.fedpegscript,
          'redeemScript': multisigScript,
          'network': mainchainNetwork,
          'hashType': peginAddrType, // if use dynafed, can use p2wsh.
        };
      } else {
        paramPeginAddrJson = {
          'fedpegscript': sidechainInfo.fedpegscript,
          'pubkey': addressinfo.pubkey,
          'network': mainchainNetwork,
          'hashType': peginAddrType, // if use dynafed, can use p2wsh.
        };
      }

      const peginaddressInfo = await cfdjs.CreatePegInAddress(paramPeginAddrJson);

      // const peginaddress = await elementsCli.directExecute(
      //     'getpeginaddress', [])
      console.log('getpeginaddress =>\n', peginaddressInfo);
      const peginAddress = peginaddressInfo.mainchainAddress;
      const claimScript = peginaddressInfo.claimScript;

      // btc
      const btcSnd0 = await btcSendToAddress(amount * 2, adrType);
      // console.log('btcSendToAddress: ', btcSnd0);
      const btcSnd = await btcCfdSendToAddress(btcSnd0, amount, peginAddress);
      console.log('btcSnd =>\n', btcSnd);
      const sendTxid = btcSnd.txid;
      const sendTxidVout = btcSnd.vout;
      await btcCli.directExecute('generatetoaddress', [blockNum, btcAddress]);
      const txData = await btcCli.directExecute('gettransaction', [sendTxid]);
      const txoutproof = await btcCli.directExecute(
          'gettxoutproof', [[sendTxid], txData.blockhash]);
      // console.log("gettransaction =>\n", txData)
      // console.log("gettxoutproof =>\n", txoutproof)

      let utxoAddrinfo = await elementsCli.directExecute(
          'getaddressinfo', [utxos.btc.address]);
      const utxoConfAddr = (isBlind) ?
          utxoAddrinfo.confidential : utxos.btc.address;
      utxoAddrinfo = await elementsCli.directExecute(
          'getaddressinfo', [utxoConfAddr]);
      console.log('utxoAddrinfo =>\n', utxoAddrinfo);
      console.log('utxoConfAddr =>\n', utxoConfAddr);

      /*
      const peginBtcTxObj = await cfdjs.DecodeRawTransaction({
        'hex': txData.hex,
        'network': mainchainNetwork,
      });
      */

      // Pegin ---------------------------------------------------------------
      const paramPeginJson = {
        'version': 2,
        'locktime': 0,
        'txins': [{
          'isPegin': true,
          'txid': sendTxid,
          'vout': sendTxidVout,
          'sequence': 4294967295,
          'peginwitness': {
            'amount': toSatoshiAmount(amount),
            'asset': assetlabels.bitcoin,
            'mainchainGenesisBlockHash': sidechainInfo.parent_blockhash,
            'claimScript': claimScript,
            'mainchainRawTransaction': txData.hex,
            'mainchainTxoutproof': txoutproof,
          },
          'isRemoveMainchainTxWitness': false,
        }, {
          'isPegin': false,
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
          'sequence': 4294967295,
        }],
        'txouts': [{
          'address': elemAddress,
          'amount': toSatoshiAmount(amount),
          'asset': assetlabels.bitcoin,
        }, {
          'address': elemSendAddress,
          'amount': toSatoshiAmount(utxos.btc.amount - fee),
          'asset': assetlabels.bitcoin,
        }],
        'fee': {
          'amount': toSatoshiAmount(fee),
          'asset': assetlabels.bitcoin,
        },
      };
      // console.log("paramPeginJson =>\n",
      //     JSON.stringify(paramPeginJson, null, 2))
      const peginTx = await cfdjs.CreateRawPegin(paramPeginJson);
      // const pegin_tx = await elementsCli.directExecute(
      //     'createrawpegin', [txData.hex, txoutproof, claimScript])
      // console.log("createrawpegin =>\n", pegin_tx)

      const peginTxObj = await cfdjs.ElementsDecodeRawTransaction({
        'hex': peginTx.hex,
        'network': network,
      });
      console.log('peginTxObj =>\n', JSON.stringify(peginTxObj, null, 2));

      // === blind transaction ===
      let blindTx = peginTx;
      if (isBlind) {
        blindTx = await cfdjs.BlindRawTransaction({
          'tx': peginTx.hex,
          'txins': [
            {
              'txid': sendTxid,
              'vout': sendTxidVout,
              'asset': assetlabels.bitcoin,
              'amount': toSatoshiAmount(amount),
              'blindFactor': '0000000000000000000000000000000000000000000000000000000000000000', // eslint-disable-line max-len
              'assetBlindFactor': '0000000000000000000000000000000000000000000000000000000000000000', // eslint-disable-line max-len
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
              'blindPubkey': addressinfo.confidential_key,
            },
            {
              'index': 1,
              'blindPubkey': utxoAddrinfo.confidential_key,
            },
          ],
        });
      }
      // console.log("blindTx = ", blindTx)

      // === sign transaction ===
      const inputAddrInfo = {};
      let signedTx = blindTx;
      // calc signature hash
      inputAddrInfo.btc = await elementsCli.getaddressinfo(utxoConfAddr);
      const sighashParamJson = {
        'tx': signedTx.hex,
        'txin': {
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
          'keyData': {
            'hex': utxoAddrinfo.pubkey,
            'type': 'pubkey',
          },
          'amount': (!isBlind) ? toSatoshiAmount(utxos.btc.amount) : 0,
          'confidentialValueCommitment': (!isBlind) ? '' : utxos.btc.amountcommitment,
          'hashType': (adrHashType === 'p2sh-p2wpkh') ? 'p2wpkh' : adrHashType,
          'sighashType': 'all',
          'sighashAnyoneCanPay': false,
        },
      };
      const sighash = await cfdjs.CreateElementsSignatureHash(sighashParamJson);
      console.log('sighash = ', sighash);

      // calc signature
      const privkey = await elementsCli.dumpprivkey(utxoConfAddr);
      // let signature = cfdtest.CalculateEcSignature(
      //     sighash.sighash, privkey, "regtest")
      let signature = await cfdjs.CalculateEcSignature({
        'sighash': sighash.sighash,
        'privkeyData': {
          'privkey': privkey,
          'network': mainchainNetwork,
        },
      }).signature;
      // set sign to wit
      signedTx = await cfdjs.AddSign({
        'tx': signedTx.hex,
        'isElements': true,
        'txin': {
          'txid': utxos.btc.txid,
          'vout': utxos.btc.vout,
          'isWitness': (adrHashType === 'p2pkh') ? false : true,
          'signParam': [
            {
              'hex': signature,
              'type': 'sign',
              'derEncode': true,
              'sighashType': 'all',
              'sighashAnyoneCanPay': false,
            },
            {
              'hex': utxoAddrinfo.pubkey,
              'type': 'pubkey',
            },
          ],
        },
      });

      if ((adrHashType !== 'p2pkh') && utxoAddrinfo.isscript) {
        let redeemScript = utxoAddrinfo.hex;
        if (!redeemScript) {
          redeemScript = utxoAddrinfo.scriptPubKey;
        }
        signedTx = await cfdjs.AddSign({
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
      // console.log("signed pegout transaction =>\n", signedTx);

      // pegin witness sign
      if (!isScript) {
        const signatureHash = await cfdjs.CreateElementsSignatureHash({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': sendTxid,
            'vout': sendTxidVout,
            'keyData': {
              'hex': addressinfo.pubkey,
              'type': 'pubkey',
            },
            'amount': toSatoshiAmount(amount),
            'hashType': (peginHashType === 'p2sh-p2wpkh') ? 'p2wpkh' : peginHashType,
            'sighashType': 'all',
            'sighashAnyoneCanPay': false,
          },
        });
        // console.log("\n*** signature hash ***\n", signatureHash, "\n")

        // calculate signature
        signature = await cfdjs.CalculateEcSignature({
          'sighash': signatureHash.sighash,
          'privkeyData': {
            'privkey': pegPrivkey,
            'network': mainchainNetwork,
          },
        }).signature;

        signedTx = await cfdjs.AddSign({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': sendTxid,
            'vout': sendTxidVout,
            'isWitness': (peginHashType === 'p2pkh') ? false : true,
            'signParam': [{
              'hex': signature,
              'type': 'sign',
              'derEncode': true,
              'sighashType': 'all',
              'sighashAnyoneCanPay': false,
            }, {
              'hex': addressinfo.pubkey,
              'type': 'pubkey',
              'derEncode': false,
            },
            ],
          },
        });
      } else {
        const datas = [{
          pubkey: addressinfo.pubkey,
          privkey: pegPrivkey,
        }, {
          pubkey: addressinfo2.pubkey,
          privkey: pegPrivkey2,
        },
        ];
        const sigArr = [];
        for (let i = 0; i < datas.length; ++i) {
          const signatureHash = await cfdjs.CreateElementsSignatureHash({
            'tx': signedTx.hex,
            'isElements': true,
            'txin': {
              'txid': sendTxid,
              'vout': sendTxidVout,
              'keyData': {
                'hex': (isScript) ? multisigScript : datas[i].pubkey,
                'type': (isScript) ? 'redeem_script' : 'pubkey',
              },
              'amount': toSatoshiAmount(amount),
              'hashType': (peginHashType === 'p2pkh') ? 'p2sh' : 'p2wsh',
              'sighashType': 'all',
              'sighashAnyoneCanPay': false,
            },
          });
          // console.log("\n*** signature hash ***\n", signatureHash, "\n")

          // calculate signature
          const signature = await cfdjs.CalculateEcSignature({
            'sighash': signatureHash.sighash,
            'privkeyData': {
              'privkey': datas[i].privkey,
              'network': mainchainNetwork,
            },
          }).signature;
          sigArr.push(signature);
        }

        signedTx = await cfdjs.AddMultisigSign({
          tx: signedTx.hex,
          isElements: true,
          txin: {
            'txid': sendTxid,
            'vout': sendTxidVout,
            'isWitness': (peginHashType === 'p2pkh') ? false : true,
            'signParams': [
              {
                hex: sigArr[0],
                type: 'sign',
                derEncode: true,
                sighashType: 'all',
                sighashAnyoneCanPay: false,
                relatedPubkey: datas[0].pubkey,
              },
              {
                hex: sigArr[1],
                type: 'sign',
                derEncode: true,
                sighashType: 'all',
                sighashAnyoneCanPay: false,
                relatedPubkey: datas[1].pubkey,
              },
            ],
            'redeemScript': (peginHashType === 'p2pkh') ? multisigScript : '',
            'witnessScript': (peginHashType === 'p2pkh') ? '' : multisigScript,
            'hashType': (peginHashType === 'p2pkh') ? 'p2sh' : 'p2wsh',
          },
        });
      }
      /*
      if (adrHashType === 'p2sh-p2wpkh') {
        signedTx = await cfdjs.AddSign({
          'tx': signedTx.hex,
          'isElements': true,
          'txin': {
            'txid': sendTxid,
            'vout': sendTxidVout,
            'isWitness': false,
            'signParam': [
              {
                'hex': addressinfo.scriptPubKey,
                'type': 'redeem_script',
              },
            ],
          },
        });
        // console.log("redeem_script =>\n", inputAddrInfo.btc);
      }
      */

      // === send transaction ===
      let txid = '';
      try {
        txid = await elementsCli.sendrawtransaction(signedTx.hex);
        console.log(`\n=== pegout txid === => ${txid}\n`);
      } catch (sendErr) {
        const failedTxHex = signedTx.hex;
        const failedTx = await cfdjs.ElementsDecodeRawTransaction({
          'hex': failedTxHex,
          'network': network,
          'mainchainNetwork': mainchainNetwork,
        });
        console.error('fail tx =>\n', JSON.stringify(failedTx, null, 2));
        throw sendErr;
      }

      // === post process ===
      await elementsCli.generatetoaddress(2, generateAddr);

      const balance = await elementsCli.getbalance();
      console.log(`  after bitcoin amount = ${balance.bitcoin}`);

      const gettransaction = await elementsCli.gettransaction(txid);
      const decodePegoutTx = await cfdjs.ElementsDecodeRawTransaction({
        'hex': gettransaction.hex,
        'network': network,
        'mainchainNetwork': mainchainNetwork,
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

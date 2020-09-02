'use strict';
const path = require('path');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);
const elementsCli = helper.getElementsCli();

const NETWORK = 'regtest';

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

const commandData = {
  generateAddress: {
    name: 'generate_address',
    alias: undefined,
    parameter: '[<address_type(legacy,p2sh-segwit,bech32,all(default))>]',
  },
  generateMultisigAddress: {
    name: 'generate_multisig_address',
    alias: undefined,
    parameter: '[<address_type(legacy,p2sh-segwit,bech32,all(default))>]',
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
  const cfdjs = await helper.getCfdJsModule();
  let currentFunction = undefined;
  try {
    if (process.argv.length <= 2) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }

    const addressTypes = ['legacy', 'p2sh-segwit', 'bech32'];
    const command = process.argv[2];
    if (checkString(command, 'generate_address')) {
      const targetAddrType = (process.argv.length <= 3) ?
          'all' : process.argv[3];

      // generate key (blinding/confidential key)
      const blindKeyPairRequestJson = {
        'wif': false,
        'network': NETWORK,
        'isCompressed': true,
      };
      const blindKeyData = await cfdjs.CreateKeyPair(blindKeyPairRequestJson);
      console.log('blindKeyData >>\n',
          JSON.stringify(blindKeyData, null, 2), '\n');

      // generate key (address priv/pub key)
      const addressKeyPairRequestJson = {
        'wif': true,
        'network': NETWORK,
        'isCompressed': true,
      };
      const addressKeyData = await cfdjs.CreateKeyPair(
          addressKeyPairRequestJson);
      console.log('addressKeyData >>\n',
          JSON.stringify(addressKeyData, null, 2), '\n');

      const addresses = [];
      const addressesTarget = [];
      for (let i = 0; i < addressTypes.length; ++i) {
        if ((targetAddrType !== 'all') &&
            (addressTypes[i] !== targetAddrType)) {
          continue;
        }
        const targetType = addressTypes[i];

        // generate address
        let address = '';
        let hashtype = '';
        if (targetType === 'p2sh-segwit') {
          hashtype = 'p2sh-p2wpkh';
        } else if (targetType === 'bech32') {
          hashtype = 'p2wpkh';
        } else { // legacy
          hashtype = 'p2pkh';
        }
        const createAddressParamJson = {
          'keyData': {
            'hex': addressKeyData.pubkey,
            'type': 'pubkey',
          },
          'network': NETWORK,
          'hashType': hashtype,
          'isElements': true,
        };
        const addrRet = await cfdjs.CreateAddress(createAddressParamJson);
        console.log(`CreateAddress(${targetType}) >>\n`,
            JSON.stringify(addrRet, null, 2), '\n');

        const getConfidentialAddressParamJson = {
          'unblindedAddress': addrRet.address,
          'key': blindKeyData.pubkey,
        };
        const caddrRet = await cfdjs.GetConfidentialAddress(
            getConfidentialAddressParamJson);
        console.log(`GetConfidentialAddress(${targetType}) >>\n`,
            JSON.stringify(caddrRet, null, 2), '\n');
        address = caddrRet.confidentialAddress;

        // importblindingkey "address" "hexkey"
        currentFunction = `importblindingkey(${targetType})`;
        await elementsCli.importblindingkey(address, blindKeyData.privkey);
        // importaddress "address" ( "label" rescan p2sh )
        currentFunction = `importaddress(${targetType})`;
        await elementsCli.importaddress(address, '', false, false);
        currentFunction = undefined;

        addresses.push(address);
        addressesTarget.push(targetType);
      }

      // importprivkey "privkey" ( "label" rescan )
      currentFunction = 'importprivkey';
      await elementsCli.importprivkey(addressKeyData.privkey);
      // importpubkey "pubkey" ( "label" rescan )
      // -> use privkey only.
      currentFunction = undefined;

      for (let i = 0; i < addresses.length; ++i) {
        console.log('--------------------------------------------------------------------------------');
        console.log('Target =', addressesTarget[i]);
        const addrinfo = await elementsCli.getaddressinfo(addresses[i]);
        console.log('addrinfo >>\n', JSON.stringify(addrinfo, null, 2));
        const privkey = await elementsCli.dumpprivkey(addresses[i]);
        console.log('privkey >>', privkey);
        const blindingkey = await elementsCli.dumpblindingkey(addresses[i]);
        console.log('blindingkey >>', blindingkey);

        const txid = await elementsCli.sendtoaddress(addresses[i], 0.01);
        console.log('sendtoaddress txid >>', txid);
        const tx = await elementsCli.gettransaction(txid);
        const unblindTx = await elementsCli.unblindrawtransaction(tx.hex);
        // const decTx = await elementsCli.decoderawtransaction(unblindTx.hex)
        const decTx = await cfdjs.ElementsDecodeRawTransaction({
          'hex': unblindTx.hex,
          'network': 'regtest',
        });
        console.log('Decode Tx >>\n', JSON.stringify(decTx, null, 2), '\n');
      }
    } else if (checkString(command, 'generate_multisig_address')) {
      // generate_multisig_address
      const targetAddrType = (process.argv.length <= 3) ?
          'all' : process.argv[3];

      // generate key (blinding/confidential key)
      const blindKeyPairRequestJson = {
        'wif': false,
        'network': NETWORK,
        'isCompressed': true,
      };
      const blindKeyData = await cfdjs.CreateKeyPair(blindKeyPairRequestJson);
      console.log('blindKeyData >>\n',
          JSON.stringify(blindKeyData, null, 2), '\n');

      // generate key (address priv/pub key)
      const addressDatas = [];
      for (let i = 1; i <= 3; ++i) {
        const addressKeyPairRequestJson = {
          'wif': true,
          'network': NETWORK,
          'isCompressed': true,
        };
        const addressKeyData = await cfdjs.CreateKeyPair(
            addressKeyPairRequestJson);
        console.log(`addressKeyData(${i}) >>\n`,
            JSON.stringify(addressKeyData, null, 2), '\n');
        addressDatas.push(addressKeyData);
      }

      const createMultisigParamJson = {
        'nrequired': 3,
        'keys': [
          addressDatas[0].pubkey,
          addressDatas[1].pubkey,
          addressDatas[2].pubkey,
        ],
        'network': NETWORK,
        'hashType': 'p2sh',
        'isElements': true,
      };
      const createMultisigResult = await cfdjs.CreateMultisig(
          createMultisigParamJson);
      console.log('Multisig >> \n', createMultisigResult, '\n');

      const addresses = [];
      const addressesTarget = [];
      for (let i = 0; i < addressTypes.length; ++i) {
        if ((targetAddrType !== 'all') &&
            (addressTypes[i] !== targetAddrType)) {
          continue;
        }
        const targetType = addressTypes[i];

        // generate address
        let address = '';
        let hashtype = '';
        if (targetType === 'p2sh-segwit') {
          hashtype = 'p2sh-p2wsh';
        } else if (targetType === 'bech32') {
          hashtype = 'p2wsh';
        } else { // legacy
          hashtype = 'p2sh';
        }
        const createAddressParamJson = {
          'keyData': {
            'hex': createMultisigResult.redeemScript,
            'type': 'redeem_script',
          },
          'network': NETWORK,
          'hashType': hashtype,
          'isElements': true,
        };
        const addrRet = await cfdjs.CreateAddress(createAddressParamJson);
        console.log(`CreateAddress(${targetType}) >>\n`,
            JSON.stringify(addrRet, null, 2), '\n');

        const getConfidentialAddressParamJson = {
          'unblindedAddress': addrRet.address,
          'key': blindKeyData.pubkey,
        };
        const caddrRet = await cfdjs.GetConfidentialAddress(
            getConfidentialAddressParamJson);
        console.log(`GetConfidentialAddress(${targetType}) >>\n`,
            JSON.stringify(caddrRet, null, 2), '\n');
        address = caddrRet.confidentialAddress;

        // importblindingkey "address" "hexkey"
        currentFunction = `importblindingkey(${targetType})`;
        await elementsCli.importblindingkey(address, blindKeyData.privkey);
        // importaddress "address" ( "label" rescan p2sh )
        currentFunction = `importaddress(${targetType})`;
        await elementsCli.importaddress(address, '', false, false);
        currentFunction = undefined;

        addresses.push(address);
        addressesTarget.push(targetType);
      }

      for (let i = 0; i < 3; ++i) {
        // importprivkey "privkey" ( "label" rescan )
        currentFunction = 'importprivkey';
        await elementsCli.importprivkey(addressDatas[i].privkey);
        // importpubkey "pubkey" ( "label" rescan )
        // -> use privkey only.
        currentFunction = undefined;
      }

      for (let i = 0; i < addresses.length; ++i) {
        console.log('--------------------------------------------------------------------------------'); // eslint-disable-line max-len
        console.log('Target =', addressesTarget[i]);
        const addrinfo = await elementsCli.getaddressinfo(addresses[i]);
        console.log('addrinfo >>\n', JSON.stringify(addrinfo, null, 2));
        // const privkey = await elementsCli.dumpprivkey(addresses[i])
        // console.log("privkey >>", privkey)
        const blindingkey = await elementsCli.dumpblindingkey(addresses[i]);
        console.log('blindingkey >>', blindingkey, '\n');

        const txid = await elementsCli.sendtoaddress(addresses[i], 0.01);
        console.log('sendtoaddress txid >>', txid);
        const tx = await elementsCli.gettransaction(txid);
        const unblindTx = await elementsCli.unblindrawtransaction(tx.hex);
        // const decTx = await elementsCli.decoderawtransaction(unblindTx.hex)
        const decTx = await cfdjs.ElementsDecodeRawTransaction({
          'hex': unblindTx.hex,
          'network': 'regtest',
        });
        console.log('Decode Tx >>\n', JSON.stringify(decTx, null, 2), '\n');
      }
    } else {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }
  } catch (error) {
    console.log('exception:', (currentFunction) ? currentFunction : '');
    console.log(error);
  }
  return 0;
};

main()
;

'use strict';
const path = require('path');
const crypto = require('crypto');
const DemoExampleHelper = require('./demo_example_helper');

const CONNECTION_CONFIG_FILE = 'connection.conf';

const confPath = path.join(__dirname, CONNECTION_CONFIG_FILE);
const helper = new DemoExampleHelper(confPath);

const commandData = {
  getwordlist: {
    name: 'getwordlist',
    alias: 'wl',
    parameter: '<shortened language>',
  },
  getseed: {
    name: 'getseed',
    alias: '',
    parameter: '<menemonic> (<passphrase> <shortened language>)',
  },
  getmnemonic: {
    name: 'getmnemonic',
    alias: '',
    parameter: '<entropy> <language>',
  },
  getrandombytes: {
    name: 'getrandombytes',
    alias: 'grb',
    parameter: '<byte len>',
  },
  createextkeyfromseed: {
    name: 'createextkeyfromseed',
    alias: 'cefs',
    parameter: '<seed bytes> <network type>',
  },
  createextkeyfromparent: {
    name: 'createextkeyfromparent',
    alias: 'cefp',
    parameter: '<parent extkey> <network type> <childnum> ' +
        '(<hardened = false> <verbose = false>)',
  },
  createextkeyfromparentpath: {
    name: 'createextkeyfromparentpath',
    alias: 'cefpp',
    parameter: '<parent extkey> <network type> <childnum array> ' +
        '(<verbose = false>)',
  },
  createextpubkey: {
    name: 'createextpubkey',
    alias: 'cep',
    parameter: '<extPrivkey> <network type>',
  },
  getextkeyinfo: {
    name: 'getextkeyinfo',
    alias: 'getinfo',
    parameter: '<extkey>',
  },
  getpubkeyfromextkey: {
    name: 'getpubkeyfromextkey',
    alias: 'getpubfe',
    parameter: '<extkey> <network>',
  },
  getpubkeyfromextkey: {
    name: 'getpubkeyfromextkey',
    alias: 'getprivfe',
    parameter: '<extkey> <network>',
  },
  getpubkeyfrompriv: {
    name: 'getpubkeyfrompriv',
    alias: 'getpub',
    parameter: '<privkey> (<compress = true>)',
  },
  parsedescriptor: {
    name: 'parsedescriptor',
    alias: 'desc',
    parameter: '<descriptor> (<network type(mainnet,testnet,regtest,liquidv1,liquidregtest)> <derive path>)',
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
  try {
    if (process.argv.length <= 2) {
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
      return -1;
    }

    const command = process.argv[2];
    if (checkString(command, 'getwordlist', 'wl')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getwordlist']);
        return 0;
      }
      const language = process.argv[3];
      if (!language) {
        throw Error('Invalid parameter');
      }

      // === pre process ===

      // === get wordlist ===
      const result = await cfdjs.GetMnemonicWordlist({
        language,
      });
      if (result.error) {
        throw Error(JSON.stringify(result.error));
      }
      console.log(JSON.stringify(result.wordlist, null, 2));

      // === post process ===
    } else if (checkString(command, 'getseed')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getseed']);
        return 0;
      }
      const mnemonicStr = process.argv[3];
      let passphrase = '';
      let language = '';
      if (process.argv.length >= 5) {
        passphrase = process.argv[4];
      }
      if (process.argv.length >= 6) {
        language = process.argv[5];
      }
      if (!mnemonicStr) {
        throw Error('Invalid parameter');
      }

      // === pre process ===
      // split mnemonic to array
      let mnemonic;
      if (mnemonicStr.includes(' ')) {
        mnemonic = mnemonicStr.split(' ');
      } else if (mnemonicStr.includes('　')) {
        mnemonic = mnemonicStr.split('　');
      } else {
        throw Error('invalid mnemonic found');
      }

      // === mnemonic to seed ===
      const result = await cfdjs.ConvertMnemonicToSeed({
        mnemonic,
        passphrase,
        language,
      });
      if (result.error) {
        throw Error(JSON.stringify(result.error));
      }
      console.log(JSON.stringify(result, null, 2));

      // === post process ===
    } else if (checkString(command, 'getmnemonic')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getmnemonic']);
        return 0;
      }
      const entropy = process.argv[3];
      const language = process.argv[4];
      if (!entropy || !language) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === entropy to mnemonic
      const result = await cfdjs.ConvertEntropyToMnemonic({
        entropy,
        language,
      });
      if (result.error) {
        throw Error(JSON.stringify(result.error));
      }
      console.log(JSON.stringify(result.mnemonic));

      // === post process ===
    } else if (checkString(command, 'getrandombytes', 'grb')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getrandombytes']);
        return 0;
      }
      const len = Number(process.argv[3]);
      if (!len) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      const result = crypto.randomBytes(len);
      console.log(result.toString('hex'));

      // === post process ===
    } else if (checkString(command, 'createextkeyfromseed', 'cefs')) {
      if (process.argv.length === 3) {
        helpDump(commandData['createextkeyfromseed']);
        return 0;
      }
      const seed = process.argv[3];
      const network = process.argv[4];
      if (!(seed || network)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === create extkeys
      const extPubkey = await cfdjs.CreateExtkeyFromSeed({
        seed,
        network,
        'extkeyType': 'extPubkey',
      });
      console.log({'ExtPubKey': extPubkey.extkey});
      const extPrivkey = await cfdjs.CreateExtkeyFromSeed({
        seed,
        network,
        'extkeyType': 'extPrivkey',
      });
      console.log({'ExtPrvKey': extPrivkey.extkey});

      // === post process ===
    } else if (checkString(command, 'createextkeyfromparent', 'cefp')) {
      if (process.argv.length === 3) {
        helpDump(commandData['createextkeyfromparent']);
        return 0;
      }
      const extkey = process.argv[3];
      const network = process.argv[4];
      const childNumber = Number(process.argv[5]);
      const hardened = String(process.argv[6]).toLowerCase() === 'true';
      const verbose = String(process.argv[7]).toLowerCase() === 'true';
      if (!(extkey || network || childNumber)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === create extkeys
      const extPubkey = await cfdjs.CreateExtkeyFromParent({
        extkey,
        network,
        'extkeyType': 'extPubkey',
        childNumber,
        hardened,
      });
      console.log({'ExtPubKey': extPubkey.extkey});
      try {
        const extPrivkey = await cfdjs.CreateExtkeyFromParent({
          extkey,
          network,
          'extkeyType': 'extPrivkey',
          childNumber,
          hardened,
        });
        console.log({'ExtPrvkey': extPrivkey.extkey});
      } catch (e) {
        if (verbose) {
          console.error(e);
        }
        // else fall through
      }

      // === post process ===
    } else if (checkString(command, 'createextkeyfromparentpath', 'cefpp')) {
      if (process.argv.length === 3) {
        helpDump(commandData['createextkeyfromparentpath']);
        return 0;
      }
      const extkey = process.argv[3];
      const network = process.argv[4];
      const childNumberArray = JSON.parse(process.argv[5]);
      const verbose = String(process.argv[6]).toLowerCase() === 'true';
      if (!(extkey || network || childNumberArray)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === create extkeys
      try {
        const extPubkey = await cfdjs.CreateExtkeyFromParentPath({
          extkey,
          network,
          'extkeyType': 'extPubkey',
          childNumberArray,
        });
        const keyid = extkey.substring(0, 12) + '...' +
          childNumberArray.join('/');
        const key = `ExtPubkey(${keyid})`;
        console.log({[key]: extPubkey.extkey});
      } catch (e) {
        if (verbose) {
          console.error(e);
        }
      // else fall through
      }
      try {
        const extPrivkey = await cfdjs.CreateExtkeyFromParentPath({
          extkey,
          network,
          'extkeyType': 'extPrivkey',
          childNumberArray,
        });
        key = `ExtPrvkey(${keyid})`;
        console.log({[key]: extPrivkey.extkey});
      } catch (e) {
        if (verbose) {
          console.error(e);
        }
        // else fall through
      }

      // === post process ===
    } else if (checkString(command, 'createextpubkey', 'cep')) {
      if (process.argv.length === 3) {
        helpDump(commandData['createextpubkey']);
        return 0;
      }
      const extkey = process.argv[3];
      const network = process.argv[4];
      if (!(extkey || network)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      const extPubkey = await cfdjs.CreateExtPubkey({
        extkey,
        network,
      });
      console.log({'ExtPubkey': extPubkey.extkey});

      // === post process ===
    } else if (checkString(command, 'getextkeyinfo', 'getinfo')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getextkeyinfo']);
        return 0;
      }
      const extkey = process.argv[3];
      if (!(extkey)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      const extkeyInfo = await cfdjs.GetExtkeyInfo({
        extkey,
      });
      console.log(extkeyInfo);

      // === post process ===
    } else if (checkString(command, 'getpubkeyfromextkey', 'getpubfe')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getpubkeyfromextkey']);
        return 0;
      }
      const extkey = process.argv[3];
      const network = process.argv[4];
      if (!(extkey || network)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      const pubkey = await cfdjs.GetPubkeyFromExtkey({
        extkey,
        network,
      });
      console.log(pubkey);

      // === post process ===
    } else if (checkString(command, 'getprivkeyfromextkey', 'getprivfe')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getprivkeyfromextkey']);
        return 0;
      }
      const extkey = process.argv[3];
      const network = process.argv[4];
      const verbose = String(process.argv[5]).toLowerCase() === 'true';
      if (!(extkey || network)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      try {
        const privkey = await cfdjs.GetPrivkeyFromExtkey({
          extkey,
          network,
        });
        console.log(privkey);
      } catch (e) {
        if (verbose) {
          console.error(e);
        }
      }

      // === post process ===
    } else if (checkString(command, 'getpubkeyfrompriv', 'getpub')) {
      if (process.argv.length === 3) {
        helpDump(commandData['getpubkeyfrompriv']);
        return 0;
      }
      const privkey = process.argv[3];
      const isCompressed = String(process.argv[4]).toLowerCase() !== 'false';
      if (!(privkey || isCompressed)) {
        throw Error('Invalid parameter');
      }
      // === pre process ===

      // === get random byte hex
      const pubkey = await cfdjs.GetPubkeyFromPrivkey({
        privkey,
        isCompressed,
      });
      console.log(pubkey);
      // === post process ===
    } else if (checkString(command, 'parsedescriptor', 'desc')) {
      if (process.argv.length === 3) {
        helpDump(commandData['parsedescriptor']);
        return 0;
      }
      const descriptor = process.argv[3];
      const netTypeStr = (process.argv.length >= 5) ? process.argv[4] : 'mainnet';
      let network = netTypeStr;
      const bip32DerivationPath = (process.argv.length >= 6) ? process.argv[5] : '';
      let isElements = false;
      if (netTypeStr !== '') {
        if (netTypeStr === 'liquidv1') {
          isElements = true;
        } else if (netTypeStr === 'liquidregtest') {
          network = 'regtest';
          isElements = true;
        }
      }
      // === pre process ===

      // === parse descriptor
      const desc = await cfdjs.ParseDescriptor({
        isElements,
        descriptor,
        network,
        bip32DerivationPath,
      });
      console.log('descriptor ->\n', JSON.stringify(desc, null, 2));
      // === post process ===
    } else {
      for (let i = 0; i < process.argv.length; i++) {
        console.log(`argv[${i}] = ${process.argv[i]}`);
      }
      help();
      return -1;
    }
  } catch (error) {
    console.error(error);
    throw Error(`An error occered. error:${error}`);
  }
  return 0;
};

main();

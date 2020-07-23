const WalletManager = require('./walletManager.js');
const cfdjsWasm = require('cfd-js-wasm');

/**
 * read input from console.
 * @param {string} question input comment.
 * @return {Promise<string>} Promise's input object.
 */
function readInput(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      resolve(answer);
      readline.close();
    });
  });
}

const generatefundFunc = async function(cmd, words, wallet) {
  let amount = 100000000;
  if (words.length > 1) {
    amount = parseInt(words[1]);
  }
  const ret = await wallet.generateFund(amount);
  console.log('generateFund -> ', ret);
};

const generateFunc = async function(cmd, words, wallet) {
  let count = 1;
  let addr = '';
  if (words.length > 1) {
    count = parseInt(words[1]);
  }
  if (words.length > 2) {
    addr = words[2];
  }
  const ret = await wallet.generate(count, addr);
  console.log('generate -> ', ret);
};

const sendtoaddressFunc = async function(cmd, words, wallet) {
  let feeAsset = '';
  let targetConf = 6;
  if (words.length > 3 && (words[3] != '\'\'') && (words[3] != '""')) {
    feeAsset = words[3];
  }
  if (words.length > 4) {
    targetConf = parseInt(words[4]);
  }
  const ret = await wallet.sendToAddress(
      words[1], parseInt(words[2]), feeAsset, targetConf);
  console.log('sendtoaddress -> ', ret);
};

const getnewaddressFunc = async function(cmd, words, wallet) {
  let addrType = 'p2wpkh';
  let label = '';
  if (words.length > 1) {
    addrType = words[1];
  }
  if (words.length > 2) {
    label = words[2];
  }
  const ret = await wallet.getNewAddress(addrType, label);
  console.log('getnewaddress -> ', ret);
};

const getscriptaddressFunc = async function(cmd, words, wallet) {
  let addrType = 'p2wpkh';
  let label = '';
  if (words.length > 2) {
    addrType = words[2];
  }
  if (words.length > 3) {
    label = words[3];
  }
  const ret = await wallet.getScriptAddress(words[1], addrType, label);
  console.log('getscriptaddress -> ', ret);
};

const dumpprivkeyFunc = async function(cmd, words, wallet) {
  let address = '';
  let pubkey = '';
  if (words.length > 1 && (words[1] != '\'\'') && (words[1] != '""')) {
    address = words[1];
  }
  if (words.length > 2 && (words[2] != '\'\'') && (words[2] != '""')) {
    pubkey = words[2];
  }
  const ret = await wallet.dumpPrivkey(address, pubkey);
  console.log('dumpprivkey -> ', ret);
};

const getaddressinfoFunc = async function(cmd, words, wallet) {
  const ret = await wallet.getAddressInfo(words[1]);
  console.log('getaddressinfo -> ', ret);
};

const dumpaddressesFunc = async function(cmd, words, wallet) {
  const ret = await wallet.getAddresses();
  console.log('dumpaddresses -> ', ret);
};

const dumpaddressesbylabelFunc = async function(cmd, words, wallet) {
  const ret = await wallet.getAddressesByLabel(words[1]);
  console.log('dumpaddresses -> ', ret);
};

const decoderawtransactionFunc = async function(cmd, words, wallet) {
  const ret = await wallet.decodeRawTransaction(words[1]);
  console.log('decoderawtransaction -> ',
      JSON.stringify(ret, null, '  '));
};

const getbalanceFunc = async function(cmd, words, wallet) {
  let minimumConf = 1;
  if (words.length > 1) {
    minimumConf = parseInt(words[1]);
  }
  const ret = await wallet.getBalance(minimumConf);
  console.log('getbalance -> ', ret);
};

const listunspentFunc = async function(cmd, words, wallet) {
  let address = '';
  let asset = '';
  let path = '';
  let minimumConf = 1;
  let maximumConf = 999999999999;
  if (words.length > 1) {
    minimumConf = parseInt(words[1]);
  }
  if (words.length > 2) {
    maximumConf = parseInt(words[2]);
  }
  if (words.length > 3 && (words[3] != '\'\'') && (words[3] != '""')) {
    address = words[3];
  }
  if (words.length > 4 && (words[4] != '\'\'') && (words[4] != '""')) {
    path = words[4];
  }
  if (words.length > 5 && (words[5] != '\'\'') && (words[5] != '""')) {
    asset = words[5];
  }
  const ret = await wallet.listUnspent(
      minimumConf, maximumConf, address, path, asset);
  console.log('listunspent -> ', ret);
};

const getblockcountFunc = async function(cmd, words, wallet, walletMgr) {
  const ret = await walletMgr.getBlockCount(wallet.getTarget());
  console.log('getblockcount -> ', ret);
};

const getmempoolutxocountFunc = async function(cmd, words, wallet) {
  const ret = await wallet.getMempoolUtxoCount();
  console.log('getmempoolutxocount -> ', ret);
};

const forceupdateutxoFunc = async function(cmd, words, wallet) {
  const ret = await wallet.forceUpdateUtxoData();
  console.log('forceupdateutxo -> ', ret);
};

const consoleFunctionList = {
  'exit': {
    finish: true,
  },
  'quit': {
    finish: true,
  },
  'generatefund': {
    execFunction: generatefundFunc,
    parameter: '<amount>',
  },
  'generate': {
    execFunction: generateFunc,
    parameter: '<count> <address>',
  },
  'sendtoaddress': {
    execFunction: sendtoaddressFunc,
    parameter: '[<address> <amount> [<feeAsset> <targetConfirmation>]',
  },
  'getnewaddress': {
    execFunction: getnewaddressFunc,
    parameter: '[<addressType> <label>]',
  },
  'getscriptaddress': {
    execFunction: getscriptaddressFunc,
    parameter: 'scriptHex [<addressType> <label>]',
  },
  'dumpprivkey': {
    execFunction: dumpprivkeyFunc,
    parameter: '[<address> <pubkey>]',
  },
  'getaddressinfo': {
    execFunction: getaddressinfoFunc,
    parameter: '<address>',
  },
  'dumpaddresses': {
    execFunction: dumpaddressesFunc,
  },
  'dumpaddressesbylabel': {
    execFunction: dumpaddressesbylabelFunc,
    parameter: '<label>',
  },
  'decoderawtransaction': {
    execFunction: decoderawtransactionFunc,
    parameter: '<txHex>',
  },
  'dectx': {
    execFunction: decoderawtransactionFunc,
    parameter: '<txHex>',
  },
  'getbalance': {
    execFunction: getbalanceFunc,
    parameter: '[<minimumConf>]',
  },
  'listunspent': {
    execFunction: listunspentFunc,
    parameter: '[<minimumConf> <maximumConf> <address> <hdPath> <asset>]',
  },
  'getblockcount': {
    execFunction: getblockcountFunc,
  },
  'getmempoolutxocount': {
    execFunction: getmempoolutxocountFunc,
  },
  'forceupdateutxo': {
    execFunction: forceupdateutxoFunc,
  },
};

const helpFunc = function() {
  console.log(' command:');
  Object.keys(consoleFunctionList).forEach((key) =>
    console.log(`  - ${key} ` + (('parameter' in consoleFunctionList[key]) ? `: ${consoleFunctionList[key].parameter}` : '') ),
  );
};

const callWalletConsole = async function(consoleName, wallet, walletMgr) {
  console.log('');
  let cmd = await readInput(`${consoleName}:> `);
  cmd = cmd.trim();
  const words = cmd.split(' ');
  if (words[0] in consoleFunctionList) {
    const cmdWord = words[0];
    const data = consoleFunctionList[cmdWord];
    if (('finish' in data) && (data.finish === true)) {
      console.log(`${cmd}`);
      walletMgr.shutdown();
      return false;
    }
    await data.execFunction(cmd, words, wallet, walletMgr);
    return true;
  } else {
    console.log(`Illegal command: ${cmd}`);
    helpFunc();
  }
  return true;
};

// call node wallet-console.js createwallet -n regtest -c ./docker/bitcoin.conf -u User -i 1 -s '0e09fbdd00e575b654d480ae979f24da45ef4dee645c7dc2e3b30b2e093d38dda0202357754cc856f8920b8e31dd02e9d34f6a2b20dc825c6ba90f90009085e1' -d "./testdata/"

const help = function() {
  console.log(' Usage: node wallet-console createwallet -n <network> -n <network> -c <configFile> -i <userIndex> -s <seed> [-u <userPrefix>] [-d <dataDirPath>] [-t <targetName>]');
  console.log('        node wallet-console help');
  console.log('');
  console.log(' option:');
  console.log('  -n   network name. (mainnet, testnet, regtest, liquidv1, elementsregtest)');
  console.log('       (ex. -n mainnet )');
  console.log('  -c   bitcoin.conf or elements.conf file path.');
  console.log('  -u   wallet usename prefix.');
  console.log('  -i   wallet user index. (0 - )');
  console.log('  -s   wallet seed.');
  console.log('  -d   data directory path.');
  console.log('  -t   target name. (bitcoin or elements)');
};

const main = async function() {
  try {
    if (process.argv.length <= 2) {
      console.log('parameter error.');
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
    } else if ((process.argv[2] === 'createwallet') || (process.argv[2] === 'getwallet')) {
      let network = '';
      let confFile = '';
      let userPrefix = 'user';
      let userIndex = -1;
      let seed = '';
      let datadir = './data';
      let target = 'bitcoin';
      for (let i = 3; i < process.argv.length; i++) {
        if ((process.argv[i] === '-n') &&
            ((i + 1) < process.argv.length)) {
          network = process.argv[i + 1];
        } else if ((process.argv[i] === '-c') &&
            ((i + 1) < process.argv.length)) {
          confFile = process.argv[i + 1];
        } else if ((process.argv[i] === '-u') &&
            ((i + 1) < process.argv.length)) {
          userPrefix = process.argv[i + 1];
        } else if ((process.argv[i] === '-i') &&
            ((i + 1) < process.argv.length)) {
          userIndex = parseInt(process.argv[i + 1]);
        } else if ((process.argv[i] === '-s') &&
            ((i + 1) < process.argv.length)) {
          seed = process.argv[i + 1];
        } else if ((process.argv[i] === '-d') &&
            ((i + 1) < process.argv.length)) {
          datadir = process.argv[i + 1];
        } else if ((process.argv[i] === '-t') &&
            ((i + 1) < process.argv.length)) {
          target = process.argv[i + 1];
        }
      }
      // -n regtest -c ./docker/bitcoin.conf -u User -i 1 -s 'xxxxxxx' -d '/fullpath/'

      let dir = datadir;
      if (datadir.startsWith('./') || datadir.startsWith('.\\')) {
        dir = __dirname + '/../' + datadir.substr(1);
      }
      let configFile = confFile;
      if (configFile.startsWith('./') || configFile.startsWith('.\\')) {
        configFile = __dirname + '/../' + configFile.substr(1);
      }
      const walletMgr = new WalletManager(configFile, dir, network,
          cfdjsWasm.getCfd());
      await setMasterPrivkey(seed, '', '', '', -1);
      const inMemoryDB = false;
      const wallet = await walletMgr.createWallet(
          userIndex, userPrefix, target, inMemoryDB);
      const consoleName = userPrefix + userIndex;
      const isConnect = await walletMgr.initialize(target);
      if (isConnect === false) {
        console.log('RPC connect failed.');
        throw Error('RPC connect failed.');
      }
      let isLoop = true;
      while (isLoop) { // split function
        try {
          isLoop = await callWalletConsole(consoleName, wallet, walletMgr);
        } catch (walletError) {
          console.log('error: ', walletError);
          // console.log('  wallet -> ', wallet);
        }
      }
    } else if (process.argv[2] === 'help') {
      help();
    } else {
      console.log('parameter error.');
      help();
    }

    // cleanup console
    try {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
    } catch (err) {
      console.log(err);
    }
  } catch (error) {
    console.log(error);
  }
};

cfdjsWasm.addInitializedListener(main);

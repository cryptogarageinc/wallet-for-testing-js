const WalletManager = require('./walletManager.js');

function readInput(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    readline.question(question, (answer) => {
      resolve(answer);
      readline.close();
    });
  });
}

// call node wallet-console.js createwallet -n regtest -c ./docker/bitcoin.conf -u User -i 1 -s '0e09fbdd00e575b654d480ae979f24da45ef4dee645c7dc2e3b30b2e093d38dda0202357754cc856f8920b8e31dd02e9d34f6a2b20dc825c6ba90f90009085e1' -d "./testdata/"

(async function main() {
  try {
    if (process.argv.length <= 2) {
      console.log('parameter error.');
      for (let i = 0; i < process.argv.length; i++) {
        console.log('argv[' + i + '] = ' + process.argv[i]);
      }
      help();
    } else if ((process.argv[2] === 'createwallet') || (process.argv[2] === 'getwallet')) {
      if (process.argv.length <= 10) {

      }
      let network = '';
      let confFile = '';
      let userPrefix = '';
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
      const walletMgr = new WalletManager(configFile, dir, network, seed);
      const wallet = await walletMgr.createWallet(
          userIndex, userPrefix, target);
      const consoleName = userPrefix + userIndex;
      const isConnect = await walletMgr.initialize(target);
      if (isConnect === false) {
        console.log('RPC connect failed.');
        throw Error('RPC connect failed.');
      }
      while (true) { // split function
        try {
          console.log('');
          let cmd = await readInput(`${consoleName}:> `);
          cmd = cmd.trim();
          const words = cmd.split(' ');
          if ((cmd === 'exit') || (cmd === 'quit')) {
            console.log(`${cmd}`);
            walletMgr.shutdown();
            break;
          } else if (words[0] === 'generatefund') {
            let amount = 100000000;
            if (words.length > 1) {
              amount = parseInt(words[1]);
            }
            const ret = await wallet.generateFund(amount);
            console.log('generateFund -> ', ret);
          } else if (words[0] === 'generate') {
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
          } else if (words[0] === 'sendtoaddress') {
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
          } else if (words[0] === 'getnewaddress') {
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
          } else if (words[0] === 'getscriptaddress') {
            let addrType = 'p2wpkh';
            let label = '';
            let script = '';
            if (words.length > 1) {
              addrType = words[1];
            }
            if (words.length > 2) {
              label = words[2];
            }
            if (words.length > 3) {
              script = words[3];
            }
            const ret = await wallet.getScriptAddress(script, addrType, label);
            console.log('getscriptaddress -> ', ret);
          } else if (words[0] === 'dumpprivkey') {
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
          } else if (words[0] === 'getaddressinfo') {
            const ret = await wallet.getAddressInfo(words[1]);
            console.log('getaddressinfo -> ', ret);
          } else if (words[0] === 'dumpaddresses') {
            const ret = await wallet.getAddresses();
            console.log('dumpaddresses -> ', ret);
          } else if (words[0] === 'dumpaddressesbylabel') {
            const ret = await wallet.getAddressesByLabel(words[1]);
            console.log('dumpaddresses -> ', ret);
          } else if ((words[0] === 'decoderawtransaction') ||
              (words[0] === 'dectx')) {
            const ret = await wallet.decodeRawTransaction(words[1]);
            console.log('decoderawtransaction -> ',
                JSON.stringify(ret, null, '  '));
          } else if (words[0] === 'getbalance') {
            let minimumConf = 1;
            if (words.length > 1) {
              minimumConf = parseInt(words[1]);
            }
            const ret = await wallet.getBalance(minimumConf);
            console.log('getbalance -> ', ret);
          } else if (words[0] === 'listunspent') {
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
          } else if (words[0] === 'getmempoolutxocount') {
            const ret = await wallet.getMempoolUtxoCount();
            console.log('getmempoolutxocount -> ', ret);
          } else if (words[0] === 'forceupdateutxo') {
            const ret = await wallet.forceUpdateUtxoData();
            console.log('forceupdateutxo -> ', ret);
          } else if (words[0] === 'getblockcount') {
            const ret = await walletMgr.getBlockCount(target);
            console.log('getblockcount -> ', ret);
          } else {
            console.log(`Illegal command: ${cmd}`);
            // FIXME command list
          }
        } catch (walletError) {
          console.log('error: ', walletError);
          // console.log('  wallet -> ', wallet);
        }
      }
    } else {
      console.log('parameter error.');
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
})();

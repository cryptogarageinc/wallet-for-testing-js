// UTF-8
'use strict';
const cfdjsWasm = require('cfd-js-wasm');
const fs = require('fs');

let cfdjs;
// const toSatoshiAmount  = async function(amount) {
//   return Number(amount * 100000000);
// };

// -----------------------------------------------------------------------------
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

const GenerateKeyPair = async function(network = 'regtest', wif = true, isCompressed = true) {
  const result = await cfdjs.CreateKeyPair({
    wif: wif,
    network: network,
    isCompressed: isCompressed,
  });
  return {pubkey: result.pubkey, privkey: result.privkey};
};

/*
const CreatePubkeyAddress  = async function(pubkey, network = 'regtest', hashType = 'p2wpkh') {
  const result = await cfdjs.CreateAddress({
    'keyData': {
      'hex': pubkey,
      'type': 'pubkey',
    },
    'network': network,
    'isElements': true,
    'hashType': hashType,
  });
  return result.address;
};

const CreateConfidentialPubkeyAddress  = async function(pubkey, confidentialKey, network = 'regtest', hashType = 'p2wpkh') {
  const addr = await CreatePubkeyAddress(pubkey, network, hashType);
  const result = await cfdjs.GetConfidentialAddress({
    'unblindedAddress': addr,
    'key': confidentialKey,
  });
  return result.confidentialAddress;
};
*/

// eslint-disable-next-line valid-jsdoc
/**
 * check string value.
 * @param {string} arg argument.
 * @param {string} matchText match text.
 * @param {string} alias alias.
 * @return true/false match or not.
 */
function checkString(arg, matchText, alias = undefined) {
  if (arg == matchText) {
    return true;
  } else if ((alias) && (arg == alias)) {
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
/**
 * convert string to boolean.
 * @param {string} boolStr boolean string.
 * @return {boolean} boolean value.
 */
function strToBool(boolStr) {
  return (boolStr == 'true') ? true : false;
}
// const toBigInt  = async function(n) {
//   let s = bigInt(n).toString(16);
//   while (s.length < 16) s = '0' + s;
//   return new Uint8Array(Buffer.from(s, 'hex'));
// };

// -----------------------------------------------------------------------------

const generatekey = async function() {
  let network = 'regtest';
  let wif = true;
  let isCompressed = true;
  if (process.argv.length > 3) network = process.argv[3];
  if (process.argv.length > 4) wif = strToBool(process.argv[4]);
  if (process.argv.length > 5) isCompressed = strToBool(process.argv[5]);
  const result = await GenerateKeyPair(network, wif, isCompressed);
  console.log(result);
};

const getcommitment = async function() {
  let amountStr = '0';
  if (process.argv.length < 4) {
    amountStr = await readInput('amount > ');
  } else {
    amountStr = process.argv[3];
  }
  const amount = parseInt(amountStr);

  let amountBlinder = '';
  if (process.argv.length < 5) {
    amountBlinder = await readInput('amountBlinder > ');
  } else {
    amountBlinder = process.argv[4];
  }

  let assetBlinder = '';
  if (process.argv.length < 6) {
    assetBlinder = await readInput('assetBlinder > ');
  } else {
    assetBlinder = process.argv[5];
  }

  let asset = '';
  if (process.argv.length < 7) {
    asset = await readInput('asset > ');
  } else {
    asset = process.argv[6];
  }

  const result = await cfdjs.GetCommitment({
    amount: amount,
    asset: asset,
    assetBlindFactor: assetBlinder,
    blindFactor: amountBlinder,
  });
  console.log(result);
};

const decodedersignature = async function() {
  let signature = '';
  if (process.argv.length < 4) {
    signature = await readInput('signature > ');
  } else {
    signature = process.argv[3];
  }

  let sighashType = 'all';
  if (process.argv.length >= 5) {
    sighashType = process.argv[4];
  }

  let sighashAnyoneCanPay = false;
  if (process.argv.length >= 6) {
    sighashAnyoneCanPay = (process.argv[5] === 'true');
  }

  const result = await cfdjs.DecodeDerSignatureToRaw({
    signature: signature,
    sighashType: sighashType,
    sighashAnyoneCanPay: sighashAnyoneCanPay,
  });
  console.log(result);
};

const decoderawtransactionFromFile = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network(mainnet,regtest,testnet) > ');
  } else {
    network = process.argv[3];
  }
  if (network === '') network = 'regtest';

  let filePath = '';
  if (process.argv.length < 5) {
    filePath = await readInput('filePath > ');
  } else {
    filePath = process.argv[4];
  }

  let fullDump = false;
  if (process.argv.length < 6) {
    // do nothing
  } else {
    fullDump = (process.argv[5] === 'true');
  }

  let decTx = '';
  const tx = fs.readFileSync(filePath, 'utf-8').toString().trim();
  try {
    const liquidNetwork = ((network === 'regtest') || (network === 'testnet')) ?
        'regtest' : 'liquidv1';
    decTx = await cfdjs.ElementsDecodeRawTransaction({
      hex: tx,
      mainchainNetwork: network,
      network: liquidNetwork,
      fullDump: fullDump,
    });
    console.log(JSON.stringify(decTx, null, 2));
    return;
  } catch (err) {
  }
  try {
    decTx = await cfdjs.DecodeRawTransaction({
      hex: tx,
      network: network,
    });
    console.log(JSON.stringify(decTx, null, 2));
  } catch (err) {
    console.log(err);
    console.log(`tx = ${tx}`);
  }
};

const decoderawtransaction = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network(mainnet,regtest,testnet) > ');
  } else {
    network = process.argv[3];
  }
  if (network === '') network = 'regtest';

  let tx = '';
  if (process.argv.length < 5) {
    const workTx = await readInput('tx > ');
    tx += workTx.trim();
  } else {
    tx = process.argv[4];
  }
  let decTx = '';
  try {
    const liquidNetwork = ((network === 'regtest') || (network === 'testnet')) ?
        'regtest' : 'liquidv1';
    decTx = await cfdjs.ElementsDecodeRawTransaction({
      hex: tx,
      mainchainNetwork: network,
      network: liquidNetwork,
    });
    console.log(JSON.stringify(decTx, null, 2));
    return;
  } catch (err) {
  }
  try {
    decTx = await cfdjs.DecodeRawTransaction({
      hex: tx,
      network: network,
    });
    console.log(JSON.stringify(decTx, null, 2));
  } catch (err) {
    console.log(err);
    console.log(`tx = ${tx}`);
  }
};

const decodesignature = async function() {
  let signature;
  if (process.argv.length < 5) {
    signature = await readInput('signature > ');
  } else {
    signature = process.argv[4];
  }
  const sig = await cfdjs.DecodeDerSignatureToRaw({
    signature: signature,
  }).signature;
  console.log(sig);
};

const verifysignature = async function() {
  // parameter: '<tx(or filename)> <txid> <vout> <signature> <pubkey> <script> <hashType> <value>',
  let tx = '';
  if (process.argv.length < 4) {
    const workTx = await readInput('tx > ');
    tx += workTx.trim();
  } else {
    tx = process.argv[3];
  }

  let txid;
  if (process.argv.length < 5) {
    txid = await readInput('txid > ');
  } else {
    txid = process.argv[4];
  }

  let vout;
  if (process.argv.length < 6) {
    vout = await readInput('vout > ');
  } else {
    vout = process.argv[5];
  }

  let signature;
  if (process.argv.length < 7) {
    signature = await readInput('signature > ');
  } else {
    signature = process.argv[6];
  }

  let pubkey;
  if (process.argv.length < 8) {
    pubkey = await readInput('pubkey > ');
  } else {
    pubkey = process.argv[7];
  }

  let script;
  if (process.argv.length < 9) {
    script = await readInput('script > ');
  } else {
    script = process.argv[8];
  }

  let hashType;
  if (process.argv.length < 10) {
    hashType = await readInput('hashType > ');
  } else {
    hashType = process.argv[9];
  }
  if (hashType === 'p2sh-p2wpkh') hashType = 'p2wpkh';
  if (hashType === 'p2sh-p2wsh') hashType = 'p2wsh';

  let value;
  if (process.argv.length < 11) {
    value = await readInput('value > ');
  } else {
    value = process.argv[10];
  }

  if (hashType.indexOf('sh') === -1) {
    script = '';
  }

  let isElements = false;
  let decTx = '';
  try {
    decTx = await cfdjs.ElementsDecodeRawTransaction({
      hex: tx,
      mainchainNetwork: 'mainnet',
      network: 'liquidv1',
    });
    isElements = true;
  } catch (err) {
  }
  if (!decTx) {
    try {
      decTx = await cfdjs.DecodeRawTransaction({
        hex: tx,
        network: network,
      });
    } catch (err) {
    }
  }
  if (!decTx) {
    try {
      tx = fs.readFileSync(tx, 'utf-8').toString().trim();
      try {
        decTx = await cfdjs.ElementsDecodeRawTransaction({
          hex: tx,
          mainchainNetwork: 'mainnet',
          network: 'liquidv1',
        });
        isElements = true;
      } catch (err2) {
        decTx = await cfdjs.DecodeRawTransaction({
          hex: tx,
          network: network,
        });
      }
    } catch (err) {
    }
  }
  if (!decTx) {
    console.log('read tx fail.');
  }
  let sig = signature;
  if (sig.length >= 136) {
    sig = await cfdjs.DecodeDerSignatureToRaw({
      signature: signature,
    }).signature;
  }
  const amount = (isElements && (value.length === 66)) ? 0 : parseInt(value);
  const valuecommitment = (isElements && (value.length === 66)) ? value : '';
  const verifyInput = {
    tx: tx,
    isElements: isElements,
    txin: {
      txid: txid,
      vout: parseInt(vout),
      signature: sig,
      pubkey: pubkey,
      redeemScript: script,
      amount: amount,
      confidentialValueCommitment: valuecommitment,
      hashType: hashType,
    },
  };
  try {
    await cfdjs.VerifySignature(verifyInput);
    console.log('verify success.');
  } catch (err) {
    console.log('verify fail.');
    console.log(err);
  }
};

const verifysign = async function() {
  // parameter: '<tx(or filename)> <txid;vout;value;descriptor> ...',
  let tx = '';
  if (process.argv.length < 4) {
    const workTx = await readInput('tx > ');
    tx += workTx.trim();
  } else {
    tx = process.argv[3];
  }

  const targetList = [];
  let targetData;
  if (process.argv.length < 5) {
    targetData = await readInput('targetData > ');
  } else {
    targetData = process.argv[4];
  }
  targetList.push(targetData);

  if (process.argv.length >= 6) {
    for (let idx=5; idx<process.argv.length; ++idx) {
      targetData = process.argv[5];
      targetList.push(targetData);
    }
  }

  let isElements = false;
  let decTx = '';
  try {
    decTx = await cfdjs.ElementsDecodeRawTransaction({
      hex: tx,
      mainchainNetwork: 'mainnet',
      network: 'liquidv1',
    });
    isElements = true;
  } catch (err) {
  }
  if (!decTx) {
    try {
      decTx = await cfdjs.DecodeRawTransaction({
        hex: tx,
        network: network,
      });
    } catch (err) {
    }
  }
  if (!decTx) {
    try {
      tx = fs.readFileSync(tx, 'utf-8').toString().trim();
      try {
        decTx = await cfdjs.ElementsDecodeRawTransaction({
          hex: tx,
          mainchainNetwork: 'mainnet',
          network: 'liquidv1',
        });
        isElements = true;
      } catch (err2) {
        decTx = await cfdjs.DecodeRawTransaction({
          hex: tx,
          network: network,
        });
      }
    } catch (err) {
    }
  }
  if (!decTx) {
    console.log('read tx fail.');
    return;
  }

  const txins = [];
  for (const data of targetList) {
    const arr = data.split(';');
    if (arr.length < 4) {
      console.log('low item. usage: <txid;vout;value;descriptor>');
      return;
    }
    const txid = arr[0];
    const vout = parseInt(arr[1]);
    const value = arr[2];
    const amount = (isElements && (value.length === 66)) ? 0 : parseInt(value);
    const valuecommitment = (isElements && (value.length === 66)) ? value : '';
    let descriptor = '';
    let address = '';
    if (arr[3].indexOf('(') == -1) {
      address = arr[3];
    } else {
      await cfdjs.ParseDescriptor({
        isElements: isElements,
        descriptor: arr[3],
        network: (isElements) ? 'liquidv1' : 'mainnet',
      });
      descriptor = arr[3];
    }
    txins.push({
      txid: txid,
      vout: vout,
      amount: amount,
      address: address,
      confidentialValueCommitment: valuecommitment,
      descriptor: descriptor,
    });
  }

  try {
    const verifyInput = {
      tx: tx,
      isElements: isElements,
      txins: txins,
    };
    console.log('verifyInput: ', verifyInput.txins);
    const result = await cfdjs.VerifySign(verifyInput);
    if (result.success) {
      console.log('VerifySign success.');
    } else {
      console.log('VerifySign fail:', JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.log(e);
  }
};

const getaddressinfo = async function() {
  let address = '';
  if (process.argv.length < 4) {
    address = await readInput('address > ');
  } else {
    address = process.argv[3];
  }
  let confidentialKey = '';
  let unblindedAddress = '';
  try {
    const ckey = await cfdjs.GetUnblindedAddress({
      confidentialAddress: address,
    });
    confidentialKey = ckey.confidentialKey;
    address = ckey.unblindedAddress;
    unblindedAddress = ckey.unblindedAddress;
  } catch (err) {
    // console.log(err);
  }

  try {
    const addrinfo = await cfdjs.GetAddressInfo({
      address: address,
      isElements: true,
    });
    if (confidentialKey !== '') {
      addrinfo['confidential_key'] = confidentialKey;
      addrinfo['address'] = unblindedAddress;
    }
    console.log(JSON.stringify(addrinfo, null, 2));
    return;
  } catch (err) {
    // console.log(err);
  }

  const addrinfo = await cfdjs.GetAddressInfo({
    address: address,
    isElements: false,
  });
  console.log(JSON.stringify(addrinfo, null, 2));
};

const decodescript = async function() {
  let script = '';
  if (process.argv.length < 4) {
    script = await readInput('script > ');
  } else {
    script = process.argv[3];
  }
  let dumpString = false;
  if (process.argv.length >= 5) {
    dumpString = (process.argv[4] === 'true');
  }

  const scriptinfo = await cfdjs.ParseScript({
    script: script,
  });
  if (dumpString) {
    const str = addrinfo.scriptItems.toString();
    console.log('asm:', str.replace(/,/gi, ' '));
  } else {
    console.log(JSON.stringify(scriptinfo, null, 2));
  }
};

const convertscript = async function() {
  let script = '';
  if (process.argv.length < 4) {
    script = await readInput('script > ');
  } else if (process.argv.length == 4) {
    script = process.argv[3];
  } else {
    for (let index = 3; index < process.argv.length; ++index) {
      if (index > 3) {
        script += ' ';
      }
      script += process.argv[index];
    }
  }

  const items = script.split(' ');
  const scriptinfo = await cfdjs.CreateScript({
    items: items,
  });
  console.log('\n', 'script: ', scriptinfo.hex);
};

const parsedescriptor = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  let isElements = false;
  if ((network === 'liquidregtest') || (network === 'elementsregtest')) {
    network = 'regtest';
    isElements = true;
  } else if (network === 'liquidv1') {
    isElements = true;
  } else if (network === '') {
    network = 'regtest';
  }

  let descriptor = '';
  if (process.argv.length < 5) {
    descriptor = await readInput('descriptor > ');
  } else {
    descriptor = process.argv[4];
  }
  let path = '';
  if (process.argv.length < 6) {
    if (descriptor.indexOf('*') >= 0) {
      path = await readInput('bip32DerivationPath > ');
    }
  } else {
    path = process.argv[5];
  }

  const descriptorInfo = await cfdjs.ParseDescriptor({
    isElements: isElements,
    descriptor: descriptor,
    network: network,
    bip32DerivationPath: path,
  });

  try {
    let typeName = 'redeem_script';
    let value = '';
    let hashType = '';
    if ((descriptorInfo.hashType === 'p2pkh') || (descriptorInfo.hashType === 'p2wpkh')) {
      value = descriptorInfo.scripts[0].key;
      typeName = 'pubkey';
      hashType = descriptorInfo.hashType;
    } else {
      value = descriptorInfo.redeemScript;
      if (descriptorInfo.hashType === 'p2wsh') {
        hashType = descriptorInfo.hashType;
      } else {
        hashType = 'p2sh';
      }
    }
    const addrInfo = await cfdjs.CreateAddress({
      isElements: isElements,
      keyData: {
        hex: value,
        type: typeName,
      },
      network: network,
      hashType: hashType,
    });
    descriptorInfo.address = addrInfo.address;
  } catch (e) {
    // do nothing
  }
  console.log(JSON.stringify(descriptorInfo, null, 2));
};

const parsedescriptors = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  let isElements = false;
  if ((network === 'liquidregtest') || (network === 'elementsregtest')) {
    network = 'regtest';
    isElements = true;
  } else if (network === 'liquidv1') {
    isElements = true;
  } else if (network === '') {
    network = 'regtest';
  }

  let descriptor = '';
  if (process.argv.length < 5) {
    descriptor = await readInput('descriptor > ');
  } else {
    descriptor = process.argv[4];
  }
  console.log(descriptor);
  // if ((path === '\'\'') || (path === '""'))

  let minValue = '';
  if (process.argv.length < 6) {
    minValue = await readInput('minValue > ');
  } else {
    minValue = process.argv[5];
  }
  minValue = Number(minValue);

  let maxValue = '';
  if (process.argv.length < 7) {
    maxValue = await readInput('maxValue > ');
  } else {
    maxValue = process.argv[6];
  }
  maxValue = Number(maxValue);

  let viewtype = 'all';
  if (process.argv.length < 8) {
    // do nothing
  } else {
    viewtype = process.argv[7];
  }

  const descriptors = [];
  for (let index = minValue; index <= maxValue; ++index) {
    const descriptorInfo = await cfdjs.ParseDescriptor({
      isElements: isElements,
      descriptor: descriptor,
      network: network,
      bip32DerivationPath: `${index}`,
    });
    if (viewtype === 'address') {
      descriptors.push(descriptorInfo.address);
    } else if (viewtype === 'lockingScript') {
      descriptors.push(descriptorInfo.lockingScript);
    } else {
      descriptors.push(descriptorInfo);
    }
  }
  console.log(JSON.stringify(descriptors, null, 2));
};

const generatemnemonic = async function() {
  let lang;
  if (process.argv.length < 4) {
    // lang = await readInput('language(en es fr it jp zhs zht) > ');
    console.log('language: en');
  } else {
    lang = process.argv[3];
  }
  if (!lang) lang = 'en';

  let inputEntropy = '';
  if (process.argv.length >= 5) {
    inputEntropy = process.argv[4];
  }

  for (let idx = 0; idx < 100; ++idx) {
    try {
      let entropy = inputEntropy;
      if (!inputEntropy) {
        const keypair = await cfdjs.CreateKeyPair({wif: false});
        entropy = keypair.privkey;
      }

      const result = await cfdjs.ConvertEntropyToMnemonic({
        entropy: entropy,
        language: lang,
      });
      const mnemonic = result.mnemonic.join(' ');
      console.log(`"${mnemonic}"`);

      if (!inputEntropy) {
        const seed = await cfdjs.ConvertMnemonicToSeed({
          mnemonic: result.mnemonic,
          passphrase: '',
          language: lang,
        });
        console.log(`entropy: ${seed.entropy}`);
      }
      return;
    } catch (e) {
      if ((idx + 1) == 100) {
        console.log(e);
      }
    }
  }
};

const getKeyInfo = async function(extkey, network, isCompressKey) {
  const extkeyInfo = await cfdjs.GetExtkeyInfo({
    extkey: extkey,
  });

  let privkey = undefined;
  try {
    privkey = await cfdjs.GetPrivkeyFromExtkey({
      extkey: extkey,
      network: network,
      wif: true,
      isCompressed: isCompressKey,
    });
    const privkeyHex = await cfdjs.GetPrivkeyFromExtkey({
      extkey: extkey,
      network: network,
      wif: false,
      isCompressed: isCompressKey,
    });
    privkey['hex'] = privkeyHex.privkey;
  } catch (err) {
  }

  let pubkey = undefined;
  try {
    if (privkey !== undefined) {
      pubkey = await cfdjs.GetPubkeyFromPrivkey({
        privkey: privkey['hex'],
        isCompressed: isCompressKey,
      });
    } else {
      pubkey = await cfdjs.GetPubkeyFromExtkey({
        extkey: extkey,
        network: network,
      });
    }
  } catch (err) {
  }

  if (privkey !== undefined) {
    extkeyInfo['extpubkey'] = await cfdjs.CreateExtPubkey({
      extkey: extkey,
      network: network,
    }).extkey;
    extkeyInfo['privkey'] = privkey;
  }
  if (pubkey !== undefined) {
    extkeyInfo['pubkey'] = pubkey.pubkey;
  }
  return extkeyInfo;
};

const mnemonictoseed = async function() {
  let mnemonic = '';
  if (process.argv.length < 4) {
    mnemonic = await readInput('mnemonic > ');
  } else {
    mnemonic = process.argv[3];
  }
  let passphrase = '';
  if (process.argv.length < 5) {
    passphrase = await readInput('passphrase > ');
  } else {
    passphrase = process.argv[4];
  }

  let network = '';
  if (process.argv.length >= 6) {
    network = process.argv[5];
  }
  let path = '';
  if (process.argv.length >= 7) {
    path = process.argv[6];
  }
  if ((path.length > 2) && (path.charAt(0) === '\'') &&
      (path.charAt(path.length - 1) === '\'')) {
    path = path.substring(1, path.length - 1);
  }

  const mnemonicItems = mnemonic.split(' ');
  console.log(`mnemonic = `, mnemonicItems);
  console.log(`passphrase = [${passphrase}]`);

  const result = await cfdjs.ConvertMnemonicToSeed({
    mnemonic: mnemonicItems,
    passphrase: passphrase,
    // eslint-disable-next-line @typescript-eslint/camelcase
    strictCheck: true,
    language: 'en',
  });
  console.log(`seed = ${result.seed}`);

  if (network) {
    // seed
    const extkeyInfo = await cfdjs.CreateExtkeyFromSeed({
      seed: result.seed,
      network: network,
      extkeyType: 'extPrivkey',
    });
    const basekey = extkeyInfo.extkey;

    let child = undefined;
    let parentFingerprint = '';
    if (path !== '') {
      try {
        child = await cfdjs.CreateExtkeyFromParentPath({
          extkey: basekey,
          network: network,
          extkeyType: 'extPrivkey',
          path: path,
        });
      } catch (err) {
        console.log(err);
        child = await cfdjs.CreateExtkeyFromParentPath({
          extkey: basekey,
          network: network,
          extkeyType: 'extPubkey',
          path: path,
        });
      }
      const tempChild = await cfdjs.CreateExtkeyFromParentPath({
        extkey: basekey,
        network: network,
        extkeyType: 'extPubkey',
        path: '0',
      });
      const keyInfo = await cfdjs.GetExtkeyInfo({
        extkey: tempChild.extkey,
      });
      parentFingerprint = keyInfo.fingerprint;
    }

    const dumpInfo = {};
    dumpInfo.key = (child !== undefined) ? child.extkey : basekey;
    const keyInfo = await getKeyInfo(dumpInfo.key, network, true);
    if (child !== undefined) {
      let splitPath = path;
      if (splitPath.startsWith('m/')) {
        splitPath = splitPath.substring(2);
      }
      dumpInfo.path = path;
      dumpInfo.keyOriginInfo = `[${parentFingerprint}/${splitPath}]`;
    } else {
      dumpInfo.path = 'm';
    }
    dumpInfo.info = keyInfo;
    console.log(JSON.stringify(dumpInfo, null, 2));
  }
};

const getprivkeyinfo = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  let isCompressKeyStr = 'true';
  if (process.argv.length < 5) {
    isCompressKeyStr = await readInput('isCompressed > ');
  } else {
    isCompressKeyStr = process.argv[4];
  }
  const isCompressed = (isCompressKeyStr !== 'false');
  let privkey = '';
  if (process.argv.length < 6) {
    privkey = await readInput('privkey > ');
  } else {
    privkey = process.argv[5];
  }

  const pubkey = await cfdjs.GetPubkeyFromPrivkey({
    privkey: privkey,
    isCompressed: isCompressed,
  });

  try {
    const privkeyData = await cfdjs.GetPrivkeyFromWif({
      wif: privkey,
    });
    privkeyData['wif'] = privkey;
    privkeyData['pubkey'] = pubkey.pubkey;
    console.log(privkeyData);
    return;
  } catch (err) {
  }

  const privkeyData = await cfdjs.GetPrivkeyWif({
    hex: privkey,
    network: network,
    isCompressed: isCompressed,
  });
  privkeyData['hex'] = privkey;
  privkeyData['pubkey'] = pubkey.pubkey;
  console.log(privkeyData);
};

const getextkeyinfo = async function() {
  let network = 'regtest';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  if (network === 'liquidv1') network = 'mainnet';
  let extkey = '';
  if (process.argv.length < 5) {
    extkey = await readInput('extkey > ');
  } else {
    extkey = process.argv[4];
  }

  let isCompressKeyStr = 'true';
  if (process.argv.length < 6) {
    // do nothing
  } else {
    isCompressKeyStr = process.argv[5];
  }
  const isCompressKey = (isCompressKeyStr !== 'false');

  const extkeyInfo = await getKeyInfo(extkey, network, isCompressKey);
  console.log(JSON.stringify(extkeyInfo, null, 2));
};

const createextkey = async function() {
  let basekey = '';
  if (process.argv.length < 4) {
    basekey = await readInput('extkey or seed > ');
  } else {
    basekey = process.argv[3];
  }
  let path = '';
  if (process.argv.length < 5) {
    path = await readInput('bip32DerivationPath > ');
  } else {
    path = process.argv[4];
  }
  if ((path === '\'\'') || (path === '""')) {
    path = '';
  }
  if ((path.length > 2) && (path.charAt(0) === '\'') && (path.charAt(path.length - 1) === '\'')) {
    path = path.substring(1, path.length - 1);
  }

  let network = 'regtest';
  let inputNetwork = 'regtest';
  let hasExtkey = false;
  try {
    const keyInfo = await cfdjs.GetExtkeyInfo({
      extkey: basekey,
    });
    hasExtkey = true;
    if ((keyInfo.version === '0488ade4') || (keyInfo.version === '0488b21e')) {
      network = 'mainnet';
    }
  } catch (err) {
    // do nothing
  }
  if (process.argv.length >= 6) {
    inputNetwork = process.argv[5];
    if (inputNetwork === '') inputNetwork = 'regtest';
  }

  if (hasExtkey) {
    if (process.argv.length < 6) {
      inputNetwork = network;
    }
  } else {
    if (process.argv.length < 6) {
      inputNetwork = await readInput('network > ');
    }
    if (inputNetwork === '') inputNetwork = 'regtest';
    network = inputNetwork;
  }

  if (!hasExtkey) {
    // seed
    const extkeyInfo = await cfdjs.CreateExtkeyFromSeed({
      seed: basekey,
      network: network,
      extkeyType: 'extPrivkey',
    });
    basekey = extkeyInfo.extkey;
  }

  let child = undefined;
  let parentFingerprint = '';
  if (path !== '') {
    try {
      child = await cfdjs.CreateExtkeyFromParentPath({
        extkey: basekey,
        network: network,
        extkeyType: 'extPrivkey',
        path: path,
      });
    } catch (err) {
      console.log(err);
      child = await cfdjs.CreateExtkeyFromParentPath({
        extkey: basekey,
        network: network,
        extkeyType: 'extPubkey',
        path: path,
      });
    }
    const tempChild = await cfdjs.CreateExtkeyFromParentPath({
      extkey: basekey,
      network: network,
      extkeyType: 'extPubkey',
      path: '0',
    });
    const keyInfo = await cfdjs.GetExtkeyInfo({
      extkey: tempChild.extkey,
    });
    parentFingerprint = keyInfo.fingerprint;
  } else if (network !== inputNetwork) {
    const keyInfo = await cfdjs.GetExtkeyInfo({
      extkey: basekey,
    });
    let keyType = 'extPubkey';
    let key = '';
    if ((keyInfo.version === '0488ade4') || (keyInfo.version === '04358394')) {
      // privkey
      keyType = 'extPrivkey';
      const privkeyRet = await cfdjs.GetPrivkeyFromExtkey({
        extkey: basekey,
        network: network,
        wif: false,
        isCompressed: true,
      });
      key = privkeyRet.privkey;
    } else {
      const pubkeyRet = await cfdjs.GetPubkeyFromExtkey({
        extkey: basekey,
        network: network,
      });
      key = pubkeyRet.pubkey;
    }
    const newExtkey = await cfdjs.CreateExtkey({
      network: inputNetwork,
      extkeyType: keyType,
      parentFingerprint: keyInfo.fingerprint,
      key: key,
      depth: keyInfo.depth,
      chainCode: keyInfo.chainCode,
      childNumber: keyInfo.childNumber,
    });
    basekey = newExtkey.extkey;
    network = inputNetwork;
  }

  const dumpInfo = {};
  if (child !== undefined) {
    let splitPath = path;
    if (splitPath.startsWith('m/')) {
      splitPath = splitPath.substring(2);
    }
    const keyInfo = await getKeyInfo(child.extkey, network, true);
    dumpInfo.key = child.extkey;
    dumpInfo.path = path;
    dumpInfo.keyOriginInfo = `[${parentFingerprint}/${splitPath}]`;
    dumpInfo.info = keyInfo;
    console.log(JSON.stringify(dumpInfo, null, 2));
  } else {
    const keyInfo = await getKeyInfo(basekey, network, true);
    dumpInfo.key = basekey;
    if (keyInfo.depth === 0) {
      dumpInfo.path = 'm';
    } else if (keyInfo.childNumber >= 0x80000000) {
      const diffVal = keyInfo.childNumber - 0x80000000;
      dumpInfo.path = `${diffVal}h`;
    } else {
      dumpInfo.path = `${keyInfo.childNumber}`;
    }
    dumpInfo.info = keyInfo;
    console.log(JSON.stringify(dumpInfo, null, 2));
  }
};

const checkextkey = async function() {
  let basekey = '';
  if (process.argv.length < 4) {
    basekey = await readInput('extkey > ');
  } else {
    basekey = process.argv[3];
  }
  let path = '';
  if (process.argv.length < 5) {
    path = await readInput('bip32DerivationPath > ');
  } else {
    path = process.argv[4];
  }
  if ((path === '\'\'') || (path === '""')) {
    path = '';
  }
  if ((path.length > 2) && (path.charAt(0) === '\'') && (path.charAt(path.length - 1) === '\'')) {
    path = path.substring(1, path.length - 1);
  }
  let childkey = '';
  if (process.argv.length < 6) {
    childkey = await readInput('child extkey > ');
  } else {
    childkey = process.argv[5];
  }
  let childPath = '';
  if (process.argv.length < 7) {
    childPath = await readInput('child bip32DerivationPath > ');
  } else {
    childPath = process.argv[6];
  }
  if ((childPath === '\'\'') || (childPath === '""')) {
    childPath = '';
  }
  if ((childPath.length > 2) && (childPath.charAt(0) === '\'') &&
      (childPath.charAt(path.length - 1) === '\'')) {
    childPath = childPath.substring(1, childPath.length - 1);
  }
};

const estimatefee = async function() {
  let feeStr = '1.0';
  if (process.argv.length < 4) {
    feeStr = await readInput('feeRate > ');
  } else {
    feeStr = process.argv[3];
  }
  const feeRate = Number(feeStr);

  let feeAsset = '';
  if (process.argv.length < 5) {
    feeAsset = await readInput('feeAsset > ');
  } else {
    feeAsset = process.argv[4];
  }
  if ((feeAsset === '\'\'') || (feeAsset === '""')) {
    feeAsset = '';
  }

  let tx = '';
  if (process.argv.length < 6) {
    tx = await readInput('tx > ');
  } else {
    tx = process.argv[5];
  }

  try {
    const feeInfo = await cfdjs.EstimateFee({
      feeRate: feeRate,
      tx: tx,
      isElements: false,
    });
    console.log('feeInfo =', feeInfo);
    return;
  } catch (err) {
    // do nothing
  }

  const feeInfo = await cfdjs.EstimateFee({
    feeRate: feeRate,
    tx: tx,
    isElements: true,
    feeAsset: feeAsset,
    isBlind: true,
  });
  console.log('feeInfo =', feeInfo);
};

const getissuanceblindingkey = async function() {
// parameter: '<masterBlindingKey> <txid> <vout>',
  let masterBlindingKey = '0';
  if (process.argv.length < 4) {
    masterBlindingKey = await readInput('masterBlindingKey > ');
  } else {
    masterBlindingKey = process.argv[3];
  }
  let txid = '';
  if (process.argv.length < 5) {
    txid = await readInput('txid > ');
  } else {
    txid = process.argv[4];
  }
  let voutStr = '0';
  if (process.argv.length < 6) {
    voutStr = await readInput('vout > ');
  } else {
    voutStr = process.argv[5];
  }
  const vout = parseInt(voutStr);

  const keyInfo = await cfdjs.GetIssuanceBlindingKey({
    masterBlindingKey: masterBlindingKey,
    txid: txid,
    vout: vout,
  });
  console.log(JSON.stringify(keyInfo, null, 2));
};

const getblindingkey = async function() {
// parameter: '<masterBlindingKey> <address>',
  let masterBlindingKey = '0';
  if (process.argv.length < 4) {
    masterBlindingKey = await readInput('masterBlindingKey > ');
  } else {
    masterBlindingKey = process.argv[3];
  }
  let address = '';
  if (process.argv.length < 5) {
    address = await readInput('address > ');
  } else {
    address = process.argv[4];
  }

  const keyInfo = await cfdjs.GetDefaultBlindingKey({
    masterBlindingKey: masterBlindingKey,
    address: address,
  });
  const ctKey = await cfdjs.GetPubkeyFromPrivkey({
    privkey: keyInfo.blindingKey,
  });
  const addrInfo = await cfdjs.GetConfidentialAddress({
    unblindedAddress: address,
    key: ctKey.pubkey,
  });
  console.log(`blinding key    : ${keyInfo.blindingKey}`);
  console.log(`confidential key: ${ctKey.pubkey}`);
  console.log(`ct address      : ${addrInfo.confidentialAddress}`);
};

const getpubkeyaddress = async function() {
// parameter: '<addrtype(p2pkh,p2wpkh,p2sh-p2wpkh)> <network> <privkey or pubkey>',
  let addrtype = 'p2pkh';
  if (process.argv.length < 4) {
    addrtype = await readInput('addrtype > ');
  } else {
    addrtype = process.argv[3];
  }
  let network = 'regtest';
  if (process.argv.length < 5) {
    network = await readInput('network > ');
  } else {
    network = process.argv[4];
  }
  let isElements = false;
  if ((network === 'liquidregtest') || (network === 'elementsregtest')) {
    network = 'regtest';
    isElements = true;
  } else if (network === 'liquidv1') {
    isElements = true;
  } else if (network === '') {
    network = 'regtest';
  }

  let key = '';
  if (process.argv.length < 6) {
    key = await readInput('pubkey or privkey > ');
  } else {
    key = process.argv[5];
  }

  let pubkey = key;
  if (key.length === 33 || key.length === 66) {
    // pubkey
  } else {
    // privkey
    pubkey = await cfdjs.GetPubkeyFromPrivkey({
      privkey: key,
    }).pubkey;
  }

  const addrInfo = await cfdjs.CreateAddress({
    isElements: isElements,
    keyData: {
      hex: pubkey,
      type: 'pubkey',
    },
    network: network,
    hashType: addrtype,
  });
  console.log(JSON.stringify(addrInfo, null, 2));
};

const getscriptaddress = async function() {
// parameter: '<addrtype(p2pkh,p2wpkh,p2sh-p2wpkh)> <network> <privkey or pubkey>',
  let addrtype = 'p2pkh';
  if (process.argv.length < 4) {
    addrtype = await readInput('addrtype > ');
  } else {
    addrtype = process.argv[3];
  }
  let network = 'regtest';
  if (process.argv.length < 5) {
    network = await readInput('network > ');
  } else {
    network = process.argv[4];
  }
  let isElements = false;
  if ((network === 'liquidregtest') || (network === 'elementsregtest')) {
    network = 'regtest';
    isElements = true;
  } else if (network === 'liquidv1') {
    isElements = true;
  } else if (network === '') {
    network = 'regtest';
  }

  let script = '';
  if (process.argv.length < 6) {
    script = await readInput('script > ');
  } else {
    script = process.argv[5];
  }

  const addrInfo = await cfdjs.CreateAddress({
    isElements: isElements,
    keyData: {
      hex: script,
      type: 'redeem_script',
    },
    network: network,
    hashType: addrtype,
  });
  console.log(JSON.stringify(addrInfo, null, 2));
};

const getconfidentialaddress = async function() {
// parameter: '<address> <blinding key>',
  let address = '';
  if (process.argv.length < 4) {
    address = await readInput('address > ');
  } else {
    address = process.argv[3];
  }
  let key = '';
  if (process.argv.length < 5) {
    key = await readInput('confidentialKey or blindingKey > ');
  } else {
    key = process.argv[4];
  }
  let cKey = key;
  if (key.length === 33 || key.length === 66) {
    // pubkey
  } else {
    // privkey
    cKey = await cfdjs.GetPubkeyFromPrivkey({
      privkey: key,
    }).pubkey;
  }

  const ctAddrInfo = await cfdjs.GetConfidentialAddress({
    unblindedAddress: address,
    key: cKey,
  });
  console.log(JSON.stringify(ctAddrInfo, null, 2));
};

const generatekeywithmnemonic = async function() {
// parameter: '<network(mainnet,testnet)> <passphrase> <derivePath> <mnemonic ...>',
  let network = '';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  let passphrase = '';
  if (process.argv.length < 5) {
    passphrase = await readInput('passphrase > ');
  } else {
    passphrase = process.argv[4];
  }
  let derivePath = '';
  if (process.argv.length < 6) {
    derivePath = await readInput('derivePath > ');
  } else {
    derivePath = process.argv[5];
  }
  const derivePathList = [];
  if (derivePath.indexOf(',') >= 0) {
    const pathList = derivePath.split(',');
    for (const path of pathList) {
      derivePathList.push(path);
    }
  } else {
    derivePathList.push(derivePath);
  }

  const mnemonicList = [];
  let mnemonic = '';
  if (process.argv.length < 7) {
    mnemonic = await readInput('mnemonic > ');
    mnemonicList.push(mnemonic);
  } else {
    for (let idx = 6; idx < process.argv.length; ++idx) {
      mnemonic = process.argv[idx];
      mnemonicList.push(mnemonic);
    }
  }

  for (let idx = 0; idx < mnemonicList.length; ++idx) {
    mnemonic = mnemonicList[idx];
    const mnemonicItems = mnemonic.split(' ');

    const seed = await cfdjs.ConvertMnemonicToSeed({
      mnemonic: mnemonicItems,
      passphrase: passphrase,
      // eslint-disable-next-line @typescript-eslint/camelcase
      strict_check: true,
      language: 'en',
    });
    const masterxpriv = await cfdjs.CreateExtkeyFromSeed({
      seed: seed.seed,
      network: network,
      extkeyType: 'extPrivkey',
    });
    console.log(`mnemonic    = "${mnemonic}"`);
    // console.log(`seed        = ${seed.seed}`);
    // console.log(`masterXpriv = ${masterxpriv.extkey}`);
    if (derivePathList.length > 1) {
      for (const path of derivePathList) {
        const rootxpriv = await cfdjs.CreateExtkeyFromParentPath({
          extkey: masterxpriv.extkey,
          network: network,
          extkeyType: 'extPrivkey',
          path: path,
        });
        const rootxpub = await cfdjs.CreateExtPubkey({
          extkey: rootxpriv.extkey,
          network: network,
        });
        console.log(`Xpriv(${path}) = ${rootxpriv.extkey}`);
        console.log(`Xpub (${path}) = ${rootxpub.extkey}`);
      }
    } else {
      const rootxpriv = await cfdjs.CreateExtkeyFromParentPath({
        extkey: masterxpriv.extkey,
        network: network,
        extkeyType: 'extPrivkey',
        path: derivePath,
      });
      const rootxpub = await cfdjs.CreateExtPubkey({
        extkey: rootxpriv.extkey,
        network: network,
      });
      console.log(`mnemonic    = "${mnemonic}"`);
      console.log(`Xpriv       = ${rootxpriv.extkey}`);
      console.log(`Xpub        = ${rootxpub.extkey}`);
    }
    console.log('');
  }
};

const mnemonictoblindtx = async function() {
// parameter: '<mnemonic ...>',
  let network = '';
  if (process.argv.length < 4) {
    network = await readInput('network > ');
  } else {
    network = process.argv[3];
  }
  let passphrase = '';
  if (process.argv.length < 5) {
    passphrase = await readInput('passphrase > ');
  } else {
    passphrase = process.argv[4];
  }
  let derivePath = '';
  if (process.argv.length < 6) {
    derivePath = await readInput('derivePath > ');
  } else {
    derivePath = process.argv[5];
  }

  const mnemonicList = [];
  let mnemonic = '';
  if (process.argv.length < 7) {
    mnemonic = await readInput('mnemonic > ');
    mnemonicList.push(mnemonic);
  } else {
    for (let idx = 6; idx < process.argv.length; ++idx) {
      mnemonic = process.argv[idx];
      mnemonicList.push(mnemonic);
    }
  }

  const mnemonicArgList = [];
  for (let idx = 0; idx < mnemonicList.length; ++idx) {
    mnemonic = mnemonicList[idx];
    if (mnemonic.indexOf(' ') === -1) {
      mnemonicArgList.push(mnemonic);
    } else {
      const mnemonicItems = mnemonic.split(' ');
      for (let i = 0; i < mnemonicItems.length; ++i) {
        mnemonicArgList.push(mnemonicItems[i]);
      }
    }
  }

  const lqNetwork = (network === 'mainnet') ? 'liquidv1' : 'regtest';
  const seed = await cfdjs.ConvertMnemonicToSeed({
    mnemonic: mnemonicArgList,
    passphrase: passphrase,
    // eslint-disable-next-line @typescript-eslint/camelcase
    strict_check: true,
    language: 'en',
  });
  const masterxpriv = await cfdjs.CreateExtkeyFromSeed({
    seed: seed.seed,
    network: network,
    extkeyType: 'extPrivkey',
  });
  const extkeys = [];
  const privkeys = [];
  const pubkeys = [];
  const ctKey = [];
  const ctBlindKey = [];
  const addrs = [];
  const ctadrs = [];
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 2; ++j) {
      const xpriv = await cfdjs.CreateExtkeyFromParentPath({
        extkey: masterxpriv.extkey,
        network: network,
        extkeyType: 'extPrivkey',
        path: derivePath + '/' + j + '/' + i,
      });
      const priv = await cfdjs.GetPrivkeyFromExtkey({
        extkey: xpriv.extkey,
        network: network,
        wif: true,
        isCompressed: false,
      });
      const priv3 = await cfdjs.GetPrivkeyFromExtkey({
        extkey: xpriv.extkey,
        network: network,
        wif: true,
        isCompressed: true,
      });
      const pub = await cfdjs.GetPubkeyFromPrivkey({
        privkey: priv.privkey,
        isCompressed: false,
      });
      const privkeyHex = await cfdjs.GetPrivkeyFromWif({
        wif: priv.privkey,
      });
      const pub2 = await cfdjs.GetPubkeyFromPrivkey({
        privkey: priv3.privkey,
        isCompressed: true,
      });
      // const priv2 = await cfdjs.GetPrivkeyWif({
      //   hex: privkeyHex.hex,
      //   network: 'testnet',
      //   isCompressed: false,
      // });
      const addr1 = await cfdjs.CreateAddress({
        keyData: {
          hex: pub.pubkey,
          type: 'pubkey',
        },
        network: lqNetwork,
        hashType: 'p2pkh',
        isElements: true,
      });
      const addr2 = await cfdjs.CreateAddress({
        keyData: {
          hex: pub.pubkey,
          type: 'pubkey',
        },
        network: lqNetwork,
        hashType: 'p2sh-p2wpkh',
        isElements: true,
      });
      const addr3 = await cfdjs.CreateAddress({
        keyData: {
          hex: pub.pubkey,
          type: 'pubkey',
        },
        network: lqNetwork,
        hashType: 'p2wpkh',
        isElements: true,
      });

      if (j === 0) {
        console.log(`xpriv   [${i}] = ${xpriv.extkey}`);
        console.log(`priv    [${i}] = ${priv.privkey}`);
        console.log(`privHex [${i}] = ${privkeyHex.hex}`);
        console.log(`pub     [${i}] = ${pub.pubkey}`);
        console.log(`AddrPkh [${i}] = ${addr1.address}`);
        console.log(`AddrShWp[${i}] = ${addr2.address}`);
        console.log(`AddrWpkh[${i}] = ${addr3.address}`);
        extkeys.push(xpriv.extkey);
        privkeys.push({wif: priv.privkey, hex: privkeyHex.hex});
        pubkeys.push(pub.pubkey);
        addrs.push({
          legacy: addr1.address,
          segwit: addr2.address,
          bech32: addr3.address,
        });
      } else {
        console.log(`blindKey[${i}] = ${privkeyHex.hex}`);
        console.log(`ctKey   [${i}] = ${pub.pubkey}`);
        console.log(`ctKeyCmp[${i}] = ${pub2.pubkey}`);
        ctBlindKey.push(privkeyHex.hex);
        ctKey.push(pub.pubkey);

        const ctadr1 = await cfdjs.GetConfidentialAddress({
          unblindedAddress: addrs[i].legacy,
          key: pub2.pubkey,
        });
        const ctadr2 = await cfdjs.GetConfidentialAddress({
          unblindedAddress: addrs[i].segwit,
          key: pub2.pubkey,
        });
        const ctadr3 = await cfdjs.GetConfidentialAddress({
          unblindedAddress: addrs[i].bech32,
          key: pub2.pubkey,
        });
        console.log(`CAdrPkh [${i}] = ${ctadr1.confidentialAddress}`);
        console.log(`CAdrShWp[${i}] = ${ctadr2.confidentialAddress}`);
        console.log(`CAdrWpkh[${i}] = ${ctadr3.confidentialAddress}`);
        ctadrs.push({
          legacy: ctadr1.confidentialAddress,
          segwit: ctadr2.confidentialAddress,
          bech32: ctadr3.confidentialAddress,
        });
      }
    }
  }
};

// -----------------------------------------------------------------------------

const commandData = {
  decoderawtransaction: {
    name: 'decoderawtransaction',
    alias: 'dectx',
    parameter: '<network> <tx>',
    function: decoderawtransaction,
  },
  decoderawtransactionReadfile: {
    name: 'decoderawtransaction_readfile',
    alias: 'dectxrf',
    parameter: '<network> <filePath> [<fullDump>]',
    function: decoderawtransactionFromFile,
  },
  decodesignature: {
    name: 'decodesignature',
    alias: 'decsig',
    parameter: '<signature>',
    function: decodesignature,
  },
  verifysignature: {
    name: 'verifysignature',
    alias: 'verifysig',
    parameter: '<tx(or filename)> <txid> <vout> <signature> <pubkey> <script> <hashType> <value>',
    function: verifysignature,
  },
  verifysign: {
    name: 'verifysign',
    alias: 'vsign',
    parameter: '<tx(or filename)> <txid;vout;value;descriptor> ...',
    function: verifysign,
  },
  decodescript: {
    name: 'decodescript',
    alias: 'script',
    parameter: '<script> [<show string (true/false)>]',
    function: decodescript,
  },
  convertscript: {
    name: 'convertscript',
    alias: 'cscript',
    parameter: '<script args>',
    function: convertscript,
  },
  getaddressinfo: {
    name: 'getaddressinfo',
    alias: 'daddr',
    parameter: '<address>',
    function: getaddressinfo,
  },
  parsedescriptor: {
    name: 'parsedescriptor',
    alias: 'pdesc',
    parameter: '<network(mainnet,testnet,regtest,liquidv1,liquidregtest)> <descriptor> [<derivePath>]',
    function: parsedescriptor,
  },
  parsedescriptors: {
    name: 'parsedescriptors',
    alias: 'pdescs',
    parameter: '<network(mainnet,testnet,regtest,liquidv1,liquidregtest)> <descriptor> <minValue> <maxValue> [<viewType(all/address/lockingScript)>]',
    function: parsedescriptors,
  },
  generatemnemonic: {
    name: 'generatemnemonic',
    alias: 'genmnemonic',
    parameter: '[<language(en es fr it jp zhs zht)>] [<entropy>]',
    function: generatemnemonic,
  },
  mnemonictoseed: {
    name: 'mnemonictoseed',
    alias: 'mnemonic',
    parameter: '<mnemonic> <passphrase> [<network> <bip32path>]',
    function: mnemonictoseed,
  },
  getprivkeyinfo: {
    name: 'getprivkeyinfo',
    alias: 'privkey',
    parameter: '<network(mainnet,testnet)> <privkey>',
    function: getprivkeyinfo,
  },
  getextkeyinfo: {
    name: 'getextkeyinfo',
    alias: 'keyinfo',
    parameter: '<network(mainnet,testnet,regtest,liquidv1,liquidregtest)> <extkey> [<isCompressed>]',
    function: getextkeyinfo,
  },
  createextkey: {
    name: 'createextkey',
    alias: 'extkey',
    parameter: '<extkey or seed> <derivePath> [<network>]',
    function: createextkey,
  },
  checkextkey: {
    name: 'checkextkey',
    alias: 'checkkey',
    parameter: '<extkey> <derivePath> <child extkey> <child derivePath>',
    function: checkextkey,
  },
  getissuanceblindingkey: {
    name: 'getissuanceblindingkey',
    alias: 'ibkey',
    parameter: '<masterBlindingKey> <txid> <vout>',
    function: getissuanceblindingkey,
  },
  getblindingkey: {
    name: 'getblindingkey',
    alias: 'bkey',
    parameter: '<masterBlindingKey> <address>',
    function: getblindingkey,
  },
  getpubkeyaddress: {
    name: 'getpubkeyaddress',
    alias: 'getpaddr',
    parameter: '<addrtype(p2pkh,p2wpkh,p2sh-p2wpkh)> <network(mainnet,testnet,regtest,liquidv1,liquidregtest)> <privkey or pubkey>',
    function: getpubkeyaddress,
  },
  getscriptaddress: {
    name: 'getscriptaddress',
    alias: 'getsaddr',
    parameter: '<addrtype(p2sh,p2wsh,p2sh-p2wsh)> <network(mainnet,testnet,regtest,liquidv1,liquidregtest)> <scriptHex>',
    function: getscriptaddress,
  },
  getconfidentialaddress: {
    name: 'getconfidentialaddress',
    alias: 'getctaddr',
    parameter: '<address> <confidentialKey or blindingKey>',
    function: getconfidentialaddress,
  },
  estimatefee: {
    name: 'estimatefee',
    alias: 'fee',
    parameter: '<feeRate> <feeAsset> <tx>',
    function: estimatefee,
  },
  getcommitment: {
    name: 'getcommitment',
    alias: 'commitment',
    parameter: '<amount> <amountBlinder> <assetBlinder> <asset>',
    function: getcommitment,
  },
  decodedersignature: {
    name: 'decodedersignature',
    alias: 'dersig',
    parameter: '<der signature> [<sighashtype> <anyoneCanPay>]',
    function: decodedersignature,
  },
  generatekey: {
    name: 'generatekey',
    alias: 'genkey',
    parameter: '[<network> [<wif> [<isCompressed>]]]',
    function: generatekey,
  },
  generatekeywithmnemonic: {
    name: 'generatekeywithmnemonic',
    alias: 'genwn',
    parameter: '<network(mainnet,testnet)> <passphrase> <derivePath> <mnemonic ...>',
    function: generatekeywithmnemonic,
  },
  mnemonictoblindtx: {
    name: 'mnemonictoblindtx',
    alias: 'ledger',
    parameter: '<mnemonic ...>',
    function: mnemonictoblindtx,
  },
};

const helpDump = async function(nameobj) {
  if (!nameobj.parameter) {
    console.log('  ' + nameobj.name);
  } else {
    console.log('  ' + nameobj.name + ' ' + nameobj.parameter);
  }
  if (nameobj.alias) {
    console.log('    - alias: ' + nameobj.alias);
  }
};

const help = async function() {
  console.log('usage:');
  for (const key in commandData) {
    if (commandData[key]) helpDump(commandData[key]);
  }
};

// -----------------------------------------------------------------------------
const main = async () =>{
  cfdjs = cfdjsWasm.getCfd();
  try {
    if (process.argv.length > 2) {
      const cmd = process.argv[2].trim();
      for (const key in commandData) {
        if (commandData[key]) {
          const cmdData = commandData[key];
          if (checkString(cmd, cmdData.name, cmdData.alias)) {
            await cmdData.function();
            return 0;
          }
        }
      }
    }

    for (let i = 0; i < process.argv.length; i++) {
      console.log('argv[' + i + '] = ' + process.argv[i]);
    }
    help();
  } catch (error) {
    console.log(error);
  }
  return 1;
};

cfdjsWasm.addInitializedListener(main);

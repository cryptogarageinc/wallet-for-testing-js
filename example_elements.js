const cfdjs = require('cfd-js');

const utxo = {txid: '0000000000000000000000000000000000000000000000000000000000001111', vout: 0};
const utxo2 = {txid: '0000000000000000000000000000000000000000000000000000000000002222', vout: 0};

const txdata = cfdjs.ElementsCreateRawTransaction({
  'version': 2,
  'locktime': 0,
  'txins': [{
    'txid': utxo.txid,
    'vout': utxo.vout,
    'sequence': 4294967295,
  }, {
    'txid': utxo2.txid,
    'vout': utxo2.vout,
    'sequence': 4294967295,
  }],
  'txouts': [{
    'address': 'AzptfproXqXSz52kFUDAN4WJe3nVkxyapTkVkmN67Jmw4isdLWXrXF4jcF3354LcaQ5ZsBrvRmvWUz73',
    'asset': '6f1a4b6bd5571b5f08ab79c314dc6483f9b952af2f5ef206cd6f8e68eb1186f3',
    'amount': 10000000,
  }, {
    'address': 'el1qqtl9a3n6878ex25u0wv8u5qlzpfkycc0cftk65t52pkauk55jqka0fajk8d80lafn4t9kqxe77cu9ez2dyr6sq54lwy009uex',
    'asset': '6f1a4b6bd5571b5f08ab79c314dc6483f9b952af2f5ef206cd6f8e68eb1186f3',
    'amount': 10000000,
  }],
  'fee': {
    'amount': 500000,
    'asset': '6f1a4b6bd5571b5f08ab79c314dc6483f9b952af2f5ef206cd6f8e68eb1186f3',
  },
});

const blindTx = cfdjs.BlindRawTransaction({
  tx: txdata.hex,
  txins: [{
    txid: utxo.txid,
    vout: utxo.vout,
    asset: '6f1a4b6bd5571b5f08ab79c314dc6483f9b952af2f5ef206cd6f8e68eb1186f3',
    amount: 10500000,
    blindFactor: '0000000000000000000000000000000000000000000000000000000000000000',
    assetBlindFactor: '0000000000000000000000000000000000000000000000000000000000000000',
  }, {
    txid: utxo2.txid,
    vout: utxo2.vout,
    asset: '6f1a4b6bd5571b5f08ab79c314dc6483f9b952af2f5ef206cd6f8e68eb1186f3',
    amount: 10000000,
    blindFactor: 'f87734c279533d8beba96c5369e169e6caf5f307a34d72d4a0f9c9a7b8f8f269',
    assetBlindFactor: '28093061ab2e407c6015f8cb33f337ffb118eaf3beb2d254de64203aa27ecbf7',
  },
  ],
  txoutConfidentialAddresses: [
    'AzptfproXqXSz52kFUDAN4WJe3nVkxyapTkVkmN67Jmw4isdLWXrXF4jcF3354LcaQ5ZsBrvRmvWUz73',
    'el1qqtl9a3n6878ex25u0wv8u5qlzpfkycc0cftk65t52pkauk55jqka0fajk8d80lafn4t9kqxe77cu9ez2dyr6sq54lwy009uex',
  ],
});

// privkey sign (calc sighash + get ecSig + add Signature)
const signTx = cfdjs.SignWithPrivkey({
  tx: blindTx.hex,
  isElements: true,
  txin: {
    txid: utxo.txid,
    vout: utxo.vout,
    privkey: 'cU4KjNUT7GjHm7CkjRjG46SzLrXHXoH3ekXmqa2jTCFPMkQ64sw1',
    hashType: 'p2wpkh',
    sighashType: 'all',
    confidentialValueCommitment: '096c711e318b1b540f683aa3ed570c571889417483979e24403e47d8be7c2ac664',
    amount: 10500000,
  },
});

// multisig sign start
const multisigScript = '5221021266577a886f59271acc99d78a3371c04fbd0e1991cb52db6d74b090c96ed47d2103700c35bbe646ac4e80a02f5688d7fe36f944d7eeb7abe0490c272e9fd3e093ac52ae';
// ert1q7w0kyu46ddterr4sglzac38mgaf4dv8jfsf0egumry5yaqqq3fpqe89kmh
const sighash = cfdjs.CreateElementsSignatureHash({
  tx: blindTx.hex,
  txin: {
    'txid': utxo2.txid,
    'vout': utxo2.vout,
    'keyData': {
      'hex': multisigScript,
      'type': 'redeem_script',
    },
    'amount': 10000000,
    'hashType': 'p2wsh',
  },
});


const privkey1 = 'cQfvmeis4EWJ4EtLoz5dAs8XY44SCdZazyTnyPVgibMWcYZCSEne';
const privkey2 = 'cN3qiuWdpPWKsEjFxnkiNdex3nRYENzuieSH6MsYBCk6oyKdfdeo';
const sig1 = cfdjs.CalculateEcSignature({
  'sighash': sighash.sighash,
  'privkeyData': {
    'privkey': privkey1,
    'network': 'regtest',
  },
});
const sig2 = cfdjs.CalculateEcSignature({
  'sighash': sighash.sighash,
  'privkeyData': {
    'privkey': privkey2,
    'network': 'regtest',
  },
});

const multisigSign = cfdjs.AddMultisigSign({
  tx: signTx.hex,
  isElements: true,
  txin: {
    txid: utxo2.txid,
    vout: utxo2.vout,
    signParams: [
      {
        hex: sig1.signature,
        type: 'sign',
        derEncode: true,
        relatedPubkey: '021266577a886f59271acc99d78a3371c04fbd0e1991cb52db6d74b090c96ed47d',
      },
      {
        hex: sig2.signature,
        type: 'sign',
        derEncode: true,
        relatedPubkey: '03700c35bbe646ac4e80a02f5688d7fe36f944d7eeb7abe0490c272e9fd3e093ac',
      },
    ],
    witnessScript: multisigScript,
    hashType: 'p2wsh',
  },
});
// multisig sign end

console.log(multisigSign.hex);

console.log('-------------------------------------------------------------------');
console.log('-- large output tx --');

const feeOutputNum = 100;
const feeUtxo = {
  txid: '0000000000000000000000000000000000000000000000000000000000000001',
  vout: 1,
  amount: 100000000,
  asset: '5ac9f65c0efcc4775e0baec4ec03abdde22473cd3cf33c0419ca290e0751b225',
  blindFactor: '0000000000000000000000000000000000000000000000000000000000000000',
  assetBlindFactor: '0000000000000000000000000000000000000000000000000000000000000000',
  privkey: 'cU4KjNUT7GjHm7CkjRjG46SzLrXHXoH3ekXmqa2jTCFPMkQ64sw1',
};
const networkType = 'liquidv1';
const mainchainNetworkType = 'mainnet';
const masterBlindingKey = '28054244faf0d4a04fc9dd3012443fc126c4a353f48d0277d3c57f69164adf87';
const txFeeAmount = 13000; // feerate: 0.148
// dust laptop safe error tent soon fragile skill pear alley awkward vague stomach duck future
// xprv9s21ZrQH143K39sCCERa3w6NuVmYLMxHKH1PjEnuiaq2RB9iHhEwncTGpbx1WANWJZzFFbFdBi7BKECLg3HnFgajeRi5Go6YxD1K2nZtpDB/44h/1776h/1h
const baseXpubkey = 'xpub6CADKiKYZrFrmFbPAQPSrzKMRohBHNmYM7GHNngAaaVHqNhC3apR1aNKJkigUjBDU7HwciQSRjeBK42vZUMZGNEjZkPjDWDawKVxTLGhNVE';
const minimumBits = 36;

// ----

const feeAmount = parseInt((feeUtxo.amount - txFeeAmount) / (feeOutputNum + 1));
const changeAmount = feeUtxo.amount - txFeeAmount - (feeAmount * feeOutputNum);

const txoutList = [];
const ctAddrList = [];
for (let i = 0; i <= feeOutputNum; ++i) {
  const child = cfdjs.CreateExtkeyFromParentPath({
    extkey: baseXpubkey,
    network: mainchainNetworkType,
    extkeyType: 'extPubkey',
    path: `0/${i}`,
  });
  const pubkeyRet = cfdjs.GetPubkeyFromExtkey({
    extkey: child.extkey,
    network: mainchainNetworkType,
  });
  const addrInfo = cfdjs.CreateAddress({
    isElements: true,
    keyData: {
      hex: pubkeyRet.pubkey,
      type: 'pubkey',
    },
    network: networkType,
    hashType: 'p2wpkh',
  });
  const blindingKey = cfdjs.GetDefaultBlindingKey({
    masterBlindingKey: masterBlindingKey,
    address: addrInfo.address,
  });
  const ctKey = cfdjs.GetPubkeyFromPrivkey({
    privkey: blindingKey.blindingKey,
  });
  const ctAddr = cfdjs.GetConfidentialAddress({
    unblindedAddress: addrInfo.address,
    key: ctKey.pubkey,
  });
  const amount = (i === feeOutputNum) ? changeAmount : feeAmount;
  txoutList.push({
    address: ctAddr.confidentialAddress,
    asset: feeUtxo.asset,
    amount: amount,
  });
  ctAddrList.push(ctAddr.confidentialAddress);
}

const feeTxdata = cfdjs.ElementsCreateRawTransaction({
  version: 2,
  locktime: 0,
  txins: [{
    txid: feeUtxo.txid,
    vout: feeUtxo.vout,
    sequence: 4294967295,
  }],
  txouts: txoutList,
  fee: {
    amount: txFeeAmount,
    asset: feeUtxo.asset,
  },
});

const feeBlindTx = cfdjs.BlindRawTransaction({
  tx: feeTxdata.hex,
  txins: [{
    txid: feeUtxo.txid,
    vout: feeUtxo.vout,
    asset: feeUtxo.asset,
    amount: feeUtxo.amount,
    blindFactor: feeUtxo.blindFactor,
    assetBlindFactor: feeUtxo.assetBlindFactor,
  },
  ],
  txoutConfidentialAddresses: ctAddrList,
  minimumBits: minimumBits,
});

const commitment = cfdjs.GetCommitment({
  amount: feeUtxo.amount,
  asset: feeUtxo.asset,
  assetBlindFactor: feeUtxo.assetBlindFactor,
  blindFactor: feeUtxo.blindFactor,
});

// privkey sign (calc sighash + get ecSig + add Signature)
const feeSignTx = cfdjs.SignWithPrivkey({
  tx: feeBlindTx.hex,
  isElements: true,
  txin: {
    txid: feeUtxo.txid,
    vout: feeUtxo.vout,
    privkey: feeUtxo.privkey,
    hashType: 'p2wpkh',
    sighashType: 'all',
    confidentialValueCommitment: commitment.amountCommitment,
  },
});

const dectx = cfdjs.ElementsDecodeRawTransaction({hex: feeSignTx.hex});

console.log(feeSignTx.hex);
console.log(`Amount:${feeAmount}, changeAmount:${changeAmount}`);
console.log(`vsize: ${dectx.vsize}`);

const estimateFeeResult = cfdjs.EstimateFee({
  selectUtxos: [{
    txid: feeUtxo.txid,
    vout: feeUtxo.vout,
    amount: feeUtxo.amount,
    asset: feeUtxo.asset,
    descriptor: 'wpkh([e3c39d64/0\'/1\'/14\']02c7822c824258258d8d16b6fd25317b60b4374ca4f5ce1a69b810615e0c5497a8)',
  }],
  feeRate: 0.147,
  tx: feeSignTx.hex,
  isElements: true,
  feeAsset: feeUtxo.asset,
  isBlind: true,
  minimumBits: minimumBits,
});
console.log(`EstimateFee:`, estimateFeeResult);

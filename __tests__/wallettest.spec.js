const WalletManager = require('../index.js');
const fs = require('fs');
const cfd = require('cfd-js');
// const path = require('path');

const isDebug = true;

const network = 'regtest';
const configFilePath = __dirname + '/bitcoin.conf';
const testSeed = '0e09fbdd00e575b654d480ae979f24da45ef4dee645c7dc2e3b30b2e093d38dda0202357754cc856f8920b8e31dd02e9d34f6a2b20dc825c6ba90f90009085e1';
let walletMgr;
let btcWallet1;
let btcWallet2;
// let btcWallet3;

const timeout = async function(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

beforeAll(async () => {
  console.log('initialize node');
  const dbDir = __dirname + '/dbdir';
  // initialize db dir
  try {
    fs.statSync(dbDir);
    const files = fs.readdirSync(dbDir);
    for (const file in files) {
      if (files[file]) {
        const targetFile = files[file];
        fs.unlinkSync(`${dbDir}/${targetFile}`);
      }
    }
    fs.rmdirSync(dbDir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.mkdirSync(dbDir);

  // initialize walletManager
  walletMgr = new WalletManager(configFilePath, dbDir, network, testSeed);
  walletMgr.initialize('bitcoin');

  console.log('initialize wallet');
  btcWallet1 = await walletMgr.createWallet(1, 'testuser', 'bitcoin', !isDebug);
  btcWallet2 = await walletMgr.createWallet(2, 'testuser', 'bitcoin', !isDebug);
  // btcWallet3 = await walletMgr.createWallet(3, 'testuser', 'bitcoin');
});

describe('wallet test', () => {
  it('wpkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress('p2wpkh', 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        'bcrt1qd40vlvfv5khcwx205z5ml0zzmqr4pnyzturxet,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,00146d5ecfb12ca5af87194fa0a9bfbc42d80750cc82,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2wpkh');
  });
  it('pkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress('p2pkh', 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        'mqVFXZtrfUPoqd49RW9YVickLbn6VuxeSy,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,76a9146d5ecfb12ca5af87194fa0a9bfbc42d80750cc8288ac,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2pkh');
  });
  it('sh-wpkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress('p2sh-p2wpkh', 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        '2MxSFp2PpYRT7QoAedCjWB6gUGiHL5Huyw5,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,a91438eeb9f2d38ff1c2dd2ff21b7786c08681bc9f4c87,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2sh-p2wpkh');
  });

  it('generateFund test', async () => {
    const amount = 20000000000; // 200BTC
    const ret = await btcWallet1.generateFund(amount);
    console.log('generateFund -> ', ret);
    expect(ret).toBe(amount);
  });

  it('generate test', async () => {
    const ret = await btcWallet1.generate(2);
    console.log('generate -> ', ret);
    expect(ret.amount).not.toBe(0);
  });

  it('sendtoaddress test', async () => {
    await btcWallet2.generate(100); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');

    const addr = await btcWallet1.getNewAddress('p2wpkh', 'label1');
    // send to 1BTC
    const amount = 100000000;
    const sendData = await btcWallet1.sendToAddress(addr.address, amount);
    const decTx = btcWallet1.decodeRawTransaction(sendData.hex);
    await btcWallet2.generate(1);
    console.log('sendToAddress1 -> ', sendData);
    expect(decTx.vout[0].value).toBe(amount);

    // wait update
    try {
      await timeout(2000);
    } catch (tmerr) {
      // ignore error
    }

    // second send tx
    const addr2 = await btcWallet1.getNewAddress('p2wpkh', 'label1');
    const addr3 = await btcWallet1.getNewAddress('p2wpkh', 'label2');
    const txin = {txid: sendData.txid, vout: 0};
    const amount2 = 99900000;
    const txout1 = {address: addr2.address, amount: amount2};
    const txout2 = {address: addr3.address, amount: 5000000000};

    let tx2 = btcWallet1.createRawTransaction(2, 0, [txin], [txout1, txout2]);
    tx2 = await btcWallet1.fundRawTransaction(tx2.hex);
    // console.log('fundRawTransaction -> ', tx2);
    tx2 = await btcWallet1.signRawTransactionWithWallet(tx2.hex, false);
    const txid = await btcWallet1.sendRawTransaction(tx2.hex);
    const decTx2 = btcWallet1.decodeRawTransaction(tx2.hex);
    console.log('sendToAddress2 -> ', {txid: txid, hex: tx2.hex});

    await btcWallet2.generate(1);

    expect(decTx2.vout[0].value).toBe(amount2);
    expect(decTx2.vout[0].scriptPubKey.hex).toBe(addr2.lockingScript);
  });


  it('multisig test', async () => {
    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');
    btcWallet2.estimateSmartFee(6, 'ECONOMICAL');

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const addr1 = await btcWallet1.getNewAddress('p2wpkh', 'label1-1');
    const addr2 = await btcWallet2.getNewAddress('p2wpkh', 'label2-1');

    const multisigAddr1 = await btcWallet1.addMultisigAddress(
        [addr1.pubkey, addr2.pubkey], 2, 'p2wsh', 'label-m1');
    const multisigAddr2 = await btcWallet2.addMultisigAddress(
        [addr1.pubkey, addr2.pubkey], 2, 'p2wsh', 'label-m1');
    expect(multisigAddr1.address).toBe(multisigAddr2.address);

    // multisigに送信
    const amount1 = 100000000;
    const txout1 = {address: multisigAddr1.address, amount: amount1};
    let tx1 = btcWallet1.createRawTransaction(2, 0, [], [txout1]);
    tx1 = await btcWallet1.fundRawTransaction(tx1.hex);
    tx1 = await btcWallet1.signRawTransactionWithWallet(tx1.hex, false);
    const txid1 = await btcWallet1.sendRawTransaction(tx1.hex);
    const decTx1 = btcWallet1.decodeRawTransaction(tx1.hex);
    console.log('[multi] sendRawTransaction1 -> ', {txid: txid1, hex: tx1.hex});
    expect(decTx1.vout[0].value).toBe(amount1);

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const wData11 = await btcWallet1.getWalletTxData(txid1, 0);
    const wData21 = await btcWallet2.getWalletTxData(txid1, 0);

    expect(wData11.spent).toBe(false);
    expect(wData21.spent).toBe(false);

    const txin2 = {txid: txid1, vout: 0};
    const txout2 = {address: addr2.address, amount: amount1};
    let tx2 = btcWallet1.createRawTransaction(2, 0, [txin2], [txout2]);
    tx2 = await btcWallet1.fundRawTransaction(tx2.hex);
    const decTx = btcWallet1.decodeRawTransaction(tx2.hex);
    const prevtxs = [];
    for (let i = 0; i < decTx.vin.length; ++i) {
      if (decTx.vin[i]) {
        const tempTxid = decTx.vin[i].txid;
        const tempVout = decTx.vin[i].vout;
        if (tempTxid === txid1 && tempVout === 0) {
          continue;
        }
        prevtxs.push({txid: tempTxid, vout: tempVout});
      }
    }
    tx2 = await btcWallet1.signRawTransactionWithWallet(
        tx2.hex, false, prevtxs);
    const sigs1 = await btcWallet1.getSignatures(
        tx2.hex, false, [{txid: txid1, vout: 0}]);
    const sigs2 = await btcWallet2.getSignatures(
        tx2.hex, false, [{txid: txid1, vout: 0}]);
    // console.log('[multi] sigs1 -> ', sigs1);
    // console.log('[multi] sigs2 -> ', sigs2);

    tx2 = cfd.AddMultisigSign({
      tx: tx2.hex,
      txin: {
        txid: txid1,
        vout: 0,
        isWitness: true,
        signParams: [
          {
            hex: sigs2.signatures[0].signature,
            type: 'sign',
            derEncode: true,
            sighashType: 'all',
            sighashAnyoneCanPay: false,
            relatedPubkey: addr2.pubkey,
          },
          {
            hex: sigs1.signatures[0].signature,
            type: 'sign',
            derEncode: true,
            sighashType: 'all',
            sighashAnyoneCanPay: false,
            relatedPubkey: addr1.pubkey,
          },
        ],
        witnessScript: multisigAddr1.script,
        hashType: 'p2wsh',
      },
    });
    const txid2 = await btcWallet1.sendRawTransaction(tx2.hex);
    console.log('[multi] sendRawTransaction2 -> ', {txid: txid2, hex: tx2.hex});

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const wData12 = await btcWallet1.getWalletTxData(txid1, 0);
    const wData22 = await btcWallet2.getWalletTxData(txid1, 0);
    // console.log('[multi] wData12 -> ', wData12);
    // console.log('[multi] wData22 -> ', wData22);

    expect(wData12.spent).toBe(true);
    expect(wData22.spent).toBe(true);
  });

  it('sendscriptaddress test', async () => {
    await btcWallet2.generate(100); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');

    const addr1 = await btcWallet1.getNewAddress('p2wpkh', 'label1-1');
    const pubkeyHash = addr1.lockingScript.substring(2);
    const script = cfd.CreateScript({
      items: [addr1.pubkey, 'OP_CHECKSIG'],
    });
    const addr = await btcWallet1.getScriptAddress(script.hex, 'p2wsh', 'label1', [addr1.pubkey]);
    // send to 1BTC
    const amount1 = 100000000;
    const txout1 = {address: addr.address, amount: amount1};
    let tx1 = btcWallet1.createRawTransaction(2, 0, [], [txout1]);
    tx1 = await btcWallet1.fundRawTransaction(tx1.hex);
    tx1 = await btcWallet1.signRawTransactionWithWallet(tx1.hex, false);
    const txid1 = await btcWallet1.sendRawTransaction(tx1.hex);
    const decTx1 = btcWallet1.decodeRawTransaction(tx1.hex);
    console.log('[script] sendRawTransaction1 -> ', {txid: txid1, hex: tx1.hex});
    expect(decTx1.vout[0].value).toBe(amount1);

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const wData11 = await btcWallet1.getWalletTxData(txid1, 0);
    expect(wData11.spent).toBe(false);

    const txin2 = {txid: txid1, vout: 0};
    const txout2 = {address: addr1.address, amount: amount1};
    let tx2 = btcWallet1.createRawTransaction(2, 0, [txin2], [txout2]);
    tx2 = await btcWallet1.fundRawTransaction(tx2.hex);
    const decTx = btcWallet1.decodeRawTransaction(tx2.hex);
    const prevtxs = [];
    for (let i = 0; i < decTx.vin.length; ++i) {
      if (decTx.vin[i]) {
        const tempTxid = decTx.vin[i].txid;
        const tempVout = decTx.vin[i].vout;
        if (tempTxid === txid1 && tempVout === 0) {
          continue;
        }
        prevtxs.push({txid: tempTxid, vout: tempVout});
      }
    }
    tx2 = await btcWallet1.signRawTransactionWithWallet(
        tx2.hex, false, prevtxs);
    const sigs1 = await btcWallet1.getSignatures(
        tx2.hex, false, [{txid: txid1, vout: 0}]);
    // console.log('[multi] sigs1 -> ', sigs1);
    // console.log('[multi] sigs2 -> ', sigs2);

    tx2 = cfd.AddSign({
      tx: tx2.hex,
      txin: {
        txid: txid1,
        vout: 0,
        isWitness: true,
        signParams: [
          {
            hex: sigs1.signatures[0].signature,
            type: 'sign',
            derEncode: true,
            sighashType: 'all',
            sighashAnyoneCanPay: false,
          },
          {
            hex: script.hex,
            type: 'redeem_script',
          },
        ],
      },
    });
    const txid2 = await btcWallet1.sendRawTransaction(tx2.hex);
    console.log('[multi] sendRawTransaction2 -> ', {txid: txid2, hex: tx2.hex});

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const wData12 = await btcWallet1.getWalletTxData(txid1, 0);
    // console.log('[multi] wData12 -> ', wData12);
    // console.log('[multi] wData22 -> ', wData22);

    expect(wData12.spent).toBe(true);
  });

});

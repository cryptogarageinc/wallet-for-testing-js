import {WalletManager, TargetNode, AddressType, AddressKind, NodeConfigurationData, BlockData, NetworkType} from '../src/walletManager';
import {Wallet, OutPoint} from '../src/libs/walletService';
import fs from 'fs';
import cfd from 'cfd-js';
import path from 'path';
import {assert} from 'console';

const isDebug = false;

const mainchainNetwork = NetworkType.Regtest;
const network = NetworkType.LiquidRegtest;
const btcConfigFilePath = __dirname + '/bitcoin.conf';
const elementsConfigFilePath = __dirname + '/elements.conf';
const testSeed = '0e09fbdd00e575b654d480ae979f24da45ef4dee645c7dc2e3b30b2e093d38dda0202357754cc856f8920b8e31dd02e9d34f6a2b20dc825c6ba90f90009085e1';
let btcWalletMgr: WalletManager;
let btcWallet1: Wallet;
let btcWallet2: Wallet;
// let btcWallet3;
let elmWalletMgr: WalletManager;
let elmWallet1: Wallet;
let elmWallet2: Wallet;

const sleep = async function(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const getDbDir = async function(dirName: string) {
  const dbDir = path.resolve(__dirname, dirName);
  // initialize db dir
  try {
    fs.statSync(dbDir);
    const files = fs.readdirSync(dbDir);
    for (const file in files) {
      if (files[file]) {
        const targetFile = files[file];
        fs.unlinkSync(path.resolve(dbDir, targetFile));
      }
    }
    fs.rmdirSync(dbDir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  try {
    fs.mkdirSync(dbDir);
  } catch (tmerr) {
    await sleep(1000);
    fs.mkdirSync(dbDir);
  }
  return dbDir;
};

beforeAll(async () => {
  console.log('initialize node');
  const dbDir = await getDbDir('dbdir');

  // initialize walletManager
  btcWalletMgr = new WalletManager(btcConfigFilePath, dbDir,
      mainchainNetwork, testSeed);
  btcWalletMgr.initialize(TargetNode.Bitcoin);
  elmWalletMgr = new WalletManager(elementsConfigFilePath, dbDir,
      network, testSeed);
  elmWalletMgr.initialize(TargetNode.Elements);

  console.log('initialize wallet');
  btcWallet1 = await btcWalletMgr.createWallet(1, 'testuser', TargetNode.Bitcoin, !isDebug);
  btcWallet2 = await btcWalletMgr.createWallet(2, 'testuser', TargetNode.Bitcoin, !isDebug);
  // btcWallet3 = await walletMgr.createWallet(3, 'testuser', TargetNode.Bitcoin);
  elmWallet1 = await elmWalletMgr.createWallet(1, 'testuser', TargetNode.Elements, !isDebug);
  elmWallet2 = await elmWalletMgr.createWallet(2, 'testuser', TargetNode.Elements, !isDebug);
});

describe('wallet test', () => {
  it('btc wpkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress(AddressType.P2wpkh, 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        'bcrt1qd40vlvfv5khcwx205z5ml0zzmqr4pnyzturxet,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,00146d5ecfb12ca5af87194fa0a9bfbc42d80750cc82,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2wpkh');
  });
  it('btc pkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress(AddressType.P2pkh, 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        'mqVFXZtrfUPoqd49RW9YVickLbn6VuxeSy,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,76a9146d5ecfb12ca5af87194fa0a9bfbc42d80750cc8288ac,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2pkh');
  });
  it('btc sh-wpkh address1 test', async () => {
    const ret = await btcWallet2.getNewAddress(AddressType.P2shP2wpkh, 'label1', 1);
    expect(
        `${ret.address},${ret.path},${ret.lockingScript},${ret.pubkey},${ret.type}`,
    ).toBe(
        '2MxSFp2PpYRT7QoAedCjWB6gUGiHL5Huyw5,tprv8fce2zvfnLAY47yqNRUy5DcM8bzqiC19WYKaP7wWLeM6FbR7mcvyDCEPesLEoJukk3bFry52mCsAhWwPBBZoqvjmEt1jkjMV7jEMMzy7BDE/0/1,a91438eeb9f2d38ff1c2dd2ff21b7786c08681bc9f4c87,027635bd0677cc5466ab49d7edeb410f35fa657f0bf5a8200e32fab6501d708fd8,p2sh-p2wpkh');
  });

  it('btc generateFund test', async () => {
    jest.setTimeout(30000);

    const amount = 20000000000; // 200BTC
    const ret = await btcWallet1.generateFund(amount, true);
    console.log('generateFund -> ', ret);
    expect(ret).toBe(amount);
  });

  it('btc generate test', async () => {
    const ret = await btcWallet1.generate(2, '', true);
    console.log('generate -> ', ret);
    expect(ret.amount).not.toBe(0);
  });

  it('btc sendtoaddress test', async () => {
    jest.setTimeout(15000);

    await btcWallet2.generate(100, '', true); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();
    await btcWallet2.forceUpdateUtxoData(); // after nowait generate

    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');

    const addr = await btcWallet1.getNewAddress(AddressType.P2wpkh, 'label1');
    // send to 1BTC
    const amount = 100000000;
    const sendData = await btcWallet1.sendToAddress(addr.address, amount);
    const decTx = btcWallet1.decodeRawTransaction(sendData.hex);
    await btcWallet2.generate(1);
    console.log('sendToAddress1 -> ', sendData);
    assert(decTx.vout, 'undefined');
    if (decTx.vout) {
      expect(decTx.vout[0].value).toBe(amount);
    }

    // second send tx
    const addr2 = await btcWallet1.getNewAddress(AddressType.P2wpkh, 'label1');
    const addr3 = await btcWallet1.getNewAddress(AddressType.P2wpkh, 'label2');
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

    assert(decTx2.vout, 'undefined');
    if (decTx2.vout) {
      expect(decTx2.vout[0].value).toBe(amount2);
      assert(decTx2.vout[0].scriptPubKey, 'undefined');
      if (decTx2.vout[0].scriptPubKey) {
        expect(decTx2.vout[0].scriptPubKey.hex).toBe(addr2.lockingScript);
      }
    }
  });


  it('btc multisig test', async () => {
    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');
    btcWallet2.estimateSmartFee(6, 'ECONOMICAL');

    await btcWallet2.generate(1); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();

    const addr1 = await btcWallet1.getNewAddress(AddressType.P2wpkh, 'label1-1');
    const addr2 = await btcWallet2.getNewAddress(AddressType.P2wpkh, 'label2-1');
    if (!addr1.pubkey || !addr2.pubkey) {
      throw new Error('pubkey undefined');
    }
    const multisigAddr1 = await btcWallet1.addMultisigAddress(
        [addr1.pubkey, addr2.pubkey], 2, AddressType.P2wsh, 'label-m1');
    const multisigAddr2 = await btcWallet2.addMultisigAddress(
        [addr1.pubkey, addr2.pubkey], 2, AddressType.P2wsh, 'label-m1');
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
    assert(decTx1.vout, 'undefined');
    if (decTx1.vout) {
      expect(decTx1.vout[0].value).toBe(amount1);
    }

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
    const prevtxs: OutPoint[] = [];
    assert(decTx.vin, 'undefined');
    if (decTx.vin) {
      for (let i = 0; i < decTx.vin.length; ++i) {
        if (decTx.vin[i]) {
          const tempTxid = decTx.vin[i].txid;
          const tempVout = decTx.vin[i].vout;
          if (tempTxid === txid1 && tempVout === 0) {
            continue;
          }
          prevtxs.push({txid: `${tempTxid}`, vout: parseInt(`${tempVout}`)});
        }
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
        hashType: AddressType.P2wsh,
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

  it('btc sendscriptaddress test', async () => {
    jest.setTimeout(15000);

    await btcWallet2.generate(100, '', true); // for using coinbase utxo
    await btcWallet1.forceUpdateUtxoData();
    await btcWallet2.forceUpdateUtxoData(); // after nowait generate

    btcWallet1.estimateSmartFee(6, 'ECONOMICAL');

    const addr1 = await btcWallet1.getNewAddress(AddressType.P2wpkh, 'label1-1');
    // const pubkeyHash = addr1.lockingScript.substring(2);
    if (!addr1.pubkey) {
      throw new Error('pubkey undefined');
    }
    const script = cfd.CreateScript({
      items: [addr1.pubkey, 'OP_CHECKSIG'],
    });
    const addr = await btcWallet1.getScriptAddress(script.hex, AddressType.P2wsh, 'label1', [addr1.pubkey]);
    // send to 1BTC
    const amount1 = 100000000;
    const txout1 = {address: addr.address, amount: amount1};
    let tx1 = btcWallet1.createRawTransaction(2, 0, [], [txout1]);
    tx1 = await btcWallet1.fundRawTransaction(tx1.hex);
    tx1 = await btcWallet1.signRawTransactionWithWallet(tx1.hex, false);
    const txid1 = await btcWallet1.sendRawTransaction(tx1.hex);
    const decTx1 = btcWallet1.decodeRawTransaction(tx1.hex);
    console.log('[script] sendRawTransaction1 -> ', {txid: txid1, hex: tx1.hex});
    assert(decTx1.vout, 'undefined');
    if (decTx1.vout) {
      expect(decTx1.vout[0].value).toBe(amount1);
    }

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
    assert(decTx.vin, 'undefined');
    if (decTx.vin) {
      for (let i = 0; i < decTx.vin.length; ++i) {
        if (decTx.vin[i]) {
          const tempTxid = decTx.vin[i].txid;
          const tempVout = decTx.vin[i].vout;
          if (tempTxid === txid1 && tempVout === 0) {
            continue;
          }
          prevtxs.push({txid: `${tempTxid}`, vout: parseInt(`${tempVout}`)});
        }
      }
    }
    tx2 = await btcWallet1.signRawTransactionWithWallet(
        tx2.hex, false, prevtxs);
    const sigs1 = await btcWallet1.getSignatures(
        tx2.hex, false, [{txid: txid1, vout: 0}]);
    console.log('[multi] sigs1 -> ', sigs1);
    // console.log('[multi] sigs2 -> ', sigs2);

    tx2 = cfd.AddSign({
      tx: tx2.hex,
      txin: {
        txid: txid1,
        vout: 0,
        isWitness: true,
        signParam: [
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
        clearStack: true,
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

  // pegin test
  it('pegin test', async () => {
    jest.setTimeout(60000);

    // 10 LBTC
    const amount = 1000000000;
    await btcWallet1.generateFund(amount, true);
    await btcWallet1.generate(100, '', true);
    await btcWallet1.generate(1);

    // fedpegscript = getsidechaininfo
    const sideChainInfo = await elmWalletMgr.callRpcDirect(
        TargetNode.Elements, 'getsidechaininfo');
    const fedpegScript: string = (typeof sideChainInfo.fedpegscript == 'string') ?
        sideChainInfo.fedpegscript : '';
    const peggedAsset: string = (typeof sideChainInfo.pegged_asset == 'string') ?
        sideChainInfo.pegged_asset : '';
    const genesisBlockHash: string = (typeof sideChainInfo.parent_blockhash == 'string') ?
        sideChainInfo.parent_blockhash : '';

    console.log('sideChainInfo:', sideChainInfo);
    // generate btc address
    // TODO: Is it necessary to install it in the wallet?
    const peginKeys = cfd.CreateKeyPair({
      network: mainchainNetwork,
      wif: false,
      isCompressed: true,
    });
    const peginAddr = cfd.CreatePegInAddress({
      fedpegscript: fedpegScript,
      pubkey: peginKeys.pubkey,
      hashType: 'p2sh-p2wsh', // if dynafed, can use p2wsh
      network: mainchainNetwork,
    });

    // create elements address (unblind)
    const elmAddr1 = await elmWallet1.getNewAddress(
        AddressType.P2wpkh, 'peginAddr');
    console.log('btc pegin address:', peginAddr);

    // send btc pegin address
    const sendInfo = await btcWallet1.sendToAddress(
        peginAddr.mainchainAddress, amount);
    console.log('send btc pegin tx:', sendInfo);

    await btcWallet1.generate(1);

    const txInfo = await btcWalletMgr.callRpcDirect(
        TargetNode.Bitcoin, 'getrawtransaction', [sendInfo.txid]);
    const txHex: string = (typeof txInfo == 'string') ? txInfo : '';

    const txoutProofResp = await btcWalletMgr.callRpcDirect(
        TargetNode.Bitcoin, 'gettxoutproof', [[sendInfo.txid]]);
    const txoutProof: string = (typeof txoutProofResp == 'string') ?
        txoutProofResp : '';

    // create pegin tx (unblind)
    const feeAmt = 10000;
    const sendAmt = amount - feeAmt;
    const peginTx = cfd.CreateRawPegin({
      version: 2,
      locktime: 0,
      txins: [{
        txid: sendInfo.txid,
        vout: sendInfo.vout,
        isPegin: true,
        peginwitness: {
          amount: amount,
          asset: peggedAsset,
          claimScript: peginAddr.claimScript,
          mainchainGenesisBlockHash: genesisBlockHash,
          mainchainRawTransaction: txHex,
          mainchainTxoutproof: txoutProof,
        },
      }],
      txouts: [{
        address: elmAddr1.address,
        amount: sendAmt,
        asset: peggedAsset,
      }],
      fee: {
        amount: feeAmt,
        asset: peggedAsset,
      },
    });
    const signTx = cfd.SignWithPrivkey({
      tx: peginTx.hex,
      isElements: true,
      txin: {
        txid: sendInfo.txid,
        vout: sendInfo.vout,
        hashType: 'p2wpkh',
        amount: amount,
        privkey: peginKeys.privkey,
        pubkey: peginKeys.pubkey,
        sighashType: 'all',
      },
    });
    const decTx = cfd.ElementsDecodeRawTransaction({hex: signTx.hex});

    // send pegin tx
    try {
      const txid = await elmWallet1.sendRawTransaction(signTx.hex);
      // console.log('sendRawTransaction pegin tx:', txid);
      expect(txid).toBe(decTx.txid);

      await elmWallet1.generate(1);
      const gettxout = await elmWalletMgr.callRpcDirect(
          TargetNode.Elements, 'gettxout', [txid, 0]);
      console.log('gettxout:', gettxout);

      const balance = await elmWallet1.getBalance(1, '', '', peggedAsset);
      console.log('wallet balance:', balance);
    } catch (e) {
      console.log(e);
      throw e;
    }
  });

  // pegout test (low)
  // getbalance test
  // lbtc sendtoaddress test
  // lbtc blind/unblind test
  // issuance / reissuance test
  // asset sendtoaddress test
  // asset blind/unblind test
});

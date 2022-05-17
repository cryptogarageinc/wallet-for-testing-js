/* eslint-disable require-jsdoc */
const define = require('./definition');

const emptyBlinder = define.emptyBlinder;

module.exports = class UtxoService {
  constructor(databaseService, addressService, client, parent) {
    this.databaseService = databaseService;
    this.addressService = addressService;
    this.rpc = client;
    this.parent = parent;
    this.utxoTable = databaseService.getUtxoTable();
    this.configTable = databaseService.getConfigTable();
    this.cfd = this.parent.getCfd();
  }

  async initialize(network, masterXprivkey) {
    this.network = network;
    this.mainchainNetwork = network;
    this.masterXprivkey = masterXprivkey;
    if ((network === 'mainnet') || (network === 'testnet') || (network === 'regtest')) {
      // do nothing
    } else {
      if (network === 'liquidv1') {
        this.mainchainNetwork = 'mainnet';
      } else {
        this.mainchainNetwork = 'regtest';
        this.network = 'regtest';
      }
    }
    return true;
  }

  async generate(address, count) {
    const addressData = await this.addressService.getAddressInfo(address);
    const lockingScript = addressData.lockingScript;
    const descriptor = addressData.descriptor;
    const result = await this.rpc.generatetoaddress(count, address);
    let totalMining = 0;
    for (let k = 0; k < result.length; k++) {
      const blockHash = result[k];
      const block = await this.rpc.getblock(blockHash, 2);
      const blockHeight = block.height;
      let coinbase = false;
      for (let i = 0; i < block.tx.length; i++) {
        const txid = block.tx[i].txid;
        const txData = block.tx[i];
        if ((txData.vin.length == 1) && ('coinbase' in txData.vin[0])) {
          coinbase = true;
        } else {
          coinbase= false;
        }
        let alreadyRegisted = false;
        if (coinbase) {
          // coinbase
          const solvable = true;
          const extend = {};
          for (let j = 0; j < txData.vout.length; j++) {
            if (txData.vout[j].scriptPubKey.hex === lockingScript) {
              let confidentialKey = '';
              if (this.parent.isElements && ('value' in txData.vout[j])) {
                const value = Math.ceil(txData.vout[j].value * 100000000);
                const asset = txData.vout[j].asset;
                const assetBlinder = emptyBlinder;
                const amountBlinder = emptyBlinder;
                totalMining = totalMining + value;
                const ret = await this.utxoTable.addUtxo(txid, j,
                    value, address,
                    descriptor, lockingScript, solvable,
                    blockHash, blockHeight, coinbase, asset,
                    confidentialKey, assetBlinder, amountBlinder, extend);
                if (ret === false) {
                  // console.info('addUtxo: addUtxo fail. (already registed)\n',
                  //     `txid=${txid}, vout=${j}`);
                  alreadyRegisted = true;
                }
              } else if (this.parent.isElements) {
                const blindingKey = await this.parent.getBlindingKeyWithData(
                    addressData);
                confidentialKey = blindingKey.pubkey;
                const unblindData = await Promise.resolve(
                    this.cfd.UnblindRawTransaction({
                      tx: txData.hex,
                      txouts: [{
                        index: j,
                        blindingKey: blindingKey.privkey,
                      }],
                    }));
                if (unblindData.outputs[0]) {
                  const assetBlinder =
                    unblindData.outputs[0].assetBlindFactor;
                  const amountBlinder = unblindData.outputs[0].blindFactor;
                  const asset = unblindData.outputs[0].asset;
                  const value = unblindData.outputs[0].amount;
                  const ret = await this.utxoTable.addUtxo(txid, j,
                      value, address,
                      descriptor, lockingScript, solvable,
                      blockHash, blockHeight, coinbase, asset,
                      confidentialKey, assetBlinder, amountBlinder, extend);
                  if (ret === false) {
                    // console.info('addUtxo: addUtxo fail. (already registed)\n',
                    //     `txid=${txid}, vout=${j}`);
                    alreadyRegisted = true;
                  }
                } else {
                  throw new error('unblind fail.');
                }
              } else {
                const amount = txData.vout[j].value;
                const satoshi = Math.ceil(amount * 100000000);
                totalMining = totalMining + satoshi;
                // console.log(`  utxo[${txid},${j}] amount = ${amount}`);
                // console.log('  tx = ', txData.vout[j]);
                const ret = await this.utxoTable.addUtxo(
                    txid, j, satoshi, address, descriptor, lockingScript,
                    true, blockHash, blockHeight, coinbase);
                if (ret === false) {
                  // console.info('addUtxo: addUtxo fail. (already registed)\n',
                  //     `txid=${txid}, vout=${j}`);
                  alreadyRegisted = true;
                }
              }
            }
          }
        } else if (!alreadyRegisted) {
          const count = await this.utxoTable.getUtxoCountByTxid(txid);
          if (count > 0) {
            const ret = await this.utxoTable.updateBlockInfo(
                txid, blockHash, blockHeight);
            if (ret === false) {
              throw Error('getUtxoCountByTxid fail.');
            }
          }
          // update spendable with txin
          const vin = txData.vin;
          for (let j = 0; j < vin.length; ++j) {
            if (vin[j]) {
              await this.updateUtxoState(vin[j].txid, vin[j].vout);
            }
          }

          // analyze txout
          const vout = txData.vout;
          for (let j = 0; j < vout.length; ++j) {
            if (vout[j] && ('scriptPubKey' in vout[j])) {
              const hasUtxo = await this.utxoTable.existUtxoByOutpoint(`${txid},${j}`);
              if (hasUtxo) {
                continue;
              }
              const lockingScript = vout[j].scriptPubKey.hex;
              const addr = await this.addressService
                  .getAddressInfoByLockingScript(lockingScript);
              // console.log('addr = ', addr);
              if (addr) {
                let confidentialKey = '';
                const extend = {};
                const solvable = (!addr.script && addr.path !== '') ? true : false;
                if (this.parent.isElements && ('value' in vout[j])) {
                  const value = Math.ceil(vout[j].value * 100000000);
                  const asset = vout[j].asset;
                  const assetBlinder = emptyBlinder;
                  const amountBlinder = emptyBlinder;
                  const ret = await this.utxoTable.addUtxo(txid, j,
                      value, addr.address,
                      addr.descriptor, lockingScript, solvable,
                      blockHash, blockHeight, coinbase, asset,
                      confidentialKey, assetBlinder, amountBlinder, extend);
                  if (ret === false) {
                    throw Error('addUtxo: addUtxo fail.');
                  }
                } else if (this.parent.isElements) {
                  const blindingKey = await this.parent.getBlindingKeyWithData(
                      addr);
                  confidentialKey = blindingKey.pubkey;
                  const unblindData = await Promise.resolve(
                      this.cfd.UnblindRawTransaction({
                        tx: txData.hex,
                        txouts: [{
                          index: j,
                          blindingKey: blindingKey.privkey,
                        }],
                      }));
                  if (unblindData.outputs[0]) {
                    const assetBlinder =
                      unblindData.outputs[0].assetBlindFactor;
                    const amountBlinder = unblindData.outputs[0].blindFactor;
                    const asset = unblindData.outputs[0].asset;
                    const value = unblindData.outputs[0].amount;
                    const ret = await this.utxoTable.addUtxo(txid, j,
                        value, addr.address,
                        addr.descriptor, lockingScript, solvable,
                        blockHash, blockHeight, coinbase, asset,
                        confidentialKey, assetBlinder, amountBlinder, extend);
                    if (ret === false) {
                      throw Error('addUtxo: addUtxo fail.');
                    }
                  } else {
                    throw new error('unblind fail.');
                  }
                } else {
                  const satoshi = Math.ceil(vout[j].value * 100000000);
                  const ret = await this.utxoTable.addUtxo(txid, j,
                      satoshi, addr.address,
                      addr.descriptor, lockingScript, solvable,
                      blockHash, blockHeight, coinbase);
                  if (ret === false) {
                    throw Error('addUtxo: addUtxo fail.');
                  }
                }
              }
            }
          }
        }
      }
    }
    return {address: address, amount: totalMining};
  }

  async getMaxBlockHeight() {
    const utxos = await this.utxoTable.getUtxos(1, 10000000);
    let maxHeight = 0;
    if (utxos) {
      for (let i = 0; i < utxos.length; ++i) {
        if (utxos[i] && (utxos[i].blockHeight > maxHeight)) {
          maxHeight = utxos[i].blockHeight;
        }
      }
    }
    return maxHeight;
  }

  async changeState(blockHashList = [], blockTxMap = {}) {
    // cleanup check
    let errorOccuredHeight = -1;
    const maxHeight = await this.getMaxBlockHeight();
    for (let k = 0; k < blockHashList.length; k++) {
      const blockHash = blockHashList[k];
      const blockData = blockTxMap[blockHash];
      const blockHeight = blockData.blockHeight;
      const utxos = await this.utxoTable.getUtxoByBlockHeight(
          blockHeight, 1, 1000000000);
      if (!utxos) {
        // do nothing
      } else {
        // utxo block check
        let successCount = 0;
        for (let i = 0; i < utxos.length; ++i) {
          if (utxos[i]) {
            if (utxos[i].blockHash === blockHash) {
              ++successCount;
            } else {
              // fail.
            }
          }
        }
        if (successCount !== utxos.length) {
          // illegal db. cleanup.
          console.log('illegal db. cleanup spent utxo table. cnt: ', successCount);
          console.log(`blockHeight: ${blockHeight}, blockHash: ${blockHash}`);
          if (successCount === 0) {
            await this.utxoTable.updateOutBlockByBlockHeight(blockHeight);
            if (errorOccuredHeight < blockHeight) {
              errorOccuredHeight = blockHeight;
            }
            await this.utxoTable.deleteCoinbaseByBlockHeight(blockHeight);
          } else {
            // illegal route.
            for (let i = 0; i < utxos.length; ++i) {
              if (utxos[i] && (utxos[i].blockHash !== blockHash)) {
                await this.utxoTable.updateOutBlockByBlock(utxos[i].blockHash);
                await this.utxoTable.deleteCoinbaseByBlock(utxos[i].blockHash);
              }
            }
          }
        }
      }
    }
    if (errorOccuredHeight !== -1) {
      // rollback state
      for (let j = maxHeight; j > errorOccuredHeight; --j) {
        await this.utxoTable.updateOutBlockByBlockHeight(j);
        await this.utxoTable.deleteCoinbaseByBlockHeight(blockHeight);
      }
    }

    for (let k = 0; k < blockHashList.length; k++) {
      const blockHash = blockHashList[k];
      const blockData = blockTxMap[blockHash];
      const blockHeight = blockData.blockHeight;
      let coinbase = false;
      for (let i = 0; i < blockData.tx.length; i++) {
        const txid = blockData.tx[i].txid;
        const txData = blockData.tx[i];
        if ((!txData.vin) || ((txData.vin.length == 1) && ('coinbase' in txData.vin[0]))) {
          coinbase = true;
        } else {
          coinbase = false;
        }

        if ((!coinbase) && blockData.tx[i].vin) {
          // update block info
          const count = await this.utxoTable.getUtxoCountByTxid(txid);
          if (count > 0) {
            const ret = await this.utxoTable.updateBlockInfo(
                txid, blockHash, blockHeight);
            if (ret === false) {
              throw Error('updateBlockInfo fail.');
            }
          }
          // update spendable with txin
          const vin = blockData.tx[i].vin;
          for (let j = 0; j < vin.length; ++j) {
            if (vin[j]) {
              await this.updateUtxoState(vin[j].txid, vin[j].vout);
            }
          }
        }

        // analyze txout
        const vout = blockData.tx[i].vout;
        for (let j = 0; j < vout.length; ++j) {
          if (vout[j] && ('scriptPubKey' in vout[j])) {
            const hasUtxo = await this.utxoTable.existUtxoByOutpoint(`${txid},${j}`);
            if (hasUtxo) {
              continue;
            }
            const lockingScript = vout[j].scriptPubKey.hex;
            const addr = await this.addressService
                .getAddressInfoByLockingScript(lockingScript);
            // console.log('addr = ', addr);
            if (addr) {
              let confidentialKey = '';
              const extend = {};
              const solvable = (!addr.script && addr.path !== '') ? true : false;
              if (this.parent.isElements && ('value' in vout[j])) {
                const assetBlinder = emptyBlinder;
                const amountBlinder = emptyBlinder;
                const satoshi = Math.ceil(vout[j].value * 100000000);
                const ret = await this.utxoTable.addUtxo(txid, j,
                    satoshi, addr.address,
                    addr.descriptor, lockingScript, solvable,
                    blockHash, blockHeight, coinbase, vout[j].asset,
                    confidentialKey, assetBlinder, amountBlinder, extend);
                if (ret === false) {
                  console.log('addUtxo: addUtxo fail.');
                  // throw Error('addUtxo: addUtxo fail.');
                }
              } else if (this.parent.isElements) {
                const blindingKey = await this.parent.getBlindingKeyWithData(
                    addr);
                confidentialKey = blindingKey.pubkey;
                try {
                  const unblindData = await Promise.resolve(
                      this.cfd.UnblindRawTransaction({
                        tx: blockData.tx[i].hex,
                        txouts: [{
                          index: j,
                          blindingKey: blindingKey.privkey,
                        }],
                      }));
                  if (unblindData.outputs[0]) {
                    const assetBlinder =
                        unblindData.outputs[0].assetBlindFactor;
                    const amountBlinder = unblindData.outputs[0].blindFactor;
                    const asset = unblindData.outputs[0].asset;
                    const value = unblindData.outputs[0].amount;
                    const ret = await this.utxoTable.addUtxo(txid, j,
                        value, addr.address,
                        addr.descriptor, lockingScript, solvable,
                        blockHash, blockHeight, coinbase, asset,
                        confidentialKey, assetBlinder, amountBlinder, extend);
                    if (ret === false) {
                      console.log('addUtxo: addUtxo fail.');
                      // throw Error('addUtxo: addUtxo fail.');
                    }
                  } else {
                    throw new error('unblind fail.');
                  }
                } catch (e) {
                  console.log('unblind error tx:', blockData.tx[i].hex);
                  throw e;
                }
              } else {
                const satoshi = Math.ceil(vout[j].value * 100000000);
                const ret = await this.utxoTable.addUtxo(txid, j,
                    satoshi, addr.address,
                    addr.descriptor, lockingScript, solvable,
                    blockHash, blockHeight, coinbase);
                if (ret === false) {
                  // console.log('addUtxo: addUtxo fail.');
                  // throw Error('addUtxo: addUtxo fail.');
                }
              }
            }
          }
        }
      }
    }
    // search confirmation-100 over target
    const spentUtxos = await this.utxoTable.getUtxosSpentableConfirmation(100);
    if ((spentUtxos) && (spentUtxos.length !== 0)) {
      for (let j = 0; j < spentUtxos.length; ++j) {
        if (spentUtxos[j]) {
          await this.utxoTable.deleteByOutpoint(spentUtxos[j].outpoint);
        }
      }
    }
    return true;
  }

  async addUtxo(tx) {
    const coinbase = false;
    if (this.parent.isElements === true) {
      const decTx = await this.parent.decodeRawTransaction(tx);
      // console.log('addUtxo tx = ', decTx);
      for (let i = 0; i < decTx.vout.length; ++i) {
        if (decTx.vout[i] && ('scriptPubKey' in decTx.vout[i])) {
          const lockingScript = decTx.vout[i].scriptPubKey.hex;
          const addr = await this.addressService.getAddressInfoByLockingScript(
              lockingScript);
          // console.log('addr = ', addr);
          if (addr) {
            let assetBlinder = emptyBlinder;
            let amountBlinder = emptyBlinder;
            let confidentialKey = '';
            let asset;
            let value;
            const extend = {};
            if ('valuecommitment' in decTx.vout[i]) {
              // get blinder
              const blindingKey = await this.parent.getBlindingKeyWithData(
                  addr);
              confidentialKey = blindingKey.pubkey;
              const unblindData = await Promise.resolve(
                  this.cfd.UnblindRawTransaction({
                    tx: tx,
                    txouts: [{
                      index: i,
                      blindingKey: blindingKey.privkey,
                    }],
                  }));
              if (unblindData.outputs[0]) {
                assetBlinder = unblindData.outputs[0].assetBlindFactor;
                amountBlinder = unblindData.outputs[0].blindFactor;
                asset = unblindData.outputs[0].asset;
                value = unblindData.outputs[0].amount;
              } else {
                throw new error('unblind fail.');
              }
            } else {
              asset = decTx.vout[i].asset;
              value = decTx.vout[i].value;
            }
            const solvable = (!addr.script && addr.path !== '') ? true : false;
            const blockHash = '';
            const blockHeight = -1;
            const ret = await this.utxoTable.addUtxo(decTx.txid, i,
                value, addr.address,
                addr.descriptor, lockingScript, solvable,
                blockHash, blockHeight, coinbase, asset,
                confidentialKey, assetBlinder, amountBlinder, extend);
            if (ret === false) {
              throw Error('addUtxo: addUtxo fail.');
            }
          } else {
            // console.log('unknown address. lockingScript = ', lockingScript);
          }
        } else {
          // console.log("vout = ", decTx.vout[i]);
        }
      }
      // update spendable with txin
      const vin = decTx.vin;
      for (let j = 0; j < vin.length; ++j) {
        if (vin[j]) {
          await this.updateUtxoState(vin[j].txid, vin[j].vout);
        }
      }
    } else {
      const decTx = await this.parent.decodeRawTransaction(tx);
      // console.log('addUtxo tx = ', decTx);
      for (let i = 0; i < decTx.vout.length; ++i) {
        if (decTx.vout[i] && ('scriptPubKey' in decTx.vout[i])) {
          const lockingScript = decTx.vout[i].scriptPubKey.hex;
          const addr = await this.addressService.getAddressInfoByLockingScript(
              lockingScript);
          // console.log('addr = ', addr);
          if (addr) {
            const solvable = (!addr.script && addr.path !== '') ? true : false;
            const ret = await this.utxoTable.addUtxo(decTx.txid, i,
                decTx.vout[i].value, addr.address,
                addr.descriptor, lockingScript, solvable, coinbase);
            if (ret === false) {
              throw Error('addUtxo: addUtxo fail.');
            }
          } else {
            // console.log('unknown address. lockingScript = ', lockingScript);
          }
        } else {
          // console.log("vout = ", decTx.vout[i]);
        }
      }
      // update spendable with txin
      const vin = decTx.vin;
      for (let j = 0; j < vin.length; ++j) {
        if (vin[j]) {
          await this.updateUtxoState(vin[j].txid, vin[j].vout);
        }
      }
    }
    return true;
  }

  async updateUtxo(outpoint, blockHash, blockCount) {
    return await this.utxoTable.updateBlockInfo(
        outpoint, blockHash, blockCount);
  }

  async updateUtxoState(txid, vout, spent = true) {
    return await this.utxoTable.updateSpendable(txid, vout, spent);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteUtxo(outpoint) {
    // delete utxoTable
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteUtxoSpentAndConfirmation(confirmation = 6) {
    // delete utxoTable spent=true, confirm >= 6
  }

  async getUtxoData(outpoint) {
    return await this.utxoTable.getUtxoByOutpoint(outpoint);
  }

  async listUnspent(minimumConf = 6, maximumConf = 9999999999,
      address = '', asset = '', path = '', solvedOnly = false,
      ignoreConfidential = false) {
    const count = await this.configTable.getTipBlockHeight();
    let utxos;
    if (solvedOnly) {
      utxos = await this.utxoTable.getUtxosBlockHeightSolvedUnspentable(
          count, minimumConf, maximumConf, 1, 10000000, ignoreConfidential);
    } else {
      utxos = await this.utxoTable.getUtxosBlockHeightUnspentable(
          count, minimumConf, maximumConf, 1, 10000000, ignoreConfidential);
    }
    if ((address === '') && (asset === '') && (path === '')) {
      return utxos;
    }
    const list = [];
    for (let i = 0; i < utxos.length; ++i) {
      if (!utxos[i]) {
        // do nothing
      } else if ((address !== '') && (utxos[i].address !== address)) {
        // do nothing
        // console.log(`skip address. [${address}]`);
      } else if ((asset !== '') && ('asset' in utxos[i]) && (utxos[i].asset !== asset)) {
        // do nothing
      } else if ((path !== '') && (utxos[i].descriptor.indexOf(path) === -1)) {
        // do nothing
      } else {
        list.push(utxos[i]);
      }
    }
    return list;
  }

  async getMempoolUtxoCount() {
    return await this.utxoTable.getUtxoCountOutsideBlock();
  }
};

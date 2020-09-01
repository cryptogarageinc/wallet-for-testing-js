/* eslint-disable require-jsdoc */
module.exports = class AddressService {
  constructor(databaseService, cfdObject) {
    this.databaseService = databaseService;
    this.addressTable = databaseService.getAddressTable();
    this.configTable = databaseService.getConfigTable();
    this.cfd = cfdObject;
  };

  async initialize(network, masterXprivkey) {
    this.network = network;
    this.mainchainNetwork = network;
    this.masterXprivkey = masterXprivkey;
    if ((network === 'mainnet') || (network === 'testnet') || (network === 'regtest')) {
      this.isElements = false;
    } else {
      if (network === 'liquidv1') {
        this.mainchainNetwork = 'mainnet';
      } else {
        this.mainchainNetwork = 'regtest';
        this.network = 'regtest';
      }
      this.isElements = true;
    }
    return true;
  };

  async getFeeAddress(addrType = 'p2wpkh', label = '', targetIndex = -1, gapLimit = 20) {
    let index = 0;
    if (targetIndex === -1) {
      index = await this.configTable.getBip32FeeCount() + 1;
      if (gapLimit < index) {
        index = 0;
      }
    } else {
      index = targetIndex;
    }
    const result = await this.getAddress(addrType, index, 1, label);

    if (targetIndex === -1) {
      await this.configTable.updateBip32Count(index);
    }
    return result;
  };

  async getReceiveAddress(addrType = 'p2wpkh', label = '', targetIndex = -1, gapLimit = 20) {
    let index = 0;
    if (targetIndex === -1) {
      index = await this.configTable.getBip32Count() + 1;
      if (gapLimit < index) {
        index = 0;
      }
    } else {
      index = targetIndex;
    }
    const result = await this.getAddress(addrType, index, 0, label);

    if (targetIndex === -1) {
      await this.configTable.updateBip32Count(index);
    }
    return result;
  };

  async getAddress(addrType, index, addrRecvType, label = '') {
    // generate hdkey
    const childPath = `${addrRecvType}/${index}`;
    const path = `${this.masterXprivkey}/${childPath}`;
    const extkey = await this.cfd.CreateExtkeyFromParentPath({
      extkey: this.masterXprivkey,
      network: this.mainchainNetwork,
      extkeyType: 'extPubkey',
      path: childPath,
    });
    const pubkey = await this.cfd.GetPubkeyFromExtkey({
      extkey: extkey.extkey,
      network: this.mainchainNetwork,
    });
    const addrInfo = await this.cfd.CreateAddress({
      keyData: {
        hex: pubkey.pubkey,
        type: 'pubkey',
      },
      network: this.network,
      hashType: addrType,
      isElements: this.isElements,
    });
    const extra = {};

    // TODO move to cfd.
    let descriptor = '';
    if (addrType === 'p2pkh') {
      descriptor = `pkh(${path})`;
    } else if (addrType === 'p2sh-p2wpkh') {
      descriptor = `sh(wpkh(${path}))`;
      extra['unlockingScript'] = addrInfo.redeemScript;
    } else if (addrType === 'p2wpkh') {
      descriptor = `wpkh(${path})`;
    }

    // save db
    let result = await this.addressTable.addPubkeyAddress(
        pubkey.pubkey, path, addrInfo.address, addrType,
        addrInfo.lockingScript, descriptor, label, extra);
    if (result === false) {
      result = await this.addressTable.getAddress(addrInfo.address);
    }

    return result;
  };

  async getScriptAddress(script, addrType = 'p2wsh', label = '', relatedPubkey = []) {
    const addrInfo = await this.cfd.CreateAddress({
      keyData: {
        hex: script,
        type: 'redeem_script',
      },
      network: this.network,
      hashType: addrType,
      isElements: this.isElements,
    });
    const pubkeyMap = {'': []};
    let isMultisig = false;
    let descriptor = '';
    try {
      const multisigRet = await this.cfd.GetAddressesFromMultisig( {
        isElements: this.isElements,
        redeemScript: script,
        network: this.network,
        hashType: 'p2wpkh',
      });
      if (multisigRet.pubkeys) {
        isMultisig = true;
        pubkeyMap[''] = multisigRet.pubkeys;
        const pubkeys = (relatedPubkey.length !== multisigRet.pubkeys.length) ?
          multisigRet.pubkeys : relatedPubkey;

        descriptor = this.getMultisigDescriptor(
            addrType, pubkeys, multisigRet.requireNum);
      }
    } catch (error) {
      // not multisig
      if (error.message.indexOf('OP_CHCKMULTISIG(OP_CHECKMULTISIGVERIFY) not found in redeem script.') === -1) {
        console.log(error);
      }
    }
    if (descriptor === '') {
      descriptor = `addr(${addrInfo.address})`;
      if (relatedPubkey.length > 0) {
        pubkeyMap[''] = relatedPubkey;
      }
    }

    let result = await this.addressTable.addScriptAddress(
        script, addrInfo.address, addrType, addrInfo.lockingScript,
        descriptor, label, isMultisig, pubkeyMap, {});
    if (result === false) {
      result = await this.addressTable.getAddress(addrInfo.address);
    }
    return result;
  };

  getMultisigDescriptor(addrType, pubkeys, requireNum) {
    let multisig = `multi(${requireNum}`;
    for (let i = 0; i < pubkeys.length; i++) {
      multisig = multisig + ',' + pubkeys[i];
    }
    multisig = multisig + ')';

    let descriptor = '';
    if (addrType === 'p2sh') {
      descriptor = `sh(${multisig})`;
    } else if (addrType === 'p2sh-p2wsh') {
      descriptor = `sh(wsh(${multisig}))`;
    } else if (addrType === 'p2wsh') {
      descriptor = `wsh(${multisig})`;
    } else {
      descriptor = multisig;
    }
    return descriptor;
  }

  async getAddressInfo(address) {
    return await this.addressTable.getAddress(address);
  };

  async getAddressInfoByPubkey(pubkey, addrType = '') {
    const list = await this.addressTable.getPubkeyAddresses(pubkey);
    if (!list) {
      console.log('getAddressInfoByPubkey fail.');
      return false;
    }
    if (addrType === '') {
      return list[0];
    }
    for (let i = 0; i < list.length; ++i) {
      if (list[i].type === addrType) {
        return list[i];
      }
    }
    return false;
  };

  async getAddressInfoByLockingScript(lockingScript) {
    return await this.addressTable.getAddressByLockingScript(lockingScript);
  };

  async getDescriptor(address) {
    const addrInfo = await this.addressTable.getAddress(address);
    return addrInfo.descriptor;
  };

  async getAddresses() {
    return await this.addressTable.getAddressesAll();
  };

  async getAddressesByLabel(label) {
    return await this.addressTable.getAddressesAll();
  };
};
/*
HDkey
m/44'/(nettype)'/(account)'/(recv/fee)/index

nettype: network. main:0, test:1 -> reg:2?
  or each asset.
account: wallet account.
recv/fee: receive(0) or fee(1)
index: address index
*/

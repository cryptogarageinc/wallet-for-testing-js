'use strict';
// https://www.npmjs.com/package/node-json-rpc2
const RpcClient = require('node-json-rpc2').Client;

const executeRpc = async function(client, method, params) {
  let res;
  try {
    const promise = client.callPromise(method, params, 1.0);
    res = await promise;
  } catch (err) {
    console.log('executeRpc connection err: ', err);
    console.trace();
    throw Error('executeRpc connection error.');
  }
  if (res && ('error' in res) && (res['error'])) {
    console.log('executeRpc error.');
    throw Error('method: ' + res.error);
  } else if (res && ('result' in res)) {
    return res.result;
  } else {
    console.log('executeRpc illegal error.');
    throw Error('executeRpc illegal error.');
  }
};

exports.createConnection = function(host, port, id, password, connectId = '') {
  const config = {
    host: host,
    user: id,
    password: password,
    port: port,
    id: (connectId === '') ? id : connectId,
  };
  return config;
};

exports.BitcoinCli = function(connection) {
  const config = {
    protocol: 'http',
    method: 'POST',
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
  };
  // console.log('config:', config);
  // console.log('requestData:', requestData);
  const client = new RpcClient(config);

  // Blockchain
  this.getblockchaininfo = async function() {
    return await executeRpc(client, 'getblockchaininfo', []);
  };
  this.getblock = async function(blockHash, verbosity = 1) {
    return await executeRpc(client, 'getblock', [blockHash, verbosity]);
  };
  this.getblockhash = async function(count) {
    return await executeRpc(client, 'getblockhash', [count]);
  };
  this.getblockcount = async function() {
    return await executeRpc(client, 'getblockcount', []);
  };
  this.getchaintips = async function() {
    return await executeRpc(client, 'getchaintips', []);
  };
  this.getrawtransaction = async function(
      txid, verbose = false, blockHash = null) {
    return await executeRpc(client, 'getrawtransaction', [txid, verbose, blockHash]);
  };
  // Generating
  this.generatetoaddress = async function(
      nblocks, address, maxtries = 1000000) {
    return await executeRpc(client, 'generatetoaddress',
        [nblocks, address, maxtries]);
  };
  this.getnewaddress = async function(label = null, type = null) {
    return await executeRpc(client, 'getnewaddress', [label, type]);
  };
  // Rawtransactions
  this.sendrawtransaction = async function(hexstring, allowhighfees = false) {
    return await executeRpc(client, 'sendrawtransaction', [hexstring, allowhighfees]);
  };

  // wallet
  this.getaddressinfo = async function(address) {
    return await executeRpc(client, 'getaddressinfo', [address]);
  };
  this.listunspent = async function(
      minConfNum = 0, maxConfNum = 100, addresses = [],
      includeUnsafe = false, queryOptions) {
    return await executeRpc(client, 'listunspent',
        [minConfNum, maxConfNum, [...addresses], includeUnsafe, queryOptions]);
  };
  this.fundrawtransaction = async function(hex, options = '', iswitness = true) {
    return await executeRpc(client, 'fundrawtransaction', [hex, options, iswitness]);
  };
  // util
  this.validateaddress = async function(address) {
    return await executeRpc(client, 'validateaddress', [address]);
  };
  this.directExecute = async function(method, params) {
    return await executeRpc(client, method, params);
  };
};

exports.ElementsCli = function(connection) {
  const config = {
    protocol: 'http',
    method: 'POST',
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
  };
  // console.log('config:', config);
  // console.log('requestData:', requestData);
  const client = new RpcClient(config);

  // Blockchain
  this.getblockchaininfo = async function() {
    return await executeRpc(client, 'getblockchaininfo', []);
  };
  this.getblockhash = async function(count) {
    return await executeRpc(client, 'getblockhash', [count]);
  };
  this.getblockcount = async function() {
    return await executeRpc(client, 'getblockcount', []);
  };
  this.getblock = async function(blockHash, verbosity = 1) {
    return await executeRpc(client, 'getblock', [blockHash, verbosity]);
  };
  this.getchaintips = async function() {
    return await executeRpc(client, 'getchaintips', []);
  };
  this.getrawtransaction = async function(
      txid, verbose = false, blockHash = null) {
    return await executeRpc(client, 'getrawtransaction', [txid, verbose, blockHash]);
  };
  this.getsidechaininfo = async function() {
    return await executeRpc(client, 'getsidechaininfo', []);
  };
  this.getwalletpakinfo = async function() {
    return await executeRpc(client, 'getwalletpakinfo', []);
  };
  // createblindedaddress "address" "blinding_key"
  // this.tweakfedpegscript = async function(claim_script)

  // ---- bitcoin command ----
  // Generating
  this.generatetoaddress = async function(
      nblocks, address, maxtries = 1000000) {
    return await executeRpc(client, 'generatetoaddress',
        [nblocks, address, maxtries]);
  };
  // Rawtransactions
  this.createrawtransaction = async function(
      inputs, outputs, locktime = 0, replaceable = false, outputAssets = null) {
    return await executeRpc(client, 'createrawtransaction',
        [inputs, outputs, locktime, replaceable, outputAssets]);
  };
  this.decoderawtransaction = async function(hexstring, iswitness = true) {
    return await executeRpc(client, 'decoderawtransaction', [hexstring, iswitness]);
  };
  this.gettransaction = async function(txid, includeWatchonly = false) {
    return await executeRpc(client, 'gettransaction', [txid, includeWatchonly]);
  };
  this.rawissueasset = async function(transaction, issuances) {
    return await executeRpc(client, 'rawissueasset', [transaction, issuances]);
  };
  this.rawreissueasset = async function(transaction, reissuances) {
    return await executeRpc(client, 'rawreissueasset', [transaction, reissuances]);
  };
  this.sendrawtransaction = async function(hexstring, allowhighfees = false) {
    return await executeRpc(client, 'sendrawtransaction', [hexstring, allowhighfees]);
  };
  // Wallet
  this.blindrawtransaction = async function(
      hexstring, ignoreblindfail = true, assetCommitments = [],
      blindIssuances = true, totalblinder = '') {
    return await executeRpc(
        client,
        'blindrawtransaction', [
          hexstring,
          ignoreblindfail,
          assetCommitments,
          blindIssuances,
          totalblinder,
        ]);
  };
  this.dumpassetlabels = async function() {
    return await executeRpc(client, 'dumpassetlabels', []);
  };
  this.dumpblindingkey = async function(address) {
    return await executeRpc(client, 'dumpblindingkey', [address]);
  };
  this.dumpmasterblindingkey = async function() {
    return await executeRpc(client, 'dumpmasterblindingkey', []);
  };
  this.dumpissuanceblindingkey = async function(txid, vin) {
    return await executeRpc(client, 'dumpissuanceblindingkey', [txid, vin]);
  };
  this.dumpprivkey = async function(address) {
    return await executeRpc(client, 'dumpprivkey', [address]);
  };
  this.getaddressinfo = async function(address) {
    return await executeRpc(client, 'getaddressinfo', [address]);
  };
  this.getbalance = async function(
      dummy = '*', minConfNum = 0, includeWatchonly = false, assetlabel = '') {
    return await executeRpc(client, 'getbalance',
        [dummy, minConfNum, includeWatchonly, assetlabel]);
  };
  this.getnewaddress = async function(label = null, type = null) {
    return await executeRpc(client, 'getnewaddress', [label, type]);
  };
  this.importblindingkey = async function(address, blindingkey) {
    return await executeRpc(client, 'importblindingkey', [address, blindingkey]);
  };
  this.importprivkey = async function(privkey, label = '', rescan = true) {
    return await executeRpc(client, 'importprivkey', [privkey, label, rescan]);
  };
  this.importpubkey = async function(pubkey, label = '', rescan = true) {
    return await executeRpc(client, 'importpubkey', [pubkey, label, rescan]);
  };
  this.importaddress = async function(
      address, label = '', rescan = true, p2sh = false) {
    return await executeRpc(client, 'importaddress', [address, label, rescan, p2sh]);
  };
  this.listissuances = async function(asset = '') {
    return await executeRpc(client, 'listissuances', [asset]);
  };
  this.listunspent = async function(
      minConfNum = 0, maxConfNum = 100, addresses = [],
      includeUnsafe = false, queryOptions) {
    return await executeRpc(client, 'listunspent',
        [minConfNum, maxConfNum, [...addresses], includeUnsafe, queryOptions]);
  };
  this.signrawtransactionwithwallet = async function(
      hexstring, prevtxs = [], sighashtype = 'ALL') {
    return await executeRpc(client, 'signrawtransactionwithwallet',
        [hexstring, prevtxs, sighashtype]);
  };
  this.unblindrawtransaction = async function(hex) {
    return await executeRpc(client, 'unblindrawtransaction', [hex]);
  };
  this.fundrawtransaction = async function(hex, options = '', iswitness = true) {
    return await executeRpc(client, 'fundrawtransaction', [hex, options, iswitness]);
  };
  this.sendtoaddress = async function(address, amount) {
    return await executeRpc(client, 'sendtoaddress', [address, amount]);
  };
  // util
  this.validateaddress = async function(address) {
    return await executeRpc(client, 'validateaddress', [address]);
  };
  this.directExecute = async function(method, params) {
    return await executeRpc(client, method, params);
  };
};

// curl --user myusername --data-binary '{"jsonrpc": "1.0", "id":"curltest", "method": "signrawtransactionwithkey", "params": ["myhex"] }' -H 'content-type: text/plain;' http://127.0.0.1:8332


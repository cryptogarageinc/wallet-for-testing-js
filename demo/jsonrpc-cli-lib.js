'use strict';
// https://www.npmjs.com/package/node-json-rpc2
const RpcClient = require('node-json-rpc2').Client;

const executeRpc = async function(client, method, params) {
  const promise = client.callPromise(method, params, 1.0);
  const res = await promise;
  if (res && ('error' in res) && (res['error'])) {
    throw Error('method: ' + res.error);
  } else return res.result;
};

exports.createConnection = function(host, port, id, password) {
  const config = {
    host: host,
    user: id,
    password: password,
    port: port,
    id: 'elements-rpc',
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

  // Generating
  this.generatetoaddress = function(nblocks, address) {
    return executeRpc(client, 'generatetoaddress', [nblocks, address]);
  };
  this.getnewaddress = function(label = null, type = null) {
    return executeRpc(client, 'getnewaddress', [label, type]);
  };

  // wallet
  this.getaddressinfo = function(address) {
    return executeRpc(client, 'getaddressinfo', [address]);
  };
  this.listunspent = function(
      minConfNum = 0, maxConfNum = 100, addresses = [],
      includeUnsafe = false, queryOptions) {
    return executeRpc(client, 'listunspent',
        [minConfNum, maxConfNum, [...addresses], includeUnsafe, queryOptions]);
  };
  this.fundrawtransaction = function(hex, options = '', iswitness = true) {
    return executeRpc(client, 'fundrawtransaction', [hex, options, iswitness]);
  };
  // util
  this.validateaddress = function(address) {
    return executeRpc(client, 'validateaddress', [address]);
  };
  this.directExecute = function(method, params) {
    return executeRpc(client, method, params);
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
  this.getblockchaininfo = function() {
    return executeRpc(client, 'getblockchaininfo', []);
  };
  this.getsidechaininfo = function() {
    return executeRpc(client, 'getsidechaininfo', []);
  };
  this.getwalletpakinfo = function() {
    return executeRpc(client, 'getwalletpakinfo', []);
  };
  // createblindedaddress "address" "blinding_key"
  // this.tweakfedpegscript = function(claim_script)

  // ---- bitcoin command ----
  // Generating
  this.generatetoaddress = function(nblocks, address) {
    return executeRpc(client, 'generatetoaddress', [nblocks, address]);
  };
  // Rawtransactions
  this.createrawtransaction = function(
      inputs, outputs, locktime = 0, replaceable = false, outputAssets = null) {
    return executeRpc(client, 'createrawtransaction',
        [inputs, outputs, locktime, replaceable, outputAssets]);
  };
  this.decoderawtransaction = function(hexstring, iswitness = true) {
    return executeRpc(client, 'decoderawtransaction', [hexstring, iswitness]);
  };
  this.gettransaction = function(txid, includeWatchonly = false) {
    return executeRpc(client, 'gettransaction', [txid, includeWatchonly]);
  };
  this.rawissueasset = function(transaction, issuances) {
    return executeRpc(client, 'rawissueasset', [transaction, issuances]);
  };
  this.rawreissueasset = function(transaction, reissuances) {
    return executeRpc(client, 'rawreissueasset', [transaction, reissuances]);
  };
  this.sendrawtransaction = function(hexstring, allowhighfees = false) {
    return executeRpc(client, 'sendrawtransaction', [hexstring, allowhighfees]);
  };
  // Wallet
  this.blindrawtransaction = function(
      hexstring, ignoreblindfail = true, assetCommitments = [],
      blindIssuances = true, totalblinder = '') {
    return executeRpc(
        client,
        'blindrawtransaction', [
          hexstring,
          ignoreblindfail,
          assetCommitments,
          blindIssuances,
          totalblinder,
        ]);
  };
  this.dumpassetlabels = function() {
    return executeRpc(client, 'dumpassetlabels', []);
  };
  this.dumpblindingkey = function(address) {
    return executeRpc(client, 'dumpblindingkey', [address]);
  };
  this.dumpmasterblindingkey = function() {
    return executeRpc(client, 'dumpmasterblindingkey', []);
  };
  this.dumpissuanceblindingkey = function(txid, vin) {
    return executeRpc(client, 'dumpissuanceblindingkey', [txid, vin]);
  };
  this.dumpprivkey = function(address) {
    return executeRpc(client, 'dumpprivkey', [address]);
  };
  this.getaddressinfo = function(address) {
    return executeRpc(client, 'getaddressinfo', [address]);
  };
  this.getbalance = function(
      dummy = '*', minConfNum = 0, includeWatchonly = false, assetlabel = '') {
    return executeRpc(client, 'getbalance',
        [dummy, minConfNum, includeWatchonly, assetlabel]);
  };
  this.getnewaddress = function(label = null, type = null) {
    return executeRpc(client, 'getnewaddress', [label, type]);
  };
  this.importblindingkey = function(address, blindingkey) {
    return executeRpc(client, 'importblindingkey', [address, blindingkey]);
  };
  this.importprivkey = function(privkey, label = '', rescan = true) {
    return executeRpc(client, 'importprivkey', [privkey, label, rescan]);
  };
  this.importpubkey = function(pubkey, label = '', rescan = true) {
    return executeRpc(client, 'importpubkey', [pubkey, label, rescan]);
  };
  this.importaddress = function(
      address, label = '', rescan = true, p2sh = false) {
    return executeRpc(client, 'importaddress', [address, label, rescan, p2sh]);
  };
  this.listissuances = function(asset = '') {
    return executeRpc(client, 'listissuances', [asset]);
  };
  this.listunspent = function(
      minConfNum = 0, maxConfNum = 100, addresses = [],
      includeUnsafe = false, queryOptions) {
    return executeRpc(client, 'listunspent',
        [minConfNum, maxConfNum, [...addresses], includeUnsafe, queryOptions]);
  };
  this.signrawtransactionwithwallet = function(
      hexstring, prevtxs = [], sighashtype = 'ALL') {
    return executeRpc(client, 'signrawtransactionwithwallet',
        [hexstring, prevtxs, sighashtype]);
  };
  this.unblindrawtransaction = function(hex) {
    return executeRpc(client, 'unblindrawtransaction', [hex]);
  };
  this.fundrawtransaction = function(hex, options = '', iswitness = true) {
    return executeRpc(client, 'fundrawtransaction', [hex, options, iswitness]);
  };
  this.sendtoaddress = function(address, amount) {
    return executeRpc(client, 'sendtoaddress', [address, amount]);
  };
  // util
  this.validateaddress = function(address) {
    return executeRpc(client, 'validateaddress', [address]);
  };
  this.directExecute = function(method, params) {
    return executeRpc(client, method, params);
  };
};

// curl --user myusername --data-binary '{"jsonrpc": "1.0", "id":"curltest", "method": "signrawtransactionwithkey", "params": ["myhex"] }' -H 'content-type: text/plain;' http://127.0.0.1:8332


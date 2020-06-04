import {Wallet} from './libs/walletService.d';
import * as cfdjs from 'cfd-js/index.d';

// definition (need export)
export enum TargetNode {
  Bitcoin = 'bitcoin',
  Elements = 'elements',
}

export enum NetworkType {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Regtest = 'regtest',
  LiquidV1 = 'liquidv1',
  LiquidRegtest = 'liquidregtest',
}

export enum AddressKind {
  Legacy = 'legacy',
  P2shSegwit = 'p2sh-segwit',
  Bech32 = 'bech32',
}

export enum AddressType {
  P2wpkh = 'p2wpkh',
  P2pkh = 'p2pkh',
  P2shP2wpkh = 'p2sh-p2wpkh',
  P2wsh = 'p2wsh',
  P2sh = 'p2sh',
  P2shP2wsh = 'p2sh-p2wsh',
}

// type
export interface NodeConnectionInfo {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface NodeConfigurationData {
  bitcoin: NodeConnectionInfo;
  elements: NodeConnectionInfo;
}

export interface BlockData {
  blockHeight: number;
  tx: cfdjs.DecodeRawTransactionResponse[];
}

export interface GetBlockResponse {
  hash: string;
  confirmations: number;
  size: number;
  strippendsize: number;
  weight: number;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  tx: cfdjs.DecodeRawTransactionResponse[];
  nonce: number;
  bits: string;
  previousblockhash: string;
  nextblockhash: string;
}

// --------------------------------------------------------------------------------------
// public
// --------------------------------------------------------------------------------------
/**
 * Wallet manager.
 */
export class WalletManager {
  /**
   * constructor.
   * @param {string} nodeConfigFile node configration file path.
   * @param {string} dirPath directory path.
   * @param {NetworkType} network network type.
   * @param {string} seed master seed.
   * @param {string} masterXprivkey? master xprivkey (ignore seed).
   * @param {string} englishMnemonic? mnemonic by english.
   * @param {string} passphrase? passphrase.
   * @param {number} domainIndex? domain index no.
   * @param {cfdjs} cfdObject? cfd-js object.
   */
  constructor(nodeConfigFile: string, dirPath: string,
      network: NetworkType, seed: string,
      masterXprivkey?: string, englishMnemonic?: string,
      passphrase?: string, domainIndex?: number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cfdObject?: any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCfd(): any;

  initialize(targetNodeType?: TargetNode): Promise<boolean>;

  shutdown(): void;

  createWallet(userIndex: number, userNamePrefix?: string,
      targetNodeType?: TargetNode, inMemoryDatabase?: boolean): Promise<Wallet>;

  getWallet(userIndex: number, userNamePrefix: string,
    targetNodeType: TargetNode): Wallet;

  checkUpdateBitcoinBlock(): Promise<void>;

  checkUpdateElementsBlock(): Promise<void>;

  // use interval function
  // https://nodejs.org/ja/docs/guides/timers-in-node/
  checkUpdateBlock(targetNodeType: TargetNode): Promise<boolean>;

  getBlockCount(targetNodeType: TargetNode): Promise<number>;

  getBlock(targetNodeType: TargetNode,
      blockHash: string): Promise<GetBlockResponse>;

  getBlockHash(targetNodeType: TargetNode, count: number): Promise<string>;

  sendsRawTransaction(targetNodeType: TargetNode, tx: string): string;

  stop(targetNodeType: TargetNode): Promise<string>;

  callRpcDirect(targetNodeType: TargetNode, command: string,
      parameters?: string[]): Promise<string>;
}

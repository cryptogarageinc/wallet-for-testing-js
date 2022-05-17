import {WalletManager, TargetNode, AddressType, AddressKind, NodeConfigurationData, BlockData} from '../walletManager';
import cfdjs from 'cfd-js-wasm/index.d';

export interface UtxoData {
    outpoint: string;
    txid: string;
    vout: number;
    amount: bigint | number;
    address: string;
    descriptor: string;
    lockingScript: string;
    blockHash: string;
    blockHeight: number;
    asset?: string;
    confidentialKey?: string;
    assetBlinder?: string;
    amountBlinder?: string;
    coinbase: boolean;
    spent: boolean;
    solvable: boolean;
    extend: {[key: string]: string};
}

export interface AddressData {
    pubkey?: string;
    path?: string;
    script?: string;
    address: string;
    type: string;
    lockingScript: string;
    descriptor: string;
    label: string;
    multisig?: boolean;
    pubkeyMap?: {[key: string]: string[]};
    extra: {[key: string]: string[]};
}

export interface FundRawTxResponse {
    hex: string;
    fee: bigint | number;
    utxos: UtxoData[];
    isConfidential: boolean;
}

export interface AmountByAddress {
    address: string;
    amount: bigint | number;
}

export interface AmountByAsset {
    asset: string;
    amount: bigint | number;
}

export interface GetBalanceResponse {
    [asset: string]: bigint | number;
}

export interface OutPoint {
    txid: string;
    vout: number;
}

export interface GetSignatureData extends OutPoint {
    pubkey: string;
    signature: string;
    sighashtype: string;
}

export interface ErrorOutPoint extends OutPoint {
    error: string;
}

export interface GetSignaturesResponse {
    signatures: GetSignatureData[];
    complete: boolean;
    errors: ErrorOutPoint[];
}

export interface SignResponse {
    hex: string;
    complete: boolean;
    errors: ErrorOutPoint[];
}

export interface SendToAddressResponse extends OutPoint {
    hex: string;
}

export interface GenerateFundResponse {
    amount: bigint | number;
    count: number;
}

export interface SendAmount {
    address: string;
    amount: bigint | number;
    asset?: string;
}

export interface KeyPair {
    pubkey: string;
    privkey: string;
}

export interface AssetInfo {
    id: string;
    label: string;
    entropy: string;
    isToken: boolean;
}

/**
 * Wallet class.
 */
export class Wallet {
  /**
   * constructor.
   * @param {string} userNamePrefix user name prefix.
   * @param {number} userIndex user index.
   * @param {string} dirPath directory path.
   * @param {string} network network type.
   * @param {string} masterXprivkey master xprivkey.
   * @param {NodeConfigurationData} nodeConfig node config.
   * @param {WalletManager} manager wallet manager.
   * @param {(addrData:AddressData)=>Promise<KeyPair>} blindingKeyFn blindingKey function.
   * @param {boolean} inMemoryDatabase use in-memory database.
   */
  constructor(userNamePrefix: string, userIndex: number, dirPath: string,
      network: string, masterXprivkey: string,
      nodeConfig: NodeConfigurationData, manager: WalletManager,
      blindingKeyFn: (addrData:AddressData)=>Promise<KeyPair>,
      inMemoryDatabase: boolean);

  initialize(): Promise<boolean>;

  getTarget(): TargetNode;

  checkConnection(): Promise<boolean>;

  callbackUpdateBlock(tipBlockCount: number, blockHashList: string[],
    blockTxMap: { [key: string]: BlockData }): Promise<boolean>;

  forceUpdateUtxoData(): Promise<boolean>;

  generate(count: number, address?: string,
    nowait?: boolean): Promise<AmountByAddress>;

  generateWaitCount(count: number, address?: string,
    waitingBlockHeight?: number): Promise<AmountByAddress>;

  getCurrentBlockHeightCache(): Promise<number>;

  generateFund(satoshiAmount: bigint | number,
    nowait?: boolean): Promise<bigint | number>;

  generateFundAndCount(satoshiAmount: bigint | number,
    nowait?: boolean): Promise<GenerateFundResponse>;

  // estimateMode: UNSET or CONSERVATIVE or ECONOMICAL
  sendToAddress(address: string, satoshiAmount: bigint | number,
      asset?: string, estimateMode?: string, feeRateForUnset?: number,
      targetConf?: number): Promise<SendToAddressResponse>;

  // estimateMode: UNSET or CONSERVATIVE or ECONOMICAL
  sendToAddresses(addresses: SendAmount[],
    estimateMode?: string, feeRateForUnset?: number,
    targetConf?: number): Promise<SendToAddressResponse>;

  createRawTransaction(version?: number, locktime?: number,
      txin?: cfdjs.TxInRequest[] | cfdjs.ElementsTxInRequest[],
      txout?: cfdjs.TxOutRequest[] | cfdjs.ElementsTxOutRequest[],
      fee?: AmountByAsset): Promise<cfdjs.CreateRawTransactionResponse |
        cfdjs.ElementsCreateRawTransactionResponse>;

  getNewAddress(addressType?: AddressType | AddressKind | undefined,
      label?: string, targetIndex?: number,
      hasFeeAddress?: boolean): Promise<AddressData>;

  getConfidentialAddress(address: string): Promise<string>;

  getBlindingKey(address: string): Promise<KeyPair>;

  getBlindingKeyWithData(addressData: AddressData): Promise<KeyPair>;

  getUserExtPubkey(): Promise<string>;

  getAddresses(): Promise<AddressData[]>;

  getAddressesByLabel(label: string): Promise<AddressData[]>;

  getAddressInfo(address: string): Promise<AddressData>;

  addMultisigAddress(pubkeys: string[], requireNum?: number,
      addressType?: AddressType | AddressKind,
      label?: string): Promise<AddressData>;

  getScriptAddress(script: string,
      addressType?: AddressType | AddressKind, label?: string,
      relatedPubkeys?: string[]): Promise<AddressData>;

  dumpPrivkey(address?: string, pubkey?: string): Promise<string>;

  estimateSmartFee(confTarget?: number, estimateMode?: string): void;

  setGapLimit(limit?: number): void;

  setAddressType(addressType?: AddressType | AddressKind): void;

  convertAddressType(addressType?: AddressType | AddressKind,
      isScript?: boolean): AddressType;

  getBalance(minimumConf?: number, address?: string, path?: string,
      asset?: string): Promise<GetBalanceResponse>;

  listUnspent(minimumConf?: number, maximumConf?: number,
      address?: string, path?: string, asset?: string): Promise<UtxoData[]>;

  getMempoolUtxoCount(): Promise<number>;

  getUtxoBlockIds(): Promise<string[]>;

  setMinimumFeeRate(minimumFeeRate?: number): Promise<void>

  decodeRawTransaction(tx: string):
      Promise<cfdjs.DecodeRawTransactionResponse |
        cfdjs.ElementsDecodeRawTransactionResponse>;

  fundRawTransaction(tx: string,
      feeAsset?: string, ignoreAssets?: string[]): Promise<FundRawTxResponse>;

  signRawTransactionWithWallet(tx: string, ignoreError?: boolean,
      prevtxs?: OutPoint[],
      sighashtype?: string): Promise<SignResponse>;

  getSignatures(tx: string, ignoreError?: boolean,
      prevtxs?: OutPoint[],
      sighashtype?: string): Promise<GetSignaturesResponse>;

  sendRawTransaction(tx: string): Promise<string>;

  getMinRelayTxFee(): Promise<number>;

  isFindAsset(asset: string): Promise<boolean>;

  isFindAssetByLabel(assetLabel: string): Promise<boolean>;

  getAssetByLabel(assetLabel: string): Promise<AssetInfo>;

  getAssetList(): Promise<{[key: string]: string}>;

  appendAsset(asset: string, assetLabel: string,
    entropy?: string, isToken?: boolean): Promise<boolean>;

  getWalletTxData(txid: string, vout: number): Promise<UtxoData>;

  getNetworkType(): string;

  getMainchainNetworkType(): string;

  getPeggedAsset(): string;

  getFedpegScript(): string;

  getParentBlockHash(): string;

  getPeginConfirmationDepth(): number;
}

interface BigNumber {
  toNumber: () => number;
}

interface TronContract {
  balanceOf: (address: string) => { call: () => Promise<BigNumber> };
  transfer: (address: string, amount: number) => { send: (options: { feeLimit: number }) => Promise<string> };
}

interface TronTransactionInfo {
  receipt: {
    result: 'SUCCESS' | 'FAILED';
  };
}

interface TronWeb {
  ready: boolean;
  defaultAddress: {
    base58: string;
  };
  contract: () => {
    at: (address: string) => Promise<TronContract>;
  };
  trx: {
    getTransactionInfo: (tx: string) => Promise<TronTransactionInfo | null>;
  };
}

interface Window {
  tronWeb?: TronWeb;
}

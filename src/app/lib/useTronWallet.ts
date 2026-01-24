// src/app/lib/useTronWallet.ts
"use client";

import { MetaMaskSDK } from '@metamask/sdk';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

let sdk: MetaMaskSDK | null = null;

export function useTronWallet() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!sdk) {
        sdk = new MetaMaskSDK({
          dappMetadata: {
            name: "Rendimientos",
            url: window.location.origin,
          },
          infuraAPIKey: process.env.NEXT_PUBLIC_INFURA_KEY, // Optional
          logging: { developerMode: false },
          checkInstallationImmediately: true, // Prioritizes mobile deep-link
          storage: { enabled: false }, // Or use localStorage shim if needed
        });
      }

      const ethereum = sdk!.getProvider();
      if (!ethereum) {
        throw new Error('MetaMask provider not available');
      }
      await ethereum.request({ method: 'eth_requestAccounts' });

      const ethersProvider = new ethers.BrowserProvider(ethereum);
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();

      // Switch/add TRON chain
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2b6653dc' }], // TRON Mainnet
        });
      } catch (switchError: unknown) {
        if ((switchError as { code?: number }).code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x2b6653dc',
              chainName: 'TRON Mainnet',
              nativeCurrency: { name: 'TRX', symbol: 'TRX', decimals: 18 },
              rpcUrls: ['https://api.trongrid.io'],
              blockExplorerUrls: ['https://tronscan.org'],
            }],
          });
        } else {
          throw switchError;
        }
      }

      setProvider(ethersProvider);
      setAccount(address);
    } catch (err: unknown) {
      setError((err as Error).message || 'Connection rejected');
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (sdk) {
      sdk.terminate();
    }
    setProvider(null);
    setAccount(null);
    setError(null);
  };

  useEffect(() => {
    if (sdk) {
      const ethereum = sdk.getProvider();
      if (ethereum?.isConnected?.()) {
        connect(); // Auto-restore session
      }
    }
  }, []);

  return { provider, account, connect, disconnect, isConnecting, error };
}
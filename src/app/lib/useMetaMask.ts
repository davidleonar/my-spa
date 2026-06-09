// app/lib/useMetaMask.ts
"use client";

import { MetaMaskSDK } from '@metamask/sdk';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const globalForMetaMask = globalThis as unknown as {
  sdk: MetaMaskSDK | undefined;
};

export function useMetaMask() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!globalForMetaMask.sdk) {
        globalForMetaMask.sdk = new MetaMaskSDK({
          dappMetadata: {
            name: "Rendimientos",
            url: window.location.origin,
          },
          infuraAPIKey: process.env.NEXT_PUBLIC_INFURA_KEY, // optional but recommended
          logging: { developerMode: false },
          checkInstallationImmediately: true, // mobile will open MetaMask immediately
          storage: { enabled: false },
        });
      }

      const ethereum = globalForMetaMask.sdk.getProvider();  // Assert non-null
      if (!ethereum) {
        throw new Error('MetaMask provider not available');
      }
      await ethereum.request({ method: 'eth_requestAccounts' });

      const ethersProvider = new ethers.BrowserProvider(ethereum);
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();

      // Switch/add Polygon if needed
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x89' }], // 137 = Polygon
        });
      } catch (switchError: unknown) {  // ← Change to unknown
        if ((switchError as { code?: number }).code === 4902) {  // Type guard
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x89',
              chainName: 'Polygon',
              nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
              rpcUrls: ['https://polygon-rpc.com'],
              blockExplorerUrls: ['https://polygonscan.com'],
            }],
          });
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

  const disconnect = () => {  // <-- New: Expose this for use in page.tsx
    if (globalForMetaMask.sdk) {
      globalForMetaMask.sdk.terminate();  // Ends the SDK session
    }
    setProvider(null);
    setAccount(null);
    setError(null);  // Optional: Clear errors
  };

  // Auto-reconnect on page load if session exists
  useEffect(() => {
    if (globalForMetaMask.sdk) {
      const ethereum = globalForMetaMask.sdk.getProvider();
      if (!ethereum) {
        throw new Error('MetaMask provider not available');
      }
      if (ethereum.isConnected?.()) {
        connect(); // silently restore
      }
    }
  }, []);

  return { provider, account, connect, disconnect, isConnecting, error };  // <-- Add disconnect to return
}
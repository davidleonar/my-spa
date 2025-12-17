// types.d.ts
import { MetaMaskInpageProvider } from '@metamask/providers';

declare global {
  interface Window {
    ethereum?: MetaMaskInpageProvider; // Precise type for MetaMask's injected provider
  }
}

export {}; // Module marker
"use client";
import { useState, useEffect, useCallback } from "react";
import '../app/globals.css';
import { ArrowsUpDownIcon } from '@heroicons/react/24/outline';
import { QRCodeCanvas } from 'qrcode.react'; 
import { auth, database } from '../app/lib/firebase'; // Adjust path
import { ref, set, serverTimestamp } from "firebase/database";
import {
  GoogleAuthProvider,
  signInWithPopup,
  AuthProvider,
  TwitterAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth'; // npm install react-firebase-hooks
//import { text } from "stream/consumers";

import { getAuth } from 'firebase/auth';
import { Buffer } from 'buffer';
import ReactCountryFlag from 'react-country-flag';
import { countries } from 'countries-list';
import Image from 'next/image';
import { ethers } from 'ethers';
import { useMetaMask } from '@/app/lib/useMetaMask';

export const dynamic = 'force-dynamic';

// Interface for balance data (from getDataById)
interface SpreadsheetRow {
  id: string;
  name: string;
  lastname: string;
  BTCbalance: string;
  COPbalance: string;
  Rendimiento: string;
  AvgCompra: string;
  [key: string]: string | null;
}

// Interface for movement data (from getMovementsById)
interface MovementRow {
  id: string;
  Fecha: string;
  'Saldo COP': string;
  'Precio BTC': string;
  'Precio Dolar': string;
  Total: string;
  Operacion: string;
  [key: string]: string | null;
}

const USDT_ABI = [
  "function transfer(address to, uint256 value) public returns (bool)",
  "function decimals() public view returns (uint8)",
  "function balanceOf(address owner) public view returns (uint256)"  // Add this line
];

// Interface for invoices
interface InvoiceStatus {
  r_hash: string;  // Base64-encoded hash (for verification)
  state: number;   // 2 = SETTLED (per LND enum: https://docs.lightning.engineering/reference/types?ref=docs.lightning.engineering#InvoiceState)
  settled: boolean;
  settle_date: string;  // Unix timestamp when settled
  amt_paid_sat: string; // Amount paid in satoshis
  // ... other fields as needed
}

export default function Home() {
  const [id, setId] = useState<string>("");
  const [data, setData] = useState<SpreadsheetRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // State for BTC/USD price tracking
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  // State for sort order in movements
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // State to toggle email form
  const [showEmailForm, setShowEmailForm] = useState<boolean>(false);

  // MetaMask hook
  const { provider, account, connect, disconnect, isConnecting, error: metamaskError } = useMetaMask();
  const [registrationStatus, setRegistrationStatus] = useState<'pending' | 'success' | null>(null);

  // States for donations
  const [donationAmount, setDonationAmount] = useState<number>(1000); // Default 1000 sats
  const [bolt11, setBolt11] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'settled' | null>(null);
  const [donationError, setDonationError] = useState<string | null>(null);
  const [showDonations, setShowDonations] = useState<boolean>(false);

  // State for copy button
  const [copyButtonText, setCopyButtonText] = useState<string>("Copy Payment Request");
  const [copySavingsButtonText, setCopySavingsButtonText] = useState<string>("Copy Payment Request");
  const [copySavingsButtonTextusdt, setCopySavingsButtonTextusdt] = useState<string>("Copy USDT Polygon Address");

  // States for savings
  const [showSavings, setShowSavings] = useState<boolean>(false);
  const [savingsOption, setSavingsOption] = useState<'bancosColombia' | 'btcLightning' | 'bancosEuropa' | 'bancosUSA' | 'usdtPolygon' | 'usdtTron' | null>(null);
  const [savingsAmount, setSavingsAmount] = useState<number>(1000);
  const [savingsBolt11, setSavingsBolt11] = useState<string | null>(null);
  const [savingsPaymentStatus, setSavingsPaymentStatus] = useState<'pending' | 'settled' | null>(null);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [savingsLoading, setSavingsLoading] = useState<boolean>(false);
  const [savingsPaymentHash, setSavingsPaymentHash] = useState<string | null>(null);

  // States for withdrawals
  const [showWithdrawals, setShowWithdrawals] = useState<boolean>(false);
  const [withdrawalOption, setWithdrawalOption] = useState<'bancosColombia' | 'bancosInternacionales' | 'btcLightning' | 'usdtWallet' | null>(null);

  // States for withdrawal form
  const [withdrawalName, setWithdrawalName] = useState<string>('');
  const [withdrawalId, setWithdrawalId] = useState<string>('');
  const [withdrawalBank, setWithdrawalBank] = useState<string>('');
  const [withdrawalBankName, setWithdrawalBankName] = useState<string>('');
  const [withdrawalCountry, setWithdrawalCountry] = useState<string>('');
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');

  // State for rendering automatico
  const [isClient, setIsClient] = useState(false);

  //States para login
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const [linkEmail, setLinkEmail] = useState(''); // Separate state for email link to avoid conflict
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [emailLinkError, setEmailLinkError] = useState<string | null>(null);
  //const [phone, setPhone] = useState('');
  //const [verificationCode, setVerificationCode] = useState(''); // ← Now used in phone confirmation

  const [usdtSavingsAmount, setUsdtSavingsAmount] = useState<number>(0); // Amount in USDT (e.g., 10.00)
  const [usdtTxHash, setUsdtTxHash] = useState<string | null>(null); // Transaction hash for tracking
  const [usdtPaymentStatus, setUsdtPaymentStatus] = useState<'pending' | 'confirmed' | null>(null);
  const [usdtError, setUsdtError] = useState<string | null>(null);

  const [usdtTronSavingsAmount, setUsdtTronSavingsAmount] = useState<number>(30); // Amount in USDT (e.g., 10.00)
  const [usdtTronTxHash, setUsdtTronTxHash] = useState<string | null>(null); // Transaction hash for tracking
  const [usdtTronPaymentStatus, setUsdtTronPaymentStatus] = useState<'pending' | 'confirmed' | null>(null);
  const [tronWalletConnected, setTronWalletConnected] = useState<boolean>(false);
  const [usdtTronError, setUsdtTronError] = useState<string | null>(null);
  const [copySavingsButtonTextusdtTron, setCopySavingsButtonTextusdtTron] = useState<string>("Copy USDT TRON Address");

  // States para Taproot Assets
  const [showAdminAssets, setShowAdminAssets] = useState(false);
  //const [edgeBalance, setEdgeBalance] = useState<number | null>(null);
  //const [assetsBalances, setAssetsBalances] = useState<{ usdt: number; cop: number }>({ usdt: 0, cop: 0 });
  //const [mintBurnHistory, setMintBurnHistory] = useState<MovementRow[]>([]);

  const [mintAsset, setMintAsset] = useState('');
  const [mintAmount, setMintAmount] = useState(0);
  const [mintUserId, setMintUserId] = useState('');
  
  const [burnAsset, setBurnAsset] = useState('');
  const [burnAmount, setBurnAmount] = useState(0);
  const [burnUserId, setBurnUserId] = useState('');
  const [transferAsset, setTransferAsset] = useState('');
  const [transferFromUserId, setTransferFromUserId] = useState('');
  const [transferToUserId, setTransferToUserId] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  
  const [tapdError, setTapdError] = useState<string | null>(null);
  const [tapdMessage, setTapdMessage] = useState<string | null>(null);
  const [tapdPath, setTapdPath] = useState<string>('v1/getinfo');

  // States for sync
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Para el rendering automatico
  useEffect(() => {
    setIsClient(true); // Set to true after mounting
    console.warn('Missing env:', !process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS && 'USDT address')

    // Handle redirect result for OAuth
    getRedirectResult(auth).then((result) => {
    if (result) {
      console.log('OAuth redirect result:', result.user);
      // Optionally force auth state refresh if needed
      // auth.currentUser?.reload(); // Uncomment if state lags
    } else {
      console.log('getRedirectResult returned null - possible storage block.');
    }
   }).catch((error) => {
    console.error('OAuth redirect error:', error);
    setError(error.message || 'Failed to process redirect result.');
    });

    // Handle email link sign-in
    if (isSignInWithEmailLink(auth, window.location.href)) {
    let storedEmail = window.localStorage.getItem('emailForSignIn');
    if (!storedEmail) {
      // Prompt for email if not stored (fallback for cross-device)
      storedEmail = window.prompt('Please provide your email for confirmation');
    }
    if (storedEmail) {
      signInWithEmailLink(auth, storedEmail, window.location.href)
        .then((result) => {
          console.log('Signed in with email link:', result.user);
          window.localStorage.removeItem('emailForSignIn'); // Clean up
          // Optionally: Redirect or refresh data
          window.location.href = '/'; // Reload to update auth state
        })
        .catch((err) => {
          const error = err as Error;
          setEmailLinkError(error.message);
          console.error('Error signing in with email link:', error);
        });
    }
  }
  //connectTronWallet();
  }, []);

  const actionCodeSettings = {
    url: `${'https://rendimientos.net'}/`,  // Redirect back to this page after clicking the link
    handleCodeInApp: true,                  // Handle the link in the app (not Firebase console)
    LinkDomain: 'rendimientos.net'                  
                                            // Optional: iOS/Android bundle IDs if supporting mobile
  };

  const handleSendEmailLink = async () => {
    if (!linkEmail) {
      setEmailLinkError('Please enter an email.');
      return;
    }
    try {
      await sendSignInLinkToEmail(auth, linkEmail, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', linkEmail); // Store email locally for verification later
      
      setEmailLinkSent(true);
      setEmailLinkError(null);
      console.log('Email link sent successfully.');
    } catch (err) {
      const error = err as Error;
      setEmailLinkError(error.message);
      console.error('Error sending email link:', error);
    }
  };
  /*
  // Phone Auth (requires reCAPTCHA)
    useEffect(() => {
      if (typeof window !== 'undefined') {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      }
    }, []);

    const handlePhoneLogin = async () => {
      try {
        const confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
        const code = verificationCode; // ← Use state (or prompt for testing)
        if (code) await confirmation.confirm(code);
      } catch (err) {
        const error = err as Error;
        setError(error.message);
      }
    };
  */
 // OAuth Providers
   const handleOAuthLogin = async (provider: AuthProvider) => {
  try {
    // Try popup first
    await signInWithPopup(auth, provider);
  } catch (popupErr: unknown) {  // Use 'unknown' for safety, then narrow
    console.error('Popup error:', popupErr);

    // Check if it's an error with 'code' (Firebase style)
    if (popupErr && typeof popupErr === 'object' && 'code' in popupErr) {
      const error = popupErr as { code: string; message?: string };  // Narrow type
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: unknown) {
          const redirectError = redirectErr as Error;  // Assume standard Error
          console.error('Redirect fallback error:', redirectError);
          setError(redirectError.message || 'Redirect authentication failed.');
        }
      } else {
        setError(error.message || 'Popup authentication failed.');
      }
    } else if (popupErr instanceof Error) {
      // Fallback for non-Firebase errors
      setError(popupErr.message || 'Unexpected authentication error.');
    } else {
      setError('Unexpected authentication error.');
    }
  }
};


  // Usage examples:

// Apple: handleOAuthLogin(new AppleAuthProvider()); poner en el import, no olvidar "AppleAuthProvider()"
// Twitter: handleOAuthLogin(new TwitterAuthProvider());
// Microsoft: const msProvider = new OAuthProvider('microsoft.com'); handleOAuthLogin(msProvider);

// Sign out
const handleSignOut = () => {
    auth.signOut();
    window.location.reload();
  };

  // Fetch BTC/USD price from CoinGecko API every 60 seconds
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
        );
        if (!response.ok) throw new Error('Failed to fetch price');
        const data = await response.json();
        const newPrice = data.bitcoin.usd;
        setPrevPrice(currentPrice); // Store previous price before updating
        setCurrentPrice(newPrice);
      } catch (err) {
        console.error('Error fetching BTC price:', err);
      }
    };

    fetchPrice(); // Initial fetch
    const interval = setInterval(fetchPrice, 600000); // Fetch every 60 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [currentPrice]);

  // Determine text color based on price change
  const getColorClass = () => {
    if (prevPrice === null || currentPrice === null) return 'text-white';
    return currentPrice > prevPrice
      ? 'text-green-400' // Price increased
      : currentPrice < prevPrice
      ? 'text-red-400'   // Price decreased
      : 'text-white';    // No change
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setMovements([]); // Reset movements when fetching new balance data
    try {

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) throw new Error("User not authenticated");

      // 1. Get the Firebase ID token from the logged-in user.
      const idToken = await user.getIdToken();

      const response = await fetch(
        `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/getDataById?id=${id}`,
        { method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`, // <-- This is the crucial part
         }}
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
      console.log("Successfully fetched data:", result);
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) throw new Error("User not authenticated");

      // 1. Get the Firebase ID token from the logged-in user.
      const idToken = await user.getIdToken();

      const response = await fetch(
        `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/getMovementsById?id=${id}`,
        { method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`, // <-- This is the crucial part
         }}
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
      console.log("Successfully fetched data:", result);
      setMovements(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch movements");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id) fetchData();
  };

  const handleMovementsClick = () => {
    if (id) fetchMovements();
  };

  // Handle Sort by Date
  const handleSortByDate = () => {
    const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newSortOrder);

    const sortedMovements = [...movements].sort((a, b) => {
      const dateA = new Date(a.Fecha);
      const dateB = new Date(b.Fecha);
      return newSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    });

    setMovements(sortedMovements);
  };

  // Handle WhatsApp chat button click
  const handleWhatsAppClick = () => {
    const phoneNumber = "573014375496"; // Replace with your WhatsApp number
    const message = encodeURIComponent("Hola, tengo dudas sobre...");
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };



  const resetDonation = useCallback(() => {
    setDonationAmount(1000);
    setBolt11(null);
    setPaymentHash(null);
    setPaymentStatus(null);
    setDonationError(null);
    setLoading(false);
  }, []);

  const resetSavings = useCallback(() => {
    setSavingsAmount(1000);
    setSavingsBolt11(null);
    setSavingsPaymentHash(null);
    setSavingsPaymentStatus(null);
    setSavingsError(null);
    setSavingsLoading(false);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Notificaciones para el estado de la factura                       */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    if (paymentHash && paymentStatus === 'pending') {
      interval = setInterval(async () => {
        try {
          // Proxy through your existing LND route: /v1/invoice/{paymentHash}
          const res = await fetch(`/api/lndProxy/v1/invoice/${paymentHash}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to check invoice`);
          
          const invoice: InvoiceStatus = await res.json();
          
          // Check settled status (LND uses 'settled' boolean directly)
          if (invoice.settled) {
            setPaymentStatus('settled');
            console.log('Payment settled! Amount:', invoice.amt_paid_sat, 'sats');

            // Show success toast (optional: replace with toast library later)
            alert(`¡Pago recibido! ${Number(invoice.amt_paid_sat)} sats`);

            // Auto-reset after 3 seconds
            setTimeout(() => {
            resetDonation();
            }, 3000);
          }
        } catch (error) {
          console.error('Check status error:', error);
          setDonationError('Failed to check payment status');
          // Don't stop polling on transient errors
        }
      }, 10000); // Poll every 10s
  
      // Timeout after 5 min
      timeout = setTimeout(() => {
        setPaymentStatus(null);
        setDonationError('Payment check timed out');
        clearInterval(interval);
      }, 300000);
    }
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [paymentHash, paymentStatus, resetDonation]);


  /* ------------------------------------------------------------------ */
  /*  Generar la factura                                                */
  /* ------------------------------------------------------------------ */
  const generateDonationInvoice = async () => {
    if (donationAmount <= 0) {
      setDonationError('Amount must be greater than 0');
      return;
    }
    setDonationError(null);
    setPaymentStatus('pending');
    setLoading(true);

    try {

      // 1. Get the Firebase ID token from the logged-in user.
      const value_msat = donationAmount * 1000;
      const body = {
        value_msat: value_msat,
        memo: 'Donation from App',
        expiry: '300',
        private: false,
        add_index: 1,
      };
      console.log('Sending donation request:', body);
      const res = await fetch('/api/lndProxy/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Proxy error:', errorText);
        throw new Error(`Server error: ${res.status}`);
      }
  
      const data = await res.json();
      console.log("LND response:", data);

      if (data.payment_request) {
        setBolt11(data.payment_request);
        setPaymentHash(Buffer.from(data.r_hash, 'base64').toString('hex'));;
        setPaymentStatus("pending");
        console.log("Set bolt11:", data.payment_request);
      } else {
        throw new Error("No payment_request in LND response");
      }
    
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error("Donation invoice error:", e);
      setDonationError(message);
      setPaymentStatus(null);
    } finally {
      setLoading(false);
    }
};

  // Maneja el boton de copiar y pegar
  const handleCopyPaymentRequest = async () => {
    if (!bolt11) {
      setCopyButtonText("No Payment Request");
      setTimeout(() => setCopyButtonText("Copy Payment Request"), 2000);
      return;
    }
  
    try {
      // Check if Clipboard API is available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(bolt11);
        setCopyButtonText("Copied!");
        setTimeout(() => setCopyButtonText("Copy Payment Request"), 2000);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = bolt11;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          setCopyButtonText("Copied!");
          setTimeout(() => setCopyButtonText("Copy Payment Request"), 2000);
        } catch {
          throw new Error("Clipboard copy failed via fallback");
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error("Clipboard error:", err);
      setCopyButtonText("Copy Failed");
      setTimeout(() => setCopyButtonText("Copy Payment Request"), 2000);
      }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;

    if (savingsPaymentHash && savingsPaymentStatus === 'pending') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/lndProxy/v1/invoice/${savingsPaymentHash}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to check invoice`);
          
          const invoice: InvoiceStatus = await res.json();
          
          if (invoice.settled) {
            setSavingsPaymentStatus('settled');
            console.log('Savings settled! Amount:', invoice.amt_paid_sat, 'sats');
            alert(`¡Ahorro recibido! ${Number(invoice.amt_paid_sat)} sats`);

            if (user) {
              const savingsData = {
                userId: user.uid,
                amount: Number(invoice.amt_paid_sat),
                settledAt: serverTimestamp(),
                r_hash: savingsPaymentHash,
                network: 'BTC Lightning',
              };
              await set(ref(database, `userSavings/${user.uid}/${savingsPaymentHash}`), savingsData);
            }

            setTimeout(() => {
            resetSavings();
            }, 3000);
          }
        } catch (error) {
          console.error('Check savings status error:', error);
          setSavingsError('Failed to check payment status');
        }
      }, 10000);
  
      timeout = setTimeout(() => {
        setSavingsPaymentStatus(null);
        setSavingsError('Savings check timed out');
        clearInterval(interval);
      }, 300000);
    }
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [savingsPaymentHash, savingsPaymentStatus, resetSavings, user]);

  const generateSavingsInvoice = async () => {
    if (savingsAmount <= 0) {
      setSavingsError('Amount must be greater than 0');
      return;
    }
    setSavingsError(null);
    setSavingsPaymentStatus('pending');
    setSavingsLoading(true);

    try {
      const value_msat = savingsAmount * 1000;
      const body = {
        value_msat: value_msat,
        memo: `Savings from${user ? ` ${user.displayName}` : ''}`,
        expiry: '300',
        private: false,
        add_index: 1,
      };
      console.log('Sending savings request:', body);
      const res = await fetch('/api/lndProxy/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Proxy error:', errorText);
        throw new Error(`Server error: ${res.status}`);
      }
  
      const data = await res.json();
      console.log("LND response:", data);

      if (data.payment_request) {
        setSavingsBolt11(data.payment_request);
        setSavingsPaymentHash(Buffer.from(data.r_hash, 'base64').toString('hex'));
        setSavingsPaymentStatus("pending");
        console.log("Set savings bolt11:", data.payment_request);
      } else {
        throw new Error("No payment_request in LND response");
      }
    
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      console.error("Savings invoice error:", e);
      setSavingsError(message);
      setSavingsPaymentStatus(null);
    } finally {
      setSavingsLoading(false);
    }
  };

  const handleCopySavingsRequest = async () => {
    if (!savingsBolt11) {
      setCopySavingsButtonText("No Payment Request");
      setTimeout(() => setCopySavingsButtonText("Copy Payment Request"), 2000);
      return;
    }
  
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(savingsBolt11);
        setCopySavingsButtonText("Copied!");
        setTimeout(() => setCopySavingsButtonText("Copy Payment Request"), 2000);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = savingsBolt11;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          setCopySavingsButtonText("Copied!");
          setTimeout(() => setCopySavingsButtonText("Copy Payment Request"), 2000);
        } catch {
          throw new Error("Clipboard copy failed via fallback");
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error("Clipboard error:", err);
      setCopySavingsButtonText("Copy Failed");
      setTimeout(() => setCopySavingsButtonText("Copy Payment Request"), 2000);
      }
  };

  const handleCopySavingsRequestusdt = async () => {
    if (!process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS) {
      setCopySavingsButtonTextusdt("No USDT Address");
      setTimeout(() => setCopySavingsButtonTextusdt("Copy Payment Request"), 2000);
      return;
    }
  
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS);
        setCopySavingsButtonTextusdt("Copied!");
        setTimeout(() => setCopySavingsButtonTextusdt("Copy USDT Address"), 2000);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          setCopySavingsButtonTextusdt("Copied!");
          setTimeout(() => setCopySavingsButtonTextusdt("Copy USDT Address"), 2000);
        } catch {
          throw new Error("Clipboard copy failed via fallback");
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (err) {
      console.error("Clipboard error:", err);
      setCopySavingsButtonTextusdt("Copy Failed");
      setTimeout(() => setCopySavingsButtonTextusdt("Copy USDT Address"), 2000);
      }
  };

  const handleWithdrawalSubmit = async () => {
    if (!user) {
      // Handle not logged in user
      alert('You must be logged in to make a withdrawal.');
      return;
    }

    if (!withdrawalName || !withdrawalId || !withdrawalBank || !withdrawalBankName || !withdrawalAmount) {
      // Handle form validation
      alert('Please fill out all fields.');
      return;
    }

    const withdrawalData = {
      userId: user.uid,
      name: withdrawalName,
      id: withdrawalId,
      bank: withdrawalBank,
      bankName: withdrawalBankName,
      amount: withdrawalAmount,
      timestamp: serverTimestamp(),
    };

    try {
      await set(ref(database, `withdrawals/${user.uid}/${Date.now()}`), withdrawalData);
      // Reset form fields
      setWithdrawalName('');
      setWithdrawalId('');
      setWithdrawalBank('');
      setWithdrawalBankName('');
      setWithdrawalAmount('');
      alert('Withdrawal request submitted successfully!');
    } catch (err: unknown) {  // Change 'any' to 'unknown'
      console.error('Error submitting withdrawal:', err);
      let userMessage = 'Failed to submit withdrawal. Please try again.';
      if (err instanceof Error && err.message === 'PERMISSION_DENIED') {  // Narrow type via guards
        userMessage = 'Access denied: You may not have permission for this action. Please check your login.';
      } else if (err instanceof Error && err.message?.includes('auth')) {
        userMessage = 'Authentication error: Please sign in again.';
      }
      alert(userMessage);
    }
};

  const handleIntWithdrawalSubmit = async () => {
    if (!user) {
      alert('You must be logged in to make a withdrawal.');
      return;
    }

    if (!withdrawalName || !withdrawalId || !withdrawalBank || !withdrawalBankName || !withdrawalCountry || !withdrawalAmount) {
      alert('Please fill out all fields.');
      return;
    }

    const intWithdrawalData = {
      userId: user.uid,
      name: withdrawalName,
      id: withdrawalId,
      bank: withdrawalBank,
      bankName: withdrawalBankName,
      country: withdrawalCountry,
      amount: withdrawalAmount,
      timestamp: serverTimestamp(),
    };

    try {
      await set(ref(database, `IntWithdrawals/${user.uid}/${Date.now()}`), intWithdrawalData);
      setWithdrawalName('');
      setWithdrawalId('');
      setWithdrawalBank('');
      setWithdrawalBankName('');
      setWithdrawalCountry('');
      setWithdrawalAmount('');
      alert('International withdrawal request submitted successfully!');
    } catch (err: unknown) {  // Change 'any' to 'unknown'
      console.error('Error submitting withdrawal:', err);
      let userMessage = 'Failed to submit withdrawal. Please try again.';
      if (err instanceof Error && err.message === 'PERMISSION_DENIED') {  // Narrow type via guards
        userMessage = 'Access denied: You may not have permission for this action. Please check your login.';
      } else if (err instanceof Error && err.message?.includes('auth')) {
        userMessage = 'Authentication error: Please sign in again.';
      }
      alert(userMessage);
    }
};

/* ------------------------------------------------------------------ */
  /*  Para manejar el deposito USDT Polygon                                                */
  /* ------------------------------------------------------------------ */
const handleUsdtDeposit = async () => {
  if (!provider || !account || !user?.uid) {
    setUsdtError('Wallet not connected or user not authenticated');
    return;
  }

  setUsdtError(null);
  setUsdtPaymentStatus('pending');

  try {
    const signer = await provider.getSigner();
    const usdtContract = new ethers.Contract(
      process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS!,
      USDT_ABI,
      signer
    );

    const amount = ethers.parseUnits(usdtSavingsAmount.toString(), 6); // USDT: 6 decimals

    const tx = await usdtContract.transfer(
      process.env.NEXT_PUBLIC_POLYGON_APP_WALLET_ADDRESS!, // Your app wallet
      amount
    );

    setUsdtTxHash(tx.hash);

    // Wait for 1 confirmation (Polygon: fast, ~15s/block)
    const receipt = await tx.wait(1);
    setUsdtPaymentStatus('confirmed');

    // Register in RTDB (after confirmation)
    const savingsRef = ref(database, `userSavings/${user.uid}/${tx.hash}`);
    await set(savingsRef, {
      userId: user.uid, // Required per rules.json for validation
      txHash: tx.hash,
      amount: usdtSavingsAmount, // Raw amount (number)
      chain: 'polygon',
      asset: 'usdt',
      timestamp: serverTimestamp(), // Server-side timestamp for accuracy/security
      status: 'Confirmed', // Optional: Track state
      receipt: { // Optional: Store minimal receipt info (avoid full for size)
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      },
    });

    console.log('Deposit registered in RTDB');
    // Optional: Update UI or fetch balances
    setRegistrationStatus('success');

  } catch (err: unknown) {
    setUsdtError((err as Error).message || 'Deposit failed');
    setUsdtPaymentStatus(null);
    console.error(err);
  }
};

const handleCopySavingsRequestusdtTron = async () => {
  if (!process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS) {
    setCopySavingsButtonTextusdtTron("No USDT Address");
    setTimeout(() => setCopySavingsButtonTextusdtTron("Copy USDT TRON Address"), 2000);
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS);
      setCopySavingsButtonTextusdtTron("Copied!");
      setTimeout(() => setCopySavingsButtonTextusdtTron("Copy USDT TRON Address"), 2000);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopySavingsButtonTextusdtTron("Copied!");
        setTimeout(() => setCopySavingsButtonTextusdtTron("Copy USDT TRON Address"), 2000);
      } catch {
        throw new Error("Clipboard copy failed via fallback");
      } finally {
        document.body.removeChild(textArea);
      }
    }
  } catch (err) {
    console.error("Clipboard error:", err);
    setCopySavingsButtonTextusdtTron("Copy Failed");
    setTimeout(() => setCopySavingsButtonTextusdtTron("Copy USDT TRON Address"), 2000);
    }
};

const connectTronWallet = async () => {
  if (window.tronWeb && window.tronWeb.ready) {
    setTronWalletConnected(true);
    setUsdtTronError(null);
    console.log('TronLink connected.');
  } else {
    setUsdtTronError('TronLink not detected. Please install the extension and unlock your wallet.');
  }
};

const initiateUsdtTronDeposit = async () => {
  setUsdtTronError(null);
  if (!window.tronWeb || !window.tronWeb.ready) {
    setUsdtTronError('TronLink not connected. Please connect your wallet first.');
    return;
  }
  console.log('Initiating USDT TRON deposit of', usdtTronSavingsAmount, 'USDT');
  try {
    const tronWeb = window.tronWeb;
    const contract = await tronWeb.contract().at(process.env.NEXT_PUBLIC_TRON_USDT_CONTRACT_ADDRESS!);

    //const userAddress = tronWeb.defaultAddress.base58;
    //const balance = await contract.balanceOf(userAddress).call();
    const amountSun = usdtTronSavingsAmount * 1e6; // USDT on TRON has 6 decimals

    /*
    if (balance.toNumber() < amountSun) {
      throw new Error(`Insufficient USDT balance. You have ${balance.toNumber() / 1e6} USDT available.`);
    }
    */

    const tx = await contract.transfer(
      process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS!,
      amountSun
    ).send({
      feeLimit: 100000000, // 100 TRX fee limit
    });

    console.log('USDT TRON deposit transaction sent. Hash:', tx);
    setUsdtTronTxHash(tx);
    setUsdtTronPaymentStatus('pending');

    await fetch('/api/recordUsdtTronDeposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: tx, amount: usdtTronSavingsAmount, userId: user?.uid }),
        });

    setUsdtTronPaymentStatus('confirmed');
    
    /*
    // Poll for confirmation
    let receipt = null;
    while (receipt === null) {
      receipt = await tronWeb.trx.getTransactionInfo(tx);
      if (receipt && receipt.receipt.result === 'SUCCESS') {
        setUsdtTronPaymentStatus('confirmed');
        console.log('USDT TRON deposit confirmed.');
        await fetch('/api/recordUsdtTronDeposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash: tx, amount: usdtTronSavingsAmount, userId: user?.uid }),
        });
      } else if (receipt && receipt.receipt.result === 'FAILED') {
        throw new Error('Transaction failed on-chain');
      }
      await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3s
    }
    */

  } catch (err: unknown) {
    const error = err as Error;
    let message = error.message || 'Deposit failed. Check wallet balance/gas.';
    if (message.includes('Insufficient USDT balance')) {
      message = 'Insufficient USDT balance in your wallet on TRON. Please add funds and retry.';
    } else if (message.includes('User rejected the request')) {
      message = 'Transaction rejected by user.';
    }
    console.error('USDT TRON deposit error:', error);
    setUsdtTronError(message);
    setUsdtTronPaymentStatus(null);
  }
};

const handleMint = async () => {
  if (!mintAsset || mintAmount <= 0 || !mintUserId) return alert('Invalid input');
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) throw new Error("User not authenticated");

      // 1. Get the Firebase ID token from the logged-in user.
    const token = await user.getIdToken();

    const body = {
        asset: mintAsset,
        amount: mintAmount,
        userId: mintUserId,
        memo: 'Donation from App',
        expiry: '300',
        private: false,
        add_index: 1,
      };
      console.log('Sending donation request:', body);

      const res = await fetch('/api/tapdProxy/v1/taproot-assets/assets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({body}),
      });
    
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Proxy error:', errorText);
        throw new Error(`Server error: ${res.status}`);
      }
  
      const data = await res.json();
      console.log("TAPD response:", data);

      setTapdError(null);
      alert('Mint successful');

    }
    catch (err: unknown) {
    const error = err as Error;
    const message = error.message || 'Mint failed. Please try again.';
    setTapdError(message);
    console.error('Mint error:', error);
  }
};
// Similar for handleBurn, handleTransfer (use /burnAsset, /transferAsset)

/* ------------------------------------------------------------------ */
/*  GET – Funcion para obtener info de TAPD            */
/* ------------------------------------------------------------------ */
const handleGet = async () => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) throw new Error("User not authenticated");

      // 1. Get the Firebase ID token from the logged-in user.
    const token = await user.getIdToken();

      const res = await fetch(`/api/tapdProxy/${tapdPath}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Proxy error:', errorText);
        throw new Error(`Server error: ${res.status}`);
      }
  
      const data = await res.json();
      console.log("TAPD response:", data);

      setTapdError(null);
      setTapdMessage('Get successful');
      //alert('Get successful');

      setBurnAsset('ok');
      setBurnAmount(1);
      setBurnUserId('ok');
      setTransferAsset('ok');
      setTransferAmount(1);
      setTransferToUserId('ok');

    }
    catch (err: unknown) {
    const error = err as Error;
    const message = error.message || 'Get failed. Please try again.';
    setTapdError(message);
    console.error('Get error:', error);
  }
};

//---------------------------------------------------------------- */
// Handle loading state
//---------------------------------------------------------------- */

const handleSync = async () => {
  if (!user) return; // Safety check, though admin section already gates this

  setSyncLoading(true);
  setSyncMessage(null);
  setSyncError(null);

  try {
    const idToken = await user.getIdToken(); // Get Firebase ID token for auth
    const response = await fetch('https://us-central1-rendimientos-5dbb9.cloudfunctions.net/syncSheetsToRTDB', {
      method: 'GET', // Matches the function's onRequest (handles GET)
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Sync failed');
    }

    const data = await response.json();
    setSyncMessage(data.message || 'Sync completed successfully');
    
  } catch (err: unknown) {
    const error = err as Error;
    setSyncError(error.message || 'An error occurred during sync');
    console.error('Sync error:', err);
  } finally {
    setSyncLoading(false);
  }
};

  /*
  if (loadingAuth) {
    return <div className="flex justify-center items-center h-screen">Loading authentication...</div>;
  }
  */
 
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">

      {loadingAuth ? (
          <p className="text-center">Cargando autenticación...</p>
        ) : user ? (
          <div className="text-center mb-4">
            <p>Bienvenido, {user.displayName || user.email}!</p>
            <button onClick={handleSignOut} className="px-5 py-1 bg-red-800 rounded text-white hover:bg-red-700">
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <div className="mt-6 p-4 bg-gray-800 rounded">
            <Image
              src="/pig.png"  // Replace with your actual image filename (e.g., /my-image.jpg)
              alt="Login Header Image"
              width={1520}
              height={1850}
              className="w-full h-auto rounded-lg mb-4"  // Responsive: full width, auto height, with margin below
              priority  // Optional: Prioritize loading if it's critical
            />
            <h2 className="text-xl font-bold mb-4 text-center">Iniciar Sesión / Registrarse</h2>
            
            {/* OAuth Buttons */}
            <button onClick={() => handleOAuthLogin(new GoogleAuthProvider())} className="w-full px-4 py-2 bg-red-500 rounded text-white mb-2">
              Iniciar con Google
            </button>
            <button onClick={() => handleOAuthLogin(new TwitterAuthProvider())} className="w-full px-4 py-2 bg-gray-900 rounded text-white mb-2">
              Iniciar con X
            </button>
            <a 
              className="text-gray-400 underline cursor-pointer block text-center mt-2"
              onClick={() => setShowEmailForm(!showEmailForm)}
            >
              Iniciar Sesión con Email
            </a>
            
            {showEmailForm && (
              <>
                
                {/* New Email Link Section */}
                <div className="mt-4">
                  <h3 className="text-md font-semibold mb-2">Ingresa tu Email</h3>
                  <input
                    type="email"
                    value={linkEmail}
                    onChange={(e) => setLinkEmail(e.target.value)}
                    placeholder="Ingresa tu email para el enlace mágico"
                    className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                  />
                  <button
                    onClick={handleSendEmailLink}
                    className="w-full px-2 py-2 bg-purple-800 rounded text-white mb-6 text-sm"
                  >
                    Enviar link de Ingreso
                  </button>
                  {emailLinkSent && <p className="text-green-400">¡Link enviado! Revisa tu correo.</p>}
                  {emailLinkError && <p className="text-red-800">{emailLinkError}</p>}
                </div>
              </>
            )}
          
            {errorAuth && <p className="text-red-400 mt-2">{errorAuth.message}</p>} 
          </div>
        )}
        {/* Add reCAPTCHA container (hidden) */}
        <div id="recaptcha-container" className="hidden"></div>

          {/* BTC/USD Price Banner */}
          {currentPrice !== null ? (
            <div className={`mb-4 p-2 rounded text-center ${getColorClass()}`}>
              <p>BTC/USD: ${currentPrice.toLocaleString()}</p>
            </div>
          ) : (
            <div className="mb-4 p-2 rounded text-center text-gray-400">
              <p>Loading BTC price...</p>
            </div>
          )}

        {user && (
          <>
            <h1 className="text-2xl font-bold mb-4 text-center">Saldos de Cuenta</h1>
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="Ingresa tu ID o cedula"
                className="w-full p-2 bg-gray-600 rounded text-white border border-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 disabled:bg-gray-500 transition-colors"
              >
                {loading ? "Cargando..." : "Obtener Datos"}
              </button>
            </form>

            {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

            {data.length > 0 ? (
              <div>
                {data.map((item, index) => (
                  <div key={index} className="bg-gray-700 p-4 rounded shadow mb-4">
                    <h2 className="text-xl font-bold mb-2 text-center">
                      {item.name} {item.lastname}
                    </h2>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-300">BTC Balance:</span>
                      <span className="text-green-400">{item.BTCbalance} BTC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-300">Saldo (Pesos):</span>
                      <span className="text-green-400">{item.COPbalance} COP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-300">Rendimiento:</span>
                      <span className="text-green-400">{item.Rendimiento}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-300">Precio Promedio Compra:</span>
                      <span className="text-green-400">{item.AvgCompra}</span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleMovementsClick}
                  disabled={loading}
                  className="w-full mt-4 px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-700 disabled:bg-gray-500 transition-colors"
                >
                  {loading ? "Cargando..." : "Mostrar Movimientos"}
                </button>
              </div>
            ) : (
              !loading && (
                <p className="text-gray-400 text-center">
                  No balances found. Enter an ID to fetch.
                </p>
              )
            )}

            {movements.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-center mb-4">
                  <h2 className="text-xl font-bold">Movimientos</h2>
                  <button
                    onClick={handleSortByDate}
                    className="ml-2 text-gray-400 hover:text-white focus:outline-none"
                    title={`Ordenar por fecha (${sortOrder === 'asc' ? 'ascendente' : 'descendente'})`}
                  >
                    <ArrowsUpDownIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  {movements.map((item, index) => (
                    <div key={index} className="bg-gray-700 p-4 rounded shadow">
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Fecha:</span>
                        <span>{item.Fecha}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Saldo COP:</span>
                        <span className="text-gray-300">{item['Saldo COP']}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Precio BTC:</span>
                        <span className="text-gray-300">{item['Precio BTC']}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Precio Dolar:</span>
                        <span className="text-gray-300">{item['Precio Dolar']}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Total BTC:</span>
                        <span className="text-gray-300">{item.Total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-300">Operación:</span>
                        <span
                          className={
                            item.Operacion === 'Compra'
                              ? 'text-green-400'
                              : item.Operacion === 'Venta'
                              ? 'text-red-400'
                              : 'text-gray-300'
                          }
                        >
                          {item.Operacion}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-center mt-4">
                <div className="w-8 h-8 border-4 border-t-blue-500 border-gray-300 rounded-full animate-spin"></div>
              </div>
            )}
          </>
        )}

        {user && (
          <div className="mt-6">
                      <h2
                        className="text-lg font-bold mb-4 text-center cursor-pointer"              onClick={() => setShowSavings(!showSavings)}
            >
              Ahorra Aqui {showSavings ? '▲' : '▼'}
            </h2>
            {showSavings && (
              <div className="bg-gray-700 p-4 rounded shadow">
                <div className="flex flex-col space-y-4">
                  <button
                    onClick={() => setSavingsOption('bancosColombia')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'bancosColombia' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Colombia
                  </button>
                  <button
                    onClick={() => setSavingsOption('btcLightning')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'btcLightning' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    BTC Lightning
                  </button>
                  <button
                    onClick={() => setSavingsOption('bancosEuropa')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'bancosEuropa' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Europa
                  </button>
                  <button
                    onClick={() => setSavingsOption('bancosUSA')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'bancosUSA' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos USA
                  </button>
                  <button
                    onClick={() => setSavingsOption('usdtPolygon')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'usdtPolygon' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    USDT (Polygon)
                  </button>
                  <button
                    onClick={() => setSavingsOption('usdtTron')}
                    className={`px-4 py-2 rounded ${
                      savingsOption === 'usdtTron' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    USDT (TRON)
                  </button>
                </div>

                {savingsOption === 'bancosColombia' && (
                  <div className="mt-4 text-center p-4 bg-gray-800 rounded">
                    <p className="text-lg">@3014375496</p>
                    <p className="text-xs mt-2">Usa esta llave para realizar transferencias desde cualquier banco en Colombia. La cantidad no debe ser superior a 1.000.000 Pesos, una vez realizada la transferencia, enviar el comprobante haciendo click en &apos;Contacto&apos;. si requieres cantidades mayores, hacer click primero en &apos;Contacto&apos;</p>
                  </div>
                )}

                {savingsOption === 'bancosEuropa' && (
                  <div className="mt-4 text-center p-4 bg-gray-800 rounded text-xs">
                    <p>My IBAN account details:</p>
                    <p>Recipient name: Bridge Building Sp. Z.o.o.</p>
                    <p>IBAN: LU77 4080 0000 4178 5760</p>
                    <p>Bank name and address: Banking Circle S.A, 2 Boulevard de la Foire Luxembourg City L-1528 Luxembourg</p>
                  </div>
                )}

                {savingsOption === 'bancosUSA' && (
                  <div className="mt-4 text-center p-4 bg-gray-800 rounded text-xs">
                    <p>Recipient name: David Leonardo Paniagua Pimienta</p>
                    <p>Recipient address: 200 North LaSalle St, Suite 2650</p>
                    <p>Chicago, IL 60601</p>
                    <p>Routing Number: 101019644</p>
                    <p>Account Number: 212277376240</p>
                    <p>Bank Name: Lead Bank</p>
                    <p>Bank Address: 1801 Main St., Kansas City, MO 64108</p>
                  </div>
                )}

                {savingsOption === 'btcLightning' && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2 text-center">Savings (BTC Lightning)</h3>
                    <input
                      type="number"
                      value={savingsAmount}
                      onChange={(e) => setSavingsAmount(parseInt(e.target.value) || 1000)}
                      placeholder="Amount (sat)"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <button
                      onClick={generateSavingsInvoice}
                      disabled={savingsAmount <= 0 || savingsPaymentStatus === 'pending'}
                      className="w-full px-4 py-2 bg-blue-600 rounded mb-4 disabled:bg-gray-500"
                      title={savingsAmount <= 0 ? 'Enter an amount greater than 0' : savingsPaymentStatus === 'pending' ? 'Waiting for payment' : ''}
                    >
                      Generate Savings Invoice
                    </button>
                    {savingsLoading && (
                      <div className="flex justify-center mt-4"></div>
                    )}
                    {isClient && savingsBolt11 && (
                      <div className="text-center">
                        <QRCodeCanvas value={savingsBolt11} size={128} className="mx-auto" />
                        <p className="mt-2">Scan to save {savingsAmount} sats</p>
                        <p className="mt-4 text-sm text-gray-300 break-all px-4">
                          Payment Request: {savingsBolt11}
                        </p>
                        <button
                          onClick={handleCopySavingsRequest}
                          className="mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                        >
                          {copySavingsButtonText}
                        </button>
                      </div>
                    )}
                    {savingsPaymentStatus === 'pending' && <p className="text-yellow-400 mt-2">Payment pending...</p>}
                    {savingsPaymentStatus === 'settled' && <p className="text-green-400 mt-2">Payment received! Thank you.</p>}
                    {savingsPaymentStatus === 'settled' && (
                      <button
                        onClick={resetSavings}
                        className="w-full mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700"
                      >
                        Create New Savings Invoice
                      </button>
                    )}
                    {savingsError && <p className="text-red-400 mt-2">{savingsError}</p>}
                  </div>
                )}

                {savingsOption === 'usdtPolygon' && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2 text-center">Savings (USDT on Polygon)</h3>
                    <input
                      type="number"
                      value={usdtSavingsAmount}
                      onChange={(e) => setUsdtSavingsAmount(parseFloat(e.target.value) || 10)}
                      placeholder="Amount (USDT)"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Send manually to: {process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS}</p>
                      <button
                          onClick={handleCopySavingsRequestusdt}
                          className="mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                        >
                          {copySavingsButtonTextusdt}
                        </button>
                        <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Or scan the QR on your wallet app</p>
                    </div>
                      <QRCodeCanvas value={`ethereum:${process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS}?value=${usdtSavingsAmount}&chain=137&token=${process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS}`} size={128} className="mx-auto" />
                    </div>

                    <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Or connect your wallet to deposit USDT</p>
                    </div>
                    
                    {!account ? (
                      <button
                        onClick={connect}
                        disabled={isConnecting}
                        className="w-full px-4 py-2 bg-indigo-600 rounded text-white hover:bg-indigo-700 disabled:bg-gray-500"
                      >
                        {isConnecting ? 'Opening MetaMask…' : 'Connect Wallet (MetaMask or any)'}
                      </button>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm text-green-400">✓ Connected</p>
                        <p className="text-xs break-all">{account}</p>
                        <button
                          onClick={disconnect}
                          className="text-xs underline text-gray-400"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                    {metamaskError && <p className="text-red-400 mt-2">{metamaskError}</p>}

                    {account && usdtSavingsAmount > 0 && (
                      <button
                        onClick={handleUsdtDeposit}
                        disabled={usdtPaymentStatus === 'pending' || !user?.uid}
                        className="w-full mt-3 px-4 py-2 bg-green-600 rounded text-white"
                      >
                        {usdtPaymentStatus === 'pending' ? 'Sending…' : 'Send USDT → Savings'}
                      </button>
                    )}

                    {usdtTxHash && (
                      <p className="text-sm text-gray-300 break-all">
                        Tx Hash: {usdtTxHash} (<a href={`https://polygonscan.com/tx/${usdtTxHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400">View on PolygonScan</a>)
                      </p>
                    )}
                    {usdtPaymentStatus === 'pending' && <p className="text-yellow-400 mt-2">Transaction pending...</p>}
                    {usdtPaymentStatus === 'confirmed' && <p className="text-green-400 mt-2">Deposit confirmed! Balance updating soon.</p>}
                    {registrationStatus === 'success' && <p className="text-green-400 mt-2">Deposit registered!</p>}
                    {usdtError && <p className="text-red-400 mt-2">{usdtError}</p>}
                  </div>
                )}

                {savingsOption === 'usdtTron' && (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-2 text-center">Savings (USDT on TRON)</h3>
                    <input
                      type="number"
                      value={usdtTronSavingsAmount}
                      onChange={(e) => setUsdtTronSavingsAmount(parseFloat(e.target.value) || 30)}
                      placeholder="Amount (USDT)"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Send manually to: {process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS}</p>
                      <button
                          onClick={handleCopySavingsRequestusdtTron}
                          className="mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                        >
                          {copySavingsButtonTextusdtTron}
                        </button>
                        <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Or scan the QR on your wallet app</p>
                    </div>
                      <QRCodeCanvas value={`${process.env.NEXT_PUBLIC_APP_TRON_WALLET_ADDRESS}?amount=${usdtTronSavingsAmount}`} size={128} className="mx-auto" />
                    </div>

                    <div className="text-center mt-4">
                      <p className="text-sm text-gray-300">Minimo 30 USDT</p>
                    </div>

                    <div className="text-center mt-1">
                      <p className="text-sm text-gray-300">Or connect your wallet to deposit USDT</p>
                    </div>
                    
                    {!tronWalletConnected ? (
                      <button onClick={connectTronWallet} className="w-full px-4 py-2 bg-blue-600 rounded mb-4">
                        Connect TronLink
                      </button>
                    ) : (
                      <button
                        onClick={initiateUsdtTronDeposit}
                        disabled={usdtTronSavingsAmount <= 0 || usdtTronPaymentStatus === 'pending'}
                        className="w-full px-4 py-2 bg-blue-600 rounded mb-4 disabled:bg-gray-500"
                        title={usdtTronSavingsAmount <= 0 ? 'Enter an amount greater than 0' : usdtTronPaymentStatus === 'pending' ? 'Transaction pending' : ''}
                      >
                        Deposit USDT
                      </button>
                    )}
                    {usdtTronTxHash && (
                      <p className="text-sm text-gray-300 break-all">
                        Tx Hash: {usdtTronTxHash} (<a href={`https://tronscan.org/#/transaction/${usdtTronTxHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400">View on TronScan</a>)
                      </p>
                    )}
                    {usdtTronPaymentStatus === 'pending' && <p className="text-yellow-400 mt-2">Transaction pending...</p>}
                    {usdtTronPaymentStatus === 'confirmed' && <p className="text-green-400 mt-2">Deposit confirmed! Balance updating soon.</p>}
                    {usdtTronError && <p className="text-red-400 mt-2">{usdtTronError}</p>}
                  </div>
                )}


              </div>
            )}
          </div>
        )}

        {user && (
          <div className="mt-6">
            <h2
              className="text-lg font-bold mb-4 text-center cursor-pointer"
              onClick={() => setShowWithdrawals(!showWithdrawals)}
            >
              Retira Aqui {showWithdrawals ? '▲' : '▼'}
            </h2>
            {showWithdrawals && (
              <div className="bg-gray-700 p-4 rounded shadow">
                <div className="flex flex-col space-y-4">
                  <button
                    onClick={() => setWithdrawalOption('bancosColombia')}
                    className={`px-4 py-2 rounded ${
                      withdrawalOption === 'bancosColombia' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Colombia
                  </button>
                  <button
                    onClick={() => setWithdrawalOption('bancosInternacionales')}
                    className={`px-4 py-2 rounded ${
                      withdrawalOption === 'bancosInternacionales' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Internacionales
                  </button>
                  <button
                    onClick={() => setWithdrawalOption('btcLightning')}
                    className={`px-4 py-2 rounded ${
                      withdrawalOption === 'btcLightning' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    BTC Lightning Wallet
                  </button>
                  <button
                    onClick={() => setWithdrawalOption('usdtWallet')}
                    className={`px-4 py-2 rounded ${
                      withdrawalOption === 'usdtWallet' ? 'bg-blue-600' : 'bg-gray-600'
                    } text-white hover:bg-blue-700 transition-colors`}
                  >
                    USDT Wallet
                  </button>
                </div>
                {/* Withdrawal options content will go here later */}
                {withdrawalOption === 'bancosColombia' && (
                  <div className="mt-4">
                    <input
                      type="text"
                      value={withdrawalName}
                      onChange={(e) => setWithdrawalName(e.target.value)}
                      placeholder="Nombre"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <input
                      type="text"
                      value={withdrawalId}
                      onChange={(e) => setWithdrawalId(e.target.value)}
                      placeholder="Cedula"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <input  // <-- New field here
                      type="number"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="Cantidad"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <textarea
                      value={withdrawalBank}
                      onChange={(e) => setWithdrawalBank(e.target.value)}
                      placeholder="Datos Bancarios"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                      rows={4}
                    ></textarea>
                    <input
                      type="text"
                      value={withdrawalBankName}
                      onChange={(e) => setWithdrawalBankName(e.target.value)}
                      placeholder="Banco"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <button
                      onClick={handleWithdrawalSubmit}
                      className="w-full px-4 py-2 bg-blue-600 rounded text-white"
                    >
                      Submit Withdrawal
                    </button>
                    <p className="text-xs mt-2 text-gray-400">Puedes usar tu llave o tu cuenta bancaria. Recuerda que usando la llave, el limite es de 1.000.000 Pesos.</p>
                    <p className="text-xs mt-2 text-gray-400">0,8% comision de retiro</p>
                  </div>
                )}
                {withdrawalOption === 'bancosInternacionales' && (
                  <div className="mt-4">
                    <input
                      type="text"
                      value={withdrawalName}
                      onChange={(e) => setWithdrawalName(e.target.value)}
                      placeholder="Nombre"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <input
                      type="text"
                      value={withdrawalId}
                      onChange={(e) => setWithdrawalId(e.target.value)}
                      placeholder="Cedula/ID"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <input  // <-- New field here
                      type="number"
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="Cantidad"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <textarea
                      value={withdrawalBank}
                      onChange={(e) => setWithdrawalBank(e.target.value)}
                      placeholder="Datos Bancarios"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                      rows={4}
                    ></textarea>
                    <input
                      type="text"
                      value={withdrawalBankName}
                      onChange={(e) => setWithdrawalBankName(e.target.value)}
                      placeholder="Bank Name"
                      className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                    />
                    <div className="flex items-center">
                      <select
                        value={withdrawalCountry}
                        onChange={(e) => setWithdrawalCountry(e.target.value)}
                        className="w-full p-2 bg-gray-600 rounded text-white mb-2"
                      >
                        <option value="">Select a country</option>
                        {Object.keys(countries).map((countryCode) => {
                          const country = countries[countryCode as keyof typeof countries];
                          return (
                            <option key={countryCode} value={countryCode}>
                              {country.name}
                            </option>
                          );
                        })}
                      </select>
                      {withdrawalCountry && (
                        <ReactCountryFlag
                          countryCode={withdrawalCountry}
                          svg
                          style={{
                            width: '2em',
                            height: '2em',
                            marginLeft: '10px',
                          }}
                          title={withdrawalCountry}
                        />
                      )}
                    </div>
                    <button
                      onClick={handleIntWithdrawalSubmit}
                      className="w-full px-4 py-2 bg-blue-600 rounded text-white"
                    >
                      Submit International Withdrawal
                    </button>
                     <p className="text-xs mt-2 text-gray-400">1% comision de retiro. 1 a 3 dias hábiles</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <h2
            className="text-lg font-bold mb-4 text-center cursor-pointer"
            onClick={() => setShowDonations(!showDonations)}
          >
            Donaciones {showDonations ? '▲' : '▼'}
          </h2>
          {showDonations && (
            <>
              <input
                type="number"
                value={donationAmount}
                onChange={(e) => setDonationAmount(parseInt(e.target.value) || 1000)}
                placeholder="Amount (sat)"
                className="w-full p-2 bg-gray-600 rounded text-white mb-2"
              />
              <button
                onClick={generateDonationInvoice}
                disabled={donationAmount <= 0 || paymentStatus === 'pending'}
                className="w-full px-4 py-2 bg-blue-600 rounded mb-4 disabled:bg-gray-500"
                title={donationAmount <= 0 ? 'Enter an amount greater than 0' : paymentStatus === 'pending' ? 'Waiting for payment' : ''}
              >
                Generate Donation Invoice
              </button>
              {loading && (
                <div className="flex justify-center mt-4"></div>
              )}
              {isClient && bolt11 && (
                <div className="text-center">
                  <QRCodeCanvas value={bolt11} size={128} className="mx-auto" />
                  <p className="mt-2">Scan to donate {donationAmount} sats</p>
                  <p className="mt-4 text-sm text-gray-300 break-all px-4">
                    Payment Request: {bolt11}
                  </p>
                  <button
                    onClick={handleCopyPaymentRequest}
                    className="mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 transition-colors"
                  >
                    {copyButtonText}
                  </button>
              </div>
              )}
              {paymentStatus === 'pending' && <p className="text-yellow-400 mt-2">Payment pending...</p>}
              {paymentStatus === 'settled' && <p className="text-green-400 mt-2">Payment received! Thank you.</p>}
              {paymentStatus === 'settled' && (
                <button
                  onClick={resetDonation}
                  className="w-full mt-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700"
                >
                  Create New Donation
                </button>
              )}
              {donationError && <p className="text-red-400 mt-2">{donationError}</p>}
            </>
          )}
        </div>
        
        {user?.uid === '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && (
          <div className="mt-6">
            <h2 className="text-lg font-bold mb-4 text-center cursor-pointer" onClick={() => setShowAdminAssets(!showAdminAssets)}>
              Admin Assets Management {showAdminAssets ? '▲' : '▼'}
            </h2>
            {showAdminAssets && (
              <div className="bg-purple-900 p-4 rounded shadow">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mint Form */}
                <div className="bg-black/50 p-4 rounded">
                  <h3 className="font-bold text-green-400">Mint Asset</h3>
                  <select onChange={(e) => setMintAsset(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2">
                    <option value="">Select Asset</option>
                    <option value="USDT">USDT</option>
                    <option value="COP">COP</option>
                  </select>
                  <input type="number" placeholder="Amount" onChange={(e) => setMintAmount(parseFloat(e.target.value))} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <input type="text" placeholder="User ID" onChange={(e) => setMintUserId(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <button onClick={handleMint} className="w-full mt-2 bg-green-600 hover:bg-green-700 py-2 rounded">Mint</button>
                </div>

                {/* Burn Form */}
                <div className="bg-black/50 p-4 rounded">
                  <h3 className="font-bold text-red-400">Burn Asset</h3>
                  <select onChange={(e) => setBurnAsset(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2">
                    <option value="">Select Asset</option>
                    <option value="USDT">USDT</option>
                    <option value="COP">COP</option>
                  </select>
                  <input type="number" placeholder="Amount" onChange={(e) => setBurnAmount(parseFloat(e.target.value))} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <input type="text" placeholder="User ID" onChange={(e) => setBurnUserId(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <button className="w-full mt-2 bg-red-600 hover:bg-red-700 py-2 rounded">Burn</button>
                </div>

                {/* Transfer Form */}
                <div className="bg-black/50 p-4 rounded">
                  <h3 className="font-bold text-blue-400">Transfer Asset</h3>
                  <select onChange={(e) => setTransferAsset(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2">
                    <option value="">Select Asset</option>
                    <option value="USDT">USDT</option>
                    <option value="COP">COP</option>
                  </select>
                  <input type="number" placeholder="Amount" onChange={(e) => setTransferAmount(parseFloat(e.target.value))} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <input type="text" placeholder="From User ID" onChange={(e) => setTransferFromUserId(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <input type="text" placeholder="To User ID" onChange={(e) => setTransferToUserId(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2" />
                  <button className="w-full mt-2 bg-blue-600 hover:bg-blue-700 py-2 rounded">Transfer</button>
                </div>
              </div>
                            </div>
                            
                          )}
                          <input type="text" placeholder="Tapd Path" value={tapdPath} onChange={(e) => setTapdPath(e.target.value)} className="w-full p-2 bg-gray-800 rounded mt-2" />
                          <button onClick={handleGet} className="w-full mt-2 bg-orange-600 hover:bg-orange-700 py-2 rounded">Call Tapd API</button>
                          {tapdError && <p className="text-red-400 mt-2">{tapdError}</p>}
                          {tapdMessage && <p className="text-green-400 mt-2">{tapdMessage}</p>}

                          <button 
                            onClick={handleSync} 
                            disabled={syncLoading} 
                            className="w-full mt-4 bg-purple-600 hover:bg-purple-700 py-2 rounded disabled:bg-gray-500"
                          >
                            {syncLoading ? 'Syncing...' : 'Sync with RTDB'}
                          </button>
                          {syncError && <p className="text-red-400 mt-2">{syncError}</p>}
                          {syncMessage && <p className="text-green-400 mt-2">{syncMessage}</p>}
                          <h3 className="font-bold text-blue-400">{burnAsset}, {burnAmount}, {burnUserId}, {transferAsset}, {transferAmount}, {transferFromUserId}, {transferToUserId}</h3>

                        </div>
              )}
              
            

        <button
          onClick={handleWhatsAppClick}
          className="w-full mt-6 px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 transition-colors"
        >
          Contacto
        </button>
      
      </div>
    </div>
  );
}
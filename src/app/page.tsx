"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import '../app/globals.css';
import { ArrowsUpDownIcon, BellIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { QRCodeCanvas } from 'qrcode.react';
import { auth, database } from '../app/lib/firebase'; // Adjust path
import { ref, set, push, serverTimestamp, onValue, update } from "firebase/database";
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
import QrScanner from './components/QrScanner';
import * as bolt11Lib from 'bolt11'; // Rename to avoid conflicts

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

interface BankWithdrawal {
  saldoCop?: number;
  uid: string;
  accountId?: string;
  requestId: string;
  userEmail: string;
  amount: number;      // COP for banks
  requestedBtcAmount?: number; // Store for copRetiros
  fee?: number;
  totalBtcToDeduct?: number;
  bankData?: string;
  option: 'bancosColombia' | 'bancosInternacionales' | 'btcLightning' | 'usdtWallet' | 'copRetiros';
  name?: string;
  bank?: string;
  bankName?: string;
  country?: string;
  timestamp: number;   // Unix ms
  status?: string;
  userNotified?: boolean;
  receipt?: {
    btcUsdt?: number;
    usdtCop?: number;
    totalCop?: number;
  };
  // Add other fields as stored
}

interface BankDeposit {
  saldoCop?: number;
  uid?: string;
  depositId: string;
  parsedName: string;
  amount: string;
  date: string;
  time: string;
  status: string;
  timestamp?: number;
  userNotified?: boolean;
  adminNotified?: boolean;
  marketBuy?: {
    btcBought: number;
    usdtSpent: number;
    orderId: number;
    usdtCopPrice?: number;
    btcUsdtPrice?: number;
  };
}

export default function Home() {
  const [id, setId] = useState<string>("");
  const [data, setData] = useState<SpreadsheetRow[]>([]);
  const [cryptoBalance, setCryptoBalance] = useState<number>(0);
  const [syncBtcBalance, setSyncBtcBalance] = useState<number>(0);
  const [avgBuyPrice, setAvgBuyPrice] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // State for BTC/USD price tracking
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [currentUsdtCop, setCurrentUsdtCop] = useState<number | null>(null);
  // State for sort order in movements
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
  const [copiedBancos, setCopiedBancos] = useState<boolean>(false);

  // States for savings
  const [showSavings, setShowSavings] = useState<boolean>(false);
  const [savingsOption, setSavingsOption] = useState<'bancosColombia' | 'btcLightning' | 'bancosEuropa' | 'bancosUSA' | 'usdtPolygon' | null>(null);
  const [savingsAmount, setSavingsAmount] = useState<number>(1000);
  const [savingsAmountFormatted, setSavingsAmountFormatted] = useState<string>('1.000');
  const [showBtcLightningDeposit, setShowBtcLightningDeposit] = useState<boolean>(false);
  const [savingsBolt11, setSavingsBolt11] = useState<string | null>(null);
  const [savingsPaymentStatus, setSavingsPaymentStatus] = useState<'pending' | 'settled' | null>(null);
  const [savingsError, setSavingsError] = useState<string | null>(null);
  const [savingsLoading, setSavingsLoading] = useState<boolean>(false);
  const [savingsPaymentHash, setSavingsPaymentHash] = useState<string | null>(null);

  // States for withdrawals
  const [showWithdrawals, setShowWithdrawals] = useState<boolean>(false);
  const [withdrawalOption, setWithdrawalOption] = useState<'bancosColombia' | 'bancosInternacionales' | 'btcLightning' | 'usdtWallet' | null>(null);

  //States for BTC withdrawals
  const [withdrawalBolt11, setWithdrawalBolt11] = useState<string | null>(null);
  const [withdrawalQuote, setWithdrawalQuote] = useState<{ amountSats: number; baseFee: number; partnerFee: number; totalSats: number } | null>(null);
  const [withdrawalPaymentStatus, setWithdrawalPaymentStatus] = useState<'pending' | 'success' | 'failure' | null>(null);
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // States for withdrawal form
  const [withdrawalName, setWithdrawalName] = useState<string>('');
  const [withdrawalId, setWithdrawalId] = useState<string>('');
  const [withdrawalBank, setWithdrawalBank] = useState<string>('');
  const [withdrawalBankName, setWithdrawalBankName] = useState<string>('');
  const [withdrawalCountry, setWithdrawalCountry] = useState<string>('');
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');

  // State for rendering automatico
  const [isClient, setIsClient] = useState(false);

  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);  // Add for UX feedback

  // States for COP Depositos and Retiros
  const [showCopDepositos, setShowCopDepositos] = useState<boolean>(false);
  const [showCopRetiros, setShowCopRetiros] = useState<boolean>(false);
  const [showBtcLightningWithdrawal, setShowBtcLightningWithdrawal] = useState<boolean>(false);
  const [copRetirosAmount, setCopRetirosAmount] = useState<string>('');
  const [copRetirosBtcAmount, setCopRetirosBtcAmount] = useState<string>('');
  const [copRetirosBreBKey, setCopRetirosBreBKey] = useState<string>('');
  const [liveBtcUsdt, setLiveBtcUsdt] = useState<number | null>(null);
  const [liveUsdtCop, setLiveUsdtCop] = useState<number | null>(null);
  const [copRetirosError, setCopRetirosError] = useState<string | null>(null);

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

  // States for bank wwithdrawals
  const [showPendingWithdrawals, setShowPendingWithdrawals] = useState<boolean>(false);
  const [pendingBankWithdrawals, setPendingBankWithdrawals] = useState<BankWithdrawal[]>([]);
  const [selectedBankWithdrawal, setSelectedBankWithdrawal] = useState<BankWithdrawal | null>(null);
  const [settleLoading, setSettleLoading] = useState<boolean>(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // States for Notifications
  const [adminUnreadCount, setAdminUnreadCount] = useState<number>(0);
  const [adminUnassignedDeposits, setAdminUnassignedDeposits] = useState<BankDeposit[]>([]);
  const [userUnreadNotifications, setUserUnreadNotifications] = useState<BankWithdrawal[]>([]);
  const [userUnreadDeposits, setUserUnreadDeposits] = useState<BankDeposit[]>([]);

  // New States for Notification Modal
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false);
  const [allUserWithdrawals, setAllUserWithdrawals] = useState<BankWithdrawal[]>([]);
  const [allUserDeposits, setAllUserDeposits] = useState<BankDeposit[]>([]);
  const [allAdminDeposits, setAllAdminDeposits] = useState<BankDeposit[]>([]);

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

  useEffect(() => {
    if (!user) return; // Exit early if no user is signed in

    const unsubscribes: Array<() => void> = [];

    if (user.uid === '5XgksHrgmyeGqqKFYGVjQVM0KGl1') {
      // Admin Listener: Listen to all withdrawals
      const withdrawalsRef = ref(database, 'withdrawals');
      const unsubscribeAdminW = onValue(withdrawalsRef, (snapshot) => {
        const filtered: BankWithdrawal[] = [];
        snapshot.forEach((userSnap) => {
          userSnap.forEach((reqSnap) => {
            const data = reqSnap.val();
            if (data.status === 'pending') {
              if (data.option === 'bancosColombia' || data.option === 'bancosInternacionales' || data.option === 'copRetiros') {
                filtered.push({
                  uid: userSnap.key!,
                  requestId: reqSnap.key!,
                  ...data,
                });
              }
            }
          });
        });
        setPendingBankWithdrawals(filtered);
        setAdminUnreadCount(filtered.length);
      }, (error) => console.error('onValue error:', error));
      unsubscribes.push(unsubscribeAdminW);

      const unassignedRef = ref(database, 'unassignedDeposits');
      const unsubscribeAdminD = onValue(unassignedRef, (snapshot) => {
        const unassigned: BankDeposit[] = [];
        const allAdmin: BankDeposit[] = [];
        snapshot.forEach((reqSnap) => {
          const data = reqSnap.val();
          const dep = { depositId: reqSnap.key!, ...data };
          allAdmin.push(dep);
          if (!data.adminNotified) {
            unassigned.push(dep);
          }
        });
        setAdminUnassignedDeposits(unassigned);
        setAllAdminDeposits(allAdmin.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      });
      unsubscribes.push(unsubscribeAdminD);
    }

    // Regular User Listener: Listen to their own withdrawals and deposits
    const userWithdrawalsRef = ref(database, `withdrawals/${user.uid}`);
    const unsubscribeW = onValue(userWithdrawalsRef, (snapshot) => {
      const unreadNotifications: BankWithdrawal[] = [];
      const allW: BankWithdrawal[] = [];
      snapshot.forEach((reqSnap) => {
        const data = reqSnap.val();
        if (data.status === 'settled') {
          const wd = {
            uid: user.uid,
            requestId: reqSnap.key!,
            ...data,
          };
          allW.push(wd);
          if (!data.userNotified) {
            unreadNotifications.push(wd);
          }
        }
      });
      setUserUnreadNotifications(unreadNotifications);
      setAllUserWithdrawals(allW.sort((a, b) => b.timestamp - a.timestamp));
    }, (error) => console.error('onValue error:', error));
    unsubscribes.push(unsubscribeW);

    const userDepositsRef = ref(database, `deposits/${user.uid}`);
    const unsubscribeD = onValue(userDepositsRef, (snapshot) => {
      const depositNotifs: BankDeposit[] = [];
      const allD: BankDeposit[] = [];
      snapshot.forEach((reqSnap) => {
        const data = reqSnap.val();
        const dep = {
          uid: user.uid,
          depositId: reqSnap.key!,
          ...data,
        };
        allD.push(dep);
        if (!data.userNotified) {
          depositNotifs.push(dep);
        }
      });
      setUserUnreadDeposits(depositNotifs);
      setAllUserDeposits(allD.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    });
    unsubscribes.push(unsubscribeD);

    const cryptoBalanceRef = ref(database, `cryptoBalances/${user.uid}`);
    const unsubscribeC = onValue(cryptoBalanceRef, (snapshot) => {
      if (snapshot.exists()) {
        setCryptoBalance(snapshot.val().balance || 0);
      } else {
        setCryptoBalance(0);
      }
    });
    unsubscribes.push(unsubscribeC);

    const balancesRef = ref(database, `balances/${user.uid}`);
    const unsubscribeB = onValue(balancesRef, (snapshot) => {
      if (snapshot.exists()) {
        const userBalance = snapshot.val();
        const btcProp = userBalance.BTCBalance ?? userBalance.BTCbalance ?? userBalance.btcBalance;
        if (btcProp) {
          const btcStr = btcProp.toString().replace(',', '.');
          setSyncBtcBalance(parseFloat(btcStr) || 0);
        } else {
          setSyncBtcBalance(0);
        }
        setAvgBuyPrice(userBalance.avgBuyPrice || 0);
      } else {
        setSyncBtcBalance(0);
      }
    });
    unsubscribes.push(unsubscribeB);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [user]);

  const handleAdminBellClick = async () => {
    setShowNotificationsModal(true);
    // Clear unassigned deposits notifications
    if (adminUnassignedDeposits.length > 0) {
      try {
        const updates: { [key: string]: boolean } = {};
        adminUnassignedDeposits.forEach((dep) => {
          updates[`unassignedDeposits/${dep.depositId}/adminNotified`] = true;
        });
        await update(ref(database), updates);
        setAdminUnassignedDeposits([]);
      } catch (e) {
        console.error('Failed to acknowledge admin deposits notifications', e);
      }
    }
  };

  const handleUserBellClick = async () => {
    setShowNotificationsModal(true);
    if ((userUnreadNotifications.length === 0 && userUnreadDeposits.length === 0) || !user) return;

    // Mark them as notified
    try {
      const updates: { [key: string]: boolean } = {};

      if (userUnreadNotifications.length > 0) {
        userUnreadNotifications.forEach((wd) => {
          updates[`withdrawals/${wd.uid}/${wd.requestId}/userNotified`] = true;
        });
      }

      if (userUnreadDeposits.length > 0) {
        userUnreadDeposits.forEach((dep) => {
          updates[`deposits/${dep.uid}/${dep.depositId}/userNotified`] = true;
        });
      }

      await update(ref(database), updates);

      // Clear local state immediately for UX
      setUserUnreadNotifications([]);
      setUserUnreadDeposits([]);
    } catch (e) {
      console.error('Failed to acknowledge user notifications', e);
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

  // Fetch live quotes for COP Retiros
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchLiveQuotes = async () => {
      try {
        const btcRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (btcRes.ok) {
          const btcData = await btcRes.json();
          setLiveBtcUsdt(parseFloat(btcData.price));
        }

        const copRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTCOP');
        if (copRes.ok) {
          const copData = await copRes.json();
          setLiveUsdtCop(parseFloat(copData.price));
        }
      } catch (err) {
        console.error("Failed to fetch live quotes for COP Retiros", err);
      }
    };

    if (user && showCopRetiros) {
      fetchLiveQuotes();
      intervalId = setInterval(fetchLiveQuotes, 60000);
    }

    return () => clearInterval(intervalId);
  }, [user, showCopRetiros]);

  // Fetch BTC/USD price using Binance WebSockets
  const currentPriceRef = useRef<number | null>(null);

  useEffect(() => {
    const wsBtc = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    const wsCop = new WebSocket('wss://stream.binance.com:9443/ws/usdtcop@ticker');

    wsBtc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newPrice = parseFloat(data.c);

        if (currentPriceRef.current !== newPrice) {
          if (currentPriceRef.current !== null) {
            setPrevPrice(currentPriceRef.current);
          }
          setCurrentPrice(newPrice);
          currentPriceRef.current = newPrice;
        }
      } catch (err) {
        console.error('Error parsing Binance websocket data:', err);
      }
    };

    wsBtc.onerror = (error) => {
      console.error('Binance WebSocket error (BTC):', error);
    };

    wsCop.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newCopPrice = parseFloat(data.c);
        setCurrentUsdtCop(newCopPrice);
      } catch (err) {
        console.error('Error parsing Binance websocket data (COP):', err);
      }
    };

    wsCop.onerror = (error) => {
      console.error('Binance WebSocket error (COP):', error);
    };

    return () => {
      wsBtc.close();
      wsCop.close();
    };
  }, []);

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
    try {

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) throw new Error("User not authenticated");

      // 1. Get the Firebase ID token from the logged-in user.
      const idToken = await user.getIdToken();

      const response = await fetch(
        `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/getDataById?id=${id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`, // <-- This is the crucial part
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Usuario no encontrado! Status: ${response.status}`);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id) fetchData();
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
    setSavingsAmountFormatted('1.000');
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

            if (user) {
              const btcAmount = Number(invoice.amt_paid_sat) / 100_000_000;
              const depositData = {
                uid: user.uid,
                depositId: savingsPaymentHash,
                parsedName: "BTC Lightning Deposit",
                status: "settled",
                timestamp: Date.now(),
                marketBuy: {
                  btcBought: btcAmount,
                  btcUsdtPrice: liveBtcUsdt || 0,
                  usdtCopPrice: liveUsdtCop || 0
                }
              };
              await set(ref(database, `deposits/${user.uid}/${savingsPaymentHash}`), depositData);
            }

            setTimeout(() => {
              resetSavings();
              setShowBtcLightningDeposit(false);
            }, 4000);
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
  }, [savingsPaymentHash, savingsPaymentStatus, resetSavings, user, liveBtcUsdt, liveUsdtCop]);

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
    if (!user?.uid) {
      setWithdrawalError('You must be logged in to submit a withdrawal.');
      return;  // Early exit for unauth
    }

    if (!withdrawalName || !withdrawalId || !withdrawalBank || !withdrawalBankName || !withdrawalAmount || !withdrawalOption) {
      // Handle form validation
      alert('Please fill out all fields.');
      return;
    }

    const isConfirmed = window.confirm('¿Estás seguro de que deseas enviar esta solicitud de retiro?');
    if (!isConfirmed) {
      return;
    }

    let currentBtcUsdt = liveBtcUsdt;
    let currentUsdtCop = liveUsdtCop;

    try {
      // Fetch the absolute freshest prices directly from Binance at the exact moment of click
      const [btcRes, copRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTCOP')
      ]);
      const btcData = await btcRes.json();
      const copData = await copRes.json();

      if (btcData.price) currentBtcUsdt = parseFloat(btcData.price);
      if (copData.price) currentUsdtCop = parseFloat(copData.price);
    } catch (err) {
      console.warn('Failed to fetch exact live prices, falling back to UI state', err);
    }

    const withdrawalData: Omit<BankWithdrawal, 'requestId'> = {
      uid: user.uid,
      userEmail: user.email || 'email',
      name: withdrawalName.trim(),  // Sanitize inputs
      accountId: withdrawalId,
      bankData: withdrawalBank,
      bankName: withdrawalBankName,
      country: withdrawalCountry,
      amount: parseFloat(withdrawalAmount),
      option: withdrawalOption,
      timestamp: Date.now(),
      status: 'pending',
      ...(currentBtcUsdt || currentUsdtCop ? {
        receipt: {
          ...(currentBtcUsdt && { btcUsdt: currentBtcUsdt }),
          ...(currentUsdtCop && { usdtCop: currentUsdtCop })
        }
      } : {})
    };

    if (withdrawalData.option = 'bancosColombia') { withdrawalData.country = 'CO' }

    try {
      // Determine path (teaching: Conditional logic for domestic/int'l)
      //const basePath = withdrawalOption === 'bancosInternacionales' 
      //  ? 'IntWithdrawals' 
      //  : 'withdrawals';
      const refPath = `${'withdrawals'}/${user.uid}`;

      // Use push() for unique ID (teaching: Firebase auto-generates timestamp-based keys)
      const newRef = push(ref(database, refPath));
      await set(newRef, withdrawalData);

      // UX Feedback (teaching: Use libraries like react-toastify for better modals)
      alert('Solicitud de retiro enviado correctamente, la Admin ha sido notificada.');
      setWithdrawalError(null);  // Clear errors

      // Reset form (teaching: Prevent resubmits; use useState setters)
      setWithdrawalName('');
      setWithdrawalId('');
      setWithdrawalBank('');
      setWithdrawalBankName('');
      setWithdrawalCountry('');
      setWithdrawalAmount('');
      setWithdrawalOption(null);

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

  const handleCopRetirosAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, ''); // Remove non-digits
    const formattedVal = rawVal ? Number(rawVal).toLocaleString('de-DE') : '';
    setCopRetirosAmount(formattedVal);

    if (liveBtcUsdt && liveUsdtCop && rawVal) {
      const btcEq = parseFloat(rawVal) / liveUsdtCop / liveBtcUsdt;
      setCopRetirosBtcAmount(btcEq.toFixed(8));
    } else {
      setCopRetirosBtcAmount('');
    }
  };

  const handleCopRetirosBtcAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCopRetirosBtcAmount(val);
    if (liveBtcUsdt && liveUsdtCop && val) {
      const copEq = parseFloat(val) * liveBtcUsdt * liveUsdtCop;
      setCopRetirosAmount(Math.floor(copEq).toLocaleString('de-DE'));
    } else {
      setCopRetirosAmount('');
    }
  };

  const handleCopRetirosSubmit = async () => {
    if (!user?.uid) {
      setCopRetirosError('You must be logged in to submit a withdrawal.');
      return;
    }
    const rawCopAmount = copRetirosAmount.replace(/\D/g, '');
    if (!rawCopAmount || !copRetirosBtcAmount || !copRetirosBreBKey || !liveBtcUsdt || !liveUsdtCop) {
      alert('Please fill out all fields and wait for live quotes.');
      return;
    }

    const requestedBtc = parseFloat(copRetirosBtcAmount);
    const fee = requestedBtc * 0.01;
    const totalBtcToDeduct = requestedBtc + fee;

    if (totalBtcToDeduct > (cryptoBalance + syncBtcBalance)) {
      alert('Insufficient total BTC balance to cover amount + 1% fee.');
      return;
    }

    const isConfirmed = window.confirm('¿Estás seguro de que deseas enviar esta solicitud de retiro?');
    if (!isConfirmed) {
      return;
    }

    const withdrawalData: Omit<BankWithdrawal, 'requestId'> = {
      uid: user.uid,
      userEmail: user.email || 'email',
      name: user.displayName || 'Unknown',
      amount: parseFloat(rawCopAmount),
      requestedBtcAmount: requestedBtc,
      fee: fee,
      totalBtcToDeduct: totalBtcToDeduct,
      bankData: copRetirosBreBKey,
      option: 'copRetiros',
      timestamp: Date.now(),
      status: 'pending',
      receipt: { btcUsdt: liveBtcUsdt, usdtCop: liveUsdtCop }
    };

    try {
      const newRef = push(ref(database, `withdrawals/${user.uid}`));
      await set(newRef, withdrawalData);

      alert('Solicitud de retiro COP enviado correctamente, Revisa tu correo y confirma.');
      setCopRetirosError(null);
      setCopRetirosAmount('');
      setCopRetirosBtcAmount('');
      setCopRetirosBreBKey('');
      setShowCopRetiros(false);
    } catch (err) {
      console.error('Error submitting COP withdrawal:', err);
      alert('Failed to submit withdrawal. Please try again.');
    }
  };


  /* ------------------------------------------------------------------ */
  /*  Para manejar el deposito USDT Polygon                             */
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

      // Success feedback + cleanup
      // You can add toast/notification here if you have one
      setTimeout(() => {
        resetUsdtPolygonDeposit();
      }, 5000); // Give user time to see success message (adjust as needed)

    } catch (err: unknown) {
      setUsdtError((err as Error).message || 'Deposit failed');
      setUsdtPaymentStatus(null);
      console.error(err);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  BTC Withdrawals                                                   */
  /* ------------------------------------------------------------------ */


  const handleBolt11 = async (raw: string) => {
    const bolt11Str = raw.startsWith('lightning:') ? raw.slice(10) : raw;

    /*if (!bolt11Str.match(/^ln(bc|tb|tc|regtest)[1-9a-zA-HJ-NP-Z]+$/i)) { // Basic bolt11 regex (Lightning spec)
    throw new Error('Invalid Lightning invoice format');
    }*/
    // Proceed to decode

    try {
      const decoded = bolt11Lib.decode(bolt11Str);
      const amountSats = decoded.satoshis || 0;
      if (!amountSats) throw new Error('No amount in invoice');

      // Fetch partner fee via REST (LND proxy)
      const feeRes = await fetch('/api/lndProxy/v1/fees'); // Or with ?amount=amountSats
      const feeData = await feeRes.json();
      const partnerFee = feeData?.max_fee_per_msat * amountSats / 1000 || amountSats * 0.01; // Fallback 1%

      const baseFeeRate = parseFloat(process.env.NEXT_PUBLIC_BASE_FEE_RATE || '0.005'); // Fallback if undefined
      const baseFee = Math.ceil(amountSats * baseFeeRate);
      const totalSats = amountSats + baseFee + partnerFee;

      setWithdrawalBolt11(bolt11Str);
      setWithdrawalQuote({ amountSats, baseFee, partnerFee, totalSats });
      setScannerError(null);
    } catch (err) {
      setScannerError((err as Error).message);
    }
  };

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard) {
      setScannerError('Clipboard not supported in this browser');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      handleBolt11(text);
    } catch (err) {
      setScannerError('Clipboard access denied—check browser permissions');
      console.error('Clipboard error:', err); // Log without exposing details
    }
  };

  const handleConfirmPayment = async () => {
    if (!user?.uid) {
      setScannerError('Debe iniciar sesión para realizar un retiro.');
      return;
    }
    if (!withdrawalQuote || !withdrawalBolt11) {
      setScannerError('No hay cotización activa.');
      return;
    }

    const totalBtcToDeduct = withdrawalQuote.totalSats / 100000000;

    // Pre-flight balance check
    if (totalBtcToDeduct > syncBtcBalance) {
      alert(`Saldo de BTC insuficiente. Tu saldo es ${syncBtcBalance} BTC, pero este retiro requiere ${totalBtcToDeduct} BTC (monto + comisiones).`);
      return;
    }

    const isConfirmed = window.confirm(`¿Estás seguro de que deseas enviar esta solicitud de retiro de ${withdrawalQuote.amountSats.toLocaleString('de-DE')} sats? Se deducirán ${totalBtcToDeduct.toFixed(8)} BTC de tu saldo.`);
    if (!isConfirmed) {
      return;
    }

    setWithdrawalPaymentStatus('pending');
    setScannerError(null);
    try {
      const payRes = await fetch('/api/lndProxy/v1/channels/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_request: withdrawalBolt11 }),
      });

      if (!payRes.ok) {
        const text = await payRes.text();
        throw new Error(text || 'Error al procesar el pago.');
      }

      const payData = await payRes.json();
      console.log('LND payment data:', payData);

      if (payData.payment_error) {
        throw new Error(payData.payment_error);
      }

      // Success!
      const requestedBtc = withdrawalQuote.amountSats / 100000000;
      const fee = (withdrawalQuote.baseFee + withdrawalQuote.partnerFee) / 100000000;
      const copEquivalent = Math.round(requestedBtc * (liveBtcUsdt || 0) * (liveUsdtCop || 0));

      const withdrawalData: Omit<BankWithdrawal, 'requestId'> = {
        uid: user.uid,
        userEmail: user.email || 'email',
        name: user.displayName || 'Unknown',
        amount: copEquivalent, // COP equivalent of satoshis
        requestedBtcAmount: requestedBtc,
        fee: fee,
        totalBtcToDeduct: totalBtcToDeduct,
        bankData: withdrawalBolt11,
        bankName: 'Bitcoin Lightning',
        option: 'btcLightning',
        timestamp: Date.now(),
        status: 'settled',
        receipt: {
          btcUsdt: liveBtcUsdt || 0,
          usdtCop: liveUsdtCop || 0
        }
      };

      const refPath = `withdrawals/${user.uid}`;
      const newRef = push(ref(database, refPath));
      await set(newRef, withdrawalData);

      setWithdrawalPaymentStatus('success');

    } catch (err) {
      setWithdrawalPaymentStatus('failure');
      setScannerError(err instanceof Error ? err.message : 'Payment failed');
      console.error('Payment error:', err);
    }
  };

  const resetWithdrawal = () => {
    setWithdrawalBolt11(null);
    setWithdrawalQuote(null);
    setWithdrawalPaymentStatus(null);
    setShowScanner(false); // Ensure revoked before re-show
    setScannerError(null);
  };


  /* ------------------------------------------------------------------ */
  /*  POST – Funciones para manejar TAPD (Mint, Burn, Transfer)          */
  /* ------------------------------------------------------------------ */

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
        body: JSON.stringify({ body }),
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
  // Handle bank Settlement state for Withdrawals
  //---------------------------------------------------------------- */

  const handleSettle = async (wd: BankWithdrawal) => {
    setSettleLoading(true);
    setSettleError(null);
    try {

      // Update RTDB
      const wdRef = ref(database, `withdrawals/${wd.uid}/${wd.requestId}`);
      await update(wdRef, {
        status: 'settled'
      });

      // Close and refresh list (box disappears via state)
      setSelectedBankWithdrawal(null);
    } catch (err: unknown) {
      const error = err as Error;
      setSettleError(error.message);
    } finally {
      setSettleLoading(false);
    }
  };

  // Reset functions for Polygon USDT
  const resetUsdtPolygonDeposit = () => {
    setUsdtSavingsAmount(10);                    // or keep last amount if preferred
    setUsdtTxHash(null);
    setUsdtPaymentStatus(null);
    setUsdtError(null);
    // Optional: keep registrationStatus if you have separate UI for it
  };


  /*
  if (loadingAuth) {
    return <div className="flex justify-center items-center h-screen">Loading authentication...</div>;
  }
  */



  return (
    <div className="min-h-screen bg-background bg-glass-gradient text-foreground flex flex-col items-center p-4 sm:p-8 relative overflow-hidden">
      {/* Dynamic background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[128px] pointer-events-none"></div>

      <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary mb-8 mt-4 drop-shadow-neon z-10">
        RENDIMIENTOS
      </h1>

      <div className="bg-surface border border-surface-border backdrop-blur-xl p-8 rounded-3xl shadow-neon w-full max-w-xl transition-all z-10">

        {loadingAuth ? (
          <div className="flex justify-center my-8">
            <div className="w-8 h-8 border-4 border-t-primary border-gray-600 rounded-full animate-spin"></div>
          </div>
        ) : user ? (
          <div className="text-center mb-6 pb-6 border-b border-surface-border">
            <div className="flex justify-center items-center gap-4 mb-4">
              <p className="text-lg font-medium text-gray-200">Bienvenido, <span className="text-white font-bold">{user.displayName || user.email}</span></p>

              {user.uid === '5XgksHrgmyeGqqKFYGVjQVM0KGl1' ? (
                // Admin Bell
                <button onClick={handleAdminBellClick} className="relative p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors active:scale-95 text-gray-300 hover:text-white border border-surface-border">
                  <BellIcon className="w-6 h-6" />
                  {(adminUnreadCount > 0 || adminUnassignedDeposits.length > 0) && (
                    <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg ring-2 ring-surface">
                      {adminUnreadCount + adminUnassignedDeposits.length}
                    </span>
                  )}
                </button>
              ) : (
                // User Bell
                <button onClick={handleUserBellClick} className="relative p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors active:scale-95 text-gray-300 hover:text-white border border-surface-border">
                  <BellIcon className="w-6 h-6" />
                  {(userUnreadNotifications.length > 0 || userUnreadDeposits.length > 0) && (
                    <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg ring-2 ring-surface">
                      {userUnreadNotifications.length + userUnreadDeposits.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            <button onClick={handleSignOut} className="px-5 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl hover:bg-red-500/40 hover:text-white transition-all active:scale-95">
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
            <h2 className="text-2xl font-bold mb-6 text-center text-white">Iniciar Sesión / Registrarse</h2>

            {/* OAuth Buttons */}
            <button onClick={() => handleOAuthLogin(new GoogleAuthProvider())} className="w-full px-4 py-3 bg-surface border border-surface-border hover:bg-white/10 rounded-xl text-white mb-3 flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
              Iniciar con Google
            </button>
            <button onClick={() => handleOAuthLogin(new TwitterAuthProvider())} className="w-full px-4 py-3 bg-surface border border-surface-border hover:bg-white/10 rounded-xl text-white mb-3 flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
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
                    className="w-full p-3 bg-black/40 border border-surface-border rounded-xl text-white mb-3 focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                  />
                  <button
                    onClick={handleSendEmailLink}
                    className="w-full px-4 py-3 bg-primary hover:bg-primary/80 rounded-xl text-white font-semibold mb-6 shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all active:scale-[0.98]"
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
            <div className="bg-surface border border-surface-border backdrop-blur-md p-6 rounded-2xl shadow-lg mb-8 transition-transform hover:-translate-y-1">
              <h2 className="text-2xl font-bold mb-4 text-center text-white">BTC Wallet</h2>
              <div className="flex flex-col gap-1 pb-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-400">Total BTC Balance</span>
                  <span className="text-3xl font-bold text-white tracking-wider">
                    {(cryptoBalance + syncBtcBalance) > 0 ? (cryptoBalance + syncBtcBalance).toFixed(8) : "0.00000000"} <span className="text-primary">BTC</span>
                  </span>
                </div>
                {currentPrice && currentUsdtCop && (
                  <div className="flex justify-end">
                    <span className="text-sm font-medium text-gray-400">
                      ≈ {((cryptoBalance + syncBtcBalance) * currentPrice * currentUsdtCop).toLocaleString('de-DE', { maximumFractionDigits: 0 })} COP
                    </span>
                  </div>
                )}
                {avgBuyPrice > 0 && (() => {
                  // Compute weighted average BTC/USDT from loaded deposits
                  let totalBtcWeighted = 0;
                  let totalBtcQty = 0;
                  allUserDeposits.forEach((dep) => {
                    const btc = dep.marketBuy?.btcBought || 0;
                    const price = dep.marketBuy?.btcUsdtPrice || 0;
                    if (btc > 0 && price > 0) {
                      totalBtcWeighted += btc * price;
                      totalBtcQty += btc;
                    }
                  });
                  const avgUsdt = totalBtcQty > 0 ? Math.round(totalBtcWeighted / totalBtcQty) : 0;

                  // Compute Rendimiento (yield) from live BTC/COP vs avg buy price
                  const currentBtcCop = currentPrice && currentUsdtCop ? currentPrice * currentUsdtCop : 0;
                  const rendimiento = currentBtcCop > 0 && avgBuyPrice > 0
                    ? ((currentBtcCop - avgBuyPrice) / avgBuyPrice) * 100
                    : null;

                  return (
                    <div className="flex flex-col gap-2 pt-3 border-t border-surface-border/50">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-400">Precio Prom. Compra</span>
                        <span className="font-mono text-white bg-white/10 px-2 py-1 rounded">
                          ${avgBuyPrice.toLocaleString('de-DE')} <span className="text-xs text-gray-400">COP/BTC</span>
                        </span>
                      </div>
                      {avgUsdt > 0 && (
                        <div className="flex justify-end">
                          <span className="font-mono text-sm text-gray-400 bg-white/5 px-2 py-1 rounded">
                            ${avgUsdt.toLocaleString('de-DE')} <span className="text-xs">USDT/BTC</span>
                          </span>
                        </div>
                      )}
                      {rendimiento !== null && (
                        <div className="flex justify-between items-center pt-2">
                          <span className="font-medium text-gray-400">Rendimiento</span>
                          <span className={`text-xl font-bold ${rendimiento >= 0
                            ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]'
                            : 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                            }`}>
                            {rendimiento >= 0 ? '+' : ''}{rendimiento.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mb-4 w-full">
              <button
                onClick={() => setShowCopDepositos(!showCopDepositos)}
                className="w-full px-4 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-2xl text-white font-bold text-lg shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-emerald-400/30"
              >
                <span>COP Depositos</span>
                <ArrowsUpDownIcon className="w-6 h-6" />
              </button>

              {showCopDepositos && (
                <div className="mt-4 bg-black/40 border border-surface-border p-6 rounded-2xl shadow-lg backdrop-blur-sm animate-fade-in">
                  <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                    <span className="text-emerald-400">Depositar con Bre-B</span>
                  </h3>
                  <div className="mt-4 text-center flex flex-col items-center">
                    <Image
                      src="/QR_rendimientos.jpg"
                      alt="QR COP Depositos"
                      width={300}
                      height={300}
                      className="rounded-lg mb-6 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    />
                    <div className="w-full max-w-xs mb-4">
                      <label className="block text-sm font-medium text-gray-300 mb-1 text-left">Bre-B Key</label>
                      <div className="flex justify-between items-center bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3 shadow-sm transition-all hover:bg-gray-800/80">
                        <span className="text-lg font-medium font-mono text-gray-200 tracking-wider">0092325247</span>
                        <button
                          onClick={() => {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              navigator.clipboard.writeText("0092325247");
                              setCopiedBancos(true);
                              setTimeout(() => setCopiedBancos(false), 2000);
                            }
                          }}
                          className="p-2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 rounded-lg transition-all active:scale-95"
                          title="Copiar Bre-B Key"
                        >
                          <DocumentDuplicateIcon className="w-5 h-5" />
                        </button>
                      </div>
                      {copiedBancos && <p className="mt-2 text-sm text-green-400 font-medium">¡Copiado!</p>}
                    </div>
                    <p className="text-sm mt-2 text-gray-300">Escanea este codigo QR o copia esta llave para realizar transferencias desde cualquier banco en Colombia. Una vez realizada la transferencia, enviar el comprobante haciendo click en &apos;Contacto&apos;.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4 w-full">
              <button
                onClick={() => setShowBtcLightningDeposit(!showBtcLightningDeposit)}
                className="w-full px-4 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rounded-2xl text-white font-bold text-lg shadow-[0_4px_20px_rgba(245,158,11,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-orange-400/30"
              >
                <span>Deposit via BTC Lightning</span>
                <span className="text-2xl" title="thunder icon">⚡</span>
              </button>

              {showBtcLightningDeposit && (
                <div className="mt-4 bg-black/40 border border-surface-border p-6 rounded-2xl shadow-lg backdrop-blur-sm animate-fade-in">
                  <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                    <span className="text-yellow-400">⚡ Savings (BTC Lightning)</span>
                  </h3>
                  
                  {savingsPaymentStatus === 'settled' ? (
                    <div className="bg-green-500/20 border border-green-500/50 p-6 rounded-xl text-center animate-fade-in shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                      <div className="text-4xl mb-4">🎉</div>
                      <h4 className="text-xl font-bold text-green-400 mb-2">¡Ahorro recibido!</h4>
                      <p className="text-green-200">Deposit successful.</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative mb-4">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={savingsAmountFormatted}
                          onChange={(e) => {
                            const rawVal = e.target.value.replace(/\D/g, '');
                            const numVal = parseInt(rawVal, 10);
                            if (!isNaN(numVal) && rawVal !== '') {
                              setSavingsAmountFormatted(numVal.toLocaleString('de-DE'));
                              setSavingsAmount(numVal);
                            } else {
                              setSavingsAmountFormatted('');
                              setSavingsAmount(0);
                            }
                          }}
                          placeholder="Amount"
                          className="w-full p-4 bg-gray-900/80 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-yellow-500 outline-none text-lg pr-20"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">⚡ sats</span>
                      </div>
                      
                      <button
                        onClick={generateSavingsInvoice}
                        disabled={savingsAmount <= 0 || savingsPaymentStatus === 'pending'}
                        className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl mb-4 disabled:bg-gray-700 disabled:text-gray-500 font-bold transition-all shadow-lg"
                        title={savingsAmount <= 0 ? 'Enter an amount greater than 0' : savingsPaymentStatus === 'pending' ? 'Waiting for payment' : ''}
                      >
                        Generate Savings Invoice
                      </button>

                      {savingsLoading && (
                        <div className="flex justify-center mt-4">
                          <div className="w-6 h-6 border-2 border-t-yellow-500 border-gray-600 rounded-full animate-spin"></div>
                        </div>
                      )}
                      
                      {isClient && savingsBolt11 && (
                        <div className="mt-6 text-center bg-white/5 border border-surface-border p-6 rounded-xl backdrop-blur-md">
                          <div className="bg-white p-2 rounded-xl inline-block shadow-lg">
                            <QRCodeCanvas value={savingsBolt11} size={180} />
                          </div>
                          <p className="mt-4 text-gray-300">Scan to save <strong className="text-white">{savingsAmountFormatted} sats</strong></p>
                          <div className="mt-4 flex items-center bg-gray-900/80 rounded-lg p-2 border border-gray-700">
                            <p className="text-xs text-gray-400 break-all px-2 line-clamp-2 overflow-hidden text-left flex-1">
                              {savingsBolt11}
                            </p>
                            <button
                              onClick={handleCopySavingsRequest}
                              className="ml-2 p-2 bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 rounded-lg transition-all active:scale-95 whitespace-nowrap"
                            >
                              {copySavingsButtonText === 'Copied!' ? '¡Copiado!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}

                      {savingsPaymentStatus === 'pending' && (
                        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center animate-pulse">
                          <p className="text-yellow-400 font-medium">Payment pending... waiting for settlement</p>
                        </div>
                      )}

                      {savingsError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                          <p className="text-red-400">{savingsError}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mb-8 w-full">
              <button
                onClick={() => setShowCopRetiros(!showCopRetiros)}
                className="w-full px-4 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-2xl text-white font-bold text-lg shadow-[0_4px_20px_rgba(79,70,229,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-indigo-400/30"
              >
                <span>COP Retiros</span>
                <ArrowsUpDownIcon className="w-6 h-6" />
              </button>

              {showCopRetiros && (
                <div className="mt-4 bg-black/40 border border-surface-border p-6 rounded-2xl shadow-lg backdrop-blur-sm animate-fade-in">
                  <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                    <span className="text-indigo-400">Retiro a Bre-B</span>
                  </h3>

                  {liveBtcUsdt && liveUsdtCop ? (
                    <div className="text-xs text-yellow-400 mb-4 bg-yellow-400/10 p-2 rounded border border-yellow-400/20">
                      Quote changes every minute. Rate: 1 BTC = ${(liveBtcUsdt * liveUsdtCop).toLocaleString('de-DE')} COP
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 mb-4 animate-pulse">
                      Fetching live quotes...
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Bre-B Key</label>
                      <input
                        type="text"
                        value={copRetirosBreBKey}
                        onChange={(e) => setCopRetirosBreBKey(e.target.value)}
                        placeholder="Ej: 3001234567"
                        className="w-full p-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Amount (COP)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={copRetirosAmount}
                          onChange={handleCopRetirosAmountChange}
                          placeholder="0"
                          className="w-full p-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Equivalent (BTC)</label>
                        <input
                          type="number"
                          value={copRetirosBtcAmount}
                          onChange={handleCopRetirosBtcAmountChange}
                          placeholder="0.00"
                          className="w-full p-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCopRetirosSubmit}
                      disabled={!liveBtcUsdt || !liveUsdtCop}
                      className="w-full mt-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all shadow-lg"
                    >
                      Solicitar Retiro
                    </button>
                    {copRetirosError && <p className="text-red-400 mt-2 text-sm text-center">{copRetirosError}</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-8 w-full">
              <button
                onClick={() => setShowBtcLightningWithdrawal(!showBtcLightningWithdrawal)}
                className="w-full px-4 py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 rounded-2xl text-white font-bold text-lg shadow-[0_4px_20px_rgba(245,158,11,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 border border-yellow-400/30"
              >
                <span>Retiro BTC Lightning</span>
                <span className="text-2xl" title="thunder icon">⚡</span>
              </button>

              {showBtcLightningWithdrawal && (
                <div className="mt-4 bg-black/40 border border-surface-border p-6 rounded-2xl shadow-lg backdrop-blur-sm animate-fade-in text-left">
                  <h3 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                    <span className="text-yellow-400">⚡ Retiro BTC Lightning</span>
                  </h3>
                  
                  {withdrawalPaymentStatus === 'success' ? (
                    <div className="bg-green-500/20 border border-green-500/50 p-6 rounded-xl text-center animate-fade-in shadow-[0_0_20px_rgba(34,197,94,0.3)] relative overflow-hidden">
                      {/* Premium CSS glowing ring animation */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-24 h-24 rounded-full border border-green-500/30 animate-ping duration-1000 opacity-75"></div>
                        <div className="w-16 h-16 rounded-full border border-green-400/50 animate-pulse opacity-50"></div>
                      </div>
                      
                      <div className="relative z-10">
                        <div className="text-5xl mb-4 animate-bounce">🎉</div>
                        <h4 className="text-2xl font-bold text-green-400 mb-2">¡Retiro Exitoso!</h4>
                        <p className="text-green-100 mb-4">El pago Lightning se ha liquidado y tu saldo ha sido actualizado.</p>
                        <button 
                          onClick={resetWithdrawal}
                          className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-md"
                        >
                          Entendido
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-yellow-400 mb-4 bg-yellow-400/10 p-3 rounded-xl border border-yellow-400/20 flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span>Tu Saldo BTC Autorizado:</span>
                          <strong className="text-white text-sm">{syncBtcBalance.toFixed(8)} BTC</strong>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>Equivalente en Satoshis:</span>
                          <span>{(syncBtcBalance * 100000000).toLocaleString('de-DE')} sats</span>
                        </div>
                      </div>

                      {/* QR Scanner view option - Always mounted to avoid React removeChild Virtual DOM conflicts */}
                      <div className={`mb-4 bg-white/5 border border-surface-border p-4 rounded-xl text-center backdrop-blur-md ${showScanner ? 'block' : 'hidden'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-semibold text-white">Escanea Código QR</span>
                          <button
                            onClick={() => setShowScanner(false)}
                            className="text-gray-400 hover:text-white text-xs font-bold bg-white/10 px-2 py-1 rounded"
                          >
                            Cancelar
                          </button>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
                          <QrScanner 
                            active={showScanner}
                            onScanSuccess={(text) => {
                              handleBolt11(text);
                              setShowScanner(false);
                            }}
                            onScanError={(err) => setScannerError(err)}
                          />
                        </div>
                      </div>

                      {/* Factura input and control buttons */}
                      {!showScanner && (
                        <div className="mb-4 flex flex-col gap-3">
                          <label className="block text-sm font-medium text-gray-300">Factura Lightning (BOLT11)</label>
                          <input
                            type="text"
                            value={withdrawalBolt11 || ''}
                            onChange={(e) => handleBolt11(e.target.value)}
                            placeholder="Pega tu factura ln..."
                            className="w-full p-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white focus:ring-2 focus:ring-yellow-500 outline-none text-sm"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={handlePasteFromClipboard}
                              className="w-full py-3 bg-yellow-500/20 hover:bg-yellow-500/30 active:bg-yellow-500/40 text-yellow-400 rounded-xl transition-all active:scale-[0.98] text-sm font-bold flex items-center justify-center gap-2 border border-yellow-500/30 shadow-md"
                              title="Pegar desde Portapapeles"
                            >
                              <span>📋</span>
                              <span>Pegar Factura</span>
                            </button>
                            <button
                              onClick={() => {
                                setScannerError(null);
                                setShowScanner(true);
                              }}
                              className="w-full py-3 bg-orange-500/20 hover:bg-orange-500/30 active:bg-orange-500/40 text-orange-400 rounded-xl transition-all active:scale-[0.98] text-sm font-bold flex items-center justify-center gap-2 border border-orange-500/30 shadow-md"
                              title="Escanear QR"
                            >
                              <span>📸</span>
                              <span>Escanear QR</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Display Quote Details if available */}
                      {withdrawalQuote && (
                        <div className="mb-6 p-4 bg-white/5 border border-surface-border rounded-xl backdrop-blur-md space-y-3 animate-fade-in text-sm text-gray-300">
                          <h4 className="font-bold text-white text-base border-b border-white/10 pb-2 mb-2 flex items-center justify-between">
                            <span>Resumen de Retiro</span>
                            <span className="text-yellow-400 font-semibold">{withdrawalQuote.amountSats.toLocaleString('de-DE')} sats</span>
                          </h4>
                          
                          <div className="flex justify-between">
                            <span>Monto a Retirar:</span>
                            <span className="text-white">{(withdrawalQuote.amountSats / 100000000).toFixed(8)} BTC</span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span>Comisión de Red (LND):</span>
                            <span className="text-white">{(withdrawalQuote.partnerFee / 100000000).toFixed(8)} BTC</span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span>Comisión de la Plataforma:</span>
                            <span className="text-white">{(withdrawalQuote.baseFee / 100000000).toFixed(8)} BTC</span>
                          </div>
                          
                          <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-white text-base">
                            <span>Total a Deducir:</span>
                            <span className="text-yellow-400">{(withdrawalQuote.totalSats / 100000000).toFixed(8)} BTC</span>
                          </div>

                          {/* Live balance sufficiency check inside the card */}
                          {syncBtcBalance < (withdrawalQuote.totalSats / 100000000) ? (
                            <div className="mt-3 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 font-medium flex flex-col gap-1 text-xs">
                              <span>⚠️ Fondos Insuficientes</span>
                              <span>Necesitas {(withdrawalQuote.totalSats / 100000000).toFixed(8)} BTC, pero tu saldo es de {syncBtcBalance.toFixed(8)} BTC.</span>
                            </div>
                          ) : (
                            <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 font-medium text-xs">
                              ✓ Saldo suficiente para cubrir este retiro.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      {withdrawalQuote && (
                        <div className="flex gap-3">
                          <button
                            onClick={handleConfirmPayment}
                            disabled={syncBtcBalance < (withdrawalQuote.totalSats / 100000000) || withdrawalPaymentStatus === 'pending'}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all shadow-lg text-center flex items-center justify-center gap-2"
                          >
                            {withdrawalPaymentStatus === 'pending' ? (
                              <>
                                <div className="w-5 h-5 border-2 border-t-white border-gray-400 rounded-full animate-spin"></div>
                                <span>Procesando Pago...</span>
                              </>
                            ) : (
                              <span>Confirmar y Enviar Pago</span>
                            )}
                          </button>
                          
                          <button
                            onClick={resetWithdrawal}
                            className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-all font-semibold"
                          >
                            Reiniciar
                          </button>
                        </div>
                      )}

                      {scannerError && (
                        <div className="mt-4 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-center text-xs text-red-400">
                          {scannerError}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <h1 className="text-2xl font-bold mb-4 text-center">Saldos de Inversión</h1>
            <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="Ingresa tu ID o cedula"
                className="w-full p-3 bg-black/40 border border-surface-border rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-primary hover:bg-primary/80 rounded-xl text-white font-semibold disabled:bg-gray-700 transition-all shadow-[0_0_10px_rgba(139,92,246,0.5)] active:scale-[0.98]"
              >
                {loading ? "..." : "Obtener Datos"}
              </button>
            </form>

            {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

            {data.length > 0 ? (
              <div className="flex flex-col gap-4 mt-6">
                {data.map((item, index) => (
                  <div key={index} className="bg-surface border border-surface-border backdrop-blur-md p-6 rounded-2xl shadow-lg transition-transform hover:-translate-y-1">
                    <h2 className="text-2xl font-bold mb-6 text-center text-white">
                      {item.name} {item.lastname}
                    </h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-3 border-b border-surface-border/50">
                        <span className="font-medium text-gray-400">BTC Balance</span>
                        <span className="text-xl font-bold text-white tracking-wider">{item.BTCbalance} <span className="text-primary">BTC</span></span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-surface-border/50">
                        <span className="font-medium text-gray-400">Saldo (Pesos)</span>
                        <span className="text-xl font-bold text-white">{item.COPbalance} <span className="text-secondary">COP</span></span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-surface-border/50">
                        <span className="font-medium text-gray-400">Rendimiento</span>
                        <span className="text-xl font-bold text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">{item.Rendimiento}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-400">Precio Promedio Compra</span>
                        <span className="font-mono text-white bg-white/10 px-2 py-1 rounded">{item.AvgCompra}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <p className="text-gray-400 text-center">
                  No balances found. Enter an ID to fetch.
                </p>
              )
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
              className="text-lg font-bold mb-4 text-center cursor-pointer" onClick={() => setShowSavings(!showSavings)}
            >
              Ahorra Aqui {showSavings ? '▲' : '▼'}
            </h2>
            {showSavings && (
              <div className="bg-gray-700 p-4 rounded shadow">
                <div className="flex flex-col space-y-4">
                  <button
                    onClick={() => setSavingsOption('bancosEuropa')}
                    className={`px-4 py-2 rounded ${savingsOption === 'bancosEuropa' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Europa
                  </button>
                  {savingsOption === 'bancosEuropa' && (
                    <div className="mt-4 text-center p-4 bg-gray-800 rounded text-xs">
                      <p>My IBAN account details:</p>
                      <p>Recipient name: Bridge Building Sp. Z.o.o.</p>
                      <p>IBAN: LU77 4080 0000 4178 5760</p>
                      <p>Bank name and address: Banking Circle S.A, 2 Boulevard de la Foire Luxembourg City L-1528 Luxembourg</p>
                    </div>
                  )}
                  <button
                    onClick={() => setSavingsOption('bancosUSA')}
                    className={`px-4 py-2 rounded ${savingsOption === 'bancosUSA' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos USA
                  </button>
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
                  <button
                    onClick={() => setSavingsOption('usdtPolygon')}
                    className={`px-4 py-2 rounded ${savingsOption === 'usdtPolygon' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    USDT (Polygon)
                  </button>
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

                        {/* INSERT HERE: Computed EIP-681 URI for MetaMask compatibility */}
                        {(() => {
                          const appWallet = process.env.NEXT_PUBLIC_APP_WALLET_ADDRESS!;
                          const usdtContract = process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS!;

                          let qrValue = appWallet; // Fallback to plain address

                          if (usdtSavingsAmount > 0) {
                            try {
                              const amountWei = ethers.parseUnits(usdtSavingsAmount.toString(), 6).toString(); // Scale to 6 decimals (USDT)
                              qrValue = `ethereum:${usdtContract}@137/transfer?address=${appWallet}&uint256=${amountWei}`;
                            } catch (err) {
                              console.error('QR amount parse error:', err);
                              qrValue = appWallet; // Fallback on error
                            }
                          }

                          return <QRCodeCanvas value={qrValue} size={128} className="mx-auto" />;
                        })()}

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
                      {usdtPaymentStatus === 'confirmed' ? (
                        <div className="mt-4 text-center">
                          <p className="text-green-400 mt-2">Deposit confirmed! Balance updating soon.</p>
                          {registrationStatus === 'success' && <p className="text-green-400 mt-2">Deposit registered!</p>}
                          <button
                            onClick={resetUsdtPolygonDeposit}
                            className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
                          >
                            New Deposit
                          </button>
                        </div>
                      ) : null}

                      {usdtError && <p className="text-red-400 mt-2">{usdtError}</p>}
                    </div>
                  )}
                </div>
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
                    className={`px-4 py-2 rounded ${withdrawalOption === 'bancosColombia' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Colombia
                  </button>
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
                        placeholder="Cantidad en COP"
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
                      {withdrawalError && <p className="text-red-400 mt-2">{withdrawalError}</p>}
                      <p className="text-xs mt-2 text-gray-400">Puedes usar tu llave o tu cuenta bancaria. Recuerda que usando la llave, el limite es de 1.000.000 Pesos.</p>
                      <p className="text-xs mt-2 text-gray-400">0,8% comision de retiro</p>
                    </div>
                  )}
                  <button
                    onClick={() => setWithdrawalOption('bancosInternacionales')}
                    className={`px-4 py-2 rounded ${withdrawalOption === 'bancosInternacionales' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    Bancos Internacionales
                  </button>
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
                        placeholder="Cantidad en COP"
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
                        onClick={handleWithdrawalSubmit}
                        className="w-full px-4 py-2 bg-blue-600 rounded text-white"
                      >
                        Submit International Withdrawal
                      </button>
                      <p className="text-xs mt-2 text-gray-400">1% comision de retiro. 1 a 3 dias hábiles</p>
                    </div>
                  )}

                  <button
                    onClick={() => setWithdrawalOption('usdtWallet')}
                    className={`px-4 py-2 rounded ${withdrawalOption === 'usdtWallet' ? 'bg-blue-600' : 'bg-gray-600'
                      } text-white hover:bg-blue-700 transition-colors`}
                  >
                    USDT Wallet
                  </button>
                </div>
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
            <h2 className="text-lg font-bold mb-4 text-center cursor-pointer" onClick={() => setShowPendingWithdrawals(!showPendingWithdrawals)}>
              Pending Withdrawals {showPendingWithdrawals ? '▲' : '▼'}
            </h2>
            {showPendingWithdrawals && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {pendingBankWithdrawals.length === 0 ? (
                  <p className="text-gray-400 col-span-full text-center">No pending bank withdrawals.</p>
                ) : (
                  pendingBankWithdrawals.map((wd) => (
                    <div
                      key={wd.requestId}
                      className="bg-gray-800 p-4 rounded shadow cursor-pointer hover:bg-gray-700 transition-colors w-48"  // Small box
                      onClick={() => setSelectedBankWithdrawal(wd)}
                    >
                      <p className="text-white font-semibold text-sm">Email: {wd.userEmail || 'N/A'}</p>
                      <p className="text-white text-sm">
                        Amount: {wd.amount.toLocaleString('de-DE')} COP
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
            {selectedBankWithdrawal && (
              <div className="mt-4 bg-black/50 p-4 rounded shadow text-sm">
                <h3 className="font-bold mb-2">Withdrawal Details</h3>
                <p><strong>User ID:</strong> {selectedBankWithdrawal.uid}</p>
                <p><strong>Name:</strong> {selectedBankWithdrawal.name}</p>
                <p><strong>Email:</strong> {selectedBankWithdrawal.userEmail || 'N/A'}</p>
                <p><strong>Amount:</strong> {selectedBankWithdrawal.amount.toLocaleString('de-DE')} COP</p>
                <p><strong>Option:</strong> {selectedBankWithdrawal.option}</p>
                {selectedBankWithdrawal.option === 'copRetiros' ? (
                  <>
                    <p className="flex items-center gap-2">
                      <strong>Bre-B Key:</strong> {selectedBankWithdrawal.bankData || selectedBankWithdrawal.bank || 'N/A'}
                      <button
                        onClick={() => navigator.clipboard.writeText(selectedBankWithdrawal.bankData || selectedBankWithdrawal.bank || '')}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <DocumentDuplicateIcon className="w-4 h-4 text-gray-300" />
                      </button>
                    </p>
                    <p><strong>Requested BTC:</strong> {selectedBankWithdrawal.requestedBtcAmount}</p>
                  </>
                ) : (
                  <>
                    <p><strong>Bank:</strong> {selectedBankWithdrawal.bankData || selectedBankWithdrawal.bank || 'N/A'}</p>
                    <p><strong>Bank Name:</strong> {selectedBankWithdrawal.bankName || 'N/A'}</p>
                    <p><strong>Country:</strong> {selectedBankWithdrawal.country || 'N/A'}</p>
                  </>
                )}
                <p><strong>Timestamp:</strong> {new Date(selectedBankWithdrawal.timestamp).toLocaleString()}</p>
                <button
                  onClick={() => handleSettle(selectedBankWithdrawal)}
                  disabled={settleLoading}
                  className="mt-2 px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 disabled:bg-gray-500"
                >
                  {settleLoading ? 'Settling...' : 'Settle'}
                </button>
                {settleError && <p className="text-red-400 mt-2">{settleError}</p>}
                <button onClick={() => setSelectedBankWithdrawal(null)} className="ml-2 px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700">
                  Close
                </button>
              </div>
            )}
          </div>
        )}


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

      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface border border-surface-border p-6 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Notificaciones Históricas</h2>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="text-gray-400 hover:text-white font-bold text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto pr-2 space-y-4 flex-1">
              {user?.uid === '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && (
                <>
                  <h3 className="text-lg font-bold text-white mt-2 mb-2">Notificaciones del Sistema</h3>
                  {allAdminDeposits.length > 0 ? allAdminDeposits.map((dep, idx) => (
                    <div key={`admin-${idx}`} className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-sm text-gray-400 mb-1">{new Date(dep.timestamp || 0).toLocaleString()}</p>
                      <p className="text-white font-medium">Deposito de {dep.parsedName}</p>
                      <p className="text-green-400 font-bold">${Number(String(dep.amount).replace(/,/g, '')).toLocaleString('de-DE')} <span className="text-xs text-gray-500">[{dep.status}]</span></p>
                      {dep.marketBuy && (
                        <div className="mt-2 text-xs bg-black/20 p-2 rounded">
                          <p className="text-gray-300">Market Buy: {dep.marketBuy.btcBought} BTC</p>
                          {dep.marketBuy.btcUsdtPrice && <p className="text-gray-400">BTC/USDT: ${dep.marketBuy.btcUsdtPrice}</p>}
                          {dep.marketBuy.usdtCopPrice && <p className="text-gray-400">USDT/COP: ${dep.marketBuy.usdtCopPrice}</p>}
                        </div>
                      )}
                    </div>
                  )) : <p className="text-gray-400 text-center py-4">No hay notificaciones del sistema.</p>}
                  <h3 className="text-lg font-bold text-white mt-6 mb-2">Mis Movimientos</h3>
                </>
              )}

              {[...allUserDeposits, ...allUserWithdrawals]
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .map((item, idx) => (
                  <div key={`user-${idx}`} className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-gray-400 mb-1">{new Date(item.timestamp || 0).toLocaleString()}</p>
                    {'parsedName' in item ? (
                      <>
                        <p className="text-white font-medium">Deposito Recibido</p>
                        <p className="text-green-400 font-bold">${item.saldoCop ? item.saldoCop.toLocaleString('de-DE') : Number(String(item.amount).replace(/,/g, '')).toLocaleString('de-DE')} <span className="text-xs text-gray-500">[{item.status}]</span></p>
                        {'marketBuy' in item && item.marketBuy && (
                          <div className="mt-2 text-xs bg-black/20 p-2 rounded">
                            <p className="text-gray-300">Market Buy: {item.marketBuy.btcBought} BTC</p>
                            {item.marketBuy.btcUsdtPrice && <p className="text-gray-400">BTC/USDT: ${item.marketBuy.btcUsdtPrice}</p>}
                            {item.marketBuy.usdtCopPrice && <p className="text-gray-400">USDT/COP: ${item.marketBuy.usdtCopPrice}</p>}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-white font-medium">Retiro a {item.bankName || 'Bitcoin'}</p>
                        <p className="text-red-400 font-bold">${item.saldoCop ? item.saldoCop.toLocaleString('de-DE') : Number(String(item.amount).replace(/,/g, '')).toLocaleString('de-DE')} <span className="text-xs text-gray-500">[{item.status}]</span></p>
                        {'receipt' in item && item.receipt && (
                          <div className="mt-2 text-xs bg-black/20 p-2 rounded">
                            {item.receipt.btcUsdt && <p className="text-gray-400">BTC/USDT: ${item.receipt.btcUsdt}</p>}
                            {item.receipt.usdtCop && <p className="text-gray-400">USDT/COP: ${item.receipt.usdtCop}</p>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              {[...allUserDeposits, ...allUserWithdrawals].length === 0 && (
                <p className="text-gray-400 text-center py-4">No hay movimientos personales.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
"use client";
import { useState, useEffect } from "react";
import '../../app/globals.css';
import { ArrowLeftIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { auth, database } from '../../app/lib/firebase';
import { ref, onValue } from "firebase/database";
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';

interface UserBalance {
  id: string;
  name: string;
  BTCbalance?: number;
  BTCBalance?: number;
  btcBalance?: number;
  avgBuyPrice?: number;
  totalCopInvested?: number;
  uid?: string;
}

interface TransactionItem {
  type: 'deposit' | 'withdrawal';
  id: string;
  uid: string;
  name?: string;
  amount: string | number;
  date: string;
  time: string;
  timestamp: number;
  status: string;
  btcBought?: number;
  requestedBtcAmount?: number;
  fee?: number;
  option?: string;
  marketBuy?: {
    btcBought: number;
    usdtSpent: number;
    orderId: number | string;
    usdtCopPrice?: number;
    btcUsdtPrice?: number;
    priceSource?: string;
  };
  receipt?: {
    btcUsdt?: number;
    usdtCop?: number;
    totalCop?: number;
  };
}

export default function AdminDashboard() {
  const [user, loadingAuth] = useAuthState(auth);
  const router = useRouter();

  // RTDB Loaded States
  const [users, setUsers] = useState<UserBalance[]>([]);
  const [totalDepositsBtc, setTotalDepositsBtc] = useState<number>(0);
  const [totalFeesBtc, setTotalFeesBtc] = useState<number>(0);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);

  // LND Node Balances
  const [nodeOnChainSat, setNodeOnChainSat] = useState<number | null>(null);
  const [nodeChannelsSat, setNodeChannelsSat] = useState<number | null>(null);
  const [loadingNode, setLoadingNode] = useState<boolean>(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  // Binance WebSockets Quotes
  const [btcUsdt, setBtcUsdt] = useState<number | null>(null);
  const [usdtCop, setUsdtCop] = useState<number | null>(null);
  const [prevBtcUsdt, setPrevBtcUsdt] = useState<number | null>(null);

  // Search Engine States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<UserBalance | null>(null);
  const [allTransactions, setAllTransactions] = useState<TransactionItem[]>([]);
  const [showUserTransactions, setShowUserTransactions] = useState<boolean>(false);

  // Manual Deposit States
  const [showManualDepositForm, setShowManualDepositForm] = useState<boolean>(false);
  const [manualDepositAmount, setManualDepositAmount] = useState<string>("1000000");
  const [manualDepositTime, setManualDepositTime] = useState<string>("");
  const [manualDepositDate, setManualDepositDate] = useState<string>("");
  const [manualDepositUsdtCop, setManualDepositUsdtCop] = useState<string>("");
  const [submittingManualDeposit, setSubmittingManualDeposit] = useState<boolean>(false);
  const [manualDepositError, setManualDepositError] = useState<string | null>(null);
  const [manualDepositSuccess, setManualDepositSuccess] = useState<string | null>(null);


  // Guard: Check admin authorization (Admin UID: '5XgksHrgmyeGqqKFYGVjQVM0KGl1')
  useEffect(() => {
    if (!loadingAuth) {
      if (!user || (user.uid !== '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && user.uid !== 'VldgsZCsJaOTrFT2uR2YvXxUe7o1')) {
        router.push('/');
      }
    }
  }, [user, loadingAuth, router]);

  // 1. Fetch Real-time RTDB Metrics
  useEffect(() => {
    if (!user || (user.uid !== '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && user.uid !== 'VldgsZCsJaOTrFT2uR2YvXxUe7o1')) return;

    const unsubscribes: Array<() => void> = [];

    // Balances reference (deposits tally & user directory)
    const balancesRef = ref(database, 'balances');
    const unsubB = onValue(balancesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const userList: UserBalance[] = [];
        let depositsSum = 0;

        for (const key in data) {
          const u = data[key];
          const btc = parseFloat((u.BTCbalance ?? u.BTCBalance ?? u.btcBalance ?? 0).toString().replace(',', '.'));

          userList.push({
            id: u.id || key,
            name: u.name || "Anonymous",
            BTCbalance: btc,
            avgBuyPrice: parseFloat((u.avgBuyPrice ?? 0).toString()),
            totalCopInvested: parseFloat((u.totalCopInvested ?? 0).toString()),
            uid: u.uid || key
          });

          depositsSum += btc;
        }

        setUsers(userList);
        setTotalDepositsBtc(parseFloat(depositsSum.toFixed(8)));
      }
    });
    unsubscribes.push(unsubB);

    // Withdrawals reference (accumulated fees)
    const withdrawalsRef = ref(database, 'withdrawals');
    const unsubW = onValue(withdrawalsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        let feesSum = 0;

        for (const uid in data) {
          const userW = data[uid];
          for (const reqId in userW) {
            const req = userW[reqId];
            if (req.status === 'settled' && req.fee) {
              feesSum += parseFloat(req.fee);
            }
          }
        }
        setTotalFeesBtc(parseFloat(feesSum.toFixed(8)));
      }
    });
    unsubscribes.push(unsubW);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [user]);

  // 2. Fetch & Merge Chronological Transaction Log (Last 3)
  useEffect(() => {
    if (!user || (user.uid !== '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && user.uid !== 'VldgsZCsJaOTrFT2uR2YvXxUe7o1')) return;

    const unsubscribes: Array<() => void> = [];

    const depositsRef = ref(database, 'deposits');
    const withdrawalsRef = ref(database, 'withdrawals');

    const updateFeed = () => {
      let combined: TransactionItem[] = [];

      // Read deposits
      onValue(depositsRef, (depSnap) => {
        const depData = depSnap.val() || {};
        const tempDeps: TransactionItem[] = [];

        for (const uid in depData) {
          if (uid === 'all') continue; // skip master logs duplicate
          const userDeps = depData[uid];
          for (const depId in userDeps) {
            const d = userDeps[depId];
            
            let displayDate = d.date;
            let displayTime = d.time;
            if ((!displayDate || displayDate === "N/A") && d.timestamp) {
              try {
                const dateObj = new Date(d.timestamp);
                const parts = new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/Bogota',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                }).formatToParts(dateObj);
                const day = parts.find(p => p.type === 'day')?.value || '01';
                const month = parts.find(p => p.type === 'month')?.value || 'Jan';
                const year = parts.find(p => p.type === 'year')?.value || '2026';
                displayDate = `${day}-${month}-${year}`;
                displayTime = new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/Bogota',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }).format(dateObj);
              } catch (e) {
                console.error("Error formatting deposit timestamp:", e);
              }
            }

            tempDeps.push({
              type: 'deposit',
              id: depId,
              uid: uid,
              name: d.parsedName || "Bancolombia Deposit",
              amount: d.saldoCop || d.amount || 0,
              date: displayDate || "N/A",
              time: displayTime || "N/A",
              timestamp: d.timestamp || 0,
              status: d.status || "pending",
              btcBought: d.marketBuy?.btcBought || d.btcBought || 0,
              marketBuy: d.marketBuy || undefined
            });
          }
        }

        // Read withdrawals
        onValue(withdrawalsRef, (witSnap) => {
          const witData = witSnap.val() || {};
          const tempWits: TransactionItem[] = [];

          for (const uid in witData) {
            const userWits = witData[uid];
            for (const witId in userWits) {
              const w = userWits[witId];
              
              let displayDate = w.date;
              let displayTime = w.time;
              if ((!displayDate || displayDate === "N/A") && w.timestamp) {
                try {
                  const dateObj = new Date(w.timestamp);
                  const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Bogota',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  }).formatToParts(dateObj);
                  const day = parts.find(p => p.type === 'day')?.value || '01';
                  const month = parts.find(p => p.type === 'month')?.value || 'Jan';
                  const year = parts.find(p => p.type === 'year')?.value || '2026';
                  displayDate = `${day}-${month}-${year}`;
                  displayTime = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Bogota',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                  }).format(dateObj);
                } catch (e) {
                  console.error("Error formatting withdrawal timestamp:", e);
                }
              }

              tempWits.push({
                type: 'withdrawal',
                id: witId,
                uid: uid,
                name: w.name || "Withdrawal Request",
                amount: w.saldoCop || w.amount || 0,
                date: displayDate || "N/A",
                time: displayTime || "N/A",
                timestamp: w.timestamp || 0,
                status: w.status || "pending",
                requestedBtcAmount: w.requestedBtcAmount || w.totalBtcToDeduct || 0,
                fee: w.fee || 0,
                option: w.option || "N/A",
                receipt: w.receipt || undefined
              });
            }
          }

          combined = [...tempDeps, ...tempWits];
          // Sort chronological descending
          combined.sort((a, b) => b.timestamp - a.timestamp);
          setRecentTransactions(combined.slice(0, 3));
          setAllTransactions(combined);
        });
      });
    };

    updateFeed();

    // Re-check periodically or simply listen to standard onValue
    const unsubD = onValue(depositsRef, updateFeed);
    const unsubW = onValue(withdrawalsRef, updateFeed);
    unsubscribes.push(unsubD, unsubW);

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [user]);

  // 3. Fetch LND Node Balances via API Proxy
  const fetchLndBalances = async () => {
    setLoadingNode(true);
    setNodeError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Authentication required.");
      }

      // Confirmed & Unconfirmed On-chain balance
      const chainRes = await fetch('/api/lndProxy/v1/balance/blockchain', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (!chainRes.ok) throw new Error(`Blockchain balance failed: ${chainRes.status}`);
      const chainData = await chainRes.json();
      const onchain = parseInt(chainData.total_balance || '0');

      // Lightning Channels balance
      const chanRes = await fetch('/api/lndProxy/v1/balance/channels', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (!chanRes.ok) throw new Error(`Channels balance failed: ${chanRes.status}`);
      const chanData = await chanRes.json();
      const channels = parseInt(chanData.balance || '0');

      setNodeOnChainSat(onchain);
      setNodeChannelsSat(channels);
    } catch (err: unknown) {
      console.error("LND Fetch Error:", err);
      const message = err instanceof Error ? err.message : "Failed to load node balances";
      setNodeError(message);
    } finally {
      setLoadingNode(false);
    }
  };

  useEffect(() => {
    if (user && (user.uid === '5XgksHrgmyeGqqKFYGVjQVM0KGl1' || user.uid === 'VldgsZCsJaOTrFT2uR2YvXxUe7o1')) {
      fetchLndBalances();
    }
  }, [user]);

  // Init Date/Time values when manual deposit form is toggled open
  useEffect(() => {
    if (showManualDepositForm) {
      const now = new Date();
      // Format to Bogota time
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, timeStyle: 'short', timeZone: 'America/Bogota' });
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      setManualDepositTime(timeStr);
      setManualDepositDate(dateStr);
      setManualDepositAmount("1000000");
      setManualDepositUsdtCop("");
      setManualDepositError(null);
      setManualDepositSuccess(null);
    }
  }, [showManualDepositForm]);

  const handleManualDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!manualDepositAmount || !manualDepositTime || !manualDepositDate) {
      setManualDepositError("Please fill out all required fields: Amount, Time, Date.");
      return;
    }

    const copAmountVal = parseFloat(manualDepositAmount.toString().replace(/,/g, ''));
    if (isNaN(copAmountVal) || copAmountVal <= 0) {
      setManualDepositError("Please enter a valid positive COP amount.");
      return;
    }

    const isConfirmed = window.confirm(`¿Estás seguro de registrar un depósito manual de $${copAmountVal.toLocaleString('de-DE')} COP para ${selectedUser.name}?`);
    if (!isConfirmed) return;

    setSubmittingManualDeposit(true);
    setManualDepositError(null);
    setManualDepositSuccess(null);

    try {
      // 1. Get auth ID token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Admin authentication required.");
      }

      // 2. Call HTTPS Cloud Function
      const response = await fetch(
        "https://us-central1-rendimientos-5dbb9.cloudfunctions.net/createManualDeposit",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            uid: selectedUser.uid || selectedUser.id,
            amount: copAmountVal,
            time: manualDepositTime,
            date: manualDepositDate,
            usdtCopRate: manualDepositUsdtCop ? parseFloat(manualDepositUsdtCop) : undefined
          })
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log("Manual deposit success:", result);
      setManualDepositSuccess(`¡Depósito registrado con éxito! Se compraron ${result.btcBought} BTC a un precio de $${result.btcUsdtPrice.toLocaleString()} USD.`);
      
      // Update selectedUser balance values locally for immediate UI update
      setSelectedUser((prev) => {
        if (!prev) return null;
        const oldBtc = prev.BTCbalance ?? 0;
        const newBtc = parseFloat((oldBtc + result.btcBought).toFixed(8));
        const oldCop = prev.totalCopInvested ?? 0;
        const newCop = oldCop + copAmountVal;
        const newAvg = newBtc > 0 ? Math.round(newCop / newBtc) : 0;
        return {
          ...prev,
          BTCbalance: newBtc,
          totalCopInvested: newCop,
          avgBuyPrice: newAvg
        };
      });

      // Clear form view after brief delay
      setTimeout(() => {
        setShowManualDepositForm(false);
      }, 5000);

    } catch (err: unknown) {
      console.error("Manual deposit error:", err);
      setManualDepositError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmittingManualDeposit(false);
    }
  };

  // 4. Binance WebSocket Integration
  useEffect(() => {
    const wsBtc = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    const wsCop = new WebSocket('wss://stream.binance.com:9443/ws/usdtcop@ticker');

    wsBtc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        setBtcUsdt((prev) => {
          if (prev !== price) setPrevBtcUsdt(prev);
          return price;
        });
      } catch (err) {
        console.error("WebSocket BTC Error:", err);
      }
    };

    wsCop.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setUsdtCop(parseFloat(data.c));
      } catch (err) {
        console.error("WebSocket COP Error:", err);
      }
    };

    return () => {
      wsBtc.close();
      wsCop.close();
    };
  }, []);

  // 5. Query matching logic for search
  const filteredUsers = searchQuery.trim() === ""
    ? []
    : users.filter(u =>
      String(u.uid || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(u.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(u.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Computations
  const liveBtcPriceCop = btcUsdt && usdtCop ? btcUsdt * usdtCop : 0;
  const nodeTotalBtc = (nodeOnChainSat !== null && nodeChannelsSat !== null)
    ? (nodeOnChainSat + nodeChannelsSat) / 100000000
    : null;

  const selectedUserTransactions = selectedUser
    ? allTransactions.filter(tx => tx.uid === selectedUser.uid || tx.uid === selectedUser.id)
    : [];

  if (loadingAuth) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#0B0E11] text-white">
        <div className="w-12 h-12 border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || (user.uid !== '5XgksHrgmyeGqqKFYGVjQVM0KGl1' && user.uid !== 'VldgsZCsJaOTrFT2uR2YvXxUe7o1')) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-[#0B0E11] text-white gap-4">
        <h1 className="text-3xl font-bold text-red-500">Access Denied</h1>
        <p className="text-gray-400">You are not authorized to view the admin console.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0B0E11] text-white min-h-screen font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-[#0B0E11]/80 backdrop-blur-lg border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-white/5 rounded-full transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:-translate-x-0.5 transition-all" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              Rendimientos Admin
            </span>
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30">
              Console v1.2
            </span>
          </div>
        </div>

        {/* Live Quotes Header */}
        <div className="flex items-center gap-6 font-mono text-sm">
          {btcUsdt && (
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-gray-400">LIVE BTC/USDT</span>
              <span className={`font-bold transition-all duration-300 ${prevBtcUsdt !== null && btcUsdt > prevBtcUsdt ? 'text-green-400' : 'text-red-400'
                }`}>
                ${btcUsdt.toLocaleString()}
              </span>
            </div>
          )}
          {liveBtcPriceCop > 0 && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-400 font-sans">TRM / COP</span>
              <span className="font-bold text-emerald-400">
                ${Math.round(liveBtcPriceCop).toLocaleString('de-DE')} <span className="text-[10px]">COP</span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto py-8 px-6 md:px-12 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* STATS SECTION (Grid 1 to 3 column layout span) */}
        <section className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Total BTC Deposited */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between group">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  Total Deposited BTC
                </h3>
                <p className="text-3xl font-extrabold font-mono mt-2 tracking-tight text-white group-hover:text-primary transition-colors">
                  {totalDepositsBtc} <span className="text-sm font-normal text-gray-400">BTC</span>
                </p>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                <span className="text-primary text-xl font-bold">₿</span>
              </div>
            </div>
            {liveBtcPriceCop > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 text-sm font-mono text-gray-400 flex justify-between">
                <span>Value in COP:</span>
                <span className="font-bold text-white">
                  ${Math.round(totalDepositsBtc * liveBtcPriceCop).toLocaleString('de-DE')} COP
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Total BTC in LND Node */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between group">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  Total BTC in Node
                </h3>
                {loadingNode ? (
                  <div className="h-9 w-24 bg-white/5 animate-pulse rounded mt-2"></div>
                ) : nodeTotalBtc !== null ? (
                  <p className="text-3xl font-extrabold font-mono mt-2 tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                    {nodeTotalBtc.toFixed(8)} <span className="text-sm font-normal text-gray-400">BTC</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 mt-3">Unavailable</p>
                )}
              </div>
              <button
                onClick={fetchLndBalances}
                disabled={loadingNode}
                className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95 transition-all"
              >
                <ArrowPathIcon className={`w-5 h-5 text-emerald-400 ${loadingNode ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {nodeError ? (
              <div className="mt-4 text-xs text-red-400">{nodeError}</div>
            ) : (nodeOnChainSat !== null && nodeChannelsSat !== null) && (
              <div className="mt-4 pt-4 border-t border-white/5 text-xs font-mono text-gray-400 flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>On-chain:</span>
                  <span className="text-white">{(nodeOnChainSat / 100000000).toFixed(8)} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span>Channels:</span>
                  <span className="text-white">{(nodeChannelsSat / 100000000).toFixed(8)} BTC</span>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Total Fees Collected */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between group">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  Total Collected Fees (1%)
                </h3>
                <p className="text-3xl font-extrabold font-mono mt-2 tracking-tight text-white group-hover:text-yellow-400 transition-colors">
                  {totalFeesBtc} <span className="text-sm font-normal text-gray-400">BTC</span>
                </p>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                <span className="text-yellow-400 text-xl font-bold">⚡</span>
              </div>
            </div>
            {liveBtcPriceCop > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 text-sm font-mono text-gray-400 flex justify-between">
                <span>Value in COP:</span>
                <span className="font-bold text-white">
                  ${Math.round(totalFeesBtc * liveBtcPriceCop).toLocaleString('de-DE')} COP
                </span>
              </div>
            )}
          </div>

        </section>

        {/* LEFT COLUMN: Search & User Drawer (Spans 2 columns on desktop) */}
        <section className="lg:col-span-2 flex flex-col gap-6">

          {/* User Search & Explorer */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="p-1.5 bg-primary/10 rounded-lg text-primary text-xs">🔍</span>
              Search Depositors Profile
            </h2>

            {/* Search Input Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Query by UID, National ID (Cédula), or Full Name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#141A20] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-primary transition-colors font-sans"
              />
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />
            </div>

            {/* Match List Dropdown */}
            {searchQuery.trim() !== "" && (
              <div className="mt-4 border border-white/5 bg-[#141A20] rounded-xl overflow-hidden divide-y divide-white/5 max-h-60 overflow-y-auto">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <button
                      key={u.uid}
                      onClick={() => {
                        setSelectedUser(u);
                        setSearchQuery(""); // clean search after selecting
                        setShowUserTransactions(false); // reset toggle
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-primary/10 transition-colors flex justify-between items-center group"
                    >
                      <div>
                        <span className="font-medium text-white group-hover:text-primary transition-colors">{u.name}</span>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">UID: {u.uid} | Cédula: {u.id}</div>
                      </div>
                      <span className="font-mono text-sm text-gray-300">{(u.BTCbalance ?? 0).toFixed(8)} BTC</span>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">No matching profiles found</div>
                )}
              </div>
            )}

            {/* Profile Summary Card */}
            {selectedUser && (
              <div className="mt-6 bg-white/[0.02] border border-white/5 rounded-xl p-6 relative overflow-hidden group">
                {/* Visual Glass Glow */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all"></div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{selectedUser.name}</h3>
                    <div className="text-xs text-gray-400 font-mono mt-1 flex flex-col gap-0.5">
                      <span>Google UID: <span className="text-gray-300">{selectedUser.uid}</span></span>
                      <span>National ID: <span className="text-gray-300">{selectedUser.id}</span></span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setShowUserTransactions(false);
                    }}
                    className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full hover:bg-red-500/20 transition-all active:scale-95"
                  >
                    Clear View
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* BTC Balance */}
                  <div className="bg-[#141A20]/50 border border-white/5 rounded-xl p-4 flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase font-medium">BTC Balance</span>
                    <span className="text-xl font-bold font-mono text-white">
                      {(selectedUser.BTCbalance ?? 0).toFixed(8)} <span className="text-xs text-gray-400">BTC</span>
                    </span>
                  </div>

                  {/* Live conversion in COP */}
                  <div className="bg-[#141A20]/50 border border-white/5 rounded-xl p-4 flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase font-medium">Live Value (COP)</span>
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {liveBtcPriceCop > 0
                        ? `$${Math.round((selectedUser.BTCbalance ?? 0) * liveBtcPriceCop).toLocaleString('de-DE')}`
                        : "Calculating..."
                      } <span className="text-xs text-gray-400">COP</span>
                    </span>
                  </div>

                  {/* Average Buy Price */}
                  <div className="bg-[#141A20]/50 border border-white/5 rounded-xl p-4 flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase font-medium">Avg Purchase Price</span>
                    <span className="text-lg font-bold font-mono text-white">
                      {selectedUser.avgBuyPrice && selectedUser.avgBuyPrice > 0
                        ? (usdtCop
                          ? `$${Math.round(selectedUser.avgBuyPrice / usdtCop).toLocaleString()}`
                          : "Calculating..."
                        )
                        : "N/A"
                      }  <span className="text-xs text-gray-400">BTC/USDT</span>
                    </span>
                  </div>

                  {/* Live yield / Rendimiento */}
                  <div className="bg-[#141A20]/50 border border-white/5 rounded-xl p-4 flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase font-medium">Live Yield (Rendimiento)</span>
                    {selectedUser.avgBuyPrice && selectedUser.avgBuyPrice > 0 && liveBtcPriceCop > 0 ? (
                      (() => {
                        const yieldPercentage = ((liveBtcPriceCop - selectedUser.avgBuyPrice) / selectedUser.avgBuyPrice) * 100;
                        const isPositive = yieldPercentage >= 0;
                        return (
                          <span className={`text-xl font-extrabold font-mono transition-all duration-300 ${isPositive
                            ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]'
                            : 'text-red-400'
                            }`}>
                            {isPositive ? "+" : ""}{yieldPercentage.toFixed(2)}%
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-gray-400 font-mono text-lg">
                        N/A
                      </span>
                    )}
                  </div>
                </div>

                {/* Historical Metrics Table */}
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs text-gray-400 font-mono">
                  <span>Total Invested: <span className="text-white">${(selectedUser.totalCopInvested ?? 0).toLocaleString('de-DE')} COP</span></span>
                </div>

                {/* Record Manual Deposit Option */}
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-mono">Manual Operations</span>
                    <button
                      onClick={() => setShowManualDepositForm(!showManualDepositForm)}
                      className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-300 active:scale-95 flex items-center gap-1.5"
                    >
                      <span>📥</span>
                      {showManualDepositForm ? "Cancel Deposit" : "Record Manual Deposit"}
                    </button>
                  </div>

                  {showManualDepositForm && (
                    <form onSubmit={handleManualDepositSubmit} className="bg-black/20 p-5 rounded-xl border border-white/5 flex flex-col gap-4 mt-2">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>💰</span> Registrar Pago Manual (COP)
                      </h4>
                      <p className="text-xs text-gray-400">
                        Esto generará una compra de mercado simulada utilizando el precio de Binance a la hora indicada.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* COP Amount */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Monto (COP)</label>
                          <input
                            type="number"
                            required
                            value={manualDepositAmount}
                            onChange={(e) => setManualDepositAmount(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="1000000"
                          />
                        </div>

                        {/* Override USDT/COP Rate */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Tasa USDT/COP (Opcional)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={manualDepositUsdtCop}
                            onChange={(e) => setManualDepositUsdtCop(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="Auto (CoinGecko)"
                          />
                        </div>

                        {/* Date */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Fecha (YYYY-MM-DD)</label>
                          <input
                            type="date"
                            required
                            value={manualDepositDate}
                            onChange={(e) => setManualDepositDate(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                          />
                        </div>

                        {/* Time */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Hora (HH:MM)</label>
                          <input
                            type="text"
                            required
                            pattern="^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$"
                            value={manualDepositTime}
                            onChange={(e) => setManualDepositTime(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="11:59"
                          />
                        </div>
                      </div>

                      {manualDepositError && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2.5 rounded-xl font-mono">
                          ⚠️ {manualDepositError}
                        </div>
                      )}

                      {manualDepositSuccess && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-2.5 rounded-xl font-sans">
                          ✅ {manualDepositSuccess}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submittingManualDeposit}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-black py-2.5 rounded-xl font-bold transition-all text-sm flex justify-center items-center gap-2"
                      >
                        {submittingManualDeposit ? (
                          <>
                            <div className="w-4 h-4 border-2 border-t-transparent border-black rounded-full animate-spin"></div>
                            Procesando...
                          </>
                        ) : (
                          "Settle Manual Deposit (Liquidar)"
                        )}
                      </button>
                    </form>
                  )}
                </div>

                {/* View Transactions Toggle and List */}
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-mono">
                      Transactions Found: <span className="text-white font-bold">{selectedUserTransactions.length}</span>
                    </span>
                    {selectedUserTransactions.length > 0 && (
                      <button
                        onClick={() => setShowUserTransactions(!showUserTransactions)}
                        className="text-xs text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-300 active:scale-95 flex items-center gap-1.5"
                      >
                        <span>📁</span>
                        {showUserTransactions ? "Hide Transactions" : "View All Transactions"}
                      </button>
                    )}
                  </div>

                  {showUserTransactions && selectedUserTransactions.length > 0 && (
                    <div className="flex flex-col gap-3 mt-2 max-h-80 overflow-y-auto pr-1">
                      {selectedUserTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="bg-[#141A20]/80 border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:border-white/10 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${tx.type === 'deposit'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}>
                              {tx.type}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">{tx.date} {tx.time}</span>
                          </div>

                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs font-medium text-gray-200 line-clamp-1 max-w-[200px]">
                              {tx.name}
                            </span>
                            <span className="font-mono text-sm font-bold text-white">
                              {tx.type === 'deposit' ? '+' : '-'}
                              {tx.btcBought || tx.requestedBtcAmount
                                ? `${(tx.btcBought || tx.requestedBtcAmount || 0).toFixed(8)} BTC`
                                : `$${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP`
                              }
                            </span>
                          </div>

                          {/* Extra details on fee if it exists */}
                          {tx.type === 'withdrawal' && tx.fee && tx.fee > 0 && (
                            <div className="text-[10px] text-gray-400 font-mono flex justify-between bg-white/[0.02] p-1.5 rounded">
                              <span>Fee Deducted:</span>
                              <span className="text-yellow-400 font-bold">{tx.fee.toFixed(8)} BTC</span>
                            </div>
                          )}

                          {/* Deposits with market buy receipt */}
                          {tx.type === 'deposit' && tx.marketBuy && (
                            <div className="mt-2 text-[10px] bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col gap-1 text-gray-400 font-mono">
                              <div className="flex justify-between border-b border-white/5 pb-1 mb-1">
                                <span className="text-gray-300 font-semibold">Market Buy Transaction:</span>
                                <span className="text-emerald-400 font-bold">{tx.marketBuy.btcBought} BTC</span>
                              </div>
                              {tx.amount && parseFloat(tx.amount.toString()) > 0 && (
                                <div className="flex justify-between text-white">
                                  <span className="text-gray-300">Amount:</span>
                                  <span>${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP</span>
                                </div>
                              )}
                              {tx.marketBuy.usdtSpent !== undefined && (
                                <div className="flex justify-between">
                                  <span>USDT spent:</span>
                                  <span className="text-gray-200">${tx.marketBuy.usdtSpent.toFixed(2)} USDT</span>
                                </div>
                              )}
                              {tx.marketBuy.btcUsdtPrice && (
                                <div className="flex justify-between">
                                  <span>BTC/USDT rate:</span>
                                  <span className="text-gray-200">${tx.marketBuy.btcUsdtPrice.toLocaleString()}</span>
                                </div>
                              )}
                              {tx.marketBuy.usdtCopPrice && (
                                <div className="flex justify-between">
                                  <span>USDT/COP rate:</span>
                                  <span className="text-gray-200">${tx.marketBuy.usdtCopPrice.toLocaleString()} COP</span>
                                </div>
                              )}
                              {tx.marketBuy.priceSource && (
                                <div className="flex justify-between text-[9px] text-gray-500 mt-0.5 border-t border-white/5 pt-1">
                                  <span>Source:</span>
                                  <span>{tx.marketBuy.priceSource}</span>
                                </div>
                              )}
                              {tx.marketBuy.orderId && (
                                <div className="flex justify-between text-[9px] text-gray-500">
                                  <span>Binance Order ID:</span>
                                  <span>{tx.marketBuy.orderId}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Withdrawals with receipt */}
                          {tx.type === 'withdrawal' && tx.receipt && (
                            <div className="mt-2 text-[10px] bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col gap-1 text-gray-400 font-mono">
                              <div className="flex justify-between border-b border-white/5 pb-1 mb-1">
                                <span className="text-gray-300 font-semibold">Withdrawal Receipt:</span>
                                <span className="text-white">Settled</span>
                              </div>
                              {tx.amount && parseFloat(tx.amount.toString()) > 0 && (
                                <div className="flex justify-between text-white">
                                  <span className="text-gray-300">Amount:</span>
                                  <span>${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP</span>
                                </div>
                              )}
                              {tx.receipt.btcUsdt && (
                                <div className="flex justify-between">
                                  <span>BTC/USDT quote:</span>
                                  <span className="text-gray-200">${tx.receipt.btcUsdt.toLocaleString()}</span>
                                </div>
                              )}
                              {tx.receipt.usdtCop && (
                                <div className="flex justify-between">
                                  <span>USDT/COP quote:</span>
                                  <span className="text-gray-200">${tx.receipt.usdtCop.toLocaleString()} COP</span>
                                </div>
                              )}
                              {tx.receipt.totalCop && (
                                <div className="flex justify-between">
                                  <span>Total COP value:</span>
                                  <span className="text-emerald-400 font-bold">${tx.receipt.totalCop.toLocaleString()} COP</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[10px] text-gray-400 border-t border-white/5 pt-2 mt-1">
                            <span>Order / Ref ID: <span className="font-mono text-gray-300 select-all">{tx.id}</span></span>
                            <span className={`font-semibold uppercase ${tx.status === 'settled' || tx.status === 'success' ? 'text-green-400' : 'text-yellow-500'
                              }`}>{tx.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Chronological Activity Feed (Spans 1 column on desktop) */}
        <section className="lg:col-span-1 flex flex-col gap-6">

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="p-1.5 bg-yellow-500/10 rounded-lg text-yellow-500 text-xs">⚡</span>
              Recent Transactions (Last 3)
            </h2>

            <div className="flex flex-col gap-4">
              {recentTransactions.length > 0 ? (
                recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-[#141A20]/50 border border-white/5 rounded-xl p-4 flex flex-col gap-2 hover:border-white/10 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase ${tx.type === 'deposit'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        {tx.type}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">{tx.date} {tx.time}</span>
                    </div>

                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-medium text-gray-200 line-clamp-1 max-w-[140px]">
                        {tx.name}
                      </span>
                      <span className="font-mono text-sm font-bold text-white">
                        {tx.type === 'deposit' ? '+' : '-'}
                        {tx.btcBought || tx.requestedBtcAmount
                          ? `${(tx.btcBought || tx.requestedBtcAmount || 0).toFixed(8)} BTC`
                          : `$${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP`
                        }
                      </span>
                    </div>

                    {/* Extra details on fee if it exists */}
                    {tx.type === 'withdrawal' && tx.fee && tx.fee > 0 && (
                      <div className="text-[10px] text-gray-400 font-mono flex justify-between bg-white/[0.02] p-1.5 rounded">
                        <span>Fee Deducted:</span>
                        <span className="text-yellow-400 font-bold">{tx.fee.toFixed(8)} BTC</span>
                      </div>
                    )}

                    {/* Deposits with market buy receipt */}
                    {tx.type === 'deposit' && tx.marketBuy && (
                      <div className="mt-2 text-[10px] bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col gap-1 text-gray-400 font-mono">
                        <div className="flex justify-between border-b border-white/5 pb-1 mb-1">
                          <span className="text-gray-300 font-semibold">Market Buy Transaction:</span>
                          <span className="text-emerald-400 font-bold">{tx.marketBuy.btcBought} BTC</span>
                        </div>
                        {tx.amount && parseFloat(tx.amount.toString()) > 0 && (
                          <div className="flex justify-between text-white">
                            <span className="text-gray-300">Amount:</span>
                            <span>${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP</span>
                          </div>
                        )}
                        {tx.marketBuy.usdtSpent !== undefined && (
                          <div className="flex justify-between">
                            <span>USDT spent:</span>
                            <span className="text-gray-200">${tx.marketBuy.usdtSpent.toFixed(2)} USDT</span>
                          </div>
                        )}
                        {tx.marketBuy.btcUsdtPrice && (
                          <div className="flex justify-between">
                            <span>BTC/USDT rate:</span>
                            <span className="text-gray-200">${tx.marketBuy.btcUsdtPrice.toLocaleString()}</span>
                          </div>
                        )}
                        {tx.marketBuy.usdtCopPrice && (
                          <div className="flex justify-between">
                            <span>USDT/COP rate:</span>
                            <span className="text-gray-200">${tx.marketBuy.usdtCopPrice.toLocaleString()} COP</span>
                          </div>
                        )}
                        {tx.marketBuy.priceSource && (
                          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5 border-t border-white/5 pt-1">
                            <span>Source:</span>
                            <span>{tx.marketBuy.priceSource}</span>
                          </div>
                        )}
                        {tx.marketBuy.orderId && (
                          <div className="flex justify-between text-[9px] text-gray-500">
                            <span>Binance Order ID:</span>
                            <span>{tx.marketBuy.orderId}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Withdrawals with receipt */}
                    {tx.type === 'withdrawal' && tx.receipt && (
                      <div className="mt-2 text-[10px] bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col gap-1 text-gray-400 font-mono">
                        <div className="flex justify-between border-b border-white/5 pb-1 mb-1">
                          <span className="text-gray-300 font-semibold">Withdrawal Receipt:</span>
                          <span className="text-white">Settled</span>
                        </div>
                        {tx.amount && parseFloat(tx.amount.toString()) > 0 && (
                          <div className="flex justify-between text-white">
                            <span className="text-gray-300">Amount:</span>
                            <span>${parseFloat(tx.amount.toString()).toLocaleString('de-DE')} COP</span>
                          </div>
                        )}
                        {tx.receipt.btcUsdt && (
                          <div className="flex justify-between">
                            <span>BTC/USDT quote:</span>
                            <span className="text-gray-200">${tx.receipt.btcUsdt.toLocaleString()}</span>
                          </div>
                        )}
                        {tx.receipt.usdtCop && (
                          <div className="flex justify-between">
                            <span>USDT/COP quote:</span>
                            <span className="text-gray-200">${tx.receipt.usdtCop.toLocaleString()} COP</span>
                          </div>
                        )}
                        {tx.receipt.totalCop && (
                          <div className="flex justify-between">
                            <span>Total COP value:</span>
                            <span className="text-emerald-400 font-bold">${tx.receipt.totalCop.toLocaleString()} COP</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[10px] text-gray-400 border-t border-white/5 pt-2 mt-1">
                      <span>User ID: <span className="font-mono text-gray-300">{tx.uid}</span></span>
                      <span className={`font-semibold uppercase ${tx.status === 'settled' || tx.status === 'success' ? 'text-green-400' : 'text-yellow-500'
                        }`}>{tx.status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-gray-400">No transactions loaded</div>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

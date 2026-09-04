"use client";
import { useState, useEffect } from "react";
import '../../app/globals.css';
import { ArrowLeftIcon, ArrowPathIcon, MagnifyingGlassIcon, Bars3Icon, UserPlusIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { auth, database } from '../../app/lib/firebase';
import { isAdminUser } from '../../app/lib/auth-utils';
import { ref, onValue, remove } from "firebase/database";
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';

interface UserBalance {
  id: string;
  name: string;
  BTCbalance?: number;
  BTCBalance?: number;
  btcBalance?: number;
  avgBuyPrice?: number;
  avgBuyPriceUsdt?: number;
  totalCopInvested?: number;
  totalUsdtInvested?: number;
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
  const [manualDepositFeeCop, setManualDepositFeeCop] = useState<string>("0");
  const [manualDepositTime, setManualDepositTime] = useState<string>("");
  const [manualDepositDate, setManualDepositDate] = useState<string>("");
  const [manualDepositUsdtCop, setManualDepositUsdtCop] = useState<string>("");
  const [submittingManualDeposit, setSubmittingManualDeposit] = useState<boolean>(false);
  const [manualDepositError, setManualDepositError] = useState<string | null>(null);
  const [manualDepositSuccess, setManualDepositSuccess] = useState<string | null>(null);

  // Manual Withdrawal States
  const [showManualWithdrawalForm, setShowManualWithdrawalForm] = useState<boolean>(false);
  const [manualWithdrawalAmountCop, setManualWithdrawalAmountCop] = useState<string>("");
  const [manualWithdrawalAmountBtc, setManualWithdrawalAmountBtc] = useState<string>("");
  const [manualWithdrawalFeeBtc, setManualWithdrawalFeeBtc] = useState<string>("0");
  const [manualWithdrawalTime, setManualWithdrawalTime] = useState<string>("");
  const [manualWithdrawalDate, setManualWithdrawalDate] = useState<string>("");
  const [manualWithdrawalDestination, setManualWithdrawalDestination] = useState<string>("");
  const [manualWithdrawalDesc, setManualWithdrawalDesc] = useState<string>("");
  const [submittingManualWithdrawal, setSubmittingManualWithdrawal] = useState<boolean>(false);
  const [manualWithdrawalError, setManualWithdrawalError] = useState<string | null>(null);
  const [manualWithdrawalSuccess, setManualWithdrawalSuccess] = useState<string | null>(null);

  // Admin Drawer & Submenu States
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [showCreateProfileModal, setShowCreateProfileModal] = useState<boolean>(false);

  // New Profile Form States
  const [newProfileId, setNewProfileId] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [newProfileEmail, setNewProfileEmail] = useState<string>("");
  const [newProfilePhone, setNewProfilePhone] = useState<string>("");
  const [newProfileBankName, setNewProfileBankName] = useState<string>("");
  const [newProfileBankData, setNewProfileBankData] = useState<string>("");
  const [newProfileNotes, setNewProfileNotes] = useState<string>("");
  const [submittingCreateProfile, setSubmittingCreateProfile] = useState<boolean>(false);
  const [createProfileError, setCreateProfileError] = useState<string | null>(null);
  const [createProfileSuccess, setCreateProfileSuccess] = useState<string | null>(null);

  const resetCreateProfileForm = () => {
    setNewProfileId("");
    setNewProfileName("");
    setNewProfileEmail("");
    setNewProfilePhone("");
    setNewProfileBankName("");
    setNewProfileBankData("");
    setNewProfileNotes("");
    setCreateProfileError(null);
    setCreateProfileSuccess(null);
  };

  const handleCreateProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateProfileError(null);
    setCreateProfileSuccess(null);

    const nationalId = newProfileId.trim();
    const fullName = newProfileName.trim();

    if (!nationalId) {
      setCreateProfileError("El documento de identidad (Cédula) es obligatorio.");
      return;
    }
    if (!fullName) {
      setCreateProfileError("El nombre completo es obligatorio.");
      return;
    }

    // Client-side quick check against already loaded users
    const existing = users.find(u => 
      String(u.id || '').toLowerCase() === nationalId.toLowerCase() ||
      String(u.uid || '').toLowerCase() === nationalId.toLowerCase()
    );
    if (existing) {
      setCreateProfileError(`Ya existe un perfil con el documento "${nationalId}" (${existing.name}).`);
      return;
    }

    setSubmittingCreateProfile(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Admin authentication required.");
      }

      const response = await fetch(
        "https://us-central1-rendimientos-5dbb9.cloudfunctions.net/createManualProfile",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            id: nationalId,
            name: fullName,
            email: newProfileEmail.trim(),
            phone: newProfilePhone.trim(),
            bankName: newProfileBankName.trim(),
            bankData: newProfileBankData.trim(),
            notes: newProfileNotes.trim()
          })
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}: Failed to create profile`);
      }

      const result = await response.json();
      console.log("Profile created:", result);

      const createdUser: UserBalance = {
        id: nationalId,
        uid: nationalId,
        name: fullName,
        BTCbalance: 0,
        avgBuyPrice: 0,
        avgBuyPriceUsdt: 0,
        totalCopInvested: 0,
        totalUsdtInvested: 0
      };

      setCreateProfileSuccess(`¡Perfil de ${fullName} (Cédula: ${nationalId}) creado con éxito!`);
      // Automatically select this user so admin can immediately view and operate
      setSelectedUser(createdUser);

      // Close modal after short delay
      setTimeout(() => {
        setShowCreateProfileModal(false);
        resetCreateProfileForm();
      }, 2500);

    } catch (err: unknown) {
      console.error("Create profile error:", err);
      setCreateProfileError(err instanceof Error ? err.message : "Error inesperado al crear el perfil.");
    } finally {
      setSubmittingCreateProfile(false);
    }
  };


  // Guard: Check admin authorization
  useEffect(() => {
    if (!loadingAuth) {
      if (!isAdminUser(user?.uid)) {
        router.push('/');
      }
    }
  }, [user, loadingAuth, router]);

  // 1. Fetch Real-time RTDB Metrics
  useEffect(() => {
    if (!isAdminUser(user?.uid)) return;

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
            avgBuyPriceUsdt: parseFloat((u.avgBuyPriceUsdt ?? 0).toString()),
            totalCopInvested: parseFloat((u.totalCopInvested ?? 0).toString()),
            totalUsdtInvested: parseFloat((u.totalUsdtInvested ?? 0).toString()),
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
    if (!isAdminUser(user?.uid)) return;

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
    if (isAdminUser(user?.uid)) {
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
      setManualDepositFeeCop("0");
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

    const feeCopVal = parseFloat(manualDepositFeeCop || "0");
    if (isNaN(feeCopVal) || feeCopVal < 0) {
      setManualDepositError("Please enter a valid fee amount.");
      return;
    }

    if (feeCopVal >= copAmountVal) {
      setManualDepositError("Fee cannot be greater than or equal to total deposit amount.");
      return;
    }

    const isConfirmed = window.confirm(`¿Estás seguro de registrar un depósito manual de $${copAmountVal.toLocaleString('de-DE')} COP (Comisión: $${feeCopVal.toLocaleString('de-DE')} COP) para ${selectedUser.name}?`);
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
            feeCop: feeCopVal,
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
        const netInvested = result.netCop ?? (copAmountVal - feeCopVal);
        const newCop = oldCop + netInvested;
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
      setSubmittingManualDeposit(false);
    }
  };

  // Init Date/Time values when manual withdrawal form is toggled open
  useEffect(() => {
    if (showManualWithdrawalForm) {
      const now = new Date();
      // Format to Bogota time
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false, timeStyle: 'short', timeZone: 'America/Bogota' });
      const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      setManualWithdrawalTime(timeStr);
      setManualWithdrawalDate(dateStr);
      setManualWithdrawalAmountCop("");
      setManualWithdrawalAmountBtc("");
      setManualWithdrawalFeeBtc("0");
      setManualWithdrawalDestination("");
      setManualWithdrawalDesc("");
      setManualWithdrawalError(null);
      setManualWithdrawalSuccess(null);
    }
  }, [showManualWithdrawalForm]);

  const handleManualWithdrawalCopChange = (val: string) => {
    setManualWithdrawalAmountCop(val);
    if (!val) {
      setManualWithdrawalAmountBtc("");
      return;
    }
    const copVal = parseFloat(val);
    if (!isNaN(copVal) && liveBtcPriceCop > 0) {
      setManualWithdrawalAmountBtc((copVal / liveBtcPriceCop).toFixed(8));
    }
  };

  const handleManualWithdrawalBtcChange = (val: string) => {
    setManualWithdrawalAmountBtc(val);
    if (!val) {
      setManualWithdrawalAmountCop("");
      return;
    }
    const btcVal = parseFloat(val);
    if (!isNaN(btcVal) && liveBtcPriceCop > 0) {
      setManualWithdrawalAmountCop(Math.round(btcVal * liveBtcPriceCop).toString());
    }
  };

  const handleManualWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!manualWithdrawalAmountCop || !manualWithdrawalAmountBtc || !manualWithdrawalTime || !manualWithdrawalDate || !manualWithdrawalDestination) {
      setManualWithdrawalError("Please fill out all required fields: Amount, Time, Date, Destination.");
      return;
    }

    const copAmountVal = parseFloat(manualWithdrawalAmountCop.toString().replace(/,/g, ''));
    const btcAmountVal = parseFloat(manualWithdrawalAmountBtc.toString());
    const feeBtcVal = parseFloat(manualWithdrawalFeeBtc || "0");

    if (isNaN(copAmountVal) || copAmountVal <= 0 || isNaN(btcAmountVal) || btcAmountVal <= 0 || isNaN(feeBtcVal) || feeBtcVal < 0) {
      setManualWithdrawalError("Please enter valid positive COP and BTC amounts, and a valid non-negative fee.");
      return;
    }

    const totalDeductBtc = parseFloat((btcAmountVal + feeBtcVal).toFixed(8));

    // Balance check client-side
    const currentBtc = selectedUser.BTCbalance ?? selectedUser.BTCBalance ?? selectedUser.btcBalance ?? 0;
    if (currentBtc < totalDeductBtc) {
      setManualWithdrawalError(`Insufficient user balance. Available: ${currentBtc} BTC, Total Required (incl. fee): ${totalDeductBtc} BTC.`);
      return;
    }

    const isConfirmed = window.confirm(`¿Estás seguro de registrar un retiro manual de $${copAmountVal.toLocaleString('de-DE')} COP (${btcAmountVal.toFixed(8)} BTC + Comisión ${feeBtcVal.toFixed(8)} BTC) para ${selectedUser.name}?`);
    if (!isConfirmed) return;

    setSubmittingManualWithdrawal(true);
    setManualWithdrawalError(null);
    setManualWithdrawalSuccess(null);

    try {
      // 1. Get auth ID token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Admin authentication required.");
      }

      // 2. Call HTTPS Cloud Function
      const response = await fetch(
        "https://us-central1-rendimientos-5dbb9.cloudfunctions.net/createManualWithdrawal",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            uid: selectedUser.uid || selectedUser.id,
            amountCop: copAmountVal,
            amountBtc: btcAmountVal,
            feeBtc: feeBtcVal,
            time: manualWithdrawalTime,
            date: manualWithdrawalDate,
            destinationAccount: manualWithdrawalDestination,
            destinationAccountDescription: manualWithdrawalDesc,
            btcUsdtPrice: btcUsdt || undefined,
            usdtCopRate: usdtCop || undefined
          })
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log("Manual withdrawal success:", result);
      setManualWithdrawalSuccess(`¡Retiro registrado con éxito! Se debitaron ${totalDeductBtc.toFixed(8)} BTC.`);

      // Update selectedUser balance values locally for immediate UI update
      setSelectedUser((prev) => {
        if (!prev) return null;
        const oldBtc = prev.BTCbalance ?? 0;
        const newBtc = parseFloat((oldBtc - totalDeductBtc).toFixed(8));
        const oldCop = prev.totalCopInvested ?? 0;
        const fraction = oldBtc > 0 ? totalDeductBtc / oldBtc : 0;
        const newCop = parseFloat((oldCop - oldCop * fraction).toFixed(2));
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
        setShowManualWithdrawalForm(false);
      }, 5000);

    } catch (err: unknown) {
      console.error("Manual withdrawal error:", err);
      setManualWithdrawalError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmittingManualWithdrawal(false);
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

  const handleDeletePendingDeposit = async (uid: string, depositId: string) => {
    if (!uid || !depositId) return;
    const confirmed = window.confirm(`¿Estás seguro de eliminar el depósito pendiente (ID: ${depositId}) de la base de datos RTDB?`);
    if (!confirmed) return;

    try {
      await remove(ref(database, `deposits/${uid}/${depositId}`));
      await remove(ref(database, `deposits/all/${depositId}`));
      console.log(`Successfully deleted pending deposit ${depositId} for user ${uid}`);
    } catch (error) {
      console.error("Error deleting pending deposit from RTDB:", error);
      alert("Error al eliminar el depósito de RTDB. Por favor reintenta.");
    }
  };

  if (loadingAuth) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#0B0E11] text-white">
        <div className="w-12 h-12 border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdminUser(user?.uid)) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-[#0B0E11] text-white gap-4">
        <h1 className="text-3xl font-bold text-red-500">Access Denied</h1>
        <p className="text-gray-400">You are not authorized to view the admin console.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0B0E11] text-white min-h-screen font-sans">
      {/* Slide-over Submenu Drawer Overlay */}
      {isDrawerOpen && (
        <div 
          onClick={() => setIsDrawerOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Slide-over Submenu Drawer */}
      <div className={`fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-[#0E1318] border-r border-white/10 z-50 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
        isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Drawer Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#141A20]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
              <span className="text-primary font-bold text-base">⚡</span>
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">Admin Menu</h3>
              <p className="text-[11px] text-gray-400 font-mono">Consola Rendimientos</p>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
            aria-label="Cerrar menú"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content / Submenu Options */}
        <div className="p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider px-3 mb-1">
            Gestión de Usuarios
          </span>

          <button
            onClick={() => {
              setIsDrawerOpen(false);
              resetCreateProfileForm();
              setShowCreateProfileModal(true);
            }}
            className="flex items-center gap-3.5 px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-primary/10 border border-white/5 hover:border-primary/30 transition-all text-left group"
          >
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <UserPlusIcon className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                Crear Nuevo Perfil
              </span>
              <span className="text-xs text-gray-400">
                Registrar usuario por documento (Cédula)
              </span>
            </div>
          </button>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-white/10 bg-[#141A20]/40 text-xs text-gray-500 flex justify-between items-center">
          <span>Rendimientos.net</span>
          <span className="font-mono">v1.2</span>
        </div>
      </div>

      {/* Create Profile Modal */}
      {showCreateProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#141A20] border border-white/10 rounded-2xl w-full max-w-xl p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200 my-8">
            {/* Modal Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-xl text-primary">
                  <UserPlusIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">Crear Nuevo Perfil</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Registrar usuario manual sin cuenta de Google.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!submittingCreateProfile) {
                    setShowCreateProfileModal(false);
                    resetCreateProfileForm();
                  }
                }}
                disabled={submittingCreateProfile}
                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateProfileSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* National ID / Cédula (Mandatory) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Cédula / Documento <span className="text-primary font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProfileId}
                    onChange={(e) => setNewProfileId(e.target.value)}
                    placeholder="Ej. 1017123456"
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white font-mono text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                  <span className="text-[11px] text-gray-400">Identificador único del usuario</span>
                </div>

                {/* Full Name (Mandatory) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Nombre Completo <span className="text-primary font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Ej. Carlos Arturo Pérez"
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                  <span className="text-[11px] text-gray-400">Primeros 2 nombres para matching bancario</span>
                </div>

                {/* Email (Optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Correo Electrónico <span className="text-[10px] text-gray-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={newProfileEmail}
                    onChange={(e) => setNewProfileEmail(e.target.value)}
                    placeholder="usuario@ejemplo.com"
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                  <span className="text-[11px] text-gray-400">Para recibos y notificaciones de depósito</span>
                </div>

                {/* Phone (Optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Teléfono / WhatsApp <span className="text-[10px] text-gray-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={newProfilePhone}
                    onChange={(e) => setNewProfilePhone(e.target.value)}
                    placeholder="+57 300 123 4567"
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                  <span className="text-[11px] text-gray-400">Contacto del titular</span>
                </div>

                {/* Bank Name (Optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Banco de Retiro <span className="text-[10px] text-gray-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={newProfileBankName}
                    onChange={(e) => setNewProfileBankName(e.target.value)}
                    placeholder="Bancolombia, Nequi, etc."
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Bank Account Number (Optional) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                    Cuenta Bancaria <span className="text-[10px] text-gray-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={newProfileBankData}
                    onChange={(e) => setNewProfileBankData(e.target.value)}
                    placeholder="Ahorros 123-456789-00"
                    className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Notes (Optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                  Notas / Observaciones <span className="text-[10px] text-gray-400 font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={newProfileNotes}
                  onChange={(e) => setNewProfileNotes(e.target.value)}
                  placeholder="Detalles adicionales sobre el perfil..."
                  className="bg-[#0B0E11] border border-white/10 focus:border-primary rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors resize-none"
                />
              </div>

              {/* Error Banner */}
              {createProfileError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3.5 py-2.5 rounded-xl font-mono flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{createProfileError}</span>
                </div>
              )}

              {/* Success Banner */}
              {createProfileSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                  <span>{createProfileSuccess}</span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  disabled={submittingCreateProfile}
                  onClick={() => {
                    setShowCreateProfileModal(false);
                    resetCreateProfileForm();
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/5 border border-transparent transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingCreateProfile}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-black bg-primary hover:bg-primary-hover disabled:bg-primary/50 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
                >
                  {submittingCreateProfile ? (
                    <>
                      <div className="w-4 h-4 border-2 border-t-transparent border-black rounded-full animate-spin"></div>
                      <span>Creando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlusIcon className="w-4 h-4" />
                      <span>Crear Perfil</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0B0E11]/80 backdrop-blur-lg border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {/* 3-Bar Hamburger Menu Button */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Abrir menú de administración"
            title="Menú de administración"
            className="p-2 hover:bg-white/10 active:scale-95 rounded-xl transition-all group border border-white/5 hover:border-primary/30"
          >
            <Bars3Icon className="w-6 h-6 text-gray-300 group-hover:text-primary transition-colors" />
          </button>

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
                      <span>Google UID: <span className="text-gray-300">{selectedUser.uid === selectedUser.id ? "Ninguno (Perfil Manual)" : selectedUser.uid}</span></span>
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
                      {selectedUser.avgBuyPriceUsdt && selectedUser.avgBuyPriceUsdt > 0
                        ? `$${Math.round(selectedUser.avgBuyPriceUsdt).toLocaleString()}`
                        : (selectedUser.avgBuyPrice && selectedUser.avgBuyPrice > 0
                          ? (usdtCop
                            ? `$${Math.round(selectedUser.avgBuyPrice / usdtCop).toLocaleString()}`
                            : "Calculating..."
                          )
                          : "N/A"
                        )
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

                {/* Record Manual Deposit / Withdrawal Option */}
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono">Manual Operations</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowManualDepositForm(!showManualDepositForm);
                          setShowManualWithdrawalForm(false);
                        }}
                        className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-3 py-1.5 rounded-xl font-medium transition-all duration-300 active:scale-95 flex items-center gap-1.5"
                      >
                        <span>📥</span>
                        {showManualDepositForm ? "Cancel Deposit" : "Record Deposit"}
                      </button>
                      <button
                        onClick={() => {
                          setShowManualWithdrawalForm(!showManualWithdrawalForm);
                          setShowManualDepositForm(false);
                        }}
                        className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 px-3 py-1.5 rounded-xl font-medium transition-all duration-300 active:scale-95 flex items-center gap-1.5"
                      >
                        <span>📤</span>
                        {showManualWithdrawalForm ? "Cancel Withdrawal" : "Record Withdrawal"}
                      </button>
                    </div>
                  </div>

                  {showManualWithdrawalForm && (
                    <form onSubmit={handleManualWithdrawalSubmit} className="bg-black/20 p-5 rounded-xl border border-white/5 flex flex-col gap-4 mt-2">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>📤</span> Registrar Retiro Manual
                      </h4>
                      <p className="text-xs text-gray-400">
                        Esto registrará un retiro manual en COP y BTC, deduciendo el saldo del usuario y creando una notificación de retiro completado.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* BTC Amount */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Monto (BTC)</label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={manualWithdrawalAmountBtc}
                            onChange={(e) => handleManualWithdrawalBtcChange(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="0.01"
                          />
                        </div>

                        {/* Fee (BTC) */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Comisión (BTC - Opcional)</label>
                          <input
                            type="number"
                            step="any"
                            value={manualWithdrawalFeeBtc}
                            onChange={(e) => setManualWithdrawalFeeBtc(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="0.00005"
                          />
                        </div>

                        {/* COP Amount */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Monto (COP)</label>
                          <input
                            type="number"
                            required
                            value={manualWithdrawalAmountCop}
                            onChange={(e) => handleManualWithdrawalCopChange(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="1000000"
                          />
                        </div>

                        {/* Destination Account */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Cuenta de Destino</label>
                          <input
                            type="text"
                            required
                            value={manualWithdrawalDestination}
                            onChange={(e) => setManualWithdrawalDestination(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm"
                            placeholder="Bancolombia Ahorros 12345..."
                          />
                        </div>

                        {/* Destination Account Description */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Descripción de Cuenta</label>
                          <input
                            type="text"
                            value={manualWithdrawalDesc}
                            onChange={(e) => setManualWithdrawalDesc(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm"
                            placeholder="Ahorros - Titular: John Doe"
                          />
                        </div>

                        {/* Date */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Fecha (YYYY-MM-DD)</label>
                          <input
                            type="date"
                            required
                            value={manualWithdrawalDate}
                            onChange={(e) => setManualWithdrawalDate(e.target.value)}
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
                            value={manualWithdrawalTime}
                            onChange={(e) => setManualWithdrawalTime(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="11:59"
                          />
                        </div>
                      </div>

                      {manualWithdrawalError && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2.5 rounded-xl font-mono">
                          ⚠️ {manualWithdrawalError}
                        </div>
                      )}

                      {manualWithdrawalSuccess && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-2.5 rounded-xl font-sans">
                          ✅ {manualWithdrawalSuccess}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submittingManualWithdrawal}
                        className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white py-2.5 rounded-xl font-bold transition-all text-sm flex justify-center items-center gap-2"
                      >
                        {submittingManualWithdrawal ? (
                          <>
                            <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                            Procesando...
                          </>
                        ) : (
                          "Settle Manual Withdrawal (Liquidar)"
                        )}
                      </button>
                    </form>
                  )}

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

                        {/* Fee COP */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Comisión (COP - Opcional)</label>
                          <input
                            type="number"
                            value={manualDepositFeeCop}
                            onChange={(e) => setManualDepositFeeCop(e.target.value)}
                            className="bg-[#141A20] border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-primary text-sm font-mono"
                            placeholder="0"
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
                            <div className="flex items-center gap-2">
                              {tx.type === 'deposit' && tx.status?.toLowerCase() === 'pending' && (
                                <button
                                  onClick={() => handleDeletePendingDeposit(tx.uid, tx.id)}
                                  className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-medium transition-all duration-200 flex items-center gap-1 active:scale-95"
                                  title="Eliminar depósito pendiente de RTDB"
                                >
                                  <span>🗑️</span>
                                  <span>Eliminar</span>
                                </button>
                              )}
                              <span className={`font-semibold uppercase ${tx.status === 'settled' || tx.status === 'success' ? 'text-green-400' : 'text-yellow-500'
                                }`}>{tx.status}</span>
                            </div>
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
                      <div className="flex items-center gap-2">
                        {tx.type === 'deposit' && tx.status?.toLowerCase() === 'pending' && (
                          <button
                            onClick={() => handleDeletePendingDeposit(tx.uid, tx.id)}
                            className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-medium transition-all duration-200 flex items-center gap-1 active:scale-95"
                            title="Eliminar depósito pendiente de RTDB"
                          >
                            <span>🗑️</span>
                            <span>Eliminar</span>
                          </button>
                        )}
                        <span className={`font-semibold uppercase ${tx.status === 'settled' || tx.status === 'success' ? 'text-green-400' : 'text-yellow-500'
                          }`}>{tx.status}</span>
                      </div>
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

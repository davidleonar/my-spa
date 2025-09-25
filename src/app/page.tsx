"use client";
import { useState, useEffect } from "react";
import '../app/globals.css';
import { ArrowsUpDownIcon } from '@heroicons/react/24/outline';

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

  //States for Wallet
  const [channelBalance, setChannelBalance] = useState<number | null>(null); // sat
  const [onChainBalance, setOnChainBalance] = useState<number | null>(null); // sat
 // const [invoice, setInvoice] = useState<string>('');
  //const [paymentHash, setPaymentHash] = useState<string>('');
  const [receiveAmount, setReceiveAmount] = useState<number>(0); // sat
  const [payInvoice, setPayInvoice] = useState<string>(''); // bolt11 */
  const [walletPassword, setWalletPassword] = useState<string>(''); // For unlock
  const [walletStatus, setWalletStatus] = useState<'locked' | 'unlocked' | 'init'>('locked');

  // Proxy URL (replace with your Firebase Functions URL)
  const proxyUrl = 'http://127.0.0.1:5001/rendimientos-5dbb9/us-central1/lndProxy';


  // Fetch BTC/USD price from CoinGecko API every 10 seconds
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
    const interval = setInterval(fetchPrice, 10000); // Fetch every 10 seconds

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
      const response = await fetch(
        `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/getDataById?id=${id}`,
        { method: "GET" }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
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
      const response = await fetch(
        `https://us-central1-rendimientos-5dbb9.cloudfunctions.net/getMovementsById?id=${id}`,
        { method: "GET" }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
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

  // Check wallet status and balances
  const fetchBalances = async () => {
    try {
      // Get node info to check if unlocked
      const infoRes = await fetch(`${proxyUrl}?path=/v1/getinfo`);
      const info = await infoRes.json();
      if (info.error) {
        setWalletStatus('locked');
        return;
      }
      setWalletStatus('unlocked');

      // Channel balance (Lightning)
      const channelRes = await fetch(`${proxyUrl}?path=/v1/balance/channels`);
      const channelData = await channelRes.json();
      setChannelBalance(channelData.balance / 1000); // msat to sat

      // On-chain balance
      const onChainRes = await fetch(`${proxyUrl}?path=/v1/balance/blockchain`);
      const onChainData = await onChainRes.json();
      setOnChainBalance(onChainData.total_balance / 1000);
    } catch (err) {
      console.error('Balance error:', err);
    }
  };
/*
  // Create invoice (receive)
  const createInvoice = async () => {
    try {
      const res = await fetch(`${proxyUrl}?path=/v1/invoices`, {
        method: 'POST',
        body: JSON.stringify({ value_msat: receiveAmount * 1000 }),
      });
      const data = await res.json();
      setInvoice(data.payment_request);
      setPaymentHash(data.r_hash);
    } catch (err) {
      console.error('Invoice error:', err);
    }
  };

  // Send payment (pay invoice)
  const sendPayment = async () => {
    try {
      const res = await fetch(`${proxyUrl}?path=/v1/channels/transactions`, {
        method: 'POST',
        body: JSON.stringify({ payment_request: payInvoice }),
      });
      const data = await res.json();
      if (data.payment_error) throw new Error(data.payment_error);
      alert('Payment sent successfully!');
    } catch (err) {
      console.error('Payment error:', err);
      //alert('Payment failed: ' + err.message);
    }
  };


  // Unlock wallet (if locked)
  const unlockWallet = async () => {
    try {
      const res = await fetch(`${proxyUrl}?path=/v1/unlockwallet`, {
        method: 'POST',
        body: JSON.stringify({ wallet_password: Buffer.from(walletPassword).toString('base64') }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setWalletStatus('unlocked');
      fetchBalances();
    } catch (err) {
      console.error('Unlock error:', err);
    }
  };
*/



  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
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

        <h1 className="text-2xl font-bold mb-4 text-center">Saldos de Cuenta</h1>
        <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Enter ID"
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

        {/* New Wallet Section */}
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4 text-center">Lightning Wallet</h2>
          
          {walletStatus === 'locked' ? (
            <div>
              <input
                type="password"
                value={walletPassword}
                onChange={(e) => setWalletPassword(e.target.value)}
                placeholder="Wallet Password"
                className="w-full p-2 bg-gray-600 rounded text-white mb-2"
              />
              <button /*onClick={unlockWallet}*/ className="w-full px-4 py-2 bg-blue-600 rounded">Unlock Wallet</button>
            </div>
          ) : (
            <>
              <button onClick={fetchBalances} className="w-full px-4 py-2 bg-blue-600 rounded mb-4">Refresh Balances</button>
              <p>Channel Balance: {channelBalance ?? 'Loading...'} sat</p>
              <p>On-Chain Balance: {onChainBalance ?? 'Loading...'} sat</p>

              {/* Receive */}
              <input
                type="number"
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(parseInt(e.target.value))}
                placeholder="Amount (sat)"
                className="w-full p-2 bg-gray-600 rounded text-white mb-2"
              />
              <button /*onClick={createInvoice}*/ className="w-full px-4 py-2 bg-green-600 rounded mb-4">Generate Invoice</button> 
              {/*invoice && <p>Invoice: {invoice}</p>*/}

              {/* Send */}
              <input
                type="text"
                value={payInvoice}
                onChange={(e) => setPayInvoice(e.target.value)}
                placeholder="Bolt11 Invoice"
                className="w-full p-2 bg-gray-600 rounded text-white mb-2"
              />
              <button /*onClick={sendPayment}*/ className="w-full px-4 py-2 bg-red-600 rounded">Send Payment</button>
            </>
          )}
        </div>

        {/* WhatsApp Chat Button */}
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
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
  // New state for BTC/USD price tracking
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  // New state for buy/sell forms
  const [showBuyForm, setShowBuyForm] = useState<boolean>(false);
  const [showSellForm, setShowSellForm] = useState<boolean>(false);
  const [buyAmount, setBuyAmount] = useState<string>("");
  const [sellAmount, setSellAmount] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  // New state for sort order in movements
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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

  // Handle Buy Form Submission
  const handleBuySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data[0]) {
      setError('No se encontraron datos para realizar la compra.');
      return;
    }
    if (!buyAmount || parseFloat(buyAmount) <= 0) {
      setError('Por favor, ingrese una cantidad válida.');
      return;
    }

    const payload = {
      id: id,
      name: `${data[0].name} ${data[0].lastname}`,
      cantidad: buyAmount,
    };

    try {
      const response = await fetch(
        'https://rendimientos-4512.twil.io/sales-service',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (response.ok && result.success) {
        setError(null);
        setBuyAmount('');
        setShowBuyForm(false);
        alert('Compra enviada al equipo de ventas con éxito.');
      } else {
        setError(result.message || 'Error al enviar la compra.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
      console.error('Error sending buy request:', err);
    }
  };

  // Handle Sell Form Submission
  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data[0]) {
      setError('No se encontraron datos para realizar la venta.');
      return;
    }
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      setError('Por favor, ingrese una cantidad válida.');
      return;
    }
    if (!accountNumber) {
      setError('Por favor, ingrese un número de cuenta válido.');
      return;
    }

    const payload = {
      id: id,
      name: `${data[0].name} ${data[0].lastname}`,
      cantidad: sellAmount,
      numeroDeCuenta: accountNumber,
    };

    try {
      const response = await fetch(
        'https://rendimientos-4512.twil.io/sales-service',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (response.ok && result.success) {
        setError(null);
        setSellAmount('');
        setAccountNumber('');
        setShowSellForm(false);
        alert('Venta enviada al equipo de ventas con éxito.');
      } else {
        setError(result.message || 'Error al enviar la venta.');
      }
    } catch (err) {
      setError('Error al conectar con el servidor.');
      console.error('Error sending sell request:', err);
    }
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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
        {/* BTC/USD Price Banner */}
        {currentPrice !== null ? (
          <div className="mb-4 p-2 bg-gray-700 rounded-lg text-center">
            <span className={getColorClass()}>
              BTC/USD: ${currentPrice}
            </span>
          </div>
        ) : (
          <div className="mb-4 p-2 bg-gray-700 rounded-lg text-center">
            Loading...
          </div>
        )}

        <h1 className="text-2xl font-bold mb-4 text-center">Saldos de Cuenta</h1>

        <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="Enter Account ID"
            className="flex-1 p-2 bg-gray-700 rounded border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 disabled:bg-gray-500 transition-colors"
          >
            {loading ? "Cargando..." : "Obtener datos"}
          </button>
        </form>

        {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

        {data.length > 0 ? (
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded shadow">
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-300">ID:</span>
                  <span>{item.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-300">Nombre:</span>
                  <span>{item.name} {item.lastname}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span className="font-semibold text-gray-300">Saldo BTC:</span>
                  <span className="text-green-400">{item.BTCbalance} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-300">Saldo COP:</span>
                  <span className="text-green-400">{item.COPbalance} COP</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-300">Rendimiento:</span>
                  <span className="text-green-400">{item.Rendimiento}</span>
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
                    <span className="font-semibold text-gray-300">Total:</span>
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

            {/* New Actions Card */}
            <div className="mt-6 bg-gray-700 p-4 rounded shadow">
              <h2 className="text-xl font-bold mb-4 text-center">Acciones</h2>
              <div className="flex justify-around mb-4">
                <button
                  onClick={() => {
                    setShowBuyForm(!showBuyForm);
                    setShowSellForm(false); // Hide sell form if buy is clicked
                    setError(null);
                  }}
                  className="px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 disabled:bg-gray-500"
                  disabled={loading || !data[0]}
                >
                  Comprar
                </button>
                <button
                  onClick={() => {
                    setShowSellForm(!showSellForm);
                    setShowBuyForm(false); // Hide buy form if sell is clicked
                    setError(null);
                  }}
                  className="px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700 disabled:bg-gray-500"
                  disabled={loading || !data[0]}
                >
                  Vender
                </button>
              </div>

              {/* Buy Form */}
              {showBuyForm && (
                <form onSubmit={handleBuySubmit} className="space-y-2">
                  <input
                    type="number"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                    placeholder="Cantidad"
                    className="w-full p-2 bg-gray-600 rounded text-white border border-gray-500 focus:outline-none focus:border-green-500"
                    min="0"
                    step="0.00000001"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-green-600 rounded text-white hover:bg-green-700 disabled:bg-gray-500"
                    disabled={loading}
                  >
                    Enviar Compra
                  </button>
                </form>
              )}

              {/* Sell Form */}
              {showSellForm && (
                <form onSubmit={handleSellSubmit} className="space-y-2">
                  <input
                    type="number"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    placeholder="Cantidad"
                    className="w-full p-2 bg-gray-600 rounded text-white border border-gray-500 focus:outline-none focus:border-red-500"
                    min="0"
                    step="0.00000001"
                    required
                  />
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Número de Cuenta"
                    className="w-full p-2 bg-gray-600 rounded text-white border border-gray-500 focus:outline-none focus:border-red-500"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700 disabled:bg-gray-500"
                    disabled={loading}
                  >
                    Enviar Venta
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center mt-4">
            <div className="w-8 h-8 border-4 border-t-blue-500 border-gray-300 rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
}
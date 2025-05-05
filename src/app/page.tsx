"use client";
import { useState } from "react";
import '../app/globals.css';

interface SpreadsheetRow {
  id: string;
  name: string;
  lastname: string;
  BTCbalance: string;
  COPbalance: string;
  [key: string]: string | null;
}

export default function Home() {
  const [id, setId] = useState<string>("");
  const [data, setData] = useState<SpreadsheetRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id) fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
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
            {loading ? "Loading..." : "Fetch"}
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
                  <span className="text-green-400">
                    {parseFloat(item.BTCbalance).toFixed(8)} BTC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-300">Saldo COP:</span>
                  <span className="text-green-400">
                    {item.COPbalance} COP
                  </span>
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
      </div>
    </div>
  );
}
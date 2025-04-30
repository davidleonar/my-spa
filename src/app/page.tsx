"use client";
import { useState } from "react";

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
    <div className="container">
      <h1>Account Balance</h1>
      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Enter Account ID"
          className="input"
        />
        <button type="submit" disabled={loading} className="button">
          {loading ? "Loading..." : "Fetch"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {data.length > 0 ? (
        <div className="entries">
          {data.map((item, index) => (
            <div key={index} className="entry">
              <div className="entry-row">
                <span className="label">ID:</span>
                <span className="value">{item.id}</span>
              </div>
              <div className="entry-row">
                <span className="label">Name:</span>
                <span className="value">{item.name}</span>
              </div>
              <div className="entry-row">
                <span className="label">Last Name:</span>
                <span className="value">{item.lastname}</span>
              </div>
              <div className="entry-row">
                <span className="label">BTC Balance:</span>
                <span className="value balance">
                  {parseFloat(item.BTCbalance).toFixed(8)} BTC
                </span>
              </div>
              <div className="entry-row">
                <span className="label">COP Balance:</span>
                <span className="value balance">
                  ${(item.COPbalance)} COP
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading && <p className="no-data">No balances found. Enter an ID to fetch.</p>
      )}

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 2rem;
          background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
          color: #ffffff;
          font-family: "Helvetica", sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        .form {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 2rem;
          justify-content: center;
        }
        .input {
          padding: 0.5rem;
          font-size: 1rem;
          border: none;
          border-bottom: 2px solid #555;
          background: transparent;
          color: #fff;
          width: 180px;
          max-width: 100%;
        }
        .button {
          padding: 0.5rem 1rem;
          font-size: 1rem;
          background: #00cc00;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .button:disabled {
          background: #444;
        }
        .error {
          color: #ff5555;
          margin-bottom: 1rem;
          text-align: center;
        }
        .no-data {
          color: #777;
          text-align: center;
        }
        .entries {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
          width: 100%;
          max-width: 900px;
        }
        .entry {
          background: #252525;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .entry-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #444;
        }
        .entry-row:last-child {
          border-bottom: none;
        }
        .label {
          font-weight: 600;
          color: #ccc;
        }
        .value {
          color: #ffffff;
        }
        .balance {
          color: #00cc00;
          font-weight: bold;
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
          .form {
            flex-direction: column;
            align-items: center;
          }
          .input {
            width: 100%;
          }
          .entries {
            grid-template-columns: 1fr;
          }
          .entry {
            padding: 0.75rem;
          }
          h1 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
"use client";
import { useState } from "react";

interface SpreadsheetRow {
  id: string;
  name: string;
  lastname: string;
  BTCbalance: string;
  COPbalance: string; 
  [key: string]: string | null; // Allow extra fields from headers
}


export default function Home() {
  const [id, setId] = useState<string>(""); // Input value
  const [data, setData] = useState<SpreadsheetRow[]>([]); // Typed array
  const [loading, setLoading] = useState<boolean>(false); // Loading state
  const [error, setError] = useState<string | null>(null); // Error state

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
      setData(result.data); // result.data is SpreadsheetRow[]
    } catch (err) {
      // Type err as Error (or unknown if you need broader handling)
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
    <div>
      <h1>Fetch Data by ID</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Enter ID"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Fetch Data"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data.length > 0 ? (
        <ul>
          {data.map((item, index) => (
            <li key={index}>
              {item.id} - {item.name} - {item.lastname} - {item.BTCbalance} - {item.COPbalance}{/* Customize display */}
            </li>
          ))}
        </ul>
      ) : (
        !loading && <p>No data yet. Enter an ID and click Fetch.</p>
      )}
    </div>
  );
}

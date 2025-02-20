"use client"; // Add this line

import { useState } from 'react';

export default function Home() {
  const [id, setId] = useState<string>(''); // Textbox input
  const [data, setData] = useState<string[]>([]); // String array from API
  const [error, setError] = useState<string | null>(null); // Error handling

  const fetchData = async () => {
    try {
      // Replace with your actual API endpoint
      const response = await fetch(`https://your-api-endpoint.com/data?id=${id}`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      // Assuming the payload returns { data: string[] }
      setData(result.data || []);
      setError(null);
    } catch (err) {
      // Use err to satisfy the linter
      setError(`Error fetching data: ${(err as Error).message}`);
      setData([]);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Ingresa Dato David</h1>
      <input
        type="text"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="Enter ID"
        style={{ padding: '8px', width: '200px', marginRight: '10px' }}
      />
      <button
        onClick={fetchData}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        Obtener datos
      </button>

      {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}

      {data.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h2>Resultados:</h2>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {data.map((item, index) => (
              <li key={index} style={{ padding: '5px 0' }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
import { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { paymentHash } = req.query;
  if (!paymentHash) return res.status(400).json({ error: 'Missing paymentHash' });

  const proxyUrl = 'http://35.208.122.165:3000'; // e.g., IP publica de la VM Proxy 35.208.122.165;
  const macaroon = '0201036c6e6402f801030a1082f4cadbd734d464054914485e044e381201301a160a0761646472657373120472656164120577726974651a130a04696e666f120472656164120577726974651a170a08696e766f69636573120472656164120577726974651a210a086d616361726f6f6e120867656e6572617465120472656164120577726974651a160a076d657373616765120472656164120577726974651a170a086f6666636861696e120472656164120577726974651a160a076f6e636861696e120472656164120577726974651a140a057065657273120472656164120577726974651a180a067369676e6572120867656e657261746512047265616400000620795ab76b30a6d0856ea98a0ecb45673b0e40458caaab2158a2f2cafbd9a31913';

  try {
    const response = await fetch(`${proxyUrl}?path=/v1/invoice/${paymentHash}`, {
      method: 'GET',
      headers: { 'Grpc-Metadata-macaroon': macaroon },
    });

    if (!response.ok) throw new Error(`LND error: ${response.statusText}`);

    const invoice = await response.json();
    res.status(200).json({ settled: invoice.settled, amountReceived: invoice.amt_paid_sat });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check status' });
  }
}
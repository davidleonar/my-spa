import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../lib/firebase';
import { ref, set, serverTimestamp } from 'firebase/database';

export async function POST(req: NextRequest) {
  try {
    const { txHash, amount, userId } = await req.json();

    if (!txHash || !amount || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const depositData = {
      userId,
      amount,
      txHash,
      timestamp: serverTimestamp(),
      network: 'TRON',
    };

    await set(ref(database, `userSavings/${userId}/${txHash}`), depositData);

    return NextResponse.json({ success: true, txHash });
  } catch (error) {
    console.error('Error recording USDT TRON deposit:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to record deposit', details: errorMessage }, { status: 500 });
  }
}

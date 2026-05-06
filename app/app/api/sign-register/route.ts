import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import { buildSelfRegisterPayload } from "@karn_lat/protocol-sdk-solana";

function getSecretKey(): Uint8Array {
  const raw = process.env.KARN_BACKEND_SECRET_KEY_JSON;
  if (!raw) {
    throw new Error("KARN_BACKEND_SECRET_KEY_JSON is missing.");
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error("KARN_BACKEND_SECRET_KEY_JSON must be a 64-byte JSON array.");
  }
  return Uint8Array.from(parsed);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const caller = new PublicKey(body.caller);
    const trackId = BigInt(body.trackId ?? process.env.KARN_REGISTER_DEFAULT_TRACK_ID ?? "1");

    const now = BigInt(Math.floor(Date.now() / 1000));
    const nonce = BigInt(Date.now());
    const expiry = now + 3600n;

    const secretKey = getSecretKey();
    const publicKey = secretKey.slice(32);
    const payload = buildSelfRegisterPayload(caller, nonce, expiry, trackId);
    const signature = nacl.sign.detached(payload, secretKey);

    return NextResponse.json({
      nonce: nonce.toString(),
      expiry: expiry.toString(),
      trackId: trackId.toString(),
      signature: Array.from(signature),
      publicKey: Array.from(publicKey),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

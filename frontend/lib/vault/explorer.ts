const STELLAR_HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "";

export function shortTxHash(hash: string) {
  return hash.length > 18 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;
}

export function stellarTransactionUrl(hash: string) {
  const network = STELLAR_HORIZON_URL.includes("horizon.stellar.org") ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(hash)}`;
}

export function GET() {
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#111316"/>
      <path d="M48 16C28 16 16 28 16 48c20 0 32-12 32-32Z" fill="none" stroke="#2ee57d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26 38 38 26" fill="none" stroke="#2ee57d" stroke-width="5" stroke-linecap="round"/>
    </svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}

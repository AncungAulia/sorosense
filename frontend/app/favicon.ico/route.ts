export function GET() {
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#0b0b0c"/>
      <text
        x="32"
        y="42"
        text-anchor="middle"
        font-family="Inter, Arial, sans-serif"
        font-size="34"
        font-weight="700"
        fill="#ffffff"
      >S</text>
    </svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}

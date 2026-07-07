import { DepositKeypad } from "../../../../components/deposit/DepositKeypad";

export default async function DepositPage({ params }: { params: Promise<{ sym: string }> }) {
  const { sym } = await params;
  return <DepositKeypad sym={sym} />;
}

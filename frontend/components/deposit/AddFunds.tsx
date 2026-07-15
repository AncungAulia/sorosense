"use client";
import { Card } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { useFunding } from "../../hooks/useFunding";
import { useNav } from "../../hooks/useNav";
import { FundingAssetRow } from "./FundingAssetRow";

export function AddFunds() {
  const nav = useNav();
  // `GET /funding` when the backend is configured, the local fixture otherwise (R7).
  const { options } = useFunding();
  return (
    <div className="stagger">
      <SubHeader title="Deposit" />
      <h2 className="ml-1 mb-2.5 text-sm font-medium text-muted">Stablecoins</h2>
      <Card className="px-5 py-1">
        {options.stablecoins.map((s, i) => (
          <FundingAssetRow
            key={s.sym}
            asset={s}
            divider={i !== 0}
            onPick={(sym) => nav.forward(`/deposit/${sym.toLowerCase()}`)}
          />
        ))}
      </Card>
    </div>
  );
}

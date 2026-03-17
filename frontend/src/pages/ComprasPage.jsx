import { useApp } from "../context/AppContext";
import PurchasesTab from "../components/PurchasesTab";

export default function ComprasPage() {
  const { notify } = useApp();
  return <PurchasesTab notify={notify} />;
}

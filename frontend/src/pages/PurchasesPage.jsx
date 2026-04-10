import { useApp } from "../context/AppContext";
import PurchasesTab from "../components/purchases/PurchasesTab";

export default function PurchasesPage() {
  const { notify } = useApp();
  return <PurchasesTab notify={notify} />;
}

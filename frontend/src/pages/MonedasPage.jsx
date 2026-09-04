import { useApp } from "../context/AppContext";
import MonedasTab from "../components/MonedasTab";

export default function MonedasPage() {
  const { notify } = useApp();
  return <MonedasTab notify={notify} />;
}

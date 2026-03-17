import { useApp } from "../context/AppContext";
import SettingsTab from "../components/SettingsTab";

export default function ConfigPage() {
  const { notify } = useApp();
  return <SettingsTab notify={notify} />;
}

import { useApp } from "../context/AppContext";
import WarehousesTab from "../components/warehouses/WarehousesTab";

export default function InventarioPage() {
  const { notify, employee } = useApp();
  return <WarehousesTab notify={notify} currentEmployee={employee} />;
}

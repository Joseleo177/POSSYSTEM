import { useApp } from "../context/AppContext";
import EmployeesTab from "../components/EmployeesTab";

export default function EmpleadosPage() {
  const { notify } = useApp();
  return <EmployeesTab notify={notify} />;
}

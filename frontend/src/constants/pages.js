// src/constants/pages.js
import DashboardPage from "../pages/DashboardPage";
import EmpleadosPage from "../pages/EmpleadosPage";
import CobroPage from "../pages/CobroPage";
import CatalogPage from "../pages/CatalogPage";
import PurchasesPage from "../pages/PurchasesPage";
import InventarioPage from "../pages/InventarioPage";
import ClientesPage from "../pages/ClientesPage";
import ContabilidadPage from "../pages/ContabilidadPage";
import ConfigPage from "../pages/ConfigPage";
import ReportesPage from "../pages/ReportesPage";

export const PAGE_COMPONENTS = {
    Dashboard: DashboardPage,
    Cobro: CobroPage,
    "Catálogo": CatalogPage,
    Compras: PurchasesPage,
    Inventario: InventarioPage,
    Clientes: ClientesPage,
    Contabilidad: ContabilidadPage,
    Reportes: ReportesPage,
    Empleados: EmpleadosPage,
    "Configuración": ConfigPage,
};

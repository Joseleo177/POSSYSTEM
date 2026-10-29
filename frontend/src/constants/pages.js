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
import MonedasPage from "../pages/MonedasPage";
import ReportesPage from "../pages/ReportesPage";
import CompaniesPage from "../pages/CompaniesPage";
import FabricaPage from "../pages/FabricaPage";
import CocinaPage from "../pages/CocinaPage";
import MesasPage from "../pages/MesasPage";
import RecetasPage from "../pages/RecetasPage";
import PedidosPage from "../pages/PedidosPage";

export const PAGE_COMPONENTS = {
    Dashboard: DashboardPage,
    Cobro: CobroPage,
    Pedidos: PedidosPage,
    "Catálogo": CatalogPage,
    Compras: PurchasesPage,
    "Fábrica": FabricaPage,
    Cocina: CocinaPage,
    Recetas: RecetasPage,
    Mesas: MesasPage,
    Inventario: InventarioPage,
    Clientes: ClientesPage,
    Contabilidad: ContabilidadPage,
    Reportes: ReportesPage,
    Empleados: EmpleadosPage,
    Empresas: CompaniesPage,
    Monedas: MonedasPage,
    "Configuración": ConfigPage,
};

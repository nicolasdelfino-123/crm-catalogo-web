import {
  CalendarDays,
  LayoutDashboard,
  Mail,
  ReceiptText,
  Server,
  Target,
  Timer,
  Users,
  WalletCards,
} from "lucide-react";

export const CRM_TABS = [
  { id: "dashboard", label: "Resumen", title: "Resumen operativo", icon: LayoutDashboard },
  { id: "clients", label: "Clientes", title: "Clientes", icon: Users },
  { id: "agenda", label: "Agenda", title: "Agenda de acciones", icon: CalendarDays },
  { id: "payments", label: "Pagos", title: "Pagos", icon: WalletCards },
  { id: "expenses", label: "Gastos", title: "Gastos", icon: ReceiptText },
  { id: "vps", label: "VPS", title: "VPS", icon: Server },
  { id: "messages", label: "Mensajes", title: "Mensajes enviados", icon: Mail },
  { id: "worked-hours", label: "Horas trabajadas", title: "Horas trabajadas", icon: Timer },
  { id: "prospecting", label: "Prospección", title: "Prospección", icon: Target },
];

export const titleForTab = (tabId) =>
  CRM_TABS.find(({ id }) => id === tabId)?.title ?? "CRM";

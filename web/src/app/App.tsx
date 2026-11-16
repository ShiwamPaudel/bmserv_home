import { createBrowserRouter, RouterProvider } from "react-router";
import { ToastProvider } from "../components/ui";
import { Layout, NotFound, RequireAuth, RouteError, TeamOnly, TeamOr } from "./Layout";
import { SignIn } from "../screens/SignIn";
import { Account } from "../screens/Account";
import { Team } from "../screens/Team";
import { SettingsScreen } from "../screens/Settings";
import { More } from "../screens/More";
import { Home } from "../screens/Home";
import { EquipmentList } from "../screens/equipment/EquipmentList";
import { EquipmentForm } from "../screens/equipment/EquipmentForm";
import { EquipmentPage } from "../screens/equipment/EquipmentPage";
import { ImportEquipment } from "../screens/equipment/ImportEquipment";
import { QrOpen, Scan } from "../screens/Scan";
import { PrintLabels } from "../screens/PrintLabels";
import { Departments, DepartmentPage } from "../screens/Departments";
import { Providers, ProviderPage } from "../screens/Providers";
import { Manuals } from "../screens/Manuals";
import { PmsScreen } from "../screens/Pms";
import { Breakdowns } from "../screens/breakdowns/Breakdowns";
import { BreakdownNew } from "../screens/breakdowns/BreakdownNew";
import { BreakdownPage } from "../screens/breakdowns/BreakdownPage";
import { AskProvider } from "../screens/breakdowns/AskProvider";
import { ModelPage, Models } from "../screens/Models";
import { MyReports, ReportStart, StaffEquipment } from "../screens/Report";
import { ReportsScreen } from "../screens/Reports";

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn />, errorElement: <RouteError /> },
  {
    path: "/",
    errorElement: <RouteError />,
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      // Shared by the team and hospital staff.
      { index: true, element: <TeamOr team={<Home />} staff={<ReportStart />} /> },
      { path: "e/:qrCode", element: <QrOpen /> },
      { path: "scan", element: <Scan /> },
      { path: "my-reports", element: <MyReports /> },
      { path: "my-equipment", element: <TeamOr team={<NotFound />} staff={<StaffEquipment />} /> },
      { path: "account", element: <Account /> },
      {
        element: <TeamOnly />,
        children: [
          { path: "equipment", element: <EquipmentList /> },
          { path: "equipment/new", element: <EquipmentForm /> },
          { path: "equipment/import", element: <ImportEquipment /> },
          { path: "equipment/:id", element: <EquipmentPage /> },
          { path: "equipment/:id/edit", element: <EquipmentForm /> },
          { path: "breakdowns", element: <Breakdowns /> },
          { path: "breakdowns/new", element: <BreakdownNew /> },
          { path: "breakdowns/:id", element: <BreakdownPage /> },
          { path: "breakdowns/:id/ask", element: <AskProvider /> },
          { path: "pms", element: <PmsScreen /> },
          { path: "models", element: <Models /> },
          { path: "models/:id", element: <ModelPage /> },
          { path: "manuals", element: <Manuals /> },
          { path: "departments", element: <Departments /> },
          { path: "departments/:id", element: <DepartmentPage /> },
          { path: "service-providers", element: <Providers /> },
          { path: "service-providers/:id", element: <ProviderPage /> },
          { path: "team", element: <Team /> },
          { path: "reports", element: <ReportsScreen /> },
          { path: "settings", element: <SettingsScreen /> },
          { path: "more", element: <More /> },
          { path: "print/labels", element: <PrintLabels /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

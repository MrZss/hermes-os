import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full bg-[#F9F9F8] text-stone-900 font-sans antialiased overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      <Sidebar />
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

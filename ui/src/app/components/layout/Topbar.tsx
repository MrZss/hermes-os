import { Search, Bell, Shield, ChevronDown } from "lucide-react";
import { useApp } from "../../context/AppContext";

export function Topbar() {
  const { activeInstance } = useApp();

  return (
    <header className="h-14 border-b border-stone-200 bg-[#F9F9F8]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center flex-1 space-x-4">
        <div className="relative group max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text"
            placeholder="搜索命令、日志或会话 (Cmd + K)"
            className="w-full bg-white border border-stone-200 shadow-sm rounded-lg pl-9 pr-4 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center space-x-5">
        <div className="flex items-center space-x-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 shadow-sm">
          <Shield className="w-3 h-3" />
          <span>Localhost 安全直连</span>
        </div>

        {activeInstance && (
          <div className="flex items-center space-x-2 cursor-pointer hover:bg-stone-100 px-2 py-1 rounded-md transition-colors border border-transparent hover:border-stone-200">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 border border-blue-200 shadow-sm">
              默认
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-stone-800 leading-none">默认档案</span>
              <span className="text-[10px] text-stone-500 mt-0.5 leading-none">gpt-4o</span>
            </div>
            <ChevronDown className="w-3 h-3 text-stone-400 ml-1" />
          </div>
        )}

        <button className="relative text-stone-500 hover:text-stone-800 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-blue-500 rounded-full border border-[#F9F9F8]"></span>
        </button>
      </div>
    </header>
  );
}

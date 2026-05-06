import React, { useState, useRef, useEffect } from 'react';
import {
  Grid3X3,
  List,
  Search,
  FolderPlus,
  Plus,
  ChevronDown,
  RotateCcw,
  ChevronRight,
  Check
} from 'lucide-react';

// --- 纯自定义的高级下拉菜单，彻底告别原生 <select> ---
function FilterMenu({ filters, setFilter, resetFilters }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const typeOptions = [
    { value: 'all', label: '显示全部' },
    { value: 'folder', label: '仅文件夹' },
    { value: 'project', label: '仅项目' },
  ];

  const sortOptions = [
    { value: 'updatedAt', label: '按最近修改' },
    { value: 'createdAt', label: '按创建日期' },
    { value: 'name', label: '按名称' },
  ];

  const orderOptions = [
    { value: 'desc', label: '最新 / 降序' },
    { value: 'asc', label: '最早 / 升序' },
  ];

  // 渲染自定义选项的辅助函数
  const renderOptions = (filterKey, options) => (
    <div className="flex flex-col gap-0.5">
      {options.map((opt) => {
        const isActive = filters[filterKey] === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setFilter(filterKey, opt.value)}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
              isActive 
                ? 'bg-white/10 text-white font-medium' 
                : 'text-white/60 hover:bg-white/5 hover:text-white/90'
            }`}
          >
            {opt.label}
            {isActive && <Check size={14} className="text-white" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 px-3 rounded-lg border flex items-center gap-2 text-sm transition-all duration-200 ${
          isOpen 
            ? 'border-white/30 bg-white/5 text-white' 
            : 'border-white/[0.12] bg-transparent text-white/70 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span>{typeOptions.find(o => o.value === filters.type)?.label || '显示全部'}</span>
        <ChevronDown size={14} className={`text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板：增加毛玻璃效果和更细腻的阴影 */}
      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl p-2 z-50 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-white/30 px-2.5 mb-1.5 uppercase">类型</div>
            {renderOptions('type', typeOptions)}
          </div>

          <div className="h-[1px] bg-white/[0.06] mx-1"></div>

          <div>
             <div className="text-[11px] font-semibold tracking-wider text-white/30 px-2.5 mb-1.5 uppercase">排序</div>
             {renderOptions('sortBy', sortOptions)}
             <div className="mt-1"></div>
             {renderOptions('sortOrder', orderOptions)}
          </div>

          <div className="h-[1px] bg-white/[0.06] mx-1"></div>

          <button
            type="button"
            onClick={() => { resetFilters(); setIsOpen(false); }}
            className="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <RotateCcw size={14} />
            重置所有条件
          </button>
        </div>
      )}
    </div>
  );
}

// --- 将面包屑与标题无缝融合 ---
function ModernBreadcrumbs({ breadcrumbs, onNavigate }) {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) {
    return <h1 className="text-[17px] font-medium text-white px-1">个人</h1>;
  }

  return (
    <div className="flex items-center text-[17px] font-medium">
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const isRoot = index === 0;

        return (
          <React.Fragment key={`${item.id ?? 'root'}-${index}`}>
            {index > 0 && (
              <ChevronRight size={16} className="text-white/20 mx-1.5 shrink-0" />
            )}
            
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNavigate(breadcrumbs.slice(0, index + 1))}
              className={`max-w-[200px] truncate transition-colors px-1 rounded-md ${
                isLast
                  ? 'text-white cursor-default'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
              title={item.name}
            >
              {/* 如果是根目录，通常显示为"个人"或者原始名称 */}
              {isRoot ? '个人' : item.name}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function DashboardHeader({
  breadcrumbs,
  onNavigate,
  searchQuery,
  onSearch,
  viewMode,
  onViewChange,
  onCreateFolder,
  onCreateProject,
  filters,
  setFilter,
  resetFilters,
}) {
  const isGrid = viewMode === 'grid';
  const isList = viewMode === 'list';

  return (
    <header className="mb-6 shrink-0 border-b border-white/[0.06] pb-4">
      <div className="flex items-center justify-between">
        
        {/* 左侧：动态面包屑路径 */}
        <div className="flex items-center">
          <div className="relative pb-1">
            <ModernBreadcrumbs breadcrumbs={breadcrumbs} onNavigate={onNavigate} />
            {/* 底部指示线，紧贴当前文字 */}
            <div className="absolute bottom-0 left-1 w-6 h-[2px] bg-white rounded-full"></div>
          </div>
        </div>

        {/* 右侧：功能操作区 */}
        <div className="flex items-center gap-2.5">
          
          <div className="relative flex items-center w-[240px]">
            <Search size={14} className="absolute left-3 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="搜索项目或文件夹..."
              className="w-full h-9 bg-[#141414] border border-white/[0.08] rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition-all duration-200 focus:border-white/30 focus:bg-transparent"
            />
          </div>

          <FilterMenu
            filters={filters}
            setFilter={setFilter}
            resetFilters={resetFilters}
          />

          <div className="flex items-center bg-[#141414] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onViewChange('grid')}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                isGrid ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-white/40 hover:text-white/90'
              }`}
            >
              <Grid3X3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => onViewChange('list')}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                isList ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-white/40 hover:text-white/90'
              }`}
            >
              <List size={15} />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/[0.1] mx-1"></div>

          <button
            type="button"
            onClick={onCreateFolder}
            className="h-9 w-9 flex items-center justify-center border border-white/[0.12] rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-all duration-200"
            title="新建文件夹"
          >
            <FolderPlus size={16} />
          </button>

          <button
            type="button"
            onClick={onCreateProject}
            className="h-9 px-4 flex items-center gap-1.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 hover:scale-[0.98] active:scale-95 transition-all duration-200"
          >
            <Plus size={16} strokeWidth={2.5} />
            新建项目
          </button>
        </div>
      </div>
    </header>
  );
}
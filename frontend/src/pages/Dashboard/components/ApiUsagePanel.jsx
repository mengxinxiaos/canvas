import { Fragment, useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, RefreshCw, Shield, X } from 'lucide-react';
import { billingService } from '../../../services/api';

const EMPTY_FILTERS = {
    start_date: '', end_date: '', user_id: '', project_id: '', provider: '',
    model: '', call_type: '', status: '', cost_status: '',
};
const PAGE_SIZE = 20;
const CALL_TYPES = { image_generation: '图片生成', video_generation: '视频生成', agent_chat: 'Agent 对话', history_summary: '历史总结' };
const STATUSES = { started: '进行中', success: '成功', failed: '失败', interrupted: '已中断' };
const COST_STATUSES = { pending: '待获取', calculated: '已计价', reported: '供应商金额', unavailable: '待计价', not_supported: '暂不采集' };
const PRICING_REASONS = {
    legacy_without_pricing_rule: '旧记录未保存当时的计价规则，原始数据已保留，暂不纳入换算合计。',
    missing_provider_cost: '供应商尚未返回原始费用。',
    invalid_provider_cost: '供应商费用格式无效，暂不换算。',
    missing_total_tokens: '供应商尚未返回实际 total_tokens。',
    invalid_total_tokens: '供应商 total_tokens 格式无效，暂不计价。',
    missing_image_count: '供应商与请求参数均未提供可用的生成张数。',
    invalid_image_count: '生成张数格式无效，暂不计价。',
    missing_duration: '供应商与请求参数均未提供可用的视频时长。',
    invalid_duration: '视频时长格式无效，暂不计价。',
    missing_duration_seconds: '供应商与请求参数均未提供可用的视频时长。',
    invalid_duration_seconds: '视频时长格式无效，暂不计价。',
    missing_token_usage: '供应商尚未返回本规则所需的实际 Token 用量。',
    invalid_token_usage: '供应商返回的 Token 用量格式无效，暂不计价。',
    missing_token_quantity: '供应商尚未返回本规则所需的实际 Token 用量。',
    invalid_token_quantity: '供应商返回的 Token 用量格式无效，暂不计价。',
    missing_price_variant: '当前生成条件没有匹配的单价，请管理员补充配置。',
    no_matching_price_variant: '当前生成条件没有匹配的单价，请管理员补充配置。',
    ambiguous_price_variant: '当前生成条件匹配到多个单价，请管理员核对配置。',
    call_not_successful: '调用尚未成功，不按配置单价计算费用。',
    missing_resolution: '缺少生成分辨率，暂不能匹配单价。',
    unsupported_resolution: '当前分辨率尚未配置计价规则。',
    missing_video_input_presence: '尚未确认实际请求是否包含视频输入。',
    unknown_model: '当前模型尚未配置计价规则。',
    model_conflict: '请求模型与供应商返回模型不一致，需要核对计价规则。',
    unsupported_provider: '此供应商暂不采集费用。',
    unsupported_call_type: '当前调用类型尚未配置计价规则。',
    invalid_pricing_config: '计价规则配置无效，请管理员核对。',
};
const inputClass = 'w-full min-w-0 rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-cyan-400/60 disabled:opacity-50';

function decimalText(value) {
    if (value === null || value === undefined) return '—';
    const text = String(value);
    if (!/^\d+(\.\d+)?$/.test(text)) return text;
    const [whole, fraction] = text.split('.');
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

function unitLabel(total) {
    if (['CNY', 'RMB'].includes(String(total.currency || '').toUpperCase())) return '人民币（元）';
    return total.currency || `未标注单位${total.provider ? `（${total.provider}）` : ''}`;
}

function pricingExplanation(record) {
    const rule = record.pricing_snapshot;
    if (!rule) return null;
    const result = record.cost == null ? '待计价' : `${decimalText(record.cost)} ${unitLabel(record)}`;
    if (rule.kind === 'provider_multiplier' && rule.multiplier != null && rule.provider_cost != null) {
        return `供应商原始金额 ${decimalText(rule.provider_cost)} × 换算系数 ${decimalText(rule.multiplier)} = ${result}`;
    }
    if (rule.kind === 'token_rate' && rule.rate_per_million_tokens != null) {
        const videoInput = rule.has_video_input === true ? '含视频输入' : rule.has_video_input === false ? '不含视频输入' : '视频输入待确认';
        const rate = `${decimalText(rule.rate_per_million_tokens)} 元 / 百万 Token`;
        const condition = `${rule.resolution || '分辨率待确认'} · ${videoInput} · ${rate}`;
        if (rule.total_tokens != null) {
            return `${condition}；${decimalText(rule.total_tokens)} ÷ ${decimalText(rule.token_unit || '1000000')} × ${decimalText(rule.rate_per_million_tokens)} = ${result}`;
        }
        return `${condition}；等待供应商返回实际 total_tokens。`;
    }
    if (rule.kind === 'unit_rate') {
        const unit = { image: '张', second: '秒', token: 'Token' }[rule.unit] || rule.unit || '单位';
        const quantityName = { image: '生成张数', second: '视频时长', token: 'Token 用量' }[rule.unit] || '用量';
        const basis = rule.quantity_source === 'request_parameters'
            ? `供应商未返回实际${quantityName}，采用请求参数`
            : rule.quantity_source === 'provider_response' ? `采用供应商返回的实际${quantityName}` : '等待可用用量';
        const selectors = { ...(rule.resolution ? { resolution: rule.resolution } : {}), ...(rule.image_size ? { image_size: rule.image_size } : {}), ...(typeof rule.has_video_input === 'boolean' ? { has_video_input: rule.has_video_input } : {}), ...rule.price_conditions };
        const selectorLabels = { resolution: '分辨率', image_size: '图片尺寸', imageSize: '图片尺寸', aspect_ratio: '宽高比', aspectRatio: '宽高比', mode: '生成模式' };
        const condition = Object.entries(selectors).map(([key, value]) => key === 'has_video_input' && typeof value === 'boolean'
            ? value ? '含视频输入' : '不含视频输入'
            : `${selectorLabels[key] || key}：${typeof value === 'boolean' ? value ? '是' : '否' : value}`).join(' · ');
        const prefix = `${condition ? `${condition}；` : ''}${basis}`;
        if (rule.unit_price == null) return `${prefix}；等待匹配单价。`;
        const unitSize = rule.unit_size ?? '1';
        const price = `${decimalText(rule.unit_price)} ${rule.currency || rule.rule?.currency || record.currency || '（币种未标注）'} / ${decimalText(unitSize)} ${unit}`;
        if (rule.quantity == null) return `${prefix}；单价 ${price}。`;
        return `${prefix}；单价 ${price}；${decimalText(rule.quantity)} ${unit} ÷ ${decimalText(unitSize)} × ${decimalText(rule.unit_price)} = ${result}`;
    }
    if (rule.kind === 'provider_reported') return '使用供应商返回的原始金额及单位，未作人民币换算。';
    return null;
}

function timeText(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function CostTotals({ totals }) {
    if (!totals?.length) return <span className="text-neutral-500">暂无已计价费用</span>;
    return (
        <div className="flex flex-wrap gap-3">
            {totals.map((total, index) => (
                <div key={`${total.currency}-${total.provider}-${index}`} className="min-w-[175px] rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-3">
                    <span className="block text-xs text-neutral-400">{unitLabel(total)}</span>
                    <span className="mt-1 block break-all font-mono text-xl text-cyan-200">{decimalText(total.cost)}</span>
                </div>
            ))}
        </div>
    );
}

function SelectFilter({ label, name, value, options, onChange }) {
    return (
        <label className="min-w-0 space-y-1.5">
            <span className="block text-xs text-neutral-400">{label}</span>
            <select className={inputClass} name={name} value={value} onChange={onChange}>
                <option value="">全部</option>
                {options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
    );
}

function RecordDetails({ record }) {
    const rule = record.pricing_snapshot;
    const explanation = pricingExplanation(record);
    const details = [
        ['调用编号', record.id], ['操作编号', record.operation_id],
        ['用户编号', record.user_id], ['项目编号', record.project_id],
        ['任务编号', record.task_id], ['节点编号', record.node_id],
        ['会话编号', record.conversation_id], ['供应商请求编号', record.provider_request_id],
        ['实际响应模型', record.billing_model],
        ['完成时间', timeText(record.completed_at)],
        ['耗时', record.duration_ms == null ? '—' : `${(record.duration_ms / 1000).toFixed(2)} 秒`],
    ];
    return (
        <div className="space-y-4 p-5 text-xs">
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <dl className="grid gap-4 sm:grid-cols-3">
                    <div><dt className="text-neutral-500">计价结果</dt><dd className="mt-1 break-all font-mono text-cyan-200">{record.cost == null ? COST_STATUSES[record.cost_status] || '待计价' : `${decimalText(record.cost)} ${unitLabel(record)}`}</dd></div>
                    <div><dt className="text-neutral-500">供应商原始金额</dt><dd className="mt-1 break-all font-mono text-neutral-300">{record.provider_cost == null ? '未返回金额' : `${decimalText(record.provider_cost)} ${record.provider_currency || '（供应商未标注单位）'}`}</dd></div>
                    <div><dt className="text-neutral-500">计价规则版本</dt><dd className="mt-1 break-all font-mono text-neutral-300">{rule?.rule_id ? `${rule.rule_id}${rule.rule_version ? ` · ${rule.rule_version}` : ''}` : '—'}</dd></div>
                </dl>
                {explanation && <p className="mt-3 break-all leading-relaxed text-neutral-300">{explanation}</p>}
                {rule?.reason && <p className="mt-3 leading-relaxed text-amber-200/80">{PRICING_REASONS[rule.reason] || '计价信息不足，请结合规则快照核对。'}</p>}
                {record.cost_status === 'calculated' && <p className="mt-2 leading-relaxed text-neutral-500">根据本次保存的规则计算费用；用量来源和计算过程见上方说明。</p>}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                {details.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-neutral-500">{label}</dt>
                        <dd className="mt-1 break-all font-mono text-neutral-300">{value || '—'}</dd>
                    </div>
                ))}
            </dl>
            <div className="grid gap-4 lg:grid-cols-2">
                {[['供应商用量', record.usage_json], ['生成参数', record.parameters_json], ['本次计价规则快照', rule]].map(([label, data]) => (
                    <div key={label} className="min-w-0">
                        <div className="mb-2 text-neutral-500">{label}</div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/5 bg-black/20 p-3 text-neutral-400">{data && Object.keys(data).length ? JSON.stringify(data, null, 2) : '暂无数据'}</pre>
                    </div>
                ))}
            </div>
            {record.error_message && <p className="break-all rounded-lg bg-red-400/5 p-3 text-red-300">{record.error_message}</p>}
        </div>
    );
}

function UsageDashboard({ onClose }) {
    const [draft, setDraft] = useState(EMPTY_FILTERS);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState({ items: [], total: 0 });
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);
    const invalidDates = Boolean(draft.start_date && draft.end_date && draft.start_date > draft.end_date);

    useEffect(() => {
        let active = true;
        Promise.all([
            billingService.listCalls({ ...filters, page, page_size: PAGE_SIZE }),
            billingService.getSummary(filters),
        ]).then(([records, totals]) => {
            if (!active) return;
            setResult(records);
            setSummary(totals);
            setError('');
        }).catch(err => {
            if (active) setError(err.status === 403 ? '当前账号没有查看调用数据的权限。' : err.message || '加载数据失败，请重试。');
        }).finally(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [filters, page, revision]);

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        const onKeyDown = event => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab') return;
            const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, [onClose]);

    const changeFilter = event => {
        const { name, value } = event.target;
        setDraft(current => ({ ...current, [name]: value }));
    };
    const applyFilters = event => {
        event.preventDefault();
        if (invalidDates) return;
        setLoading(true);
        setError('');
        setExpandedId(null);
        setPage(1);
        setFilters({ ...draft });
    };
    const resetFilters = () => {
        setLoading(true);
        setError('');
        setDraft({ ...EMPTY_FILTERS });
        setFilters({ ...EMPTY_FILTERS });
        setExpandedId(null);
        setPage(1);
    };
    const refresh = () => {
        setLoading(true);
        setError('');
        setRevision(value => value + 1);
    };
    const changePage = next => {
        setLoading(true);
        setError('');
        setExpandedId(null);
        setPage(next);
    };
    const options = summary?.options || {};
    const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
            <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="api-usage-title" className="flex max-h-[94dvh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#191919] text-neutral-200 shadow-2xl">
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-xl bg-cyan-400/10 p-2.5 text-cyan-300"><Activity size={23} /></div>
                        <div className="min-w-0">
                            <h2 id="api-usage-title" className="text-lg font-semibold text-white">API 调用与费用</h2>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500"><Shield size={12} /> 管理员可见 · 时间按北京时间显示</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={refresh} disabled={loading} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40" title="刷新数据"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">刷新</span></button>
                        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭调用数据面板" className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white"><X size={23} /></button>
                    </div>
                </header>

                <div className="space-y-5 overflow-y-auto p-5 sm:p-7" aria-busy={loading}>
                    <form onSubmit={applyFilters} className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                            <label className="space-y-1.5"><span className="block text-xs text-neutral-400">开始日期</span><input type="date" name="start_date" value={draft.start_date} onChange={changeFilter} className={`${inputClass} [color-scheme:dark]`} /></label>
                            <label className="space-y-1.5"><span className="block text-xs text-neutral-400">结束日期（含当天）</span><input type="date" name="end_date" value={draft.end_date} onChange={changeFilter} className={`${inputClass} [color-scheme:dark]`} /></label>
                            <SelectFilter label="调用用户" name="user_id" value={draft.user_id} options={(options.users || []).map(user => ({ value: user.id, label: user.name || user.id }))} onChange={changeFilter} />
                            <SelectFilter label="所属项目" name="project_id" value={draft.project_id} options={(options.projects || []).map(project => ({ value: project.id, label: project.name || project.id }))} onChange={changeFilter} />
                            <SelectFilter label="供应商" name="provider" value={draft.provider} options={(options.providers || []).map(provider => ({ value: provider, label: provider }))} onChange={changeFilter} />
                            <SelectFilter label="模型" name="model" value={draft.model} options={(options.models || []).map(model => ({ value: model, label: model }))} onChange={changeFilter} />
                            <SelectFilter label="调用类型" name="call_type" value={draft.call_type} options={Object.entries(CALL_TYPES).map(([value, label]) => ({ value, label }))} onChange={changeFilter} />
                            <SelectFilter label="调用状态" name="status" value={draft.status} options={Object.entries(STATUSES).map(([value, label]) => ({ value, label }))} onChange={changeFilter} />
                            <SelectFilter label="费用状态" name="cost_status" value={draft.cost_status} options={Object.entries(COST_STATUSES).map(([value, label]) => ({ value, label }))} onChange={changeFilter} />
                            <div className="flex items-end gap-2"><button type="submit" disabled={invalidDates || loading} className="flex-1 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-medium text-[#102125] hover:bg-cyan-200 disabled:opacity-40">查询</button><button type="button" onClick={resetFilters} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-400 hover:text-white disabled:opacity-40">重置</button></div>
                        </div>
                        {invalidDates && <p role="alert" className="mt-3 text-xs text-red-300">开始日期不能晚于结束日期。</p>}
                    </form>

                    {error ? (
                        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">{error}<button type="button" onClick={refresh} className="ml-4 underline underline-offset-4">重新加载</button></div>
                    ) : loading ? (
                        <div role="status" className="flex min-h-[300px] items-center justify-center gap-2 text-neutral-500"><Loader2 size={20} className="animate-spin" /> 正在加载调用数据…</div>
                    ) : (
                        <>
                            <section className="space-y-3">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-sm font-medium text-white">费用合计</h3><p className="text-xs text-neutral-500">按配置规则换算；不同币种分开汇总，空值不计为零。</p></div>
                                <CostTotals totals={summary?.cost_totals} />
                            </section>

                            <section className="overflow-hidden rounded-xl border border-white/10">
                                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h3 className="text-sm font-medium text-white">调用明细</h3><span className="text-xs text-neutral-500">共 {result.total} 条</span></div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1050px] text-left text-xs">
                                        <thead className="bg-white/[0.03] text-neutral-500"><tr>{['调用时间', '用户 / 项目', '供应商 / 模型', '类型', '状态', '费用', ''].map((heading, index) => <th key={index} scope="col" className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-white/5">
                                            {result.items.map(record => (
                                                <Fragment key={record.id}>
                                                    <tr className="align-top hover:bg-white/[0.02]">
                                                        <td className="whitespace-nowrap px-4 py-4 text-neutral-400">{timeText(record.started_at)}</td>
                                                        <td className="max-w-[210px] px-4 py-4"><p className="truncate text-neutral-200" title={record.user_name || record.user_id}>{record.user_name || record.user_id || '未知用户'}</p><p className="mt-1 truncate text-neutral-500" title={record.project_name || record.project_id}>{record.project_name || record.project_id || '未关联项目'}</p></td>
                                                        <td className="max-w-[260px] px-4 py-4"><p className="text-neutral-400">{record.provider || '—'}</p><p className="mt-1 break-all text-neutral-300">{record.model || '—'}</p></td>
                                                        <td className="whitespace-nowrap px-4 py-4 text-neutral-400">{CALL_TYPES[record.call_type] || record.call_type}</td>
                                                        <td className="whitespace-nowrap px-4 py-4"><span className={`inline-block rounded-md px-2 py-1 ${record.status === 'success' ? 'bg-emerald-400/10 text-emerald-300' : record.status === 'failed' || record.status === 'interrupted' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}>{STATUSES[record.status] || record.status}</span></td>
                                                        <td className="max-w-[220px] px-4 py-4">{record.cost == null ? <span className="text-neutral-500">{COST_STATUSES[record.cost_status] || '待计价'}</span> : <><p className="break-all font-mono text-cyan-200">{decimalText(record.cost)}</p><p className="mt-1 text-[11px] text-neutral-500">{unitLabel(record)} · {COST_STATUSES[record.cost_status] || '已计价'}</p></>}</td>
                                                        <td className="px-3 py-3"><button type="button" aria-expanded={expandedId === record.id} aria-label={`${expandedId === record.id ? '收起' : '查看'}调用 ${record.id} 的详情`} onClick={() => setExpandedId(current => current === record.id ? null : record.id)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white">{expandedId === record.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td>
                                                    </tr>
                                                    {expandedId === record.id && <tr className="bg-black/15"><td colSpan={7}><RecordDetails record={record} /></td></tr>}
                                                </Fragment>
                                            ))}
                                            {!result.items.length && <tr><td colSpan={7} className="py-16 text-center text-neutral-500">没有符合条件的调用记录。新调用完成后可刷新查看。</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-neutral-500"><span>每页 {PAGE_SIZE} 条 · 第 {page} / {totalPages} 页</span><div className="flex gap-2"><button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1} aria-label="上一页" className="rounded-lg border border-white/10 p-2 hover:text-white disabled:opacity-30"><ChevronLeft size={15} /></button><button type="button" onClick={() => changePage(page + 1)} disabled={page >= totalPages} aria-label="下一页" className="rounded-lg border border-white/10 p-2 hover:text-white disabled:opacity-30"><ChevronRight size={15} /></button></div></div>
                            </section>
                            <p className="text-xs leading-relaxed text-neutral-600">按供应商与模型配置计价规则，支持按张、按秒、按 Token 或读取供应商费用。按张、按秒优先使用实际结果，缺失时采用请求参数；Token 使用实际用量。没有匹配规则或必要用量时保留空值。</p>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}

export default function ApiUsagePanel({ currentUser, onClose }) {
    if (currentUser?.role !== 'admin') return null;
    return <UsageDashboard onClose={onClose} />;
}

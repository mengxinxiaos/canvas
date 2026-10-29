# API 调用与人民币成本统计（规则版）

使用现有 SQLite；记录真实调用用户、项目、供应商、模型、任务状态及原始用量。数据面板和统计接口仅 admin 可访问。

## 本次计价规则

所有单价与换算系数按用户 2026-10-27 提供的数据配置，不声称是供应商官网实时价格。

- zhenzhen、zhenzhen-gpt、zhenzhen-gemini：人民币成本 = 供应商原始 cost × 1.35。此系数为供应商金额换算规则，不是通用实时汇率。
- volcengine 和 poxian 的 Seedance 2.0：人民币成本 = 最终 usage.total_tokens ÷ 1,000,000 × 对应单价。
- 不叠加 completion_tokens，不用参考表的“元/个”“元/秒”再次计算，不根据请求时长推算实际费用。
- “含视频输入”取决于实际发送到供应商 payload 中是否含视频引用；仅有图片/音频不属于视频输入。以实际生效分辨率选择单价。

| 分辨率 | 不含视频输入：元/百万 Token | 含视频输入：元/百万 Token |
| --- | ---: | ---: |
| 480p | 46 | 28 |
| 720p | 46 | 28 |
| 1080p | 51 | 31 |
| 4K | 26 | 16 |

例如：35,800 Token、720p，不含视频输入为 1.6468 元；含视频输入为 1.0024 元。

## 配置及扩展

规则位于 `app/core/pricing_rules.json`，计算引擎为 `app/services/pricing.py`。

文件包含供应商匹配、模型版本、endpoint 别名、单价、换算系数及规则版本。新增 Seedance 2.5 时新增独立 token_rate 规则，填写该模型真实 ID、已确认的 endpoint 别名和价格矩阵，并更新配置 version。不要修改 2.0 的匹配模式去笼统匹配所有 Seedance 版本。

当前 poxian 的 `ep-20260414170324-klrk5` 映射为 2.0。任务查询返回明确模型名时优先校验该实际模型；如返回 2.5/fast/旧模型，不套用 2.0 单价。仅有未知 endpoint、缺少总 Token/分辨率/视频输入信息时保持待计价并说明原因。

新调用保存完整计价规则快照。修改配置只作用于后续新调用，不改变已经开始或完成调用的单价；最终返回的实际分辨率及视频输入条件在该快照对应的价格矩阵内选档。

可通过环境变量 `API_COST_PRICING_RULES_FILE` 指向另一份同结构配置。模型返回空费用时不写零；零 Token 或明确返回的零金额正常计为零。金额用十进制字符串保存和返回，计算使用 Decimal，不按每条记录先四舍五入到分。

`default` 或其他未声明的 Agent 供应商不会自动当作 zhenzhen。若其实际通道确为 zhenzhen，需要在规则 providers 中明确配置该身份，不能靠猜测 base URL 计价。

## 数据字段

- `provider_cost` / `provider_currency`：供应商原始金额及原始单位（可空）。
- `usage_json`：实际 Token 等用量。
- `model`：请求模型或 endpoint；`billing_model`：供应商实际返回模型。
- `cost` / `currency`：最终计价金额与币种；上述换算规则输出 CNY。
- `pricing_snapshot`：本次规则、版本、实际单价、参数、计算公式或待计价原因。
- `cost_status`：pending 进行中，calculated 已换算，reported 未换算的其他供应商金额，unavailable 待计价，not_supported 暂不采集。

供应商成功后先保存费用再下载文件，下载失败不会抹掉上游生成费用。视频轮询只更新同一条调用记录。原始金额和换算金额分别保存，重复回调不会重复乘以 1.35。

## 更新步骤（已安装上一版费用功能）

1. 停止后端，备份当前 SQLite 数据库。把更新包内 backend 和 frontend 的文件复制到项目相同路径。
2. 在 backend 的原虚拟环境执行 `alembic upgrade head`，新增原始金额、返回模型及规则快照字段，然后重启后端。
3. 如平时使用 `npm run dev`，保持开发服务运行并刷新页面；如使用正式打包部署，则在 frontend 执行 `npm run build` 并按原方式更新 dist。此次没有新增前端依赖。
4. admin 账号打开“调用与费用”，展开明细核对公式。

迁移保留旧记录原始金额，不自动套用新规则重算历史账单；旧记录会标记 legacy_without_pricing_rule，暂不纳入新的换算合计。历史规则未保存时不能假装已得到可靠人民币成本。

这次不包含已作废的“用户下拉框列出所有账号”改动；仍沿用原选项来源。不移除前端旧模型菜单，由用户自行调整。即梦 1.5/海螺/阿里云等旧视频模型不新增单价，MiniMax、阿里云费用继续为空。

## 验证与边界

后端测试：在 backend 环境运行 `python -m pytest tests -q`。测试使用临时 SQLite、Mock 响应或内存 HTTP transport，没有调用付费模型。

上线前需用实际供应商响应核对模型、分辨率和 total_tokens 字段。自动远端对账、超时任务恢复和重新计算历史费用不在本次范围内。

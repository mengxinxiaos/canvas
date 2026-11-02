# 按供应商、模型配置 API 计价规则

## 本次约定

规则继续维护在 `app/core/pricing_rules.json`，不新增配置页面。费用计算和保存都在后端，前端只展示计价结果、用量来源和公式。

每条规则指定供应商、模型、调用类型，以及使用哪种金额来源：

| 配置 | 含义 | 最终计算 |
| --- | --- | --- |
| `kind: unit_rate`、`unit: image` | 图片按张 | 张数 ÷ unit_size × unit_price |
| `kind: unit_rate`、`unit: second` | 视频按秒 | 秒数 ÷ unit_size × unit_price |
| `kind: unit_rate`、`unit: token` | 图片或视频按 Token | 实际 Token ÷ unit_size × unit_price |
| `kind: provider_multiplier` | 从供应商响应提取原始金额 | provider_cost × multiplier |
| `kind: token_rate` | 兼容原有 Seedance 2.0 分辨率与视频输入矩阵 | total_tokens ÷ token_unit × 对应单价 |

这里的“前算”指提前配置单价，在生成成功后结算。不会在请求发出时把预估金额当作实际花费。

一条调用只使用选中的一种计价规则。选择本地计算时，即使响应里有 cost，也只保留为原始证据，不覆盖本地结果；选择读取供应商金额时，没有 cost 就保持待获取，不自动切换到本地价格。

## 已保留的默认价格

- zhenzhen、zhenzhen-gpt、zhenzhen-gemini：供应商返回金额乘以 1.35，输出 CNY。
- volcengine、poxian 的 Seedance 2.0：保留此前已确认的 Token 单价矩阵及 poxian endpoint 别名。
- MiniMax、Aliyun/ali：继续为空，暂不计价。
- 未配置供应商仍兼容旧版的供应商原始金额透传，币种缺失时不会假定人民币；正式使用新供应商前建议明确配置规则。

本次没有新增真实模型的单价。配置末尾有五个 `enabled: false` 模板，单价和模型均为占位内容；模板默认不参与匹配。

## 如何为模型启用规则

1. 在 rules 中复制对应模板，为 id 填写一个唯一名称。
2. 填写真实 providers、models 和 call_types。providers 使用代码中的供应商标识，例如 zhenzhen、volcengine、poxian。
3. 填写已经确认的 unit_price 或 multiplier、币种，以及计价单位。
4. 将该规则的 enabled 改为 true，并更新配置顶层 version。
5. 校验 JSON 格式后，让该模型产生一条新调用，在管理员明细核对规则和公式。

金额及换算系数建议使用 JSON 字符串，例如 `"0.20"`。unit_size 表示该单价对应多少计价单位：每张或每秒使用 `"1"`，每百万 Token 使用 `"1000000"`。模板中的中文占位单价必须替换后才能启用。

修改已部署的 JSON 会作用于后续新调用；进行中的调用继续使用开始时保存的规则。代码更新后仍需按部署方式重启后端。若使用环境变量 API_COST_PRICING_RULES_FILE 指向外部配置文件，需要修改该文件。

## 模型匹配与覆盖

- models：精确模型名列表，通常最容易维护。
- model_patterns：完整匹配模型名的正则，适合明确的版本命名规则。
- model_aliases：按供应商配置 endpoint 别名，沿用原来的 poxian 配置方式。
- 不写模型条件的规则是该供应商的通用默认规则。具体模型规则优先于这个默认规则，与文件排列顺序无关。
- 同样具体的规则同时命中会保持待计价并提示配置无效，不随机选一条。同样具体的条件单价重复命中也会提示配置无效。
- 供应商返回明确的实际模型名时，以实际模型匹配；请求别名与实际模型名称不一致时，需要将对应名称纳入同一条规则。未知 endpoint 不能随便套用相似模型价格。

例如 zhenzhen 保留通用的 cost × 1.35 规则，同时可为某个图片模型增加 models 专属的按张规则。该模型匹配后使用按张计算，其他 zhenzhen 模型继续读取返回金额。

新增 Seedance 2.5 时应新增独立模型规则及其已确认单价，不扩大 2.0 的匹配范围。旧版 token_rate 继续兼容，也可以为新模型直接使用 unit_rate + token。

## 分辨率等条件单价

unit_rate 可以通过 price_variants 指定条件价格。以下只是未启用的结构模板，没有可用真实单价：

```json
{
  "id": "example-image-resolution-price",
  "enabled": false,
  "kind": "unit_rate",
  "providers": ["zhenzhen"],
  "call_types": ["image_generation"],
  "models": ["YOUR_IMAGE_MODEL"],
  "unit": "image",
  "unit_size": "1",
  "currency": "CNY",
  "price_variants": [
    {"when": {"image_size": "2K"}, "unit_price": "填写确认后的2K每张单价"},
    {"when": {"image_size": "4K"}, "unit_price": "填写确认后的4K每张单价"}
  ]
}
```

条件匹配使用保存的生成参数，例如 image_size、resolution、has_video_input、mode。字符串忽略大小写，布尔值使用 JSON 的 true/false。条件更多的匹配项优先；相同具体程度同时命中视为冲突。若规则顶层提供 unit_price，它作为没有任何条件命中时的默认单价；没有默认单价则保持待计价。

当前视频适配器会保存实际发出的分辨率、时长和视频引用数量；返回的实际分辨率可修正分辨率条件。不要把输入参考图片张数或参考视频时长当作生成结果数量。

## 实际数量与请求参数

- 按张：优先使用实际生成的图片数量；没有实际数量时使用本次请求数量。现有图片任务没有批量数量参数时，保存请求数量为 1；已有供应商适配器会用实际返回 URL 数量补充生成张数。
- 按秒：优先使用响应中的实际输出时长；缺失时使用发给供应商的 duration。输出时长存入 usage_json.duration_seconds，请求时长保留在 parameters_json.duration，二者分开。
- 按 Token：默认使用实际返回的 total_tokens；可用 usage_field 指定其他已采集的实际 Token 字段，也支持点号路径。不能用 max_tokens 预算代替实际消耗，缺少实际 Token 时保持待计价。
- 供应商明确返回 0 时，0 是有效实际数量，不回退请求参数。
- 实际数量存在但格式无效时，保留待计价并显示原因，不用请求值掩盖问题。
- 本地按单价计算只对成功生成结算。失败、中断或等待中的任务不会根据请求张数、时长生成费用。上游成功后本地文件下载失败，仍保留已发生的生成费用。

自动提取仅检查明确的用量字段和已识别的结果结构，不扫描提示词、参考素材或请求回显。新供应商如果使用完全不同的响应结构，除配置价格外，还需在其适配器中提供标准化的实际用量或 cost。

## 保存与兼容

沿用现有 api_call_records 表，不新增字段：provider_cost 保存供应商原始金额，cost 保存最终金额，usage_json 保存实际用量，parameters_json 保存请求参数，pricing_snapshot 保存选中的规则、公式、计价数量及其来源。

新调用保存完整的配置快照。后续价格、规则或模型目录修改不会重新定价已经开始的调用；实际模型晚到时仍在原来的配置快照中选规则。旧版只保存单条规则的快照继续使用原规则。开始时配置文件损坏或缺失的调用保持待计价，不在修复后自动套用新的价格。

重复轮询和完成通知更新同一条调用记录，不重复生成金额、不重复乘 1.35，也不自动重算历史调用。原来标记 legacy_without_pricing_rule 的旧数据继续保持原处理方式。

管理员权限限制保持不变。页面继续只保留筛选、费用合计和调用明细；不恢复四个统计卡片或按用户、按模型分组展示。明细新增张数、秒数、Token 公式和“实际返回 / 请求参数”来源说明。

## 本次部署

前提：已经安装原 API 费用功能及上一版计价快照字段，后端已注册 /api/admin/api-calls 和 /api/admin/api-calls/summary。此包不是首次安装完整包，不包含整个应用和路由注册。

1. 保存现有代码和自定义 pricing_rules.json。如果已经改过价格，将这些规则合并到新文件，避免直接覆盖后丢失自定义内容。
2. 将更新包中的 backend、frontend 文件复制到项目相同路径。
3. 使用原进程管理方式重启后端。本次不新增依赖和迁移，不需要为本次更新执行 alembic upgrade。
4. 开发模式刷新页面；正式部署在 frontend 执行 npm run build，然后按原方式更新 dist。
5. 管理员发起新调用，核对费用明细的规则 ID、实际用量或请求回退来源，以及最终金额。

JSON 格式校验（backend 目录）：

```bash
python -m json.tool app/core/pricing_rules.json > /dev/null
```

Windows PowerShell 可去掉重定向，或将 > /dev/null 换成 > $null。

后端相关测试（backend 目录、原虚拟环境）：

```bash
python -m pytest tests/test_pricing.py tests/test_unit_pricing.py tests/test_billing_service.py tests/test_billing_quantities.py tests/test_video_pricing_context.py -q
```

测试使用模拟响应和临时数据库，不调用付费模型接口。新供应商上线时仍应使用其实际响应核对字段与计费口径。

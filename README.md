# API 费用管理补丁

适用于 mengxinxiaos/canvas 的 feature/agent 分支，基线提交 66b9a39。
没有向 GitHub 推送；请先在自己的分支检查并应用。

## 应用

1. 将 canvas-api-costs.patch 放在项目根目录，确保当前工作区的改动已保存。
2. 运行 `git apply --check canvas-api-costs.patch`，检查通过后运行 `git apply canvas-api-costs.patch`。
3. 停止后端并备份 SQLite 数据库。在 backend 的原虚拟环境执行 `pip install -r requirements.txt`，然后 `alembic upgrade head`。
4. 重启后端；在 frontend 执行 `npm install --no-package-lock` 和 `npm run build`，按原部署方式更新前端。仓库原锁文件存在依赖不一致，此补丁未更改锁文件。
5. 使用 admin 账号登录，在项目空间左侧栏打开“调用与费用”。

支持供应商 cost 采集、用户/项目关联、图片/视频/Agent/历史总结记录，管理面板筛选与分页。MiniMax 和阿里云费用始终为空，不维护价格表，不自动估价。费用缺失时为空；没有币种时标注未知单位。统计只覆盖启用后的新调用。

56 项后端模拟测试通过；前端生产构建和定向 ESLint 通过。没有使用真实密钥做付费接口联调；超时后自动对账/任务恢复未包含。完整说明在应用补丁后的 backend/API_COSTS.md。

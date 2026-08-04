# 管理后台（Admin UI）

## 1. 目标

商业运营后台：用户、订单、流水、价格、支付/邮件/短信配置、审计。  
风格与前台一致：Ant Design 5 + `@lobehub/ui`，支持深色模式与移动端响应式（桌面 Sider / 移动 Drawer）。

## 2. 路由与权限（规划）

| 页面 | 路径 | 权限 |
|------|------|------|
| 仪表盘 | `/admin` | `admin:dashboard:read` |
| 用户列表 | `/admin/users` | `billing:users:read` |
| 订单 | `/admin/orders` | `billing:orders:read` |
| 流水 | `/admin/ledger` | `billing:ledger:read` |
| 模型价格 | `/admin/prices` | `billing:prices:config` |
| 支付配置 | `/admin/payment` | `billing:payment:config` |
| 邮箱 SMTP | `/admin/email` | `system:email:config` |
| 短信 API | `/admin/sms` | `system:sms:config` |
| 审计日志 | `/admin/audit` | `admin:audit:read` |

角色建议：`user` 无任何 admin 权限；`admin` / `super_admin` 按 `ROLE_PERMISSIONS` 映射。  
服务端默认拒绝；禁止仅靠前端隐藏菜单。

## 3. 配置页约定

### 3.1 支付（支付宝示例）

- 字段：APPID、商户私钥、支付宝公钥（RSA2）、notify/return URL、沙箱开关
- 私钥 / 公钥：**掩码**；已配置时输入框 placeholder 为「已配置，留空则不修改」
- 更新 payload：仅当字段为非空字符串时写入新密钥

### 3.2 邮箱 SMTP

- 预设：Gmail / Outlook / QQ / 163 / 126 / 阿里云 / SendGrid / 自定义
- 密码掩码；「启用邮箱注册」开关

### 3.3 短信

- 提供商：阿里云 / 腾讯云 / 自定义
- AccessKey 等凭据掩码；「启用手机号注册」开关

## 4. 用户管理

- 列表字段含邮箱、手机号（可选）、昵称、余额、角色、封禁状态
- 搜索：邮箱 / 手机 / 昵称
- 调账：必须填原因、幂等键、写流水 + 审计；禁止直接改余额数字

## 5. 代码位置

| 说明 | 路径 |
|------|------|
| 功能占位 | `src/features/admin/README.md` |
| 本地 mock UI 稿（若未合入） | 仓库外 / 开发分支 `admin-ui` 产物 |
| 验收 | `docs/qa/ACCEPTANCE_USER_BILLING.md` §7 |

## 6. 当前仓库状态

`src/features/admin` 在 main 上仍为**占位说明**。完整页面需按 Phase 计划接入 tRPC 与 RBAC 后再合入；合入前可用 mock 数据验证 UI。

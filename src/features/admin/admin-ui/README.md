# Wedai Admin UI

Wedai 商业运营后台的 Web SPA 实现，挂载在 `/admin/*`。当前阶段使用
`mock/store.ts` 的内存 API；其方法、分页结果和配置类型按未来 tRPC/API 形状设计，替换
数据层时不需要重写页面。

> 当前仓库实际锁定 React 19、Ant Design 6 与 `@lobehub/ui` 5。本模块遵循仓库现有依赖，
> 不单独降级到需求草案中的 React 18 / Ant Design 5。

## 功能

| 路径             | 功能                                         | 读取权限                 | 写入权限                              |
| ---------------- | -------------------------------------------- | ------------------------ | ------------------------------------- |
| `/admin`         | 用户、订单、收入与积分总览                   | `admin:dashboard:read`   | —                                     |
| `/admin/users`   | 邮箱 / 手机号用户查询、余额调整、封禁 / 解封 | `user:read`              | `billing:balance:adjust`、`user:ban`  |
| `/admin/orders`  | 订阅和积分包订单、状态筛选                   | `billing:order:read`     | `billing:order:refund` 预留给真实 API |
| `/admin/prices`  | Token / 按次计费、积分价格与启停             | `billing:price:read`     | `billing:price:write`                 |
| `/admin/payment` | 支付宝 RSA2、回调与沙箱配置                  | `billing:payment:config` | 同左                                  |
| `/admin/email`   | SMTP 服务商、事务邮件与邮箱注册开关          | `system:email:config`    | 同左                                  |
| `/admin/sms`     | 阿里云 / 腾讯云 / 自定义短信与手机号注册开关 | `system:sms:config`      | 同左                                  |
| `/admin/audit`   | 敏感操作审计记录                             | `admin:audit:read`       | —                                     |

`billing:webhook:read` 已进入 RBAC 映射，等待真实 Webhook 事件查询 API 后挂载独立页面；
`role:assign` 只授予 `super_admin`，等待 Better Auth 角色变更 API 后开放 UI。

## 注册双通道

`AdminUserRow.email` 与 `AdminUserRow.phone` 均为可选字段，业务约束是至少存在一个。
mock 数据包含纯手机号用户，用于验证列表、搜索与运营操作不会错误依赖邮箱。

SMTP 的 `enableEmailRegister` 与短信的 `enablePhoneRegister` 分别控制注册页通道。当前仅
保存 mock 配置；接入真实后端后，注册页必须读取服务端公开配置，不能信任浏览器本地值。

## RBAC

权限定义在 `permissions.ts`。`admin` 拥有日常运营权限，`super_admin` 额外拥有
`role:assign`，`user` 不拥有后台权限。菜单、页面 Guard 与按钮均调用
`can(permission)`，没有 `role === 'admin'` 形式的业务判断。

前端权限只用于交互显隐。生产环境的 Better Auth session、tRPC procedure 和服务端业务
方法必须逐层重复验证权限和资源范围。

## 响应式

- `lg` 及以上：220px 固定侧栏，Header 粘性，内容区 24px 间距。
- 小于 `lg`：隐藏侧栏，通过 Header 汉堡按钮打开 260px Drawer；路由变化后自动关闭。
- 表格启用 `scroll={{ x: 'max-content' }}`；手机端使用 simple 分页。
- 所有背景、边框和文字层级使用现有主题 token，自动跟随前台明暗主题。

## 密钥安全

- `getAlipayConfig`、`getSmtpConfig`、`getSmsConfig` 只返回 `*Configured` 布尔值。
- 私钥、密码、AccessKey 保存后立即清空输入框，永不回显。
- 更新输入中的密钥字段留空或只含空白字符时，不覆盖已有值。
- 审计 metadata 只记录 “是否更新”、服务商与开关，不记录密钥内容。
- 生产密钥必须在服务端加密存储或托管到 KMS；禁止放入前端包、localStorage 或日志。

## 本地预览

启动完整开发环境：

```bash
bun run dev
```

浏览器打开应用，在开发者工具执行：

```js
localStorage.setItem('WEDAI_ADMIN_ROLE', 'admin');
location.assign('/admin');
```

预览仅有 `role:assign` 的超级管理员权限：

```js
localStorage.setItem('WEDAI_ADMIN_ROLE', 'super_admin');
location.reload();
```

`localStorage` 角色只用于 UI/mock 阶段预览，不是真正鉴权。生产接入时应将
`hooks/useAdminAccess.ts` 的角色来源替换为 Better Auth session。

## 替换真实 API

保留 `types.ts` 的接口形状，将页面中的 `adminMockApi` 替换为 tRPC client/service。
真实写操作需满足：

1. Better Auth session 鉴权并按 permission 授权；
2. 金额使用整数最小单位，积分使用安全整数或数据库 decimal，禁止 float；
3. 调余额、退款、封禁和配置更新在事务中写入审计；
4. 密钥只接受写入，不通过任何读取 API 返回；
5. 列表搜索、筛选与分页在服务端针对完整数据集执行。

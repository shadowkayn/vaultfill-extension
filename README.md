# VaultFill

VaultFill 是一个基于 Manifest V3 的 Chrome / Microsoft Edge 扩展，用于在本地加密保存并由用户主动填入网站登录凭据。

当前版本支持创建、锁定、解锁和重置本地加密密码库，支持恢复密钥、修改主密码和恢复后自动轮换密钥，也支持按网站来源保存多个账号并进行新增、编辑、删除和手动一键填入。密码库采用信封加密：随机数据密钥使用 AES-256-GCM 加密数据，主密码和恢复密钥分别通过 PBKDF2-HMAC-SHA-256 派生的密钥包装数据密钥。填入前会在后台和网页脚本中进行双重来源校验，且不会自动提交表单。

## 本地开发

```bash
pnpm install
pnpm test
pnpm build
```

构建完成后，在 Chrome 中打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，然后选择项目中的 `dist` 目录。

Edge 对应地址为 `edge://extensions`。

## 项目结构

```text
src/
├── background/   # Manifest V3 Service Worker
├── content/      # 注入网页的登录表单脚本
├── credentials/  # 当前网站的账号管理界面
├── crypto/       # 密钥派生、AES-GCM 加密和编码
├── shared/       # Popup 与 Service Worker 共享的消息类型
├── storage/      # 本地密文和会话密钥存储
├── vault/        # 密码库内的账号业务规则
├── App.tsx       # 扩展 Popup
└── main.tsx
```

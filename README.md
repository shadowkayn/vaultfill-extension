# VaultFill

VaultFill 是一个基于 Manifest V3 的 Chrome / Microsoft Edge 扩展，用于在本地加密保存并由用户主动填入网站登录凭据。

当前版本为最小可运行骨架，尚未接入真实凭据存储。

## 本地开发

```bash
pnpm install
pnpm build
```

构建完成后，在 Chrome 中打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，然后选择项目中的 `dist` 目录。

Edge 对应地址为 `edge://extensions`。

## 项目结构

```text
src/
├── background/   # Manifest V3 Service Worker
├── content/      # 注入网页的登录表单脚本
├── App.tsx       # 扩展 Popup
└── main.tsx
```

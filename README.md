# VaultFill

VaultFill 是一个基于 Manifest V3 的 Chrome / Microsoft Edge 扩展，用于在本地加密保存并由用户主动填入网站登录凭据。

界面采用“蓝色大肥鱼密码管家”主题，以海洋蓝、气泡、波浪和鱼鱼守护元素贯穿密码库创建、解锁、账号管理、恢复密钥与安全状态页面。

当前版本支持创建、锁定、解锁和重置本地加密密码库，支持恢复密钥、修改主密码和恢复后自动轮换密钥，也支持按网站来源保存多个账号并进行新增、编辑、删除和手动一键填入。添加账号时会自动记录当前登录页的完整地址，用户也可以在表单中修改；“已保存登录页”会分别展示协议、域名、端口及具体登录路由，并可在新页签中打开登录页面。用户可以为不同登录页设置加密别名，也可以查看账号数量与最近更新时间，或单独清理某个网站的全部账号。插件会只读检测当前页面是否存在可用的登录密码框：登录页显示“一键填入”和“别名登录”，同域名内部页面隐藏填入按钮并显示“别名页面”。密码库采用信封加密：随机数据密钥使用 AES-256-GCM 加密数据，主密码和恢复密钥分别通过 PBKDF2-HMAC-SHA-256 派生的密钥包装数据密钥。填入前会在后台和网页脚本中进行双重来源校验，且不会自动提交表单。

## 本地开发

```bash
pnpm install
pnpm test
pnpm build
```

构建完成后，在 Chrome 中打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，然后选择项目中的 `dist` 目录。

Edge 对应地址为 `edge://extensions`。

## 视觉素材与许可

插件工具栏直接使用 [Bai-Cute/big-blue-fish-desktop-pet](https://github.com/Bai-Cute/big-blue-fish-desktop-pet) 自带的奶油色圆角应用图标，并分别抽取其原生 16、32、48、128 像素版本。背景水印、页面立绘、按钮角色与页脚角色统一取自该项目收录的蓝色大肥鱼透明动画帧；创建、解锁、恢复、修改、重置、继续、锁定、保存、删除、取消与添加按钮分别使用不同动作，不重复共用。

桌宠项目采用 Apache License 2.0，对应文本保存在 `public/licenses/big-blue-fish-desktop-pet-Apache-2.0.txt`。项目说明角色动画上游来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，采用 MIT License；对应许可文本保存在 `public/licenses/blue-fish-character-MIT.txt`。其余海洋背景、气泡、卡片和交互元素由 VaultFill 的 HTML / CSS 绘制。

## 项目结构

```text
src/
├── background/   # Manifest V3 Service Worker
├── content/      # 注入网页的登录表单脚本
├── credentials/  # 当前网站的账号管理界面
├── crypto/       # 密钥派生、AES-GCM 加密和编码
├── shared/       # Popup 与 Service Worker 共享的消息类型
├── sites/        # 已保存登录页、别名与整站清理界面
├── storage/      # 本地密文和会话密钥存储
├── vault/        # 密码库内的账号业务规则
├── App.tsx       # 扩展 Popup
└── main.tsx
```

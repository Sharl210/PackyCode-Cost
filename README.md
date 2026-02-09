# PackyCode-Cost

OpenCode 插件，用于显示 PackyCode 账户用量，并在每次模型响应完成后弹出用量 toast。

## 功能

- `/cost`：中文 + emoji 账户用量统计（不触发模型回复）。
- 统计块：当前会话与提供商汇总（⏫ 输入 / ⏬ 输出 / ♻️ 缓存 / ⚡ 首字延时 / 总用量）。
- ` /clearcost`：清除当前会话记录。
- ` /clearallcost`：清除全部会话记录。
- toast：模型完全回复后弹出，含 token 指标、首字延时、本次/当前会话、今日已用/每日限额。
- token 数值按千分位显示（例如 12,345）。
- `providerKey`：仅对指定服务商生效。
- `toastDuration`：自定义 toast 持续时间（默认 7000ms）。

## 安装

### Windows（本地插件目录自动加载）

OpenCode 会自动加载本地插件目录：

- 全局：`%USERPROFILE%\.config\opencode\plugins\`
- 项目级：`.opencode\plugins\`

来源：OpenCode 插件文档 https://opencode.ai/docs/plugins

1. 克隆仓库（或直接下载 ZIP 解压）：

```
git clone https://github.com/Sharl210/PackyCode-Cost.git
```

2. 复制到全局插件目录：

```
mkdir %USERPROFILE%\.config\opencode\plugins
xcopy /E /I PackyCode-Cost %USERPROFILE%\.config\opencode\plugins\packycode-cost
```

然后创建配置文件 `%USERPROFILE%\.config\opencode\packycode-cost.json`（示例见下方）。

### Linux / WSL（显式加载）

OpenCode 官方推荐在 Windows 使用 WSL。请在 WSL 中按 Linux 步骤安装与配置。

文档：https://opencode.ai/docs/windows-wsl

1. 克隆仓库：

```
git clone https://github.com/Sharl210/PackyCode-Cost.git
```

2. 复制到指定位置：

```
mkdir -p ~/.config/opencode/plugins
cp -r PackyCode-Cost ~/.config/opencode/plugins/packycode-cost
```

3. 在 `~/.config/opencode/opencode.json` 添加插件路径（来源：https://opencode.ai/docs/plugins）：

```
{
  "plugin": [
    "file:///home/YOUR_USER/.config/opencode/plugins/packycode-cost"
  ]
}
```

然后创建配置文件 `~/.config/opencode/packycode-cost.json`（示例见下方）。

## 配置

`packycode-cost.json` 示例：

```
{
  "endpoint": "https://codex.packycode.com/api/backend/users/info",
  "apiKey": "YOUR_PACKYCODE_API_KEY",
  "providerKey": "packy-codex",
  "toastDuration": 7000
}
```

字段说明：

- `endpoint`：PackyCode 用户信息接口。
- `apiKey`：PackyCode API Key。
- `providerKey`：必选，仅对指定服务商生效（值应等于 OpenCode provider 的 `id`，注：不是 `name` 字段），如示例里的 `packy-codex`。
- `toastDuration`：toast 持续时间（毫秒）。

插件只从 `packycode-cost.json` 读取 `apiKey`，不依赖 `opencode.json` 的 provider 配置。

如果你要限制在某个服务商生效，`providerKey` 必须与 `opencode.json` 里的 provider ID 对应。示例（仅示意，API key 请替换）：

```
{
  "provider": {
    "packy-codex": {
      "models": {
        "gpt-5.3-codex": { "limit": { "context": 400000, "output": 128000 }, "modalities": { "input": ["text","image","pdf"], "output": ["text"] }, "name": "GPT-5.3-Codex" }
      },
      "name": "PackyCode",
      "npm": "@ai-sdk/openai",
      "options": {
        "apiKey": "YOUR_PACKYCODE_API_KEY",
        "baseURL": "https://codex-api-slb.packycode.com/v1",
        "setCacheKey": true,
        "store": false
      }
    }
  }
}
```

## 打包

本仓库可直接 `zip` 或 `npm pack` 分享：

```
npm pack
```

## LLM 一键安装提示词

将下面内容复制给 LLM，它会在你的机器上完成安装步骤：

```
请在我的机器上安装 OpenCode 插件 PackyCode-Cost：
1) git clone https://github.com/Sharl210/PackyCode-Cost.git
2) 把仓库复制到 ~/.config/opencode/plugins/packycode-cost
3) 创建 ~/.config/opencode/packycode-cost.json，写入 endpoint、apiKey、providerKey（可选）、toastDuration（可选）
4) 提示我重启 OpenCode
```

## 许可证

MIT License

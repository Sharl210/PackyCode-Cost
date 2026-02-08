# PackyCode-Cost

OpenCode 插件，用于显示 PackyCode 账户用量，并在每次模型响应完成后弹出用量 toast。

## 功能

- `/cost`：以中文 + emoji 展示账户用量统计（不触发模型回复）。
- 每次 `packy-codex` 模型完成回复后弹出 toast：
  - 本次用量（基于调用前后 total_spent_usd 的差值）
  - 会话用量（累加每次本次用量）
  - 总用量（当前 total_spent_usd）

## 安装

1. 复制插件目录到本地：

```
~/.config/opencode/plugins/packycode-cost
```

2. 在 `~/.config/opencode/opencode.json` 添加插件：

```
{
  "plugin": [
    {
      "name": "packycode-cost",
      "path": "~/.config/opencode/plugins/packycode-cost/index.js"
    }
  ]
}
```

3. 创建配置文件 `~/.config/opencode/packycode-cost.json`（示例见下方）。

## 配置

`packycode-cost.json` 示例：

```
{
  "providerKey": "packy-codex",
  "endpoint": "https://codex.packycode.com/api/backend/users/info"
}
```

插件会从 `~/.config/opencode/opencode.json` 的 provider 配置读取 API Key：

```
{
  "provider": {
    "packy-codex": {
      "options": {
        "apiKey": "YOUR_API_KEY"
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

## 许可证

MIT License

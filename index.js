import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "packycode-cost.json")
const OPENCODE_FILE = join(CONFIG_DIR, "opencode.json")
const LOG_DIR = join(CONFIG_DIR, "logs", "packycode-cost")
const STATE_FILE = join(LOG_DIR, "state.json")

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

const DEFAULT_CONFIG = {
  providerKey: "packy-codex",
  endpoint: "https://codex.packycode.com/api/backend/users/info",
}

function resolveConfig() {
  const user = readJson(CONFIG_FILE, {})
  return {
    providerKey: user.providerKey || user.provider || DEFAULT_CONFIG.providerKey,
    endpoint: user.endpoint || DEFAULT_CONFIG.endpoint,
  }
}

function resolveApiKey(providerKey) {
  const opencode = readJson(OPENCODE_FILE, {})
  const provider = opencode?.provider?.[providerKey]
  const apiKey = provider?.options?.apiKey
  if (typeof apiKey === "string" && apiKey.trim()) {
    return apiKey.trim()
  }
  return null
}

function writeJson(path, data) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2))
  } catch {
    // ignore
  }
}

function n(value) {
  return Number.isFinite(value) ? value : Number(value)
}

function money(value) {
  const amount = n(value)
  if (!Number.isFinite(amount)) {
    return "-"
  }
  return `$${amount.toFixed(2)}`
}

function moneyFine(value) {
  const amount = n(value)
  if (!Number.isFinite(amount)) {
    return "-"
  }
  return `$${amount.toFixed(4)}`
}

function loadState() {
  return readJson(STATE_FILE, {
    updatedAt: null,
    data: null,
    lastSessionId: null,
    sessionTotals: {},
    lastUserTotals: {},
  })
}

function updateLastSessionId(sessionID) {
  if (!sessionID) {
    return
  }
  const current = loadState()
  if (current.lastSessionId === sessionID) {
    return
  }
  writeJson(STATE_FILE, {
    ...current,
    lastSessionId: sessionID,
    sessionTotals: current.sessionTotals || {},
    lastUserTotals: current.lastUserTotals || {},
  })
}

function formatDate(value) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}/${month}/${day}`
}

function formatRange(start, end) {
  const startText = formatDate(start)
  const endText = formatDate(end)
  if (startText === "-" || endText === "-") {
    return "-"
  }
  return `${startText} ~ ${endText}`
}

function buildOutput(data) {
  const weeklyUsed = money(data?.weekly_spent_usd)
  const weeklyBudget = money(data?.weekly_budget_usd)
  const weeklyRange = formatRange(data?.weekly_window_start, data?.weekly_window_end)
  const lines = [
    "📇【账号信息】",
    `- 邮箱：${data?.email ?? "-"}`,
    `- 注册时间：${formatDate(data?.created_at)}`,
    "",
    "📊【用量】",
    `- 每日预算：${money(data?.daily_budget_usd)}`,
    `- 本周已用：${weeklyUsed} / ${weeklyBudget}`,
    `  期间：${weeklyRange}`,
    `- 今日已用：${money(data?.daily_spent_usd)}`,
    `- 累计已用：${money(data?.total_spent_usd)}`,
    "",
    "说明：以上为 PackyCode 账户统计。",
  ]
  return `${lines.join("\n")}\n`
}

async function fetchAccountData() {
  const config = resolveConfig()
  const apiKey = resolveApiKey(config.providerKey)
  if (!apiKey) {
    return null
  }
  const response = await fetch(config.endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })
  if (!response.ok) {
    return null
  }
  return response.json()
}

export const PackyCodeCostPlugin = async ({ client }) => {
  const toastSeen = new Set()
  return {
    config: async (input) => {
      const cfg = input
      cfg.command ??= {}
      cfg.command.cost = {
        template: "/cost",
        description: "显示 PackyCode 账户用量",
      }
    },
    "command.execute.before": async (input) => {
      if (input.command !== "cost") {
        return
      }
      const data = await fetchAccountData()
      const text = data ? buildOutput(data) : "PackyCode-Cost: request failed.\n"
      if (data) {
        const state = loadState()
        writeJson(STATE_FILE, { ...state, data, updatedAt: Date.now() })
      }
      try {
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            noReply: true,
            parts: [{ type: "text", text, ignored: true }],
          },
        })
      } catch {
        // ignore
      }
      throw new Error("__QUOTA_COMMAND_HANDLED__")
    },
    event: async ({ event }) => {
      if (event?.type !== "message.updated") {
        return
      }
      const info = event.properties?.info
      if (!info) {
        return
      }
      if (info.role === "user") {
        const data = await fetchAccountData()
        if (!data) {
          return
        }
        const totalSpent = n(data?.total_spent_usd)
        if (!Number.isFinite(totalSpent)) {
          return
        }
        const state = loadState()
        const lastUserTotals = { ...(state.lastUserTotals || {}) }
        lastUserTotals[info.sessionID] = totalSpent
        const sessionTotals = { ...(state.sessionTotals || {}) }
        if (!Number.isFinite(n(sessionTotals[info.sessionID]))) {
          sessionTotals[info.sessionID] = 0
        }
        writeJson(STATE_FILE, {
          ...state,
          data,
          updatedAt: Date.now(),
          lastUserTotals,
          sessionTotals,
        })
        return
      }
      if (info.role !== "assistant") {
        return
      }
      const providerID = info.providerID ?? info.model?.providerID
      if (providerID !== "packy-codex") {
        return
      }
      const completedAt = n(info.time?.completed)
      if (!Number.isFinite(completedAt)) {
        return
      }
      if (toastSeen.has(info.id)) {
        return
      }
      toastSeen.add(info.id)
      updateLastSessionId(info.sessionID)
      const data = await fetchAccountData()
      if (!data) {
        return
      }
      const totalSpent = n(data?.total_spent_usd)
      const state = loadState()
      const lastUserTotals = { ...(state.lastUserTotals || {}) }
      const sessionTotals = { ...(state.sessionTotals || {}) }
      const baseline = n(lastUserTotals[info.sessionID])
      const delta = Number.isFinite(totalSpent) && Number.isFinite(baseline) ? totalSpent - baseline : null
      const sessionTotal = n(sessionTotals[info.sessionID])
      if (Number.isFinite(delta) && Number.isFinite(sessionTotal)) {
        sessionTotals[info.sessionID] = sessionTotal + delta
      }
      writeJson(STATE_FILE, {
        ...state,
        data,
        updatedAt: Date.now(),
        sessionTotals,
      })
      await client.tui.showToast({
        body: {
          title: "PackyCodeCost",
          message: `本次用量：${moneyFine(delta)} | 会话用量：${moneyFine(sessionTotals[info.sessionID])} | 总用量：${moneyFine(totalSpent)}`,
          variant: "info",
          duration: 5500,
        },
      })
    },
  }
}

export default PackyCodeCostPlugin

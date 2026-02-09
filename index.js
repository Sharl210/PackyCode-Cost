import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "packycode-cost.json")
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
  endpoint: "https://codex.packycode.com/api/backend/users/info",
  apiKey: null,
  providerKey: null,
  toastDuration: 7000,
}

function resolveConfig() {
  const user = readJson(CONFIG_FILE, {})
  return {
    endpoint: user.endpoint || DEFAULT_CONFIG.endpoint,
    apiKey: typeof user.apiKey === "string" && user.apiKey.trim() ? user.apiKey.trim() : DEFAULT_CONFIG.apiKey,
    providerKey: typeof user.providerKey === "string" && user.providerKey.trim() ? user.providerKey.trim() : DEFAULT_CONFIG.providerKey,
    toastDuration: Number.isFinite(Number(user.toastDuration)) ? Number(user.toastDuration) : DEFAULT_CONFIG.toastDuration,
  }
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

function makeStats() {
  return {
    input: 0,
    output: 0,
    cache: 0,
    latencySum: 0,
    latencyCount: 0,
    cost: 0,
  }
}

function count(value) {
  const amount = n(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return "-"
  }
  const rounded = Math.round(amount)
  return `${rounded}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function statMoney(value) {
  const amount = n(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return "-"
  }
  return `$${amount.toFixed(4)}`
}

function latencyMs(value) {
  if (value == null) {
    return "-"
  }
  const amount = n(value)
  if (!Number.isFinite(amount)) {
    return "-"
  }
  return `${Math.round(amount)} ms`
}

function latencyMsCompact(value) {
  if (value == null) {
    return "-"
  }
  const amount = n(value)
  if (!Number.isFinite(amount)) {
    return "-"
  }
  return `${Math.round(amount)}ms`
}

function avgLatency(stats) {
  if (!stats || !Number.isFinite(stats.latencySum) || !Number.isFinite(stats.latencyCount) || stats.latencyCount <= 0) {
    return null
  }
  return stats.latencySum / stats.latencyCount
}


function loadState() {
  return readJson(STATE_FILE, {
    updatedAt: null,
    data: null,
    lastSessionId: null,
    sessionTotals: {},
    lastUserTotals: {},
    sessionStats: {},
    providerStats: {},
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

function buildOutput(data, sessionStats, providerStats) {
  const weeklyUsed = money(data?.weekly_spent_usd)
  const weeklyBudget = money(data?.weekly_budget_usd)
  const weeklyRange = formatRange(data?.weekly_window_start, data?.weekly_window_end)
  const currentLabel = "🧭 当前会话"
  const providerLabel = "🏷️ 提供商"
  const divider = "————————————————————————————————————"
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
    "说明：以上为 PackyCode 账户统计。",
    divider,
    `${currentLabel} ⏫ ${count(sessionStats?.input)} ⏬ ${count(sessionStats?.output)} ♻️ ${count(sessionStats?.cache)} ⚡：${latencyMsCompact(avgLatency(sessionStats))}（首字） 总用量：${statMoney(sessionStats?.cost)}`,
    `${providerLabel} ⏫ ${count(providerStats?.input)} ⏬ ${count(providerStats?.output)} ♻️ ${count(providerStats?.cache)} ⚡：${latencyMsCompact(avgLatency(providerStats))}（首字） 总用量：${statMoney(providerStats?.cost)}`,
  ]
  return `${lines.join("\n")}\n`
}

async function fetchAccountData() {
  const config = resolveConfig()
  if (!config.apiKey) {
    return null
  }
  const response = await fetch(config.endpoint, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
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
  const firstPartStartByMessage = {}
  const config = resolveConfig()
  return {
    config: async (input) => {
      const cfg = input
      cfg.command ??= {}
      cfg.command.cost = {
        template: "/cost",
        description: "显示 PackyCode 账户用量",
      }
      cfg.command.clearcost = {
        template: "/clearcost",
        description: "清除当前会话用量记录",
      }
      cfg.command.clearallcost = {
        template: "/clearallcost",
        description: "清除全部会话用量记录",
      }
    },
    "command.execute.before": async (input) => {
      if (input.command === "clearcost" || input.command === "clearallcost") {
        const state = loadState()
        const next = { ...state }
        if (input.command === "clearcost") {
          const sessionID = input.sessionID
          next.sessionTotals = { ...(state.sessionTotals || {}) }
          next.lastUserTotals = { ...(state.lastUserTotals || {}) }
          next.sessionStats = { ...(state.sessionStats || {}) }
          delete next.sessionTotals[sessionID]
          delete next.lastUserTotals[sessionID]
          delete next.sessionStats[sessionID]
        } else {
          next.sessionTotals = {}
          next.lastUserTotals = {}
          next.sessionStats = {}
          next.providerStats = {}
          next.lastSessionId = null
        }
        writeJson(STATE_FILE, { ...next, updatedAt: Date.now() })
        const text =
          input.command === "clearcost"
            ? "PackyCode-Cost: 当前会话记录已清除。\n"
            : "PackyCode-Cost: 全部会话记录已清除。\n"
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
      }
      if (input.command !== "cost") {
        return
      }
      const data = await fetchAccountData()
      const state = data ? loadState() : null
      const sessionStats = state?.sessionStats?.[input.sessionID] || null
      let providerStats = state?.providerStats?.__all__ || null
      if (!providerStats && state?.sessionStats) {
        const allStats = makeStats()
        for (const stats of Object.values(state.sessionStats)) {
          if (!stats) {
            continue
          }
          allStats.input += n(stats.input)
          allStats.output += n(stats.output)
          allStats.cache += n(stats.cache)
          allStats.latencySum += n(stats.latencySum)
          allStats.latencyCount += n(stats.latencyCount)
          allStats.cost += n(stats.cost)
        }
        providerStats = allStats
      }
      const text = data ? buildOutput(data, sessionStats, providerStats) : "PackyCode-Cost: request failed.\n"
      if (data) {
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
      const eventType = event?.type
      if (eventType === "message.part.updated") {
        const part = event.properties?.part
        const start = part?.time?.start
        if (part?.messageID && Number.isFinite(start)) {
          const current = firstPartStartByMessage[part.messageID]
          if (!Number.isFinite(current) || start < current) {
            firstPartStartByMessage[part.messageID] = start
          }
        }
        return
      }
      if (eventType !== "message.updated") {
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
        const sessionStats = { ...(state.sessionStats || {}) }
        if (!sessionStats[info.sessionID]) {
          sessionStats[info.sessionID] = makeStats()
        }
        const providerStats = { ...(state.providerStats || {}) }
        writeJson(STATE_FILE, {
          ...state,
          data,
          updatedAt: Date.now(),
          lastUserTotals,
          sessionTotals,
          sessionStats,
          providerStats,
        })
        return
      }
      if (info.role !== "assistant") {
        return
      }
      const providerID = info.providerID ?? info.model?.providerID ?? "unknown"
      if (config.providerKey && providerID !== config.providerKey) {
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
      const createdAt = n(info.time?.created)
      const firstPartStart = firstPartStartByMessage[info.id]
      const firstTokenLatency =
        Number.isFinite(createdAt) && Number.isFinite(firstPartStart) ? Math.max(0, firstPartStart - createdAt) : null
      const inputTokens = n(info.tokens?.input)
      const outputTokens = n(info.tokens?.output)
      const cacheRead = n(info.tokens?.cache?.read)
      const cacheWrite = n(info.tokens?.cache?.write)
      const cacheTotal =
        Number.isFinite(cacheRead) || Number.isFinite(cacheWrite)
          ? (Number.isFinite(cacheRead) ? cacheRead : 0) + (Number.isFinite(cacheWrite) ? cacheWrite : 0)
          : null
      const metricsLine = `⏫ ${count(inputTokens)} ⏬ ${count(outputTokens)} ♻️ ${count(cacheTotal)} ⚡：${latencyMs(firstTokenLatency)}（首字）`
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
      const sessionStats = { ...(state.sessionStats || {}) }
      if (!sessionStats[info.sessionID]) {
        sessionStats[info.sessionID] = makeStats()
      }
      if (Number.isFinite(inputTokens)) {
        sessionStats[info.sessionID].input += inputTokens
      }
      if (Number.isFinite(outputTokens)) {
        sessionStats[info.sessionID].output += outputTokens
      }
      if (Number.isFinite(cacheTotal)) {
        sessionStats[info.sessionID].cache += cacheTotal
      }
      if (Number.isFinite(firstTokenLatency)) {
        sessionStats[info.sessionID].latencySum += firstTokenLatency
        sessionStats[info.sessionID].latencyCount += 1
      }
      if (Number.isFinite(delta)) {
        sessionStats[info.sessionID].cost += delta
      }
      const providerStats = { ...(state.providerStats || {}) }
      const providerBucket = providerStats.__all__ ? { ...providerStats.__all__ } : makeStats()
      void providerID
      if (Number.isFinite(inputTokens)) {
        providerBucket.input += inputTokens
      }
      if (Number.isFinite(outputTokens)) {
        providerBucket.output += outputTokens
      }
      if (Number.isFinite(cacheTotal)) {
        providerBucket.cache += cacheTotal
      }
      if (Number.isFinite(firstTokenLatency)) {
        providerBucket.latencySum += firstTokenLatency
        providerBucket.latencyCount += 1
      }
      if (Number.isFinite(delta)) {
        providerBucket.cost += delta
      }
      providerStats.__all__ = providerBucket
      writeJson(STATE_FILE, {
        ...state,
        data,
        updatedAt: Date.now(),
        sessionTotals,
        sessionStats,
        providerStats,
      })
      const dailySpent = moneyFine(data?.daily_spent_usd)
      const dailyBudget = moneyFine(data?.daily_budget_usd)
      await client.tui.showToast({
        body: {
          title: "PackyCodeCost",
          message: `${metricsLine}\n💰 本次：${moneyFine(delta)} | 当前会话：${moneyFine(sessionTotals[info.sessionID])}\n📆 今日已用：${dailySpent} / ${dailyBudget}`,
          variant: "info",
          duration: config.toastDuration,
        },
      })
    },
  }
}

export default PackyCodeCostPlugin

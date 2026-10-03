import { expect, test } from 'claude-code/testing'
import { AgyNarrator, AGY_TIMEOUT_MS, findBridgeServer, type Bridge } from '../hooks/agy'
import { findModel, type Ask } from '../hooks/director'

const ASK: Ask = { model: 'agy', system: 'Reply with scene JSON.', prompt: 'A test passed.', maxTokens: 2000, effort: 'low', timeoutMs: 30000 }
const reply = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: false })
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function world(statuses: unknown[] = []) {
  let now = 0
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const logs: string[] = []
  const bridge: Bridge = {
    now: () => now,
    log: message => { logs.push(message) },
    call: async (tool, args) => {
      calls.push({ tool, args })
      return reply(tool === 'start_task' ? { taskId: 'scene-task' } : tool === 'cancel_task' ? { cancelled: true } : statuses.shift())
    },
  }
  return { bridge, calls, logs, advance: (ms: number) => { now += ms } }
}

test('AGY selection accepts its explicit names', () => {
  expect(findModel('AGY')).toBe('agy')
  expect(findModel('agy-bridge')).toBe('agy')
  expect(findModel('claude-agy')).toBe(undefined)
})

test('bridge discovery recognizes standalone and plugin names without selecting unrelated tools', () => {
  expect(findBridgeServer([{ name: 'mcp__other__start_task' }])).toBe(undefined)
  expect(findBridgeServer([{ name: 'mcp__agy-bridge__start_task' }])).toBe('agy-bridge')
  expect(findBridgeServer([{ name: 'mcp__plugin_agy-bridge_agy-bridge__start_task' }])).toBe('plugin_agy-bridge_agy-bridge')
})

test('AGY waits through the queue and returns only the successful response', async () => {
  const w = world([{ status: 'queued' }, { status: 'running' }, { status: 'success', response: '{"caption":"Tests passed!"}' }])
  const narrator = new AgyNarrator()
  let answered = false
  const answer = narrator.complete(w.bridge, '/project', ASK).then(r => { answered = true; return r })
  await settle()
  expect(w.calls[0]?.args.workspace).toBe('/project')
  expect(w.calls[0]?.args.access).toBe('read')
  expect(w.calls[0]?.args.isolated).toBe(false)
  expect(String(w.calls[0]?.args.prompt)).toContain('Do not use tools')
  await narrator.poll()
  await narrator.poll()
  expect(answered).toBe(false)
  await narrator.poll()
  expect(await answer).toEqual({ isAnswered: true, text: '{"caption":"Tests passed!"}' })
  expect(w.logs.length).toBe(0)
})

test('failed and unsafe task results never become scenes', async () => {
  for (const status of ['error', 'needs_review', 'cancelled', 'success']) {
    const w = world([{ status, response: status === 'success' ? '' : 'untrusted answer' }])
    const narrator = new AgyNarrator()
    const answer = narrator.complete(w.bridge, '/project', ASK)
    await settle()
    await narrator.poll()
    expect((await answer).isAnswered).toBe(false)
    expect(w.logs[0]).toContain('No Claude fallback')
  }
})

test('timeout cancels the queued task and allows another scene', async () => {
  const w = world([{ status: 'success', response: '{}' }])
  const narrator = new AgyNarrator()
  const answer = narrator.complete(w.bridge, '/project', ASK)
  await settle()
  w.advance(AGY_TIMEOUT_MS)
  await narrator.poll()
  expect((await answer).isAnswered).toBe(false)
  expect(w.calls.some(c => c.tool === 'cancel_task')).toBe(true)
  const next = narrator.complete(w.bridge, '/project', ASK)
  await settle()
  await narrator.poll()
  expect((await next).isAnswered).toBe(true)
})

test('cancellation while start_task is in flight still cancels its eventual task ID', async () => {
  const w = world()
  let started!: (value: unknown) => void
  const call = w.bridge.call
  w.bridge.call = (tool, args) => tool === 'start_task' ? new Promise(resolve => { started = resolve }) : call(tool, args)
  const narrator = new AgyNarrator()
  const answer = narrator.complete(w.bridge, '/project', ASK)
  await settle()
  await narrator.cancel()
  started(reply({ taskId: 'late-task' }))
  expect((await answer).isAnswered).toBe(false)
  expect(w.calls[0]).toEqual({ tool: 'cancel_task', args: { task_id: 'late-task' } })
})

test('a disconnected MCP server reports failure and releases the narrator', async () => {
  const w = world()
  w.bridge.call = async () => { throw new Error('Server disconnected') }
  const narrator = new AgyNarrator()
  expect((await narrator.complete(w.bridge, '/project', ASK)).isAnswered).toBe(false)
  expect(w.logs[0]).toContain('Server disconnected')
  expect((await narrator.complete(w.bridge, '/project', ASK)).isAnswered).toBe(false)
})

import type { ModelCompleteResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SCENE = {
  backdrop: 'forest',
  hero: { action: 'walk', from: 5, to: 35 },
  props: [{ sprite: 'bug', x: 60, y: 'ground', motion: 'shake', label: 'parseHex' }],
  caption: 'And here we see the rare parseHex bug in its natural habitat.',
}
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const answer = (text: string): { value: ModelCompleteResult } => ({ value: { isAnswered: true, text, usage: USAGE } })

/** What the engine would answer beneath the plugin in a session. */
function world(on: On) {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  return clock
}

const BAND = {
  plugin: 'fables',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

test('activity becomes a scene drawn above the prompt on the desktop only', async ($, on) => {
  const clock = world(on)
  const asked: string[] = []
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return answer('```json\n' + JSON.stringify(SCENE) + '\n```')
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'look for bugs in effects.ts', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)

  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('look for bugs in effects.ts')

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(String((svg?.props as { source?: unknown } | undefined)?.source)).toContain('parseHex')
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBe(undefined)
  await terminal.unmount()
})

test('a garbage reply is skipped and the narrator backs off', async ($, on) => {
  const clock = world(on)
  let calls = 0
  on('model.complete', () => {
    calls++
    return answer('I would love to draw that! Here is a scene: {{{')
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'fix it', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)
  expect(calls).toBe(1)

  // More activity arrives, but the narrator waits out its backoff (10s after one failure).
  await $.prompt.submit({ text: 'and again', wait: false, origin: { kind: 'composer' } })
  await clock.advance(5000)
  expect(calls).toBe(1)
  await clock.advance(6000)
  expect(calls).toBe(2)

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBe(undefined)
  await desktop.unmount()
})

test('/fables off clears the stage and stops asking', async ($, on) => {
  const clock = world(on)
  let calls = 0
  on('model.complete', () => {
    calls++
    return answer(JSON.stringify(SCENE))
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)
  expect(calls).toBe(1)

  const ran = await $.command.run({ command: 'fables', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  expect(ran.text).toContain('off')
  await $.prompt.submit({ text: 'more', wait: false, origin: { kind: 'composer' } })
  await clock.advance(20000)
  expect(calls).toBe(1)

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBe(undefined)
  await desktop.unmount()
})

test('a style is chosen by name and draws the band, until it is turned off', async ($, on) => {
  const clock = world(on)
  const asked: string[] = []
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return answer(JSON.stringify(SCENE))
  })
  const run = (args: string) => $.command.run({ command: 'fables', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  const band = async () => {
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const svg = await desktop.find({ type: 'Svg' })
    await desktop.unmount()
    return String((svg?.props as { source?: unknown } | undefined)?.source)
  }

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  expect((await run('style')).text).toContain('ukiyoe')
  expect((await run('style Ukiyo-e')).text).toContain('Ukiyo-e')
  expect((await run('style nonsense')).text).toContain('No style')

  await $.prompt.submit({ text: 'tidy the README', wait: false, origin: { kind: 'composer' } })
  await clock.advance(1000)
  expect(asked[0]).toContain('woodblock')
  expect(await band()).toContain('data-look="ukiyoe"')

  expect((await run('style off')).text).toContain('default')
  expect(await band()).not.toContain('data-look')
})

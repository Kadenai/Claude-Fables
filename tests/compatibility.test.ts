import { expect, mock, test } from 'claude-code/testing'

// Exercise both sides of the hook chain; the real two-plugin Desktop protocol
// is checked separately with both published runtime modules.
for (const tier of ['prepend', 'append'] as const) {
  test('preserves the indicators with Fables on either side of the chain: ' + tier, {
    plugins: [{ name: 'kadenais-style', tier, register(on) {
      on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
        if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
        const { Box, Svg } = $.ui.resolve(e)
        return Box({ flexDirection: 'column', children: [await next(e), Svg({
          width: 200, height: 18,
          source: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="18"><text y="12">84.000 tokens</text></svg>',
          alt: 'Contexto: 84.000 tokens; 5h 23% (2h 14min)',
        })] })
      })
    } }],
  }, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', (_, e) => ({ value: { command: e.name } }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'native band' }))
    on('model.complete', () => ({ value: {
      isAnswered: true,
      text: '{"backdrop":"forest","hero":{"action":"walk","from":5,"to":35},"props":[],"caption":"Os dois mods aparecem juntos."}',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } }))
    await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
    await $.prompt.submit({ text: 'test composition', wait: false, origin: { kind: 'composer' } })
    await clock.advance(1000)
    const props = { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 12 }, view: {} }
    const ui = await $.ui.mount({ plugin: 'fables', component: 'AbovePrompt', surface: 'desktop', props })
    const drawings = await ui.findAll({ type: 'Svg' })
    expect(drawings.length).toBe(2)
    expect(drawings[0].props.isInteractive).toBe(true)
    expect(drawings[0].props.alt).toBe('Os dois mods aparecem juntos.')
    expect(drawings[1].props.alt).toContain('5h 23% (2h 14min)')
    expect(await ui.find({ type: 'Text', text: 'native band' })).toBeDefined()
    await $.command.run({ command: 'fables', args: 'off', origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 100 } })
    expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
    expect((await ui.find({ type: 'Svg' })).props.alt).toContain('84.000 tokens')
    await ui.unmount()
    const survey = await $.ui.mount({ plugin: 'fables', component: 'AbovePrompt', surface: 'desktop',
      props: { ...props, hasSurvey: true } })
    expect(await survey.find({ type: 'Svg' })).toBeUndefined()
    expect(await survey.find({ type: 'Text', text: 'native band' })).toBeDefined()
    await survey.unmount()
  })
}

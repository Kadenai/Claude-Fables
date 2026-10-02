/**
 * Whole sessions, played back by the viewer as if Claude were working: what
 * the person asked, each tool call and what came back, what Claude said in
 * between, and the scene the narrator draws at each moment. Times are seconds
 * from the prompt. The scenes are written the way the narrator is asked to
 * write them, without props: the rich stage tells the story in words; the viewer can also ask Claude for them live from the same
 * activity, through the mod's own prompt.
 */
export type Step =
  | { at: number; tool: string; input: Record<string, unknown>; out?: string; failed?: boolean }
  | { at: number; said: string }

export type Scenario = {
  id: string
  title: string
  repo: string
  ask: string
  steps: Step[]
  /** Scenes as the narrator would send them, each shown from `at`. */
  beats: { at: number; scene: unknown }[]
  /** When the turn completes; the closing scene follows a moment later. */
  end: number
  closing: unknown
}

const bash = (at: number, command: string, description: string, out?: string, failed?: boolean): Step => ({ at, tool: 'Bash', input: { command, description }, out, failed })
const read = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Read', input: { file_path }, out })
const edit = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Edit', input: { file_path }, out })
const write = (at: number, file_path: string, out?: string): Step => ({ at, tool: 'Write', input: { file_path }, out })

export const SCENARIOS: Scenario[] = [
  {
    id: 'leap',
    title: 'Fix a failing test',
    repo: 'calendar-kit · TypeScript',
    ask: 'The leap-year test in dates.test.ts started failing yesterday. Can you fix it?',
    steps: [
      bash(0.5, 'npm test', 'Run the test suite', '✗ parseDate › accepts Feb 29 on leap years\n  Expected 2024-02-29, received Invalid Date\n41 passed, 1 failed', true),
      read(4, 'tests/dates.test.ts', 'Read 88 lines'),
      { at: 7, tool: 'Grep', input: { pattern: 'daysInMonth' }, out: 'Found 3 files' },
      read(9.5, 'src/dates.ts', 'Read 142 lines'),
      { at: 13, said: "Found it: daysInMonth() hardcodes February at 28 days. Yesterday's refactor dropped its isLeapYear() check." },
      read(17, 'src/calendar.ts', 'Read 61 lines'),
      edit(21, 'src/dates.ts', 'Updated src/dates.ts with 4 additions and 1 removal'),
      bash(25, 'npm test', 'Run the test suite', '42 passed'),
      bash(28.5, 'npx tsc --noEmit', 'Typecheck the project', '(no output)'),
      { at: 31.5, said: 'Fixed: daysInMonth() asks isLeapYear() about February again, and all 42 tests pass.' },
    ],
    beats: [
      { at: 3.5, scene: { backdrop: 'lab', hero: { action: 'think', from: 10, to: 10 }, caption: 'One red test out of 42. Something has a grudge against February 29th.', tone: 'trouble', title: '1 failed' } },
      { at: 11.5, scene: { backdrop: 'forest', hero: { action: 'walk', from: 5, to: 32 }, caption: 'Tracking the leap-year bug through dates.ts. The prints lead to daysInMonth().' } },
      { at: 18.5, scene: { backdrop: 'desert', hero: { action: 'inspect', from: 10, to: 30 }, caption: 'February has 28 days, says the code. Every fourth year the calendar disagrees.' } },
      { at: 26, scene: { backdrop: 'lab', hero: { action: 'inspect', from: 15, to: 30 }, caption: 'isLeapYear() is wired back into February. Running all 42 tests again.' } },
    ],
    end: 33,
    closing: { backdrop: 'city', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'Leap day is back on the calendar! 42 of 42 green and the typecheck is clean.', tone: 'milestone', title: 'fixed' },
  },
  {
    id: 'dark',
    title: 'Add a feature',
    repo: 'studio-web · React',
    ask: 'Add a dark mode toggle to the settings page, and remember the choice.',
    steps: [
      { at: 0.5, tool: 'Glob', input: { pattern: 'src/**/*.tsx' }, out: 'Found 37 files' },
      read(3, 'src/pages/Settings.tsx', 'Read 120 lines'),
      read(5.5, 'src/theme/tokens.css', 'Read 64 lines'),
      { at: 8, said: 'The colors are already CSS variables, so dark mode is a second set of tokens and a switch that flips a data attribute.' },
      write(11, 'src/theme/useTheme.ts', 'Wrote 34 lines'),
      edit(15, 'src/theme/tokens.css', 'Updated with 28 additions'),
      edit(19, 'src/pages/Settings.tsx', 'Updated with 12 additions'),
      edit(22.5, 'src/App.tsx', 'Updated with 3 additions'),
      bash(26, 'npm run build', 'Build the app', '✓ built in 3.8s'),
      bash(29, 'npm test -- Settings', 'Run the settings tests', '6 passed'),
      { at: 32, said: 'Added a Dark mode switch under Appearance. It follows the system setting until you choose, then remembers it.' },
    ],
    beats: [
      { at: 3, scene: { backdrop: 'city', hero: { action: 'walk', from: 5, to: 30 }, caption: 'Touring 37 components to find where the settings page lives.' } },
      { at: 10.5, scene: { backdrop: 'night', hero: { action: 'think', from: 20, to: 20 }, caption: 'The colors are already variables. Dark mode is the same town, after sunset.' } },
      { at: 18, scene: { backdrop: 'lab', hero: { action: 'inspect', from: 10, to: 28 }, caption: 'Building useTheme: it listens to the system, then remembers your choice.' } },
      { at: 27, scene: { backdrop: 'night', hero: { action: 'walk', from: 5, to: 35 }, caption: 'Flipping the switch in App.tsx. Lights on, lights off, lights remembered.' } },
    ],
    end: 34,
    closing: { backdrop: 'night', hero: { action: 'celebrate', from: 15, to: 30 }, caption: 'Dark mode ships: Settings, Appearance, and it remembers you.', tone: 'milestone', title: 'shipped' },
  },
  {
    id: 'slow',
    title: 'Hunt a slow endpoint',
    repo: 'shopfront-api · Django',
    ask: 'The /api/orders endpoint got really slow this week. Find out why and fix it.',
    steps: [
      bash(0.5, 'curl -s -o /dev/null -w "%{time_total}" localhost:8000/api/orders', 'Time the orders endpoint', '2.41'),
      { at: 4, tool: 'Grep', input: { pattern: 'class OrderList' }, out: 'orders/views.py' },
      read(6, 'orders/views.py', 'Read 88 lines'),
      read(9, 'orders/serializers.py', 'Read 54 lines'),
      bash(12, 'python manage.py count_queries /api/orders', 'Count SQL queries for one request', '312 queries'),
      { at: 16, said: "It's an N+1: the serializer loads every order's customer and line items one query at a time. 312 queries for 100 orders." },
      edit(21, 'orders/views.py', "Updated with select_related('customer').prefetch_related('items')"),
      bash(24, 'python manage.py count_queries /api/orders', 'Count SQL queries again', '3 queries'),
      bash(27, 'curl -s -o /dev/null -w "%{time_total}" localhost:8000/api/orders', 'Time the endpoint again', '0.18'),
      bash(30, 'pytest orders', 'Run the orders tests', '18 passed'),
      { at: 33, said: 'Fixed the N+1 in OrderList: 312 queries down to 3, and the endpoint from 2.4s to 0.18s.' },
    ],
    beats: [
      { at: 3.5, scene: { backdrop: 'desert', hero: { action: 'walk', from: 5, to: 30 }, caption: '2.41 seconds to cross /api/orders. Something is weighing down the caravan.' } },
      { at: 11, scene: { backdrop: 'space', hero: { action: 'walk', from: 10, to: 35 }, caption: 'Moonwalking through serializers.py, looking for the crater that eats time.' } },
      { at: 19, scene: { backdrop: 'volcano', hero: { action: 'dig', from: 10, to: 22 }, caption: 'Found it: 312 queries erupting for 100 orders. A classic N+1.', title: 'N+1' } },
      { at: 28, scene: { backdrop: 'space', hero: { action: 'fly', from: 15, to: 35 }, caption: 'select_related and a prefetch: 312 queries down to 3. Liftoff.', tone: 'milestone' } },
    ],
    end: 35,
    closing: { backdrop: 'space', hero: { action: 'celebrate', from: 15, to: 30 }, caption: 'From 2.41s to 0.18s. Orders now arrive at roughly the speed of light.', tone: 'milestone', title: '13x' },
  },
  {
    id: 'ci',
    title: 'Get CI green',
    repo: 'design-tokens · Node',
    ask: 'CI went red after I bumped eslint to v9. Can you get it green again?',
    steps: [
      bash(0.5, 'npm run lint', 'Run the linter', "ESLint couldn't find an eslint.config.(js|mjs|cjs) file.", true),
      read(3.5, '.eslintrc.json', 'Read 31 lines'),
      { at: 6, tool: 'WebSearch', input: { query: 'eslint 9 migrate eslintrc to flat config' }, out: 'eslint.org/docs/latest/use/configure/migration-guide' },
      { at: 9, said: 'ESLint 9 no longer reads .eslintrc; it wants a flat eslint.config.js. I will port the config over.' },
      write(13, 'eslint.config.js', 'Wrote 42 lines'),
      bash(16, 'npm run lint', 'Run the linter', "TypeError: Key \"plugins\": Expected an object, plugin 'react-hooks' is not flat-config ready", true),
      bash(19.5, 'npm i -D eslint-plugin-react-hooks@5', 'Upgrade the react-hooks plugin', 'added 1 package, changed 1 package'),
      bash(23, 'npm run lint', 'Run the linter', '✓ 0 problems'),
      bash(26, 'git rm .eslintrc.json', 'Remove the old eslintrc', "rm '.eslintrc.json'"),
      bash(28, 'npm test', 'Run the test suite', '128 passed'),
      { at: 31, said: 'Lint is green: the config is now a flat eslint.config.js, and eslint-plugin-react-hooks is on v5 for ESLint 9.' },
    ],
    beats: [
      { at: 3, scene: { backdrop: 'volcano', hero: { action: 'run', from: 40, to: 10 }, caption: "CI erupted the moment eslint 9 landed. It can't even find its config.", tone: 'trouble', title: 'red' } },
      { at: 11, scene: { backdrop: 'night', hero: { action: 'inspect', from: 10, to: 28 }, caption: 'Reading the migration guide by moonlight: .eslintrc is history, flat config is in.' } },
      { at: 18.5, scene: { backdrop: 'volcano', hero: { action: 'dig', from: 10, to: 22 }, caption: "Second eruption: react-hooks isn't flat-config ready. Digging for v5.", tone: 'trouble' } },
      { at: 25, scene: { backdrop: 'lab', hero: { action: 'think', from: 15, to: 15 }, caption: '0 problems. Running the 128 tests before calling it green.' } },
    ],
    end: 33,
    closing: { backdrop: 'forest', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'CI is green again: eslint 9, a flat config and 128 passing tests.', tone: 'milestone', title: 'green' },
  },
  {
    id: 'auth',
    title: 'Refactor a module',
    repo: 'notes-server · TypeScript',
    ask: 'Move all the auth code into its own module, src/auth, without changing behaviour.',
    steps: [
      { at: 0.5, tool: 'Agent', input: { description: 'Find every place that touches sessions or tokens' }, out: 'Found 9 files across api/, middleware/ and utils/' },
      { at: 6, said: "Auth is spread over 9 files. I'll gather it into src/auth: session.ts, tokens.ts and guard.ts." },
      write(9, 'src/auth/session.ts', 'Wrote 58 lines'),
      write(11, 'src/auth/tokens.ts', 'Wrote 41 lines'),
      write(13, 'src/auth/guard.ts', 'Wrote 27 lines'),
      edit(15.5, 'src/api/login.ts', 'Updated with 2 additions and 19 removals'),
      edit(17, 'src/api/logout.ts', 'Updated with 1 addition and 8 removals'),
      edit(18.5, 'src/middleware/requireUser.ts', 'Updated with 2 additions and 24 removals'),
      bash(20, 'git rm src/utils/jwt.ts', 'Delete the old jwt helper', "rm 'src/utils/jwt.ts'"),
      edit(22, 'src/server.ts', 'Updated with 1 addition and 1 removal'),
      bash(24, 'npx tsc --noEmit', 'Typecheck the project', "src/api/refresh.ts(4,10): error TS2307: Cannot find module '../utils/jwt'", true),
      edit(27, 'src/api/refresh.ts', 'Updated with 1 addition and 1 removal'),
      bash(29, 'npx tsc --noEmit', 'Typecheck the project', '(no output)'),
      bash(31, 'npm test', 'Run the test suite', '96 passed'),
      { at: 34, said: 'Auth now lives in src/auth (session, tokens, guard). 9 files updated with no behaviour change; types check and all 96 tests pass.' },
    ],
    beats: [
      { at: 4.5, scene: { backdrop: 'forest', hero: { action: 'walk', from: 5, to: 30 }, caption: 'A scout reports back: auth is scattered across 9 files. Time to gather it.' } },
      { at: 12, scene: { backdrop: 'lab', hero: { action: 'inspect', from: 10, to: 28 }, caption: 'Three new modules on the bench: session, tokens and guard.' } },
      { at: 20, scene: { backdrop: 'city', hero: { action: 'run', from: 5, to: 35 }, caption: 'Moving login, logout and the middleware onto the new line. All aboard src/auth.' } },
      { at: 26, scene: { backdrop: 'night', hero: { action: 'think', from: 20, to: 20 }, caption: 'One straggler: refresh.ts still asks for the jwt helper I just retired.', tone: 'trouble' } },
    ],
    end: 36,
    closing: { backdrop: 'forest', hero: { action: 'celebrate', from: 10, to: 30 }, caption: 'Auth has a home now. Same behaviour, a cleaner map, 96 tests green.', tone: 'milestone', title: 'refactored' },
  },
]

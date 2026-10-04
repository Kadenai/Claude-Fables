import type { ClientSurface } from 'claude-code'

type Menu = { open: boolean; x: number; y: number }

/** A transparent input layer; the SVG keeps its own animation clock underneath. */
export default function Controls(_: unknown, surface: ClientSurface<Menu>) {
  const { Box, Button } = surface.elements
  const menu = surface.state ?? { open: false, x: 0, y: 0 }
  surface.onPointer(e => {
    if (e.type !== 'down') return
    if (e.button === 'right') {
      surface.setState({ open: true, x: Math.max(0, Math.min(e.x, surface.columns - 24)), y: Math.max(0, Math.min(e.y, surface.rows - 4)) })
    } else if (e.button === 'left' && menu.open && (e.x < menu.x || e.x >= menu.x + 24 || e.y < menu.y || e.y >= menu.y + 4)) {
      surface.setState({ ...menu, open: false })
    }
  })
  return Box({ width: '100%', height: '100%', children: menu.open ? [
    Box({ position: 'absolute', left: menu.x, top: menu.y, width: 24, flexDirection: 'column', backgroundColor: '#ffffff', borderStyle: 'round', borderColor: '#777777', children: [
      Button({ key: 'hide-fables', label: 'Ocultar animação', onPress: () => surface.post({ action: 'hide' }) }),
      Button({ key: 'close-menu', label: 'Fechar menu', onPress: () => surface.setState({ ...menu, open: false }) }),
    ] }),
  ] : [] })
}

/**
 * A painter for a style drawn as an artwork, built from the style's rules:
 * which ink each family takes, how shapes are outlined, which roles are
 * redrawn outright. Everything not redrawn is repainted from the lit
 * painting: its blooms and lens effects removed, its colors and gradients
 * carried into the style's inks, its shapes given the style's line.
 */
import { dropBlooms, type Gradient, gradients, opacities, type PaintAttr, repaint, stripLight } from './ink'
import { type Family, type Meta, type Painter, type Role, ROLES } from './roles'

export type Ctx = {
  role: Role
  family: Family
  depth: number
  meta: Meta
  /** The element repainted by the style's general rules. */
  repaint: (svg: string) => string
  /** The element's own animation (a drift, a flicker), to keep on whatever replaces it. */
  motion: (svg: string) => string
}

export type Rules = {
  /** The ink for a lit color, in an element of the given family at the given depth. */
  ink: (color: string, family: Family, depth: number, attr: PaintAttr) => string
  /** A group's attributes giving its shapes the style's line ('' for none). */
  line?: (family: Family, depth: number) => string
  /** How the lit painting's opacities carry over, by family. */
  opacity?: (family: Family, v: number) => number
  /** Washes fainter than this get no line (rims, glints, glazes). */
  lineless?: number
  /** What becomes of those faint washes: kept unlined (the default), or left out, as a drawing would. */
  faint?: 'unlined' | 'hide'
  /** A gradient or pattern fill in the style's terms; absent, the gradient is carried over in the style's inks. */
  url?: (id: string, family: Family, attr: PaintAttr) => string | undefined
  /** Roles or whole families drawn the style's own way. */
  redraw?: Partial<Record<Role | Family, (svg: string, c: Ctx) => string>>
  /** Ink for the shapes of the lit painting's templates (firs, clumps, ferns), drawn once in definitions. */
  templateFamily?: Family
}

const ANIM = /<(animate|animateTransform|animateMotion)\b[^>]*\/>/g

export function painter(rules: Rules, suffix: string): Painter {
  const known = new Map<string, Gradient>()
  const made = new Set<string>()

  const remapGradient = (id: string, family: Family, depth: number): string | undefined => {
    const g = known.get(id)
    if (!g) return undefined
    const nid = `${id}-${suffix}-${family}`
    if (made.has(nid)) return `url(#${nid})`
    made.add(nid)
    const stops = g.stops
      .map(s => `<stop offset="${s.offset}" stop-color="${rules.ink(s.color, family, depth, 'stop-color')}"${s.opacity < 1 ? ` stop-opacity="${+(rules.opacity?.(family, s.opacity) ?? s.opacity).toFixed(3)}"` : ''}/>`)
      .join('')
    pending += `<${g.tag} id="${nid}" ${g.attrs}>${stops}</${g.tag}>`
    return `url(#${nid})`
  }
  let pending = ''

  const general = (svg: string, family: Family, depth: number) => {
    for (const [id, g] of gradients(svg)) known.set(id, g)
    let out = stripLight(dropBlooms(svg))
    out = repaint(out, {
      ink: (color, attr) => rules.ink(color, family, depth, attr),
      url: (id, attr) => (attr === 'stop-color' ? undefined : (rules.url?.(id, family, attr) ?? remapGradient(id, family, depth))),
    })
    if (rules.opacity) out = opacities(out, v => rules.opacity?.(family, v) ?? v)
    const line = rules.line?.(family, depth) ?? ''
    if (line) {
      // Faint washes take no line: a rim of light or a glaze is not a shape of its own.
      const lim = rules.lineless ?? 0.6
      out = out.replace(/<(path|rect|circle|ellipse|use)\b([^>]*?)(\/?)>/g, (all, tag: string, attrs: string, close: string) => {
        const op = /\sopacity="([\d.]+)"/.exec(attrs)
        if (/\sstroke=/.test(attrs) || !op || Number(op[1]) >= lim) return all
        return rules.faint === 'hide' ? `<${tag}${attrs} visibility="hidden"${close}>` : `<${tag}${attrs} stroke="none"${close}>`
      })
      out = `<g ${line}>${out}</g>`
    }
    const defs = pending
    pending = ''
    return (defs ? `<defs>${defs}</defs>` : '') + out
  }

  return {
    el(role, svg, meta = {}) {
      const info = ROLES[role]
      const c: Ctx = {
        role,
        family: info.family,
        depth: info.depth,
        meta,
        repaint: s => general(s, info.family, info.depth),
        motion: s => (s.match(ANIM) ?? []).join(''),
      }
      const own = rules.redraw?.[role] ?? rules.redraw?.[info.family]
      if (own) {
        // Gradients the element defines are still known to later elements.
        for (const [id, g] of gradients(svg)) known.set(id, g)
        const out = own(svg, c)
        const defs = pending
        pending = ''
        return (defs ? `<defs>${defs}</defs>` : '') + out
      }
      return general(svg, info.family, info.depth)
    },
    defs(svg) {
      for (const [id, g] of gradients(svg)) known.set(id, g)
      // The lit look's materials and blurs are not drawn here; its gradients are carried
      // over as each element uses them; its templates take the style's inks.
      // A gradient a mask or pattern in the same definitions uses stays, as the lit look drew it.
      const noFilters = svg.replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/g, '')
      const kept = noFilters.replace(/<(linearGradient|radialGradient)\b[^>]*?id="([^"]+)"[\s\S]*?<\/\1>/g, (all, _t, id: string) =>
        noFilters.includes(`url(#${id})`) ? all : '',
      )
      const fam = rules.templateFamily ?? 'foliage'
      // Masks and clips are shapes of coverage, not paint: they keep their values.
      const held: string[] = []
      const shielded = kept.replace(/<(mask|clipPath|linearGradient|radialGradient)\b[\s\S]*?<\/\1>/g, m => `\u0000${held.push(stripLight(m)) - 1}\u0000`)
      return repaint(shielded, { ink: (color, attr) => rules.ink(color, fam, 0.5, attr) }).replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? '')
    },
  }
}

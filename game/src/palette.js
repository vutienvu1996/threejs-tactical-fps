// Emberline: the look plan, in one place. A dusk foundry yard: cold slate and steel
// against molten amber, with teal marking the defending team. The same names are
// the CSS custom properties in index.html, so the page and the scene agree.
export const PALETTE = {
  canvas: '#101318',
  surface: '#1a1e26',
  hairline: '#2b313d',
  ink: '#ece7db',
  muted: '#8f99a8',
  accent: '#f5a524',
  ember: '#ff6b2c',
  teal: '#3ec6b8',
  danger: '#e5484d',
  floor: '#2e333e',
  wall: '#3a4252',
  wallDark: '#303743',
  crate: '#57493a',
  container: '#40606e',
  containerB: '#6e4a42',
};

export function hex(name) {
  return PALETTE[name];
}

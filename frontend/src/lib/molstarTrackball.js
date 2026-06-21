export function trackballAnimateForLenses(activeLenses = [], spinEnabled = false) {
  void activeLenses;
  return spinEnabled
    ? { name: "spin", params: { speed: 0.18, axis: [0, -1, 0] } }
    : { name: "off", params: {} };
}

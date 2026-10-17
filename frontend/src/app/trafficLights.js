export const TRAFFIC_LIGHT_COLORS = ["red", "yellow", "green", "lilac"];

export function trafficLightLabel(color) {
  return { red: "Rojo", yellow: "Amarillo", green: "Verde", lilac: "Lila · Excelente" }[color] || "Rojo";
}

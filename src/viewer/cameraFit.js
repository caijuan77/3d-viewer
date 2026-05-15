export function calculateCameraFit({ diameter, fov }) {
  const safeDiameter = Math.max(diameter, 0.01);
  const distance = (safeDiameter / 2) / Math.tan(fov * Math.PI / 360) * 1.6;

  return {
    distance,
    near: Math.max(0.01, safeDiameter / 10000),
    far: Math.max(1000, distance + safeDiameter * 3),
  };
}

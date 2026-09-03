export function hasRequiredServices(output, requiredServices) {
  const running = new Set(String(output).split(/\r?\n/u).map((item) => item.trim()).filter(Boolean));
  return requiredServices.every((service) => running.has(service));
}

/** Keep the web and native start flows on the same presets and resume bounds. */
export function sessionDurationChoices(planned: number, elapsed: number) {
  const minimum = Math.min(600, Math.floor(elapsed / 60) + 1);
  const options = minimum > 90 ? [10, 30, 60, 90, Math.max(minimum, Math.min(600, planned))] : [10, 30, 60, 90];
  const selected = options.find(value => value >= Math.max(minimum, planned)) ?? options[options.length - 1];
  return { minimum, options, selected };
}

/** Validate portable decoded baseline weapon data. Binary game formats are imported by applications. */
export function validateTouhouShots(data) {
  if (!['ts-stg-touhou-shots', 'ts-stg-th20-sht'].includes(data?.format)) throw new TypeError('TouhouPlayer requires decoded Touhou shot data');
  if (!Array.isArray(data.speeds) || data.speeds.length !== 4 || !data.speeds.every(Number.isFinite)) throw new TypeError('Touhou shot data requires four finite movement speeds');
  if (!Array.isArray(data.patterns) || data.patterns.length < 15 || !data.patterns.slice(0, 15).every(Array.isArray)) throw new TypeError('Touhou shot data requires baseline patterns 0 through 14');
  if (!data.offsets?.[0]?.normal || !data.offsets?.[0]?.focus || !data.optionScripts?.length || !data.fullPowerScripts?.length) throw new TypeError('Touhou shot data requires option offsets and animation scripts');
  return data;
}

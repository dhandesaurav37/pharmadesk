/**
 * Formula-injection-safe CSV cell serializer.
 * Neutralizes spreadsheet formulas (=, +, -, @, leading tab/CR) unless the value is a plain finite numeric literal.
 */
export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  const trimmed = str.trim();
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(trimmed);

  const safeStr =
    !isPlainNumber && /^[\t\r ]*[=+\-@]/.test(str)
      ? `'${str}`
      : str;

  if (/[",\n\r]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

/** Serial numbers are compared without case or spaces (PRD F5). */
export function serialKey(serial: string): string {
  return serial.replace(/\s+/g, "").toUpperCase();
}

/** A model is unique by manufacturer + model, compared lower-case and trimmed. */
export function modelKey(manufacturer: string, model: string): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return `${norm(manufacturer)}|${norm(model)}`;
}

/** Hospital tags compared the same way as serial numbers. */
export function tagKey(tag: string): string {
  return serialKey(tag);
}

export function breakdownNumber(n: number): string {
  return `BD-${String(n).padStart(4, "0")}`;
}

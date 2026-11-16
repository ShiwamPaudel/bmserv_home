// Phone numbers are stored as "+977 9812345678": country code, space, the number as typed.
// The default country code is a setting (Nepal, +977). WhatsApp links use wa.me (no API).

export const countryCodes = [
  { code: "+977", name: "Nepal" },
  { code: "+91", name: "India" },
  { code: "+880", name: "Bangladesh" },
  { code: "+975", name: "Bhutan" },
  { code: "+86", name: "China" },
  { code: "+94", name: "Sri Lanka" },
  { code: "+960", name: "Maldives" },
  { code: "+92", name: "Pakistan" },
  { code: "+971", name: "United Arab Emirates" },
  { code: "+974", name: "Qatar" },
  { code: "+966", name: "Saudi Arabia" },
  { code: "+65", name: "Singapore" },
  { code: "+60", name: "Malaysia" },
  { code: "+66", name: "Thailand" },
  { code: "+81", name: "Japan" },
  { code: "+82", name: "South Korea" },
  { code: "+61", name: "Australia" },
  { code: "+44", name: "United Kingdom" },
  { code: "+49", name: "Germany" },
  { code: "+1", name: "USA and Canada" },
] as const;

export const DEFAULT_COUNTRY_CODE = "+977";

const codeRe = /^\+\d{1,4}$/;
export function isCountryCode(v: string): boolean {
  return codeRe.test(v.trim());
}

/** Splits a stored phone into country code and number. Old values without a code get `defaultCode`. */
export function splitPhone(value: string | null | undefined, defaultCode = DEFAULT_COUNTRY_CODE): { code: string; number: string } {
  const v = (value ?? "").trim();
  const m = /^(\+\d{1,4})[\s-]+(.*)$/.exec(v);
  if (m) return { code: m[1] as string, number: (m[2] as string).trim() };
  if (v.startsWith("+")) {
    // "+9779812345678" without a space: match the longest known code.
    const known = [...countryCodes].sort((a, b) => b.code.length - a.code.length).find((c) => v.startsWith(c.code));
    if (known) return { code: known.code, number: v.slice(known.code.length).trim() };
  }
  return { code: defaultCode, number: v };
}

export function joinPhone(code: string, number: string): string {
  const n = number.trim();
  if (!n) return "";
  return `${code.trim() || DEFAULT_COUNTRY_CODE} ${n}`;
}

/** Digits WhatsApp needs: country code + national number, no "+", spaces or leading zero. */
export function whatsAppNumber(value: string | null | undefined, defaultCode = DEFAULT_COUNTRY_CODE): string | null {
  const { code, number } = splitPhone(value, defaultCode);
  const national = number.replace(/\D/g, "").replace(/^0+/, "");
  if (national.length < 6) return null;
  return code.replace(/\D/g, "") + national;
}

/** https://wa.me/<number>?text=… opens WhatsApp (app or web) with the message ready to send. */
export function whatsAppLink(value: string | null | undefined, text: string, defaultCode = DEFAULT_COUNTRY_CODE): string | null {
  const n = whatsAppNumber(value, defaultCode);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

/** tel: link target for a stored phone. */
export function telHref(value: string, defaultCode = DEFAULT_COUNTRY_CODE): string {
  const { code, number } = splitPhone(value, defaultCode);
  return `tel:${code}${number.replace(/[^\d]/g, "").replace(/^0+/, "")}`;
}

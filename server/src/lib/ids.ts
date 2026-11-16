import { customAlphabet, nanoid } from "nanoid";

/** Text ids for our tables. */
export function newId(): string {
  return nanoid(16);
}

// QR codes: no 0/O, 1/I/l so a code can be read aloud or typed if a label is damaged.
const qrAlphabet = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz", 10);

export function newQrCode(): string {
  return qrAlphabet();
}

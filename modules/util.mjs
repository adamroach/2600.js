
// Converts an 8-bit unsigned integer to its signed equivalent
export function signed8(x) {
  x &= 0xff;
  if (x > 127) {
    return x-256;
  }
  return x;
}

export function unsigned8(x) {
  if (x < 0) {
    return (x+256) & 0xff;
  }
  return x & 0xff;
}

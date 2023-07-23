export class Rom {
  // Takes anything that can be converted to a Uint8Array
  constructor(memory) {
    this.memory = new Uint8Array(memory);
  }

  read(address) {
    return this.memory[address % this.memory.length];
  }

  write(address, value) {
    // No op: writing to ROM changes nothing
  }

  get length() {
    return this.memory.length
  }
}

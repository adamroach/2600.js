export class Ram {
  constructor(size) {
    this.memory = new Uint8Array(size);
  }

  read(address) {
    if (address > this.memory.length) {
      throw new Error("RAM address out of range: " +
        address + " > " + this.memory.length);
    }
    return this.memory[address];
  }

  write(address, value) {
    if (address > this.memory.length) {
      throw new Error("RAM address out of range: " +
        address + " > " + this.memory.length);
    }
    return this.memory[address];
  }
}

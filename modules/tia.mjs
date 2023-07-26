import {signed8, unsigned8} from "./util.mjs"

const cyclesPerLine = 228;
const linesPerFrame = 262;
const visibleLines = 200;
const visibleWidth = 160;

export class Tia {
  constructor(screen) {
    this.screen = screen;

    this.clock = 0; // X position
    this.line = 0;  // Y position
    this.writeRegisters = new Uint8Array(64);
    this.readRegisters = new Uint8Array(64);
    this.raster = new Uint8Array(visibleWidth);

    // These track the points on the rasterline to be updated
    this.startClock = 0;
    this.endClock = 0;

    // Sprite positions
    this.p0x = 0;
    this.p1x = 0;
    this.m0x = 0;
    this.m1x = 0;
    this.bx = 0;

    // Total width from low three bits of NUSIZ0 and NUSIZ1
    this.size = [8,24,40,40,72,16,72,32];

    // map for player bitmaps
    this.playerMap =
      [[[0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01], /* one copy */
        [0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,  /* two, close */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01],
        [0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,  /* two, medium */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01],
        [0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,  /* three, close */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01],
        [0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,  /* two, far */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01],
        [0x80,0x80,0x40,0x40,0x20,0x20,0x10,0x10,  /* double width */
         0x08,0x08,0x04,0x04,0x02,0x02,0x01,0x01],
        [0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,  /* three, medium */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x80,0x40,0x20,0x10,0x08,0x04,0x02,0x01],
        [0x80,0x80,0x80,0x80,0x40,0x40,0x40,0x40,  /* quad width */
         0x20,0x20,0x20,0x20,0x10,0x10,0x10,0x10,
         0x08,0x08,0x08,0x08,0x04,0x04,0x04,0x04,
         0x02,0x02,0x02,0x02,0x01,0x01,0x01,0x01]],

         /* mirrored */
       [[0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80], /* one copy */
        [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,  /* two, close */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80],
        [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,  /* two, medium */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80],
        [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,  /* three, close */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80],
        [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,  /* two, far */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80],
        [0x01,0x01,0x02,0x02,0x04,0x04,0x08,0x08,  /* double width */
         0x10,0x10,0x20,0x20,0x40,0x40,0x80,0x80],
        [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,  /* three, medium */
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
         0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80],
        [0x01,0x01,0x01,0x01,0x02,0x02,0x02,0x02,  /* quad width */
         0x04,0x04,0x04,0x04,0x08,0x08,0x08,0x08,
         0x10,0x10,0x10,0x10,0x20,0x20,0x20,0x20,
         0x40,0x40,0x40,0x40,0x80,0x80,0x80,0x80]]];

    // Map for the playing field (bit order is bonkers)
    this.fieldMap =
      [[0x00100000,0x00200000,0x00400000,0x00800000, /* non-mirrored */
        0x00008000,0x00004000,0x00002000,0x00001000,
        0x00000800,0x00000400,0x00000200,0x00000100,
        0x00000001,0x00000002,0x00000004,0x00000008,
        0x00000010,0x00000020,0x00000040,0x00000080,
        0x00100000,0x00200000,0x00400000,0x00800000,
        0x00008000,0x00004000,0x00002000,0x00001000,
        0x00000800,0x00000400,0x00000200,0x00000100,
        0x00000001,0x00000002,0x00000004,0x00000008,
        0x00000010,0x00000020,0x00000040,0x00000080],
       [0x00100000,0x00200000,0x00400000,0x00800000, /* mirrored */
        0x00008000,0x00004000,0x00002000,0x00001000,
        0x00000800,0x00000400,0x00000200,0x00000100,
        0x00000001,0x00000002,0x00000004,0x00000008,
        0x00000010,0x00000020,0x00000040,0x00000080,
        0x00000080,0x00000040,0x00000020,0x00000010,
        0x00000008,0x00000004,0x00000002,0x00000001,
        0x00000100,0x00000200,0x00000400,0x00000800,
        0x00001000,0x00002000,0x00004000,0x00008000,
        0x00800000,0x00400000,0x00200000,0x00100000]];
  }

  read(address) {
    this.draw();
    return this.readRegisters[address];
  }

  write(address, value) {
    this.draw();
    this.writeRegisters[address] = value
    switch (address) {
      // Sprite positioning registers (value is ignored)
      case RESP0: this.p0x = this.clock; break;
      case RESP1: this.p1x = this.clock; break;
      case RESM0: this.m0x = this.clock; break;
      case RESM1: this.m1x = this.clock; break;
      case RESBL: this.bx = this.clock; break;

      // Clear collision registers
      case CXCLR:
        this.CXM0P = 0;
        this.CXM1P = 0;
        this.CXP0FB = 0;
        this.CXP1FB = 0;
        this.CXM0FB = 0;
        this.CXM1FB = 0;
        this.CXBLPF = 0;
        this.CXPPMM = 0;
        break;
    }
  }

  missile(x, color, size, active) {
    let line = new Uint8Array(visibleWidth);
    if (!(active & 0x02)) {
      return line;
    }
    let width = 1 << (size & 0x03);
    color = color | 0x01;

    let start = x;
    let end = x + width;

    if (this.startClock > end || this.endClock < start) return line;
    if (this.startClock > start) start = this.startClock;
    if (this.endClock < end) end = this.endClock;
    for (let i = start; i < end; i++) {
      line[i] = color;
    }
    return line;
  }

  player(x, color, size, mirror, bitmap) {
    let line = new Uint8Array(visibleWidth);
    if (bitmap == 0) {
      return line;
    }

    let width = this.size[size];
    color = color | 0x01;
    mirror = (mirror&0x08)?1:0;
    if (x >= visibleWidth) {
      x -= cyclesPerLine;
    }

    let start = x;
    let end = x + width;
    if (this.startClock > end || this.endClock < start) return line;
    if (this.startClock > start) start = this.startClock;
    if (this.endClock < end) end = this.endClock;

    for (let i = start; i < end; i++) {
      if (bitmap & this.playerMap[mirror][size][i-x]) {
        line[i] = color;
      }
    }
    return line;
  }

  field() {
    let mirror = this.CTRLPF & 0x01;
    let color = this.COLUPF | 0x01;
    let buffer = new ArrayBuffer(visibleWidth)
    let line = new Uint8Array(buffer);
    let line32 = new Uint32Array(buffer);
    let pattern = (this.PF0 << 16) | (this.PF0 << 8) | this.pf2;
    let end = Math.floor(this.endClock / 4);
    let fg;

    // Scoreboard mode
    if (this.CTRLPF & 0x02){
      if (this.startClock < visibleWidth / 2) {
        fg = (this.COLUP0 << 24) || (this.COLUP0 << 16) || (this.COLUP0 << 8) || this.COLUP0;
      } else {
        fg = (this.COLUP1 << 24) || (this.COLUP1 << 16) || (this.COLUP1 << 8) || this.COLUP1;
      }
      for (let i = this.startClock * 4; i < end; i++){
        if (i == 20) {
          fg = (this.COLUP1 << 24) || (this.COLUP1 << 16) || (this.COLUP1 << 8) || this.COLUP1;
        }
        if(pattern & field[mirror][i]) {
          line32[i] = fg;
        }
      }
    } else {
      fg = (this.COLUPF << 24) || (this.COLUPF << 16) || (this.COLUPF << 8) || this.COLUPF;
      for (let i = this.startClock * 4; i < end; i++){
        if(pattern & this.fieldMap[mirror][i]) {
          line32[i] = fg;
        }
      }
    }
    return line;
  }

  draw() {
    this.endClock = this.clock;
    if (this.endClock > visibleWidth) {
      this.endClock = visibleWidth;
    }
    // In the returned arrays, we set the (normally unused) bit 0 to
    // indicate whether a pixel is set; basically, it's a one-bit
    // alpha channel, which can be used in combining lines and
    // in detecting collisions.
    let pf = this.field();
    let bl = this.missile(this.bx, this.COLUPF, this.CTRLPF>>>4, this.ENABL);
    let p1 = this.player(this.p1x, this.COLUP1, this.NUSIZ1 & 0x07, this.REFP1, this.GRP1);
    let m1 = this.missile(this.m1x, this.COLUP1, this.NUSIZ1>>>4, this.ENAM1);
    let p0 = this.player(this.p0x, this.COLUP0, this.NUSIZ0 & 0x07, this.REFP0, this.GRP0);
    let m0 = this.missile(this.m0x, this.COLUP0, this.NUSIZ0>>>4, this.ENAM0);

    for (let i = this.startClock; i < this.endClock; i++) {
      this.raster[i] = this.COLUBK;
    }
    if (!(this.CTRLPF & 0x04)) {
      this.mergeLine(pf);
      this.mergeLine(bl);
    }
    this.mergeLine(p1);
    this.mergeLine(m1);
    this.mergeLine(p0);
    this.mergeLine(m0);
    if (this.CTRLPF & 0x04) {
      this.mergeLine(pf);
      this.mergeLine(bl);
    }

    this.checkCollision(m0, p1, CXM0P, 7);
    this.checkCollision(m0, p0, CXM0P, 6);
    this.checkCollision(m1, p1, CXM1P, 7);
    this.checkCollision(m1, p0, CXM1P, 6);
    this.checkCollision(p0, pf, CXP0FB, 7);
    this.checkCollision(p0, bl, CXP0FB, 6);
    this.checkCollision(p1, pf, CXP1FB, 7);
    this.checkCollision(p1, bl, CXP1FB, 6);
    this.checkCollision(m0, pf, CXM0FB, 7);
    this.checkCollision(m0, bl, CXM0FB, 6);
    this.checkCollision(m1, pf, CXM1FB, 7);
    this.checkCollision(m1, bl, CXM1FB, 6);
    this.checkCollision(bl, pf, CXBLPF, 7);
    this.checkCollision(p0, p1, CXPPMM, 7);
    this.checkCollision(m0, m1, CXPPMM, 6);

    this.startClock = this.clock;
  }

  checkCollision(o1, o2, register, bit) {
    for (let i = this.startClock; i < this.endClock; i++) {
      if (o1[i] & o2[i] & 0x01) {
        this.readRegisters[register] |= (1 << bit);
        return;
      }
    }
  }

  mergeLine(line) {
    for (let i = this.startClock; i < this.endClock; i++) {
      if (line[i] & 0x01) {
        this.raster[i] = line[i] >>> 1;
      }
    }
  }

  tick() {
    let reset = false;
    this.clock++;
    if (this.clock == cyclesPerLine) {
      this.draw();
      if (this.screen) {
        this.screen.draw(this.line, this.raster);
      }
      this.line++;
      this.clock = 0;
    }
    if (this.line > linesPerFrame) {
      this.line = 0;
      reset = true;
    }
    return(reset);
  }

  get VSYNC() { return this.writeRegisters[VSYNC]; }
  set VSYNC(v) { this.writeRegisters[VSYNC] = v; }
  get VBLANK() { return this.writeRegisters[VBLANK]; }
  set VBLANK(v) { this.writeRegisters[VBLANK] = v; }
  get NUSIZ0() { return this.writeRegisters[NUSIZ0]; }
  set NUSIZ0(v) { this.writeRegisters[NUSIZ0] = v; }
  get NUSIZ1() { return this.writeRegisters[NUSIZ1]; }
  set NUSIZ1(v) { this.writeRegisters[NUSIZ1] = v; }
  get COLUP0() { return this.writeRegisters[COLUP0]; }
  set COLUP0(v) { this.writeRegisters[COLUP0] = v; }
  get COLUP1() { return this.writeRegisters[COLUP1]; }
  set COLUP1(v) { this.writeRegisters[COLUP1] = v; }
  get COLUPF() { return this.writeRegisters[COLUPF]; }
  set COLUPF(v) { this.writeRegisters[COLUPF] = v; }
  get COLUBK() { return this.writeRegisters[COLUBK]; }
  set COLUBK(v) { this.writeRegisters[COLUBK] = v; }
  get CTRLPF() { return this.writeRegisters[CTRLPF]; }
  set CTRLPF(v) { this.writeRegisters[CTRLPF] = v; }
  get REFP0() { return this.writeRegisters[REFP0]; }
  set REFP0(v) { this.writeRegisters[REFP0] = v; }
  get REFP1() { return this.writeRegisters[REFP1]; }
  set REFP1(v) { this.writeRegisters[REFP1] = v; }
  get PF0() { return this.writeRegisters[PF0]; }
  set PF0(v) { this.writeRegisters[PF0] = v; }
  get PF1() { return this.writeRegisters[PF1]; }
  set PF1(v) { this.writeRegisters[PF1] = v; }
  get PF2() { return this.writeRegisters[PF2]; }
  set PF2(v) { this.writeRegisters[PF2] = v; }
  get AUDC0() { return this.writeRegisters[AUDC0]; }
  set AUDC0(v) { this.writeRegisters[AUDC0] = v; }
  get AUDC1() { return this.writeRegisters[AUDC1]; }
  set AUDC1(v) { this.writeRegisters[AUDC1] = v; }
  get AUDF0() { return this.writeRegisters[AUDF0]; }
  set AUDF0(v) { this.writeRegisters[AUDF0] = v; }
  get AUDF1() { return this.writeRegisters[AUDF1]; }
  set AUDF1(v) { this.writeRegisters[AUDF1] = v; }
  get AUDV0() { return this.writeRegisters[AUDV0]; }
  set AUDV0(v) { this.writeRegisters[AUDV0] = v; }
  get AUDV1() { return this.writeRegisters[AUDV1]; }
  set AUDV1(v) { this.writeRegisters[AUDV1] = v; }
  get GRP0() { return this.writeRegisters[GRP0]; }
  set GRP0(v) { this.writeRegisters[GRP0] = v; }
  get GRP1() { return this.writeRegisters[GRP1]; }
  set GRP1(v) { this.writeRegisters[GRP1] = v; }
  get ENAM0() { return this.writeRegisters[ENAM0]; }
  set ENAM0(v) { this.writeRegisters[ENAM0] = v; }
  get ENAM1() { return this.writeRegisters[ENAM1]; }
  set ENAM1(v) { this.writeRegisters[ENAM1] = v; }
  get ENABL() { return this.writeRegisters[ENABL]; }
  set ENABL(v) { this.writeRegisters[ENABL] = v; }
  get HMP0() { return this.writeRegisters[HMP0]; }
  set HMP0(v) { this.writeRegisters[HMP0] = v; }
  get HMP1() { return this.writeRegisters[HMP1]; }
  set HMP1(v) { this.writeRegisters[HMP1] = v; }
  get HMM0() { return this.writeRegisters[HMM0]; }
  set HMM0(v) { this.writeRegisters[HMM0] = v; }
  get HMM1() { return this.writeRegisters[HMM1]; }
  set HMM1(v) { this.writeRegisters[HMM1] = v; }
  get HMBL() { return this.writeRegisters[HMBL]; }
  set HMBL(v) { this.writeRegisters[HMBL] = v; }
  get VDELP0() { return this.writeRegisters[VDELP0]; }
  set VDELP0(v) { this.writeRegisters[VDELP0] = v; }
  get VDELP1() { return this.writeRegisters[VDELP1]; }
  set VDELP1(v) { this.writeRegisters[VDELP1] = v; }
  get VDELBL() { return this.writeRegisters[VDELBL]; }
  set VDELBL(v) { this.writeRegisters[VDELBL] = v; }
  get RESMP0() { return this.writeRegisters[RESMP0]; }
  set RESMP0(v) { this.writeRegisters[RESMP0] = v; }
  get RESMP1() { return this.writeRegisters[RESMP1]; }
  set RESMP1(v) { this.writeRegisters[RESMP1] = v; }

  get CXM0P() { return this.readRegisters[CXM0P]; }
  set CXM0P(v) { this.readRegisters[CXM0P] = v; }
  get CXM1P() { return this.readRegisters[CXM1P]; }
  set CXM1P(v) { this.readRegisters[CXM1P] = v; }
  get CXP0FB() { return this.readRegisters[CXP0FB]; }
  set CXP0FB(v) { this.readRegisters[CXP0FB] = v; }
  get CXP1FB() { return this.readRegisters[CXP1FB]; }
  set CXP1FB(v) { this.readRegisters[CXP1FB] = v; }
  get CXM0FB() { return this.readRegisters[CXM0FB]; }
  set CXM0FB(v) { this.readRegisters[CXM0FB] = v; }
  get CXM1FB() { return this.readRegisters[CXM1FB]; }
  set CXM1FB(v) { this.readRegisters[CXM1FB] = v; }
  get CXBLPF() { return this.readRegisters[CXBLPF]; }
  set CXBLPF(v) { this.readRegisters[CXBLPF] = v; }
  get CXPPMM() { return this.readRegisters[CXPPMM]; }
  set CXPPMM(v) { this.readRegisters[CXPPMM] = v; }
  get INPT0() { return this.readRegisters[INPT0]; }
  set INPT0(v) { this.readRegisters[INPT0] = v; }
  get INPT1() { return this.readRegisters[INPT1]; }
  set INPT1(v) { this.readRegisters[INPT1] = v; }
  get INPT2() { return this.readRegisters[INPT2]; }
  set INPT2(v) { this.readRegisters[INPT2] = v; }
  get INPT3() { return this.readRegisters[INPT3]; }
  set INPT3(v) { this.readRegisters[INPT3] = v; }
  get INPT4() { return this.readRegisters[INPT4]; }
  set INPT4(v) { this.readRegisters[INPT4] = v; }
  get INPT5() { return this.readRegisters[INPT5]; }
  set INPT5(v) { this.readRegisters[INPT5] = v; }

}

// Write register names
const VSYNC = 0x00;
const VBLANK = 0x01;
const WSYNC = 0x02;
const RSYNC = 0x03;
const NUSIZ0 = 0x04;
const NUSIZ1 = 0x05;
const COLUP0 = 0x06;
const COLUP1 = 0x07;
const COLUPF = 0x08;
const COLUBK = 0x09;
const CTRLPF = 0x0A;
const REFP0 = 0x0B;
const REFP1 = 0x0C;
const PF0 = 0x0D;
const PF1 = 0x0E;
const PF2 = 0x0F;
const RESP0 = 0x10;
const RESP1 = 0x11;
const RESM0 = 0x12;
const RESM1 = 0x13;
const RESBL = 0x14;
const AUDC0 = 0x15;
const AUDC1 = 0x16;
const AUDF0 = 0x17;
const AUDF1 = 0x18;
const AUDV0 = 0x19;
const AUDV1 = 0x1A;
const GRP0 = 0x1B;
const GRP1 = 0x1C;
const ENAM0 = 0x1D;
const ENAM1 = 0x1E;
const ENABL = 0x1F;
const HMP0 = 0x20;
const HMP1 = 0x21;
const HMM0 = 0x22;
const HMM1 = 0x23;
const HMBL = 0x24;
const VDELP0 = 0x25;
const VDELP1 = 0x26;
const VDELBL = 0x27;
const RESMP0 = 0x28;
const RESMP1 = 0x29;
const HMOVE = 0x2A;
const HMCLR = 0x2B;
const CXCLR = 0x2C;

// Read register names
const CXM0P = 0x00;
const CXM1P = 0x01;
const CXP0FB = 0x02;
const CXP1FB = 0x03;
const CXM0FB = 0x04;
const CXM1FB = 0x05;
const CXBLPF = 0x06;
const CXPPMM = 0x07;
const INPT0 = 0x08;
const INPT1 = 0x09;
const INPT2 = 0x0A;
const INPT3 = 0x0B;
const INPT4 = 0x0C;
const INPT5 = 0x0D;

import {Vcs} from "../modules/2600.mjs"

function ntscToRgb(color) {
  // This is a modified HSL calculation
  // NOTE: this is untested, and I think it's off by 60 degrees.
  // I'll have to play around with it a bit to get it right.

  // Convert color code to HSL, all in the range of 0.0 - 1.0
  let h = (((color >> 3) & 0x0f) - 1) / 15.0; // tia "hue"
  let s = 1;
  let l = (color & 0x07) / 8.0; // tia "luminance"

  let r, g, b;

  if (h < 0) {
    r = g = b = l; // achromatic (gray)
  } else {
    const hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  // Convert RGB values to the range 0-255
  r = Math.round(r * 255);
  g = Math.round(g * 255);
  b = Math.round(b * 255);

  return { r, g, b };
}

class Screen {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.image = this.ctx.createImageData(160, 1);
    this.clear();
    this.lineCount = 0;
  }

  clear() {
    const data = this.image.data;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 160; x++) {
        data[x*4] = x;       // red
        data[x*4+1] = 160-x; // green
        data[x*4+2] = y;     // blue
        data[x*4+3] = 255;   // alpha
      }
      this.ctx.putImageData(this.image, 0, y);
    }
  }

  draw(y, line) {
    const data = this.image.data;
    for (let x = 0; x < 160; x++) {
      if (line[x] != 0) {
        console.log(x, y, line[x]);
      }
      let c = ntscToRgb(line[x]);
      data[x*4] = c.r;
      data[x*4+1] = c.g;
      data[x*4+2] = c.b;
      data[x*4+3] = 255;     // alpha
    }
    this.ctx.putImageData(this.image, 0, y);
    this.lineCount++;
  }
}

async function init() {
  const resp = await fetch("../roms/4k/advnture.bin");
  //const resp = await fetch("../roms/colrtest.bit");
  if (!resp.ok) {
    console.log(resp);
    alert("Error loading cartridge: " + resp.status + " " + resp.statusText);
  }
  const cart = await resp.arrayBuffer()
  console.log("Loaded cartridge: " + cart.byteLength + " bytes");
  const screen = new Screen(document.getElementById("canvas"));
  const vcs = new Vcs(cart, screen);
  // console.log(vcs.cart());
  vcs.start();
}

init();

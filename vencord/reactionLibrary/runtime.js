/* SPDX-License-Identifier: GPL-3.0-or-later
Bundled gifenc license:
The MIT License (MIT)
Copyright (c) 2017 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.


*/
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// bundled-gifenc:gifenc
var require_gifenc = __commonJS({
  "bundled-gifenc:gifenc"(exports) {
    var __defProp2 = Object.defineProperty;
    var __markAsModule = (target) => __defProp2(target, "__esModule", { value: true });
    var __export = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    __markAsModule(exports);
    __export(exports, {
      GIFEncoder: () => GIFEncoder2,
      applyPalette: () => applyPalette2,
      default: () => src_default,
      nearestColor: () => nearestColor,
      nearestColorIndex: () => nearestColorIndex,
      nearestColorIndexWithDistance: () => nearestColorIndexWithDistance,
      prequantize: () => prequantize,
      quantize: () => quantize2,
      snapColorsToPalette: () => snapColorsToPalette
    });
    var constants_default = {
      signature: "GIF",
      version: "89a",
      trailer: 59,
      extensionIntroducer: 33,
      applicationExtensionLabel: 255,
      graphicControlExtensionLabel: 249,
      imageSeparator: 44,
      signatureSize: 3,
      versionSize: 3,
      globalColorTableFlagMask: 128,
      colorResolutionMask: 112,
      sortFlagMask: 8,
      globalColorTableSizeMask: 7,
      applicationIdentifierSize: 8,
      applicationAuthCodeSize: 3,
      disposalMethodMask: 28,
      userInputFlagMask: 2,
      transparentColorFlagMask: 1,
      localColorTableFlagMask: 128,
      interlaceFlagMask: 64,
      idSortFlagMask: 32,
      localColorTableSizeMask: 7
    };
    function createStream(initialCapacity = 256) {
      let cursor = 0;
      let contents = new Uint8Array(initialCapacity);
      return {
        get buffer() {
          return contents.buffer;
        },
        reset() {
          cursor = 0;
        },
        bytesView() {
          return contents.subarray(0, cursor);
        },
        bytes() {
          return contents.slice(0, cursor);
        },
        writeByte(byte) {
          expand(cursor + 1);
          contents[cursor] = byte;
          cursor++;
        },
        writeBytes(data, offset = 0, byteLength = data.length) {
          expand(cursor + byteLength);
          for (let i = 0; i < byteLength; i++) {
            contents[cursor++] = data[i + offset];
          }
        },
        writeBytesView(data, offset = 0, byteLength = data.byteLength) {
          expand(cursor + byteLength);
          contents.set(data.subarray(offset, offset + byteLength), cursor);
          cursor += byteLength;
        }
      };
      function expand(newCapacity) {
        var prevCapacity = contents.length;
        if (prevCapacity >= newCapacity)
          return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
        if (prevCapacity != 0)
          newCapacity = Math.max(newCapacity, 256);
        const oldContents = contents;
        contents = new Uint8Array(newCapacity);
        if (cursor > 0)
          contents.set(oldContents.subarray(0, cursor), 0);
      }
    }
    var BITS = 12;
    var DEFAULT_HSIZE = 5003;
    var MASKS = [
      0,
      1,
      3,
      7,
      15,
      31,
      63,
      127,
      255,
      511,
      1023,
      2047,
      4095,
      8191,
      16383,
      32767,
      65535
    ];
    function lzwEncode(width, height, pixels, colorDepth, outStream = createStream(512), accum = new Uint8Array(256), htab = new Int32Array(DEFAULT_HSIZE), codetab = new Int32Array(DEFAULT_HSIZE)) {
      const hsize = htab.length;
      const initCodeSize = Math.max(2, colorDepth);
      accum.fill(0);
      codetab.fill(0);
      htab.fill(-1);
      let cur_accum = 0;
      let cur_bits = 0;
      const init_bits = initCodeSize + 1;
      const g_init_bits = init_bits;
      let clear_flg = false;
      let n_bits = g_init_bits;
      let maxcode = (1 << n_bits) - 1;
      const ClearCode = 1 << init_bits - 1;
      const EOFCode = ClearCode + 1;
      let free_ent = ClearCode + 2;
      let a_count = 0;
      let ent = pixels[0];
      let hshift = 0;
      for (let fcode = hsize; fcode < 65536; fcode *= 2) {
        ++hshift;
      }
      hshift = 8 - hshift;
      outStream.writeByte(initCodeSize);
      output(ClearCode);
      const length = pixels.length;
      for (let idx = 1; idx < length; idx++) {
        next_block: {
          const c = pixels[idx];
          const fcode = (c << BITS) + ent;
          let i = c << hshift ^ ent;
          if (htab[i] === fcode) {
            ent = codetab[i];
            break next_block;
          }
          const disp = i === 0 ? 1 : hsize - i;
          while (htab[i] >= 0) {
            i -= disp;
            if (i < 0)
              i += hsize;
            if (htab[i] === fcode) {
              ent = codetab[i];
              break next_block;
            }
          }
          output(ent);
          ent = c;
          if (free_ent < 1 << BITS) {
            codetab[i] = free_ent++;
            htab[i] = fcode;
          } else {
            htab.fill(-1);
            free_ent = ClearCode + 2;
            clear_flg = true;
            output(ClearCode);
          }
        }
      }
      output(ent);
      output(EOFCode);
      outStream.writeByte(0);
      return outStream.bytesView();
      function output(code) {
        cur_accum &= MASKS[cur_bits];
        if (cur_bits > 0)
          cur_accum |= code << cur_bits;
        else
          cur_accum = code;
        cur_bits += n_bits;
        while (cur_bits >= 8) {
          accum[a_count++] = cur_accum & 255;
          if (a_count >= 254) {
            outStream.writeByte(a_count);
            outStream.writeBytesView(accum, 0, a_count);
            a_count = 0;
          }
          cur_accum >>= 8;
          cur_bits -= 8;
        }
        if (free_ent > maxcode || clear_flg) {
          if (clear_flg) {
            n_bits = g_init_bits;
            maxcode = (1 << n_bits) - 1;
            clear_flg = false;
          } else {
            ++n_bits;
            maxcode = n_bits === BITS ? 1 << n_bits : (1 << n_bits) - 1;
          }
        }
        if (code == EOFCode) {
          while (cur_bits > 0) {
            accum[a_count++] = cur_accum & 255;
            if (a_count >= 254) {
              outStream.writeByte(a_count);
              outStream.writeBytesView(accum, 0, a_count);
              a_count = 0;
            }
            cur_accum >>= 8;
            cur_bits -= 8;
          }
          if (a_count > 0) {
            outStream.writeByte(a_count);
            outStream.writeBytesView(accum, 0, a_count);
            a_count = 0;
          }
        }
      }
    }
    var lzwEncode_default = lzwEncode;
    function rgb888_to_rgb565(r, g, b) {
      return r << 8 & 63488 | g << 2 & 992 | b >> 3;
    }
    function rgba8888_to_rgba4444(r, g, b, a) {
      return r >> 4 | g & 240 | (b & 240) << 4 | (a & 240) << 8;
    }
    function rgb888_to_rgb444(r, g, b) {
      return r >> 4 << 8 | g & 240 | b >> 4;
    }
    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value;
    }
    function sqr(value) {
      return value * value;
    }
    function find_nn(bins, idx, hasAlpha) {
      var nn = 0;
      var err = 1e100;
      const bin1 = bins[idx];
      const n1 = bin1.cnt;
      const wa = bin1.ac;
      const wr = bin1.rc;
      const wg = bin1.gc;
      const wb = bin1.bc;
      for (var i = bin1.fw; i != 0; i = bins[i].fw) {
        const bin = bins[i];
        const n2 = bin.cnt;
        const nerr2 = n1 * n2 / (n1 + n2);
        if (nerr2 >= err)
          continue;
        var nerr = 0;
        if (hasAlpha) {
          nerr += nerr2 * sqr(bin.ac - wa);
          if (nerr >= err)
            continue;
        }
        nerr += nerr2 * sqr(bin.rc - wr);
        if (nerr >= err)
          continue;
        nerr += nerr2 * sqr(bin.gc - wg);
        if (nerr >= err)
          continue;
        nerr += nerr2 * sqr(bin.bc - wb);
        if (nerr >= err)
          continue;
        err = nerr;
        nn = i;
      }
      bin1.err = err;
      bin1.nn = nn;
    }
    function create_bin() {
      return {
        ac: 0,
        rc: 0,
        gc: 0,
        bc: 0,
        cnt: 0,
        nn: 0,
        fw: 0,
        bk: 0,
        tm: 0,
        mtm: 0,
        err: 0
      };
    }
    function create_bin_list(data, format) {
      const bincount = format === "rgb444" ? 4096 : 65536;
      const bins = new Array(bincount);
      const size = data.length;
      if (format === "rgba4444") {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const a = color >> 24 & 255;
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgba8888_to_rgba4444(r, g, b, a);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.ac += a;
          bin.cnt++;
        }
      } else if (format === "rgb444") {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgb888_to_rgb444(r, g, b);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.cnt++;
        }
      } else {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgb888_to_rgb565(r, g, b);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.cnt++;
        }
      }
      return bins;
    }
    function quantize2(rgba, maxColors, opts = {}) {
      const {
        format = "rgb565",
        clearAlpha = true,
        clearAlphaColor = 0,
        clearAlphaThreshold = 0,
        oneBitAlpha = false
      } = opts;
      if (!rgba || !rgba.buffer) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      const data = new Uint32Array(rgba.buffer);
      let useSqrt = opts.useSqrt !== false;
      const hasAlpha = format === "rgba4444";
      const bins = create_bin_list(data, format);
      const bincount = bins.length;
      const bincountMinusOne = bincount - 1;
      const heap = new Uint32Array(bincount + 1);
      var maxbins = 0;
      for (var i = 0; i < bincount; ++i) {
        const bin = bins[i];
        if (bin != null) {
          var d = 1 / bin.cnt;
          if (hasAlpha)
            bin.ac *= d;
          bin.rc *= d;
          bin.gc *= d;
          bin.bc *= d;
          bins[maxbins++] = bin;
        }
      }
      if (sqr(maxColors) / maxbins < 0.022) {
        useSqrt = false;
      }
      var i = 0;
      for (; i < maxbins - 1; ++i) {
        bins[i].fw = i + 1;
        bins[i + 1].bk = i;
        if (useSqrt)
          bins[i].cnt = Math.sqrt(bins[i].cnt);
      }
      if (useSqrt)
        bins[i].cnt = Math.sqrt(bins[i].cnt);
      var h, l, l2;
      for (i = 0; i < maxbins; ++i) {
        find_nn(bins, i, false);
        var err = bins[i].err;
        for (l = ++heap[0]; l > 1; l = l2) {
          l2 = l >> 1;
          if (bins[h = heap[l2]].err <= err)
            break;
          heap[l] = h;
        }
        heap[l] = i;
      }
      var extbins = maxbins - maxColors;
      for (i = 0; i < extbins; ) {
        var tb;
        for (; ; ) {
          var b1 = heap[1];
          tb = bins[b1];
          if (tb.tm >= tb.mtm && bins[tb.nn].mtm <= tb.tm)
            break;
          if (tb.mtm == bincountMinusOne)
            b1 = heap[1] = heap[heap[0]--];
          else {
            find_nn(bins, b1, false);
            tb.tm = i;
          }
          var err = bins[b1].err;
          for (l = 1; (l2 = l + l) <= heap[0]; l = l2) {
            if (l2 < heap[0] && bins[heap[l2]].err > bins[heap[l2 + 1]].err)
              l2++;
            if (err <= bins[h = heap[l2]].err)
              break;
            heap[l] = h;
          }
          heap[l] = b1;
        }
        var nb = bins[tb.nn];
        var n1 = tb.cnt;
        var n2 = nb.cnt;
        var d = 1 / (n1 + n2);
        if (hasAlpha)
          tb.ac = d * (n1 * tb.ac + n2 * nb.ac);
        tb.rc = d * (n1 * tb.rc + n2 * nb.rc);
        tb.gc = d * (n1 * tb.gc + n2 * nb.gc);
        tb.bc = d * (n1 * tb.bc + n2 * nb.bc);
        tb.cnt += nb.cnt;
        tb.mtm = ++i;
        bins[nb.bk].fw = nb.fw;
        bins[nb.fw].bk = nb.bk;
        nb.mtm = bincountMinusOne;
      }
      let palette = [];
      var k = 0;
      for (i = 0; ; ++k) {
        let r = clamp(Math.round(bins[i].rc), 0, 255);
        let g = clamp(Math.round(bins[i].gc), 0, 255);
        let b = clamp(Math.round(bins[i].bc), 0, 255);
        let a = 255;
        if (hasAlpha) {
          a = clamp(Math.round(bins[i].ac), 0, 255);
          if (oneBitAlpha) {
            const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
            a = a <= threshold ? 0 : 255;
          }
          if (clearAlpha && a <= clearAlphaThreshold) {
            r = g = b = clearAlphaColor;
            a = 0;
          }
        }
        const color = hasAlpha ? [r, g, b, a] : [r, g, b];
        const exists = existsInPalette(palette, color);
        if (!exists)
          palette.push(color);
        if ((i = bins[i].fw) == 0)
          break;
      }
      return palette;
    }
    function existsInPalette(palette, color) {
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        let matchesRGB = p[0] === color[0] && p[1] === color[1] && p[2] === color[2];
        let matchesAlpha = p.length >= 4 && color.length >= 4 ? p[3] === color[3] : true;
        if (matchesRGB && matchesAlpha)
          return true;
      }
      return false;
    }
    function euclideanDistanceSquared(a, b) {
      var sum = 0;
      var n;
      for (n = 0; n < a.length; n++) {
        const dx = a[n] - b[n];
        sum += dx * dx;
      }
      return sum;
    }
    function roundStep(byte, step) {
      return step > 1 ? Math.round(byte / step) * step : byte;
    }
    function prequantize(rgba, { roundRGB = 5, roundAlpha = 10, oneBitAlpha = null } = {}) {
      const data = new Uint32Array(rgba.buffer);
      for (let i = 0; i < data.length; i++) {
        const color = data[i];
        let a = color >> 24 & 255;
        let b = color >> 16 & 255;
        let g = color >> 8 & 255;
        let r = color & 255;
        a = roundStep(a, roundAlpha);
        if (oneBitAlpha) {
          const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
          a = a <= threshold ? 0 : 255;
        }
        r = roundStep(r, roundRGB);
        g = roundStep(g, roundRGB);
        b = roundStep(b, roundRGB);
        data[i] = a << 24 | b << 16 | g << 8 | r << 0;
      }
    }
    function applyPalette2(rgba, palette, format = "rgb565") {
      if (!rgba || !rgba.buffer) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (palette.length > 256) {
        throw new Error("applyPalette() only works with 256 colors or less");
      }
      const data = new Uint32Array(rgba.buffer);
      const length = data.length;
      const bincount = format === "rgb444" ? 4096 : 65536;
      const index = new Uint8Array(length);
      const cache = new Array(bincount);
      const hasAlpha = format === "rgba4444";
      if (format === "rgba4444") {
        for (let i = 0; i < length; i++) {
          const color = data[i];
          const a = color >> 24 & 255;
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const key = rgba8888_to_rgba4444(r, g, b, a);
          const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGBA(r, g, b, a, palette);
          index[i] = idx;
        }
      } else {
        const rgb888_to_key = format === "rgb444" ? rgb888_to_rgb444 : rgb888_to_rgb565;
        for (let i = 0; i < length; i++) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const key = rgb888_to_key(r, g, b);
          const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGB(r, g, b, palette);
          index[i] = idx;
        }
      }
      return index;
    }
    function nearestColorIndexRGBA(r, g, b, a, palette) {
      let k = 0;
      let mindist = 1e100;
      for (let i = 0; i < palette.length; i++) {
        const px2 = palette[i];
        const a2 = px2[3];
        let curdist = sqr2(a2 - a);
        if (curdist > mindist)
          continue;
        const r2 = px2[0];
        curdist += sqr2(r2 - r);
        if (curdist > mindist)
          continue;
        const g2 = px2[1];
        curdist += sqr2(g2 - g);
        if (curdist > mindist)
          continue;
        const b2 = px2[2];
        curdist += sqr2(b2 - b);
        if (curdist > mindist)
          continue;
        mindist = curdist;
        k = i;
      }
      return k;
    }
    function nearestColorIndexRGB(r, g, b, palette) {
      let k = 0;
      let mindist = 1e100;
      for (let i = 0; i < palette.length; i++) {
        const px2 = palette[i];
        const r2 = px2[0];
        let curdist = sqr2(r2 - r);
        if (curdist > mindist)
          continue;
        const g2 = px2[1];
        curdist += sqr2(g2 - g);
        if (curdist > mindist)
          continue;
        const b2 = px2[2];
        curdist += sqr2(b2 - b);
        if (curdist > mindist)
          continue;
        mindist = curdist;
        k = i;
      }
      return k;
    }
    function snapColorsToPalette(palette, knownColors, threshold = 5) {
      if (!palette.length || !knownColors.length)
        return;
      const paletteRGB = palette.map((p) => p.slice(0, 3));
      const thresholdSq = threshold * threshold;
      const dim = palette[0].length;
      for (let i = 0; i < knownColors.length; i++) {
        let color = knownColors[i];
        if (color.length < dim) {
          color = [color[0], color[1], color[2], 255];
        } else if (color.length > dim) {
          color = color.slice(0, 3);
        } else {
          color = color.slice();
        }
        const r = nearestColorIndexWithDistance(paletteRGB, color.slice(0, 3), euclideanDistanceSquared);
        const idx = r[0];
        const distanceSq = r[1];
        if (distanceSq > 0 && distanceSq <= thresholdSq) {
          palette[idx] = color;
        }
      }
    }
    function sqr2(a) {
      return a * a;
    }
    function nearestColorIndex(colors, pixel, distanceFn = euclideanDistanceSquared) {
      let minDist = Infinity;
      let minDistIndex = -1;
      for (let j = 0; j < colors.length; j++) {
        const paletteColor = colors[j];
        const dist = distanceFn(pixel, paletteColor);
        if (dist < minDist) {
          minDist = dist;
          minDistIndex = j;
        }
      }
      return minDistIndex;
    }
    function nearestColorIndexWithDistance(colors, pixel, distanceFn = euclideanDistanceSquared) {
      let minDist = Infinity;
      let minDistIndex = -1;
      for (let j = 0; j < colors.length; j++) {
        const paletteColor = colors[j];
        const dist = distanceFn(pixel, paletteColor);
        if (dist < minDist) {
          minDist = dist;
          minDistIndex = j;
        }
      }
      return [minDistIndex, minDist];
    }
    function nearestColor(colors, pixel, distanceFn = euclideanDistanceSquared) {
      return colors[nearestColorIndex(colors, pixel, distanceFn)];
    }
    function GIFEncoder2(opt = {}) {
      const { initialCapacity = 4096, auto = true } = opt;
      const stream = createStream(initialCapacity);
      const HSIZE = 5003;
      const accum = new Uint8Array(256);
      const htab = new Int32Array(HSIZE);
      const codetab = new Int32Array(HSIZE);
      let hasInit = false;
      return {
        reset() {
          stream.reset();
          hasInit = false;
        },
        finish() {
          stream.writeByte(constants_default.trailer);
        },
        bytes() {
          return stream.bytes();
        },
        bytesView() {
          return stream.bytesView();
        },
        get buffer() {
          return stream.buffer;
        },
        get stream() {
          return stream;
        },
        writeHeader,
        writeFrame(index, width, height, opts = {}) {
          const {
            transparent = false,
            transparentIndex = 0,
            delay = 0,
            palette = null,
            repeat = 0,
            colorDepth = 8,
            dispose = -1
          } = opts;
          let first = false;
          if (auto) {
            if (!hasInit) {
              first = true;
              writeHeader();
              hasInit = true;
            }
          } else {
            first = Boolean(opts.first);
          }
          width = Math.max(0, Math.floor(width));
          height = Math.max(0, Math.floor(height));
          if (first) {
            if (!palette) {
              throw new Error("First frame must include a { palette } option");
            }
            encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth);
            encodeColorTable(stream, palette);
            if (repeat >= 0) {
              encodeNetscapeExt(stream, repeat);
            }
          }
          const delayTime = Math.round(delay / 10);
          encodeGraphicControlExt(stream, dispose, delayTime, transparent, transparentIndex);
          const useLocalColorTable = Boolean(palette) && !first;
          encodeImageDescriptor(stream, width, height, useLocalColorTable ? palette : null);
          if (useLocalColorTable)
            encodeColorTable(stream, palette);
          encodePixels(stream, index, width, height, colorDepth, accum, htab, codetab);
        }
      };
      function writeHeader() {
        writeUTFBytes(stream, "GIF89a");
      }
    }
    function encodeGraphicControlExt(stream, dispose, delay, transparent, transparentIndex) {
      stream.writeByte(33);
      stream.writeByte(249);
      stream.writeByte(4);
      if (transparentIndex < 0) {
        transparentIndex = 0;
        transparent = false;
      }
      var transp, disp;
      if (!transparent) {
        transp = 0;
        disp = 0;
      } else {
        transp = 1;
        disp = 2;
      }
      if (dispose >= 0) {
        disp = dispose & 7;
      }
      disp <<= 2;
      const userInput = 0;
      stream.writeByte(0 | disp | userInput | transp);
      writeUInt16(stream, delay);
      stream.writeByte(transparentIndex || 0);
      stream.writeByte(0);
    }
    function encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth = 8) {
      const globalColorTableFlag = 1;
      const sortFlag = 0;
      const globalColorTableSize = colorTableSize(palette.length) - 1;
      const fields = globalColorTableFlag << 7 | colorDepth - 1 << 4 | sortFlag << 3 | globalColorTableSize;
      const backgroundColorIndex = 0;
      const pixelAspectRatio = 0;
      writeUInt16(stream, width);
      writeUInt16(stream, height);
      stream.writeBytes([fields, backgroundColorIndex, pixelAspectRatio]);
    }
    function encodeNetscapeExt(stream, repeat) {
      stream.writeByte(33);
      stream.writeByte(255);
      stream.writeByte(11);
      writeUTFBytes(stream, "NETSCAPE2.0");
      stream.writeByte(3);
      stream.writeByte(1);
      writeUInt16(stream, repeat);
      stream.writeByte(0);
    }
    function encodeColorTable(stream, palette) {
      const colorTableLength = 1 << colorTableSize(palette.length);
      for (let i = 0; i < colorTableLength; i++) {
        let color = [0, 0, 0];
        if (i < palette.length) {
          color = palette[i];
        }
        stream.writeByte(color[0]);
        stream.writeByte(color[1]);
        stream.writeByte(color[2]);
      }
    }
    function encodeImageDescriptor(stream, width, height, localPalette) {
      stream.writeByte(44);
      writeUInt16(stream, 0);
      writeUInt16(stream, 0);
      writeUInt16(stream, width);
      writeUInt16(stream, height);
      if (localPalette) {
        const interlace = 0;
        const sorted = 0;
        const palSize = colorTableSize(localPalette.length) - 1;
        stream.writeByte(128 | interlace | sorted | 0 | palSize);
      } else {
        stream.writeByte(0);
      }
    }
    function encodePixels(stream, index, width, height, colorDepth = 8, accum, htab, codetab) {
      lzwEncode_default(width, height, index, colorDepth, stream, accum, htab, codetab);
    }
    function writeUInt16(stream, short) {
      stream.writeByte(short & 255);
      stream.writeByte(short >> 8 & 255);
    }
    function writeUTFBytes(stream, text) {
      for (var i = 0; i < text.length; i++) {
        stream.writeByte(text.charCodeAt(i));
      }
    }
    function colorTableSize(length) {
      return Math.max(Math.ceil(Math.log2(length)), 1);
    }
    var src_default = GIFEncoder2;
  }
});

// src/reaction-library.js
var import_gifenc = __toESM(require_gifenc());
function createReactionLibrary(host, options = {}) {
  const NAME = "Reaction Library";
  const KEY = "index";
  const FILE = (id) => `file:${id}`;
  const BUTTON_CLASS = "reaction-library-button";
  const ROOT_CLASS = "reaction-library";
  let root;
  let anchor;
  let entries = [];
  let query = "";
  let filter = "all";
  let sort = "newest";
  let editing = null;
  let previewObserver;
  let previewCleanup = [];
  let visibleLimit = 60;
  let importing = false;
  let loading = false;
  let importProgress;
  let folderFilter = "";
  let removing = false;
  let folderHandles = [];
  let defaultFolder;
  let saveQueue = Promise.resolve();
  const contextPatches = [];
  let accessWarning = false;
  let busy = false;
  let store;
  let renderId = 0;
  let panelSize;
  let playback;
  let playbackId = 0;
  let conversion;
  let lastStatus = "";
  const folderAccess = /* @__PURE__ */ new Map();
  const css = `
        button.${BUTTON_CLASS} { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--icon-default, var(--interactive-icon-default, var(--interactive-normal, #b5bac1))); cursor: pointer; }
        button.${BUTTON_CLASS} svg { display: block; color: inherit; fill: none; }
        button.${BUTTON_CLASS}:hover { color: var(--icon-strong, var(--interactive-hover, #f2f3f5)); background: var(--background-modifier-hover, #ffffff14); }
        .${ROOT_CLASS} { --rl-text: var(--text-default, var(--text-normal, #f2f3f5)); --rl-muted: var(--text-muted, #aeb3bb); --rl-panel: var(--background-surface-high, var(--background-floating, #232428)); --rl-input: var(--input-background-default, var(--input-background, #16171a)); --rl-border: var(--border-subtle, #ffffff1f); --rl-card: var(--background-surface-higher, var(--background-secondary, #2b2d31)); position: fixed; z-index: 10000; width: min(440px, calc(100vw - 16px)); max-height: min(520px, 70vh); overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--rl-border); border-radius: 8px; background: var(--rl-panel); color: var(--rl-text); box-shadow: 0 8px 32px #0008; font: 14px/1.4 var(--font-primary, "Segoe UI", sans-serif); color-scheme: dark; }
        .theme-light .${ROOT_CLASS} { color-scheme: light; }
        .${ROOT_CLASS} * { box-sizing: border-box; }
        .${ROOT_CLASS} header { margin: 0; padding: 12px 14px; color: var(--rl-text); font-size: 15px; font-weight: 700; border-bottom: 1px solid var(--rl-border); }
        .${ROOT_CLASS} .rl-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
        .${ROOT_CLASS} input, .${ROOT_CLASS} select { display: block; min-width: 0; height: 36px; margin: 0; padding: 7px 10px; border: 1px solid var(--rl-border); border-radius: 5px; outline: 0; background: var(--rl-input); color: var(--rl-text); font: inherit; }
        .${ROOT_CLASS} input::placeholder { color: var(--rl-muted); opacity: 1; }
        .${ROOT_CLASS} input[type=search] { grid-column: 1 / -1; width: 100%; appearance: none; }
        .${ROOT_CLASS} input[hidden] { display: none; }
        .${ROOT_CLASS} select { width: 100%; cursor: pointer; }
        .${ROOT_CLASS} select option { background: var(--rl-panel); color: var(--rl-text); }
        .${ROOT_CLASS} input:focus-visible, .${ROOT_CLASS} select:focus-visible, .${ROOT_CLASS} button:focus-visible { outline: 2px solid var(--focus-primary, #7289ff); outline-offset: 1px; }
        .${ROOT_CLASS} .rl-import { margin: 0 10px 10px; align-self: flex-start; }
        .${ROOT_CLASS} button.rl-primary { padding: 7px 12px; border: 0; border-radius: 4px; background: var(--button-filled-brand-background, #5865f2); color: white; font: inherit; font-weight: 600; cursor: pointer; }
        .${ROOT_CLASS} .rl-scroll { min-height: 0; overflow-y: auto; padding: 0 12px 12px; }
        .${ROOT_CLASS} .rl-empty { padding: 38px 12px; color: var(--rl-muted); text-align: center; }
        .${ROOT_CLASS} .rl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .${ROOT_CLASS} .rl-item { min-width: 0; overflow: hidden; border-radius: 5px; background: var(--rl-card); }
        .${ROOT_CLASS} .rl-send { display: flex; position: relative; width: 100%; height: 105px; align-items: center; justify-content: center; overflow: hidden; padding: 0; border: 0; background: var(--rl-input); color: var(--rl-text); cursor: pointer; }
        .${ROOT_CLASS} .rl-send img { width: 100%; height: 100%; object-fit: cover; }
        .${ROOT_CLASS} .rl-send video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .${ROOT_CLASS} .rl-video-badge { position: absolute; top: 5px; right: 5px; padding: 1px 5px; border-radius: 4px; background: #000a; color: white; font-size: 12px; }
        .${ROOT_CLASS} .rl-send .rl-symbol { font-size: 34px; }
        .${ROOT_CLASS} .rl-send strong { position: absolute; right: 0; bottom: 0; left: 0; overflow: hidden; padding: 6px; background: linear-gradient(transparent, #000a); color: white; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-tags { display: flex; gap: 4px; padding: 5px; }
        .${ROOT_CLASS} .rl-tags input { flex: 1; width: 0; }
        .${ROOT_CLASS} .rl-edit { width: 100%; overflow: hidden; padding: 7px; border: 0; background: transparent; color: var(--rl-muted); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
        .${ROOT_CLASS} .rl-status { padding: 4px 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-status:empty { display: none; }
        .${ROOT_CLASS} .rl-progress { padding: 0 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-progress:empty { display: none; }
        .${ROOT_CLASS} progress { display: block; width: 100%; height: 6px; margin-top: 6px; accent-color: #7289ff; }
        .${ROOT_CLASS} button:disabled { opacity: .55; cursor: wait; }
        .${ROOT_CLASS} .rl-more { display: block; margin: 12px auto 0; }
        .${ROOT_CLASS} .rl-folders { display: flex; gap: 6px; padding: 0 12px 10px; }
        .${ROOT_CLASS} .rl-folders select { flex: 1; min-width: 0; }
        .${ROOT_CLASS} .rl-save-folder { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-save-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-remove { border: 0; border-radius: 4px; padding: 5px 7px; background: #f23f431f; color: var(--text-danger, #ff858b); cursor: pointer; }
        .${ROOT_CLASS} .rl-item-footer { display: flex; align-items: center; }
        .${ROOT_CLASS} .rl-item-footer .rl-edit { flex: 1; min-width: 0; }
        .${ROOT_CLASS} > :not(.rl-scroll) { flex-shrink: 0; }
        .${ROOT_CLASS} .rl-scroll { flex: 1; }
        .${ROOT_CLASS} .rl-grid { grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); }
        .${ROOT_CLASS} .rl-resize { position: absolute; top: 0; left: 0; width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: var(--rl-muted); cursor: nwse-resize; touch-action: none; }
        .${ROOT_CLASS} .rl-resize::after { content: ""; position: absolute; top: 4px; left: 4px; width: 8px; height: 8px; border-top: 2px solid currentColor; border-left: 2px solid currentColor; }
        .${ROOT_CLASS} header { padding-left: 26px; }
        .${ROOT_CLASS} .rl-actions { display: flex; gap: 6px; padding: 5px; flex-wrap: wrap; }
        .${ROOT_CLASS} .rl-actions button { padding: 5px 8px; border: 1px solid var(--rl-border); border-radius: 4px; background: var(--rl-input); color: var(--rl-text); cursor: pointer; }
        .${ROOT_CLASS} .rl-actions .rl-action-preview { border-color: #5865f280; background: #5865f233; color: #c5cbff; }
        .${ROOT_CLASS} .rl-actions .rl-action-send { border-color: #23a55980; background: #23a55933; color: #a8e7c0; }
        .${ROOT_CLASS} .rl-actions .rl-action-voice { border-color: #a970db80; background: #a970db33; color: #e1bcfa; }
        .${ROOT_CLASS} .rl-actions .rl-action-gif { border-color: #e5963280; background: #e5963233; color: #f8cd91; }
        .${ROOT_CLASS} .rl-actions .rl-action-close { border-color: var(--rl-border); background: var(--rl-card); color: var(--rl-muted); }
        .${ROOT_CLASS} .rl-actions button:hover, .${ROOT_CLASS} .rl-remove:hover { filter: brightness(1.2); }
        .${ROOT_CLASS} .rl-options { position: relative; padding: 4px 6px; }
        .${ROOT_CLASS} .rl-options summary { cursor: pointer; padding: 2px 6px; border-radius: 4px; list-style: none; color: var(--rl-muted); text-align: right; font-size: 18px; line-height: 20px; }
        .${ROOT_CLASS} .rl-options summary::-webkit-details-marker { display: none; }
        .${ROOT_CLASS} .rl-options summary:hover, .${ROOT_CLASS} .rl-options[open] summary { background: var(--rl-input); color: var(--rl-text); }
        .${ROOT_CLASS} .rl-options[open] .rl-actions { display: flex; flex-direction: column; gap: 1px; padding: 3px 0 0; }
        .${ROOT_CLASS} .rl-options .rl-actions button { padding: 5px 6px; border: 0; background: transparent; color: var(--rl-text); text-align: left; }
        .${ROOT_CLASS} .rl-options .rl-actions button:hover { background: var(--rl-input); }
        .${ROOT_CLASS} .rl-clip { margin-top: 10px; }
        .${ROOT_CLASS} .rl-clip-track { position: relative; height: 54px; margin: 0 10px; border-radius: 4px; background: repeating-linear-gradient(90deg, #333841 0 16px, #252a33 16px 32px); touch-action: none; cursor: pointer; }
        .${ROOT_CLASS} .rl-clip-selection { position: absolute; top: 0; bottom: 0; border: 2px solid #00c8ee; background: #00c8ee18; pointer-events: none; }
        .${ROOT_CLASS} .rl-clip-playhead { position: absolute; top: -5px; bottom: -5px; width: 2px; background: white; box-shadow: 0 0 3px #000; pointer-events: none; transform: translateX(-50%); }
        .${ROOT_CLASS} .rl-clip-handle { position: absolute; top: 0; bottom: 0; width: 13px; padding: 0; border: 0; border-radius: 4px; background: #00c8ee; color: white; cursor: ew-resize; touch-action: none; transform: translateX(-50%); }
        .${ROOT_CLASS} .rl-clip-handle::after { content: '\u22EE'; }
        .${ROOT_CLASS} .rl-clip-times { display: flex; justify-content: space-between; margin: 5px 0 8px; color: #00c8ee; font-size: 12px; font-variant-numeric: tabular-nums; }
        .${ROOT_CLASS} .rl-clip-times span:nth-child(2) { color: var(--rl-muted); }
        .${ROOT_CLASS} .rl-clip-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .${ROOT_CLASS} .rl-preview { padding: 10px 12px; border-bottom: 1px solid var(--rl-border); }
        .${ROOT_CLASS} .rl-preview:empty { display: none; }
        .${ROOT_CLASS} .rl-preview video { display: block; width: 100%; max-height: min(220px, 25vh); background: black; }
        .${ROOT_CLASS} .rl-preview audio { display: block; width: 100%; }
        .${ROOT_CLASS} .rl-preview-title { margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-cancel { position: absolute; top: 8px; right: 10px; border: 0; border-radius: 4px; background: var(--rl-input); color: var(--rl-text); padding: 4px 8px; cursor: pointer; }
        .${ROOT_CLASS} .rl-cancel[hidden] { display: none; }
        .${BUTTON_CLASS} { position: relative; display: inline-flex; }
        .${BUTTON_CLASS}.rl-working::after { content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: #7289ff; }
        .${ROOT_CLASS} .rl-access { max-height: 130px; overflow-y: auto; padding: 8px 12px; border-top: 1px solid var(--rl-border); border-bottom: 1px solid var(--rl-border); color: var(--rl-text); background: var(--rl-card); font-size: 12px; }
        .${ROOT_CLASS} .rl-access:empty { display: none; }
        .${ROOT_CLASS} .rl-access-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
        .${ROOT_CLASS} .rl-access-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
  function vencord() {
    return host ?? globalThis.Vencord;
  }
  const portuguese = {
    "Reaction Library": "Biblioteca de rea\xE7\xF5es",
    "Loading your library\u2026": "Carregando sua biblioteca\u2026",
    "Scanning folder": "Verificando pasta",
    "files found": "arquivos encontrados",
    "Indexing": "Indexando",
    "Import stopped": "Importa\xE7\xE3o interrompida",
    "Import complete": "Importa\xE7\xE3o conclu\xEDda",
    "referenced": "referenciados",
    "skipped": "ignorados",
    "failed": "com falha",
    "Folder import progress": "Progresso da importa\xE7\xE3o da pasta",
    "Previously indexed items are still available.": "Os itens j\xE1 indexados continuam dispon\xEDveis.",
    "The client mod is not ready yet. Try opening the library again.": "O mod do cliente ainda n\xE3o est\xE1 pronto. Tente abrir a biblioteca novamente.",
    "The client mod is not ready yet.": "O mod do cliente ainda n\xE3o est\xE1 pronto.",
    "This client version does not support persistent folder references. No files were copied.": "Esta vers\xE3o do cliente n\xE3o oferece refer\xEAncias permanentes a pastas. Nenhum arquivo foi copiado.",
    "Storage write failed.": "Falha ao salvar os dados.",
    "Open a chat before sending a reaction.": "Abra uma conversa antes de enviar uma rea\xE7\xE3o.",
    "Preparing clip\u2026": "Preparando trecho\u2026",
    "Choose audio or video to send as a voice message.": "Escolha um \xE1udio ou v\xEDdeo para enviar como mensagem de voz.",
    "You cannot send voice messages in this channel.": "Voc\xEA n\xE3o pode enviar mensagens de voz neste canal.",
    "Preparing voice message\u2026": "Preparando mensagem de voz\u2026",
    "Uploading voice message\u2026": "Enviando mensagem de voz\u2026",
    "Choose a video to send as a GIF.": "Escolha um v\xEDdeo para enviar como GIF.",
    "Uploading GIF\u2026": "Enviando GIF\u2026",
    "The upload was not accepted.": "O envio do arquivo n\xE3o foi aceito.",
    "Conversion cancelled.": "Convers\xE3o cancelada.",
    "Could not send this reaction.": "N\xE3o foi poss\xEDvel enviar esta rea\xE7\xE3o.",
    "Only audio and video can be clipped.": "Somente \xE1udios e v\xEDdeos podem ser recortados.",
    "Clip recording is unavailable in this client version.": "A grava\xE7\xE3o de trechos n\xE3o est\xE1 dispon\xEDvel nesta vers\xE3o do cliente.",
    "Choose a valid clip start and end time.": "Escolha hor\xE1rios v\xE1lidos para o in\xEDcio e o fim do trecho.",
    "Clip recording is unavailable for this format in this client.": "N\xE3o \xE9 poss\xEDvel gravar trechos deste formato neste cliente.",
    "This client cannot encode a clip of this type.": "Este cliente n\xE3o consegue codificar um trecho deste tipo.",
    "Could not record this clip.": "N\xE3o foi poss\xEDvel gravar este trecho.",
    "The recorded clip was empty.": "O trecho gravado est\xE1 vazio.",
    "Your client cannot play this file's format. You can still send the original file.": "Seu cliente n\xE3o consegue reproduzir este formato. Voc\xEA ainda pode enviar o arquivo original.",
    "Send file": "Enviar arquivo",
    "Send as spoiler": "Enviar como spoiler",
    "Send as voice": "Enviar como voz",
    "Send as GIF": "Enviar como GIF",
    "Close preview": "Fechar pr\xE9via",
    "The preview could not seek to the clip start. Try playing again.": "A pr\xE9via n\xE3o conseguiu ir ao in\xEDcio do trecho. Tente reproduzir novamente.",
    "Clip start": "In\xEDcio do trecho",
    "Clip end": "Fim do trecho",
    "Send clip": "Enviar trecho",
    "Send clip as spoiler": "Enviar trecho como spoiler",
    "Send clip as voice": "Enviar trecho como voz",
    "Your client could not decode this video. You can send the original file instead.": "Seu cliente n\xE3o conseguiu decodificar este v\xEDdeo. Voc\xEA pode enviar o arquivo original.",
    "Video decoding timed out. Try sending the original file.": "A decodifica\xE7\xE3o do v\xEDdeo demorou demais. Tente enviar o arquivo original.",
    "The video has no readable frames or duration.": "O v\xEDdeo n\xE3o tem quadros ou dura\xE7\xE3o leg\xEDveis.",
    "GIF conversion is unavailable in this client version.": "A convers\xE3o para GIF n\xE3o est\xE1 dispon\xEDvel nesta vers\xE3o do cliente.",
    "This GIF is too large to prepare in memory. Try a shorter video or send the original file.": "Este GIF \xE9 grande demais para preparar na mem\xF3ria. Tente um v\xEDdeo mais curto ou envie o arquivo original.",
    "This client version cannot extract this video's audio. Try a browser-supported video format.": "Esta vers\xE3o do cliente n\xE3o consegue extrair o \xE1udio do v\xEDdeo. Tente um formato de v\xEDdeo compat\xEDvel.",
    "No supported audio track was found in this video.": "Nenhuma faixa de \xE1udio compat\xEDvel foi encontrada neste v\xEDdeo.",
    "Audio extraction is unavailable in this client version.": "A extra\xE7\xE3o de \xE1udio n\xE3o est\xE1 dispon\xEDvel nesta vers\xE3o do cliente.",
    "Could not extract this video's audio.": "N\xE3o foi poss\xEDvel extrair o \xE1udio deste v\xEDdeo.",
    "The video's audio track was empty.": "A faixa de \xE1udio do v\xEDdeo est\xE1 vazia.",
    "Audio packet is too large.": "O pacote de \xE1udio \xE9 grande demais.",
    "Extracting the video's audio in memory\u2026": "Extraindo o \xE1udio do v\xEDdeo na mem\xF3ria\u2026",
    "This audio file is empty or could not be decoded.": "Este \xE1udio est\xE1 vazio ou n\xE3o p\xF4de ser decodificado.",
    "Voice conversion is unavailable in this client version. You can send this as a file, or use OGG Opus audio.": "A convers\xE3o para mensagem de voz n\xE3o est\xE1 dispon\xEDvel nesta vers\xE3o do cliente. Envie como arquivo ou use \xE1udio OGG Opus.",
    "This client version cannot encode voice messages. Send the original file instead.": "Esta vers\xE3o do cliente n\xE3o consegue codificar mensagens de voz. Envie o arquivo original.",
    "Voice conversion produced no audio.": "A convers\xE3o para mensagem de voz n\xE3o produziu \xE1udio.",
    "Voice message upload failed.": "Falha ao enviar a mensagem de voz.",
    "Restore folder access below to load your thumbnails. Your file references are still saved.": "Restaure o acesso \xE0 pasta abaixo para carregar as miniaturas. As refer\xEAncias aos arquivos continuam salvas.",
    "Desktop file access is unavailable. Restart your client to load the plugin's native helper.": "O acesso a arquivos locais n\xE3o est\xE1 dispon\xEDvel. Reinicie o cliente para carregar o componente nativo do plugin.",
    "This file is missing. Add its folder again to reconnect it.": "Este arquivo n\xE3o foi encontrado. Adicione a pasta novamente para reconect\xE1-lo.",
    "Folder access needs to be renewed after restarting your client. Your library and tags are still saved.": "O acesso \xE0s pastas precisa ser renovado ap\xF3s reiniciar o cliente. Sua biblioteca e etiquetas continuam salvas.",
    "Select folder again": "Selecionar pasta novamente",
    "Restore access": "Restaurar acesso",
    "Select": "Selecionar",
    "Restore access to": "Restaurar acesso a",
    "Select a referenced folder first, or use Add folder to reconnect it.": "Selecione uma pasta referenciada ou use Adicionar pasta para reconect\xE1-la.",
    "Folder access was not granted. Your references and tags are unchanged.": "O acesso \xE0 pasta n\xE3o foi concedido. Suas refer\xEAncias e etiquetas n\xE3o foram alteradas.",
    "All folders": "Todas as pastas",
    "No reactions match your search.": "Nenhuma rea\xE7\xE3o corresponde \xE0 busca.",
    "Choose a folder to start your reaction library.": "Escolha uma pasta para come\xE7ar sua biblioteca de rea\xE7\xF5es.",
    "Preview and trim": "Pr\xE9via e recorte",
    "Save": "Salvar",
    "Add tags": "Adicionar etiquetas",
    "Remove": "Remover",
    "Tags, separated by commas": "Etiquetas, separadas por v\xEDrgulas",
    "Drag the upper-left corner to resize. Arrow keys also work.": "Arraste o canto superior esquerdo para redimensionar. As setas do teclado tamb\xE9m funcionam.",
    "Resize library": "Redimensionar biblioteca",
    "Cancel conversion": "Cancelar convers\xE3o",
    "Search names, folders, and tags": "Buscar nomes, pastas e etiquetas",
    "Search reactions": "Buscar rea\xE7\xF5es",
    "Type": "Tipo",
    "All types": "Todos os tipos",
    "Images and GIFs": "Imagens e GIFs",
    "Videos": "V\xEDdeos",
    "Audio": "\xC1udio",
    "Sort": "Ordenar",
    "Newest": "Mais recentes",
    "Oldest": "Mais antigos",
    "Name": "Nome",
    "Add folder": "Adicionar pasta",
    "Set save folder": "Definir pasta para salvar",
    "Save folder": "Pasta para salvar",
    "No save folder selected": "Nenhuma pasta para salvar selecionada",
    "Add to reaction library": "Adicionar \xE0 biblioteca de rea\xE7\xF5es",
    "Choose a default save folder in Reaction Library first.": "Escolha primeiro uma pasta padr\xE3o para salvar na Biblioteca de rea\xE7\xF5es.",
    "This media could not be downloaded.": "N\xE3o foi poss\xEDvel baixar esta m\xEDdia.",
    "This media is too large to save (256 MiB limit).": "Esta m\xEDdia \xE9 grande demais para salvar (limite de 256 MiB).",
    "The selected file is not supported media.": "O arquivo selecionado n\xE3o \xE9 uma m\xEDdia compat\xEDvel.",
    "Save folder access expired. Set the save folder again in Reaction Library.": "O acesso \xE0 pasta para salvar expirou. Defina a pasta novamente na Biblioteca de rea\xE7\xF5es.",
    "The save folder is unavailable. Open Reaction Library and set the save folder again.": "A pasta para salvar n\xE3o est\xE1 dispon\xEDvel. Abra a Biblioteca de rea\xE7\xF5es e defina a pasta novamente.",
    "Library folder": "Pasta da biblioteca",
    "Reconnect": "Reconectar",
    "Remove folder": "Remover pasta",
    "Restore folder access to load its thumbnail": "Restaure o acesso \xE0 pasta para carregar a miniatura",
    "Options for": "Op\xE7\xF5es para",
    "Preview": "Pr\xE9via",
    "Send": "Enviar",
    "Remove from library": "Remover da biblioteca"
  };
  function locale() {
    return vencord()?.Webpack?.Common?.LocaleStore?.locale ?? document.documentElement?.lang ?? "en-US";
  }
  function t(message) {
    if (!/^pt(?:-|$)/i.test(locale()) || typeof message !== "string") return message;
    const direct = portuguese[message];
    if (direct) return direct;
    return message.replace(/\b(?:Sending|Sent|Removed|Recording clip|Converting GIF|Extracting audio|Show more|Folder|Access to)\b[^]*$/, (value) => {
      let match;
      if (match = /^Sending (.+)…$/.exec(value)) return `Enviando ${match[1]}\u2026`;
      if (match = /^Sent (.+)\.$/.exec(value)) return `${match[1]} enviado.`;
      if (match = /^Removed (.+) old stored copies\. File references were preserved\.$/.exec(value)) return `${match[1]} c\xF3pias antigas removidas. As refer\xEAncias aos arquivos foram preservadas.`;
      if (match = /^Recording clip · (.+)$/.exec(value)) return `Gravando trecho \xB7 ${match[1]}`;
      if (match = /^Converting GIF · frame (.+)$/.exec(value)) return `Convertendo GIF \xB7 quadro ${match[1]}`;
      if (match = /^Extracting audio · (.+) \(plays through once\)$/.exec(value)) return `Extraindo \xE1udio \xB7 ${match[1]} (reproduz uma vez)`;
      if (match = /^Show more \((.+)\)$/.exec(value)) return `Mostrar mais (${match[1]})`;
      if (match = /^Folder (.+) reconnected\.$/.exec(value)) return `Pasta ${match[1]} reconectada.`;
      if (match = /^Access to (.+) restored\. Thumbnails are loading\.$/.exec(value)) return `Acesso a ${match[1]} restaurado. As miniaturas est\xE3o carregando.`;
      return value;
    });
  }
  function dataStore() {
    const api = vencord()?.Api?.DataStore;
    if (!api) throw new Error("The client mod is not ready yet. Try opening the library again.");
    store ??= api.createStore("ReactionLibrary", "files");
    return { api, store };
  }
  function mediaKind(file) {
    if (file.type.startsWith("image/") || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)) return "image";
    if (file.type.startsWith("video/") || /\.(?:avi|m4v|mkv|mov|mp4|webm)$/i.test(file.name)) return "video";
    if (file.type.startsWith("audio/") || /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)$/i.test(file.name)) return "audio";
    return null;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = t(text).replace(/^([◉♫▧▶] {2})(.+)$/, (_, icon, label) => icon + t(label));
    return node;
  }
  function status(message) {
    lastStatus = message;
    const line = root?.querySelector(".rl-status");
    if (line) line.textContent = t(message);
    syncSendState();
    position();
    if (message) console.info(`[${NAME}] ${message}`);
  }
  function close() {
    renderId++;
    closePlayback();
    clearPreviews();
    root?.remove();
    root = void 0;
    editing = null;
  }
  function syncSendState() {
    const cancel = root?.querySelector(".rl-cancel");
    if (cancel) cancel.hidden = !conversion;
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
      button.classList.toggle("rl-working", busy);
      button.setAttribute("aria-busy", String(busy));
      button.title = busy && lastStatus ? t(lastStatus) : t(NAME);
    }
  }
  async function load() {
    loading = true;
    updateProgress();
    try {
      if (!importing) {
        const { api, store: store2 } = dataStore();
        const cleaned = await cleanupLegacyCopies();
        entries = await api.get(KEY, store2) ?? [];
        folderHandles = await api.get("folders", store2) ?? [];
        defaultFolder = await api.get("defaultFolder", store2) ?? void 0;
        updateSaveFolderLabel();
        await refreshFolderAccess();
        await restoreAccessOnOpen();
        if (!panelSize) {
          const savedSize = await api.get("panelSize", store2);
          if (savedSize && Number.isFinite(savedSize.width) && Number.isFinite(savedSize.height)) resizePanel(savedSize.width, savedSize.height);
        }
        if (cleaned.count) status(`Removed ${cleaned.count.toLocaleString()} old stored copies. File references were preserved.`);
      }
      render();
    } finally {
      loading = false;
      updateProgress();
    }
  }
  async function cleanupLegacyCopies() {
    const { api, store: store2 } = dataStore();
    const marker = "legacy-copies-cleaned-v1";
    return store2("readwrite", (objectStore) => {
      const complete = api.promisifyRequest(objectStore.transaction);
      const deleted = /* @__PURE__ */ new Set();
      let bytes = 0;
      const checked = objectStore.get(marker);
      checked.onsuccess = () => {
        if (checked.result) return;
        const request = objectStore.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            if (typeof cursor.key === "string" && cursor.key.startsWith("file:") && cursor.value instanceof Blob) {
              deleted.add(cursor.key.slice(5));
              bytes += cursor.value.size;
              cursor.delete();
            }
            cursor.continue();
            return;
          }
          const index = objectStore.get(KEY);
          index.onsuccess = () => {
            if (deleted.size) objectStore.put((index.result ?? []).filter((entry) => !deleted.has(entry.id)), KEY);
            objectStore.put({ count: deleted.size, bytes, completed: Date.now() }, marker);
          };
        };
      };
      return complete.then(() => ({ count: deleted.size, bytes }));
    });
  }
  async function pickFolder() {
    if (importing || removing) return;
    const native = vencord()?.Native;
    if (!native && !globalThis.showDirectoryPicker) {
      status("This client version does not support persistent folder references. No files were copied.");
      return;
    }
    let directory;
    try {
      directory = native ? await native.pickFolder() : await globalThis.showDirectoryPicker({ mode: "read" });
    } catch (error) {
      if (error.name !== "AbortError") status(error.message);
      return;
    }
    if (!directory) return;
    importing = true;
    importProgress = { total: 0, processed: 0, imported: 0, skipped: 0, failed: 0, scanning: true };
    updateProgress();
    try {
      const files = [];
      async function scan(handle2, path) {
        for await (const child of handle2.values()) {
          const childPath = `${path}/${child.name}`;
          if (child.kind === "directory") await scan(child, childPath);
          else {
            files.push({ name: child.name, type: "", path: childPath, handle: child });
            importProgress.total++;
            if (files.length % 20 === 0) {
              updateProgress();
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }
      }
      if (native) {
        for (const file of directory.files) files.push({ name: file.name, type: "", path: `${directory.name}/${file.relative}`, handle: { kind: "native-file", root: directory.root, relative: file.relative } });
        importProgress.total = files.length;
      } else await scan(directory, directory.name);
      const { api, store: store2 } = dataStore();
      const handle = native ? { kind: "native-directory", root: directory.root } : directory;
      folderHandles = [...folderHandles.filter((item) => item.name !== directory.name), { name: directory.name, handle }];
      await api.set("folders", folderHandles, store2);
      folderAccess.set(directory.name, "granted");
      importProgress.scanning = false;
      await importFolder(files);
    } catch (error) {
      importProgress.error = error.message;
      status(error.message);
    } finally {
      importing = false;
      importProgress.scanning = false;
      updateProgress();
      render();
    }
  }
  function updateSaveFolderLabel() {
    const label = root?.querySelector(".rl-save-folder-label");
    if (label) label.textContent = defaultFolder ? `${t("Save folder")}: ${defaultFolder.name}` : t("No save folder selected");
  }
  async function chooseSaveFolder() {
    const native = vencord()?.Native;
    if (!native?.pickSaveFolder && !globalThis.showDirectoryPicker) return status("This client version does not support persistent folder references. No files were copied.");
    let selected;
    try {
      selected = native?.pickSaveFolder ? await native.pickSaveFolder() : await globalThis.showDirectoryPicker({ mode: "readwrite" });
    } catch (error) {
      if (error.name !== "AbortError") status(error.message);
      return;
    }
    if (!selected) return;
    try {
      const { api, store: store2 } = dataStore();
      const saved = await api.get("folders", store2) ?? [];
      const handle = native?.pickSaveFolder ? { kind: "native-directory", root: selected.root } : selected;
      let name = selected.name;
      let suffix = 2;
      while (saved.some((folder2) => folder2.name === name && (handle.root ? folder2.handle.root !== handle.root : folder2.handle !== handle))) name = `${selected.name} (${suffix++})`;
      const folder = { name, handle };
      const next = [...saved.filter((item) => item.name !== name), folder];
      await api.setMany([["folders", next], ["defaultFolder", folder]], store2);
      folderHandles = next;
      defaultFolder = folder;
      folderAccess.set(name, "granted");
      updateSaveFolderLabel();
      updateFolders();
      status(`${t("Save folder")}: ${name}`);
    } catch (error) {
      status(error.message);
    }
  }
  function contextMedia(navId, props) {
    if (!props || navId === "image-context" && "href" in props && !props.src) return null;
    const target = props.target;
    const media = target?.closest?.("img,video,audio");
    const candidates = [props.itemSrc, props.src, props.itemHref, props.href, media?.currentSrc, media?.src];
    const candidate = candidates.find((value) => typeof value === "string" && mediaKind({ name: value.split("?")[0], type: "" })) ?? (media && candidates.find((value) => typeof value === "string"));
    if (!candidate) return null;
    let url;
    try {
      url = new URL(candidate, location.href);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "blob:") return null;
    let filename;
    try {
      filename = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    } catch {
      filename = url.pathname.split("/").pop() ?? "";
    }
    filename = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
    const attachmentKey = (value) => {
      try {
        const path = new URL(value).pathname;
        const match = path.match(/\/attachments\/\d+\/(\d+)\//);
        return match?.[1] ?? path;
      } catch {
        return "";
      }
    };
    const key = attachmentKey(candidate);
    const attachment = props.message?.attachments?.find((item) => [item.url, item.proxy_url].some((value) => value && attachmentKey(value) === key));
    const name = attachment?.filename ?? filename;
    if (!mediaKind({ name, type: "" }) && !media) return null;
    const urls = [...new Set([attachment?.url, attachment?.proxy_url, url.href].filter((value) => typeof value === "string"))];
    return { urls, name };
  }
  async function saveContextMedia(source) {
    const { api, store: store2 } = dataStore();
    const folder = await api.get("defaultFolder", store2) ?? defaultFolder;
    if (!folder) throw new Error("Choose a default save folder in Reaction Library first.");
    const native = vencord()?.Native;
    if (!native?.saveMedia) {
      let permission;
      try {
        permission = await folder.handle.queryPermission({ mode: "readwrite" });
      } catch (error) {
        if (error.name === "NotFoundError") throw new Error("The save folder is unavailable. Open Reaction Library and set the save folder again.");
        throw error;
      }
      if (permission !== "granted") throw new Error("Save folder access expired. Set the save folder again in Reaction Library.");
    }
    let saved;
    let kind;
    const urls = source.urls ?? [source.url];
    if (native?.downloadMedia && urls.some((url) => url.startsWith("https:"))) {
      let lastError;
      for (const url of urls.filter((url2) => url2.startsWith("https:"))) {
        try {
          saved = await native.downloadMedia(folder.handle.root, url, source.name);
          break;
        } catch (error) {
          if (/too large|not supported|default save folder/i.test(error.message)) throw error;
          lastError = error;
        }
      }
      if (!saved) throw lastError;
      kind = mediaKind({ name: saved.name, type: saved.type });
      if (!kind) throw new Error("The selected file is not supported media.");
      saved.handle = { kind: "native-file", root: folder.handle.root, relative: saved.relative };
    } else {
      const limit = 256 * 1024 * 1024;
      const nativeFetch = globalThis.VencordNative?.pluginHelpers?.FileUpload;
      let blob;
      let lastError;
      for (const url of urls) {
        try {
          if (nativeFetch?.fetchFile && url.startsWith("https:")) {
            const result = await nativeFetch.fetchFile(url);
            if (!result?.success || !result.data) throw new Error(result?.error || "This media could not be downloaded.");
            blob = new Blob([result.data], { type: result.contentType ?? "" });
          } else {
            const response = await fetch(url, { credentials: "omit" });
            if (!response.ok) throw new Error("This media could not be downloaded.");
            if (Number(response.headers.get("content-length")) > limit) throw new Error("This media is too large to save (256 MiB limit).");
            blob = await response.blob();
          }
          break;
        } catch (error) {
          if (/too large|not supported/i.test(error.message)) throw error;
          lastError = error;
        }
      }
      if (!blob) throw lastError;
      if (!blob.size || blob.size > limit) throw new Error(blob.size ? "This media is too large to save (256 MiB limit)." : "This media could not be downloaded.");
      const type = blob.type.split(";")[0];
      if (type && type !== "application/octet-stream" && !/^(image|video|audio)\//.test(type)) throw new Error("The selected file is not supported media.");
      const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav" };
      let name = source.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || `reaction-${Date.now()}`;
      if (!mediaKind({ name, type: "" }) && extensions[type]) name += extensions[type];
      kind = mediaKind({ name, type });
      if (!kind) throw new Error("The selected file is not supported media.");
      if (native?.saveMedia) {
        saved = await native.saveMedia(folder.handle.root, name, new Uint8Array(await blob.arrayBuffer()));
        saved.handle = { kind: "native-file", root: folder.handle.root, relative: saved.relative };
      } else {
        const extension = name.match(/\.[^.]+$/)?.[0] ?? "";
        const stem = name.slice(0, name.length - extension.length);
        try {
          for (let number = 1; number <= 1e4; number++) {
            const candidate = number === 1 ? name : `${stem} (${number})${extension}`;
            let exists = false;
            try {
              await folder.handle.getFileHandle(candidate);
              exists = true;
            } catch (error) {
              if (error.name !== "NotFoundError") throw error;
            }
            if (exists) continue;
            const handle = await folder.handle.getFileHandle(candidate, { create: true });
            const writer = await handle.createWritable();
            try {
              await writer.write(blob);
              await writer.close();
            } catch (error) {
              await writer.abort().catch(() => {
              });
              throw error;
            }
            saved = { name: candidate, relative: candidate, handle };
            break;
          }
        } catch (error) {
          if (error.name === "NotFoundError") throw new Error("The save folder is unavailable. Open Reaction Library and set the save folder again.");
          throw error;
        }
        if (!saved) throw new Error("Could not find an available filename in the save folder.");
      }
    }
    const latest = await api.get(KEY, store2) ?? [];
    const entry = { id: crypto.randomUUID(), name: saved.name, path: `${folder.name}/${saved.relative}`, kind, tags: [], added: Date.now(), reference: true };
    await api.setMany([[FILE(entry.id), saved.handle], [KEY, [...latest, entry]]], store2);
    entries = [...latest, entry];
    defaultFolder = folder;
    render();
    const message = /^pt/i.test(locale()) ? `${saved.name} adicionado \xE0 biblioteca de rea\xE7\xF5es.` : `Added ${saved.name} to Reaction Library.`;
    status(message);
    vencord()?.Webpack?.Common?.showToast?.({ text: message, variant: "success" });
  }
  function queueContextSave(source) {
    const job = saveQueue.then(() => saveContextMedia(source));
    saveQueue = job.catch(() => {
    });
    void job.catch((error) => {
      status(error.message);
      vencord()?.Webpack?.Common?.showToast?.({ text: t(error.message), variant: "critical" });
    });
  }
  function attachContextMenus() {
    if (contextPatches.length) return;
    const common = vencord()?.Webpack?.Common;
    const api = vencord()?.Api?.ContextMenu;
    if (!api?.addContextMenuPatch || !common?.Menu?.MenuItem || !common?.React?.createElement) return;
    for (const navId of ["message", "image-context"]) {
      const patch = (children, props) => {
        const source = contextMedia(navId, props);
        if (!source) return;
        children.push(common.React.createElement(common.Menu.MenuItem, {
          id: "reaction-library-add-media",
          label: t("Add to reaction library"),
          action: () => queueContextSave(source)
        }));
      };
      api.addContextMenuPatch(navId, patch);
      contextPatches.push({ api, navId, patch });
    }
  }
  async function importFolder(files) {
    const { api, store: store2 } = dataStore();
    updateProgress();
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    let batch = [];
    async function commit() {
      if (!batch.length) return;
      const next = new Map(entries.map((entry) => [entry.id, entry]));
      for (const { entry } of batch) next.set(entry.id, entry);
      try {
        await api.setMany([...batch.map(({ entry, file }) => [FILE(entry.id), file.handle]), [KEY, [...next.values()]]], store2);
        entries = [...next.values()];
        importProgress.imported += batch.length;
        batch.forEach(({ entry }) => byPath.set(entry.path, entry));
        render();
      } catch (error) {
        importProgress.failed += batch.length;
        importProgress.error = error instanceof Error ? error.message : "Storage write failed.";
        throw error;
      } finally {
        batch = [];
        updateProgress();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    try {
      for (const file of files) {
        const kind = mediaKind(file);
        importProgress.processed++;
        if (!kind) {
          importProgress.skipped++;
          continue;
        }
        const { path } = file;
        const existing = byPath.get(path);
        const entry = { ...existing ?? { id: crypto.randomUUID(), tags: [], added: Date.now() }, name: file.name, path, kind, reference: true };
        batch.push({ entry, file });
        if (batch.length >= 20) await commit();
      }
      await commit();
    } finally {
      updateProgress();
    }
  }
  function updateProgress() {
    const add = root?.querySelector(".rl-import");
    if (add) add.disabled = importing || loading || removing;
    root?.querySelectorAll(".rl-remove").forEach((button) => {
      button.disabled = importing || removing;
    });
    const removeFolder = root?.querySelector(".rl-remove-folder");
    if (removeFolder) removeFolder.disabled = !folderFilter || importing || removing;
    const area = root?.querySelector(".rl-progress");
    if (!area) return;
    area.replaceChildren();
    if (loading && !importProgress) {
      area.textContent = t("Loading your library\u2026");
    } else if (importProgress) {
      const p = importProgress;
      const prefix = p.scanning ? `${t("Scanning folder")} \xB7 ${p.total.toLocaleString()} ${t("files found")}` : importing ? `${t("Indexing")} ${p.processed.toLocaleString()} / ${p.total.toLocaleString()}` : p.error ? t("Import stopped") : t("Import complete");
      area.append(element("div", "", `${prefix} \xB7 ${p.imported.toLocaleString()} ${t("referenced")}${p.skipped ? ` \xB7 ${p.skipped} ${t("skipped")}` : ""}${p.failed ? ` \xB7 ${p.failed} ${t("failed")}` : ""}`));
      if (importing) {
        const progress = element("progress");
        progress.max = Math.max(1, p.total);
        if (!p.scanning) progress.value = p.imported + p.skipped;
        progress.setAttribute("aria-label", t("Folder import progress"));
        area.append(progress);
      }
      if (p.error) area.append(element("div", "", `${t(p.error)} ${t("Previously indexed items are still available.")}`));
    }
    position();
  }
  async function saveTags(entry, value) {
    if (importing || removing) return;
    const { api, store: store2 } = dataStore();
    const tags = [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
    entries = entries.map((item) => item.id === entry.id ? { ...item, tags } : item);
    await api.set(KEY, entries, store2);
    editing = null;
    await render();
  }
  async function sendEntry(entry, format = "file", options2 = {}) {
    if (busy) return;
    busy = true;
    const initialRoot = root;
    const voice = format === "voice";
    if (format !== "file" || options2.clip) conversion = new AbortController();
    const signal = conversion?.signal;
    status(`Sending ${entry.name}\u2026`);
    try {
      const vc = vencord();
      const common = vc?.Webpack?.Common;
      if (!common) throw new Error("The client mod is not ready yet.");
      const channelId = common.SelectedChannelStore.getChannelId();
      const channel = common.ChannelStore.getChannel(channelId);
      if (!channel) throw new Error("Open a chat before sending a reaction.");
      let blob = await readMedia(entry, true);
      signal?.throwIfAborted();
      if (options2.clip && !voice) {
        status("Preparing clip\u2026");
        blob = await prepareClip(blob, entry.kind, options2.clip, signal);
        signal?.throwIfAborted();
      }
      if (voice) {
        if (entry.kind !== "audio" && entry.kind !== "video") throw new Error("Choose audio or video to send as a voice message.");
        if (channel.guild_id && (!common.PermissionStore.can(common.PermissionsBits.SEND_VOICE_MESSAGES, channel) || !common.PermissionStore.can(common.PermissionsBits.SEND_MESSAGES, channel))) throw new Error("You cannot send voice messages in this channel.");
        status("Preparing voice message\u2026");
        const prepared = await prepareVoice(blob, entry.kind === "video", signal, options2.clip);
        signal.throwIfAborted();
        conversion = void 0;
        status("Uploading voice message\u2026");
        await uploadVoice(common, channelId, prepared);
        finishSend(entry, initialRoot);
        return;
      }
      if (format === "gif") {
        if (entry.kind !== "video") throw new Error("Choose a video to send as a GIF.");
        blob = await prepareGif(blob, signal);
        signal.throwIfAborted();
        conversion = void 0;
        status("Uploading GIF\u2026");
      }
      const baseName = format === "gif" ? entry.name.replace(/\.[^.]+$/, "") + ".gif" : options2.clip ? entry.name.replace(/\.[^.]+$/, "") + "-clip.webm" : entry.name;
      const filename = options2.spoiler ? `SPOILER_${baseName}` : baseName;
      const file = new File([blob], filename, { type: blob.type });
      const draftType = common.DraftType.ChannelMessage;
      await common.UploadHandler.promptToUpload([file], channel, draftType);
      const uploads = [...common.UploadAttachmentStore.getUploads(channelId, draftType)];
      const index = uploads.findIndex((upload2) => upload2.item.file === file);
      if (index < 0) throw new Error("The upload was not accepted.");
      const [upload] = uploads.splice(index, 1);
      if (options2.spoiler) upload.item.isSpoiler = true;
      common.UploadManager.setUploads({ uploads, channelId, draftType });
      const reply = common.PendingReplyStore.getPendingReply(channelId);
      common.FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
      await vc.Util.sendMessage(channelId, {}, false, {
        ...common.MessageActions.getSendMessageOptionsForReply(reply),
        attachmentsToUpload: [upload]
      });
      finishSend(entry, initialRoot);
    } catch (error) {
      const message = signal?.aborted ? "Conversion cancelled." : error instanceof Error ? error.message : "Could not send this reaction.";
      status(message);
      if (!root) vencord()?.Webpack?.Common?.showToast?.({ text: t(message), variant: "critical" });
    } finally {
      busy = false;
      conversion = void 0;
      syncSendState();
    }
  }
  function finishSend(entry, initialRoot) {
    status(`Sent ${entry.name}.`);
    if (root && root === initialRoot) close();
    else vencord()?.Webpack?.Common?.showToast?.({ text: t(`Sent ${entry.name}.`), variant: "success" });
  }
  async function prepareClip(blob, kind, clip, signal) {
    if (kind !== "audio" && kind !== "video") throw new Error("Only audio and video can be clipped.");
    if (!globalThis.MediaRecorder) throw new Error("Clip recording is unavailable in this client version.");
    const media = element(kind);
    const url = URL.createObjectURL(blob);
    let stream;
    let recorder;
    media.preload = "auto";
    media.playsInline = true;
    media.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none";
    document.body.append(media);
    try {
      await waitForMedia(media, "loadedmetadata", signal, () => {
        media.src = url;
        media.load();
      });
      const { start: start2, end } = clip;
      if (!Number.isFinite(media.duration) || !Number.isFinite(start2) || !Number.isFinite(end) || start2 < 0 || end > media.duration || end - start2 < 0.1) throw new Error("Choose a valid clip start and end time.");
      if (start2) await waitForMedia(media, "seeked", signal, () => {
        media.currentTime = start2;
      });
      if (!media.captureStream) throw new Error("Clip recording is unavailable for this format in this client.");
      await media.play();
      signal?.throwIfAborted();
      stream = media.captureStream();
      if (!stream.getTracks().some((track) => track.readyState === "live")) throw new Error("Clip recording is unavailable for this format in this client.");
      media.pause();
      if (Math.abs(media.currentTime - start2) > 5e-3) await waitForMedia(media, "seeked", signal, () => {
        media.currentTime = start2;
      });
      signal?.throwIfAborted();
      const mimeType = kind === "video" ? ["video/webm", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"] : ["audio/webm", "audio/webm;codecs=opus"];
      const supported = mimeType.find((type) => MediaRecorder.isTypeSupported(type));
      if (!supported) throw new Error("This client cannot encode a clip of this type.");
      recorder = new MediaRecorder(stream, { mimeType: supported });
      const chunks = [];
      return await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          media.removeEventListener("timeupdate", progress);
          media.removeEventListener("ended", stop2);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        const stop2 = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };
        const abort = () => {
          stop2();
          fail(new Error("Conversion cancelled."));
        };
        const progress = () => {
          status(`Recording clip \xB7 ${Math.min(100, Math.round((media.currentTime - start2) / (end - start2) * 100))}%`);
          if (media.currentTime >= end) stop2();
        };
        const timer = setTimeout(stop2, Math.ceil((end - start2) * 1e3) + 1e3);
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror = () => fail(new Error("Could not record this clip."));
        recorder.onstop = () => {
          if (settled) return;
          settled = true;
          cleanup();
          const result = new Blob(chunks, { type: supported });
          result.size ? resolve(result) : reject(new Error("The recorded clip was empty."));
        };
        signal?.addEventListener("abort", abort, { once: true });
        media.addEventListener("timeupdate", progress);
        media.addEventListener("ended", stop2, { once: true });
        try {
          recorder.start();
          Promise.resolve(media.play()).catch(fail);
        } catch (error) {
          fail(error);
        }
      });
    } finally {
      media.pause();
      if (recorder?.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      media.removeAttribute("src");
      media.load();
      media.remove();
      URL.revokeObjectURL(url);
    }
  }
  function closePlayback() {
    playbackId++;
    if (playback) {
      playback.media.pause();
      playback.media.removeAttribute("src");
      playback.media.load();
      URL.revokeObjectURL(playback.url);
      playback = void 0;
    }
    root?.querySelector(".rl-preview")?.replaceChildren();
  }
  async function previewEntry(entry) {
    closePlayback();
    const current = playbackId;
    try {
      const blob = await readMedia(entry, true);
      if (!root || current !== playbackId) return;
      const area = root.querySelector(".rl-preview");
      const media = element(entry.kind === "video" ? "video" : "audio");
      const url = URL.createObjectURL(blob);
      playback = { media, url };
      media.controls = true;
      media.preload = "metadata";
      media.playsInline = true;
      media.src = url;
      media.addEventListener("error", () => status("Your client cannot play this file's format. You can still send the original file."), { once: true });
      const actions = element("div", "rl-actions");
      for (const [label, className, action] of [
        ["Send file", "rl-action-send", () => void sendEntry(entry)],
        ["Send as spoiler", "", () => void sendEntry(entry, "file", { spoiler: true })],
        ["Send as voice", "rl-action-voice", () => void sendEntry(entry, "voice")],
        ...entry.kind === "video" ? [["Send as GIF", "rl-action-gif", () => void sendEntry(entry, "gif")]] : [],
        ["Close preview", "rl-action-close", () => {
          closePlayback();
          position();
        }]
      ]) {
        const button = element("button", className, label);
        button.type = "button";
        button.addEventListener("click", action);
        actions.append(button);
      }
      area.append(element("div", "rl-preview-title", entry.name), media, actions);
      const clip = element("div", "rl-clip");
      const track = element("div", "rl-clip-track");
      const selection = element("div", "rl-clip-selection");
      const playhead = element("div", "rl-clip-playhead");
      const startHandle = element("button", "rl-clip-handle");
      const endHandle = element("button", "rl-clip-handle");
      const times = element("div", "rl-clip-times");
      const startTime = element("span");
      const durationTime = element("span");
      const endTime = element("span");
      let duration = 0;
      let start2 = 0;
      let end = 0;
      let playRequested = false;
      let seekTimer;
      const timeLabel = (value) => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toFixed(1).padStart(4, "0")}`;
      const updatePlayhead = () => {
        playhead.style.left = `${duration ? Math.max(0, Math.min(100, media.currentTime / duration * 100)) : 0}%`;
      };
      const updateClip = () => {
        const left = duration ? start2 / duration * 100 : 0;
        const right = duration ? end / duration * 100 : 100;
        selection.style.left = `${left}%`;
        selection.style.width = `${right - left}%`;
        startHandle.style.left = `${left}%`;
        endHandle.style.left = `${right}%`;
        startTime.textContent = timeLabel(start2);
        durationTime.textContent = timeLabel(end - start2);
        endTime.textContent = timeLabel(end);
        startHandle.setAttribute("aria-valuenow", String(start2.toFixed(1)));
        endHandle.setAttribute("aria-valuenow", String(end.toFixed(1)));
        updatePlayhead();
      };
      media.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(media.duration) || media.duration <= 0) return;
        duration = media.duration;
        end = duration;
        for (const handle of [startHandle, endHandle]) handle.setAttribute("aria-valuemax", String(duration));
        updateClip();
      }, { once: true });
      const resumeSelection = () => {
        if (!playRequested || playback?.media !== media || media.seeking) return;
        if (Math.abs(media.currentTime - start2) >= 0.025) {
          media.currentTime = start2;
          return;
        }
        clearTimeout(seekTimer);
        playRequested = false;
        void media.play().catch((error) => status(error.message));
      };
      const playSelection = () => {
        if (!duration || playRequested) return;
        playRequested = true;
        media.pause();
        const needsSeek = media.seeking || Math.abs(media.currentTime - start2) >= 0.025;
        if (Math.abs(media.currentTime - start2) >= 0.025) media.currentTime = start2;
        seekTimer = setTimeout(() => {
          if (!playRequested) return;
          playRequested = false;
          status("The preview could not seek to the clip start. Try playing again.");
        }, 5e3);
        if (needsSeek) setTimeout(resumeSelection, 50);
        else resumeSelection();
      };
      media.addEventListener("seeked", () => {
        updatePlayhead();
        resumeSelection();
      });
      media.addEventListener("emptied", () => {
        playRequested = false;
        clearTimeout(seekTimer);
      });
      media.addEventListener("play", () => {
        if (duration && !playRequested && (media.seeking || media.currentTime < start2 - 0.025 || media.currentTime >= end)) playSelection();
      });
      media.addEventListener("timeupdate", () => {
        if (!duration) return;
        if (!media.paused && !media.seeking && !playRequested) {
          if (media.currentTime < start2 - 0.025) playSelection();
          else if (media.currentTime >= end) media.pause();
        }
        updatePlayhead();
      });
      const moveHandle = (which, value) => {
        if (!duration) return;
        const minimum = Math.min(0.1, duration);
        if (which === "start") start2 = Math.max(0, Math.min(end - minimum, value));
        else end = Math.min(duration, Math.max(start2 + minimum, value));
        playRequested = false;
        clearTimeout(seekTimer);
        media.pause();
        if (which === "start" || media.currentTime < start2 || media.currentTime >= end) media.currentTime = start2;
        updateClip();
      };
      for (const [handle, which, label] of [[startHandle, "start", "Clip start"], [endHandle, "end", "Clip end"]]) {
        handle.type = "button";
        handle.setAttribute("aria-label", t(label));
        handle.setAttribute("aria-valuemin", "0");
        handle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener("pointermove", (event) => {
          if (handle.hasPointerCapture(event.pointerId)) {
            const bounds = track.getBoundingClientRect();
            moveHandle(which, (event.clientX - bounds.left) / bounds.width * duration);
          }
        });
        handle.addEventListener("keydown", (event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            moveHandle(which, (which === "start" ? start2 : end) + (event.key === "ArrowRight" ? 0.1 : -0.1));
          }
        });
      }
      track.addEventListener("pointerdown", (event) => {
        if (event.target !== track && event.target !== selection) return;
        const bounds = track.getBoundingClientRect();
        const value = (event.clientX - bounds.left) / bounds.width * duration;
        moveHandle(Math.abs(value - start2) < Math.abs(value - end) ? "start" : "end", value);
      });
      track.append(selection, playhead, startHandle, endHandle);
      times.append(startTime, durationTime, endTime);
      updateClip();
      const clipSend = element("button", "rl-primary", "Send clip");
      clipSend.type = "button";
      clipSend.addEventListener("click", () => void sendEntry(entry, "file", { clip: { start: start2, end } }));
      const clipSpoiler = element("button", "rl-primary", "Send clip as spoiler");
      clipSpoiler.type = "button";
      clipSpoiler.addEventListener("click", () => void sendEntry(entry, "file", { spoiler: true, clip: { start: start2, end } }));
      const clipVoice = element("button", "rl-primary", "Send clip as voice");
      clipVoice.type = "button";
      clipVoice.addEventListener("click", () => void sendEntry(entry, "voice", { clip: { start: start2, end } }));
      const clipActions = element("div", "rl-clip-actions");
      clipActions.append(clipSend, clipSpoiler, clipVoice);
      clip.append(track, times, clipActions);
      area.append(clip);
      position();
    } catch (error) {
      status(error.message);
    }
  }
  function waitForMedia(video, event, signal, action, timeout = 3e4) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener("error", failed);
        signal?.removeEventListener("abort", aborted);
      };
      const done = () => {
        clean();
        resolve();
      };
      const failed = () => {
        clean();
        reject(new Error("Your client could not decode this video. You can send the original file instead."));
      };
      const aborted = () => {
        clean();
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        clean();
        reject(new Error("Video decoding timed out. Try sending the original file."));
      }, timeout);
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", failed, { once: true });
      signal?.addEventListener("abort", aborted, { once: true });
      try {
        action?.();
      } catch (error) {
        clean();
        reject(error);
      }
    });
  }
  async function conversionVideo(blob, signal) {
    const video = element("video");
    const url = URL.createObjectURL(blob);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none";
    document.body.append(video);
    const dispose = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(url);
    };
    try {
      await waitForMedia(video, "loadeddata", signal, () => {
        video.src = url;
        video.load();
      });
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error("The video has no readable frames or duration.");
      return { video, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  }
  async function prepareGif(blob, signal) {
    const { video, dispose } = await conversionVideo(blob, signal);
    const canvas = element("canvas");
    try {
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("GIF conversion is unavailable in this client version.");
      const count = Math.max(1, Math.min(900, Math.ceil(video.duration * 10)));
      const gif = (0, import_gifenc.GIFEncoder)();
      for (let i = 0; i < count; i++) {
        signal?.throwIfAborted();
        const time = i * video.duration / count;
        if (Math.abs(video.currentTime - time) > 1e-5) await waitForMedia(video, "seeked", signal, () => {
          video.currentTime = time;
        });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const palette = (0, import_gifenc.quantize)(data, 128);
        const pixels = (0, import_gifenc.applyPalette)(data, palette);
        const delay = (Math.round((i + 1) * video.duration * 100 / count) - Math.round(i * video.duration * 100 / count)) * 10;
        gif.writeFrame(pixels, canvas.width, canvas.height, { palette, delay: Math.max(10, delay), repeat: 0 });
        if (gif.bytesView().length > 64 * 1024 * 1024) throw new Error("This GIF is too large to prepare in memory. Try a shorter video or send the original file.");
        status(`Converting GIF \xB7 frame ${(i + 1).toLocaleString()} / ${count.toLocaleString()}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      gif.finish();
      return new Blob([gif.bytesView()], { type: "image/gif" });
    } finally {
      canvas.width = canvas.height = 0;
      dispose();
    }
  }
  async function extractVideoAudio(blob, signal) {
    const { video, dispose } = await conversionVideo(blob, signal);
    let stream;
    let recorder;
    try {
      if (!video.captureStream || !globalThis.MediaRecorder) throw new Error("This client version cannot extract this video's audio. Try a browser-supported video format.");
      await video.play();
      signal?.throwIfAborted();
      stream = video.captureStream();
      const tracks = stream.getAudioTracks();
      if (!tracks.some((track) => track.readyState === "live")) throw new Error("No supported audio track was found in this video.");
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Audio extraction is unavailable in this client version.");
      recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
      const chunks = [];
      return await new Promise((resolve, reject) => {
        const clean = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", aborted);
          video.removeEventListener("ended", ended);
          video.removeEventListener("timeupdate", progress);
          video.removeEventListener("error", failed);
          recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
        };
        const failed = () => {
          clean();
          reject(new Error("Could not extract this video's audio."));
        };
        const aborted = () => {
          clean();
          reject(signal.reason);
        };
        const ended = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };
        const progress = () => status(`Extracting audio \xB7 ${Math.min(100, Math.floor(video.currentTime / video.duration * 100))}% (plays through once)`);
        const timer = setTimeout(failed, Math.ceil(video.duration * 1e3) + 3e4);
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onerror = failed;
        recorder.onstop = () => {
          const audio = new Blob(chunks, { type: mimeType });
          clean();
          if (audio.size) resolve(audio);
          else reject(new Error("The video's audio track was empty."));
        };
        signal?.addEventListener("abort", aborted, { once: true });
        video.addEventListener("ended", ended, { once: true });
        video.addEventListener("timeupdate", progress);
        video.addEventListener("error", failed, { once: true });
        try {
          signal?.throwIfAborted();
          recorder.start();
        } catch (error) {
          clean();
          reject(error);
        }
      });
    } finally {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      dispose();
    }
  }
  function waveform(samples, duration) {
    const bins = new Uint8Array(Math.min(256, Math.max(32, Math.ceil(duration * 10))));
    for (let i = 0; i < bins.length; i++) {
      const start2 = Math.floor(i * samples.length / bins.length);
      const end = Math.floor((i + 1) * samples.length / bins.length);
      let sum = 0;
      for (let j = start2; j < end; j++) sum += samples[j] ** 2;
      bins[i] = Math.min(255, Math.round(Math.sqrt(sum / Math.max(1, end - start2)) * 255));
    }
    return btoa(String.fromCharCode(...bins));
  }
  function oggPage(packet, sequence, granule, flags, serial) {
    const segments = Math.floor(packet.length / 255) + 1;
    if (segments > 255) throw new Error("Audio packet is too large.");
    const page = new Uint8Array(27 + segments + packet.length);
    const view = new DataView(page.buffer);
    page.set(new TextEncoder().encode("OggS"));
    page[5] = flags;
    view.setBigUint64(6, BigInt(granule), true);
    view.setUint32(14, serial, true);
    view.setUint32(18, sequence, true);
    page[26] = segments;
    for (let i = 0; i < segments; i++) page[27 + i] = Math.min(255, packet.length - i * 255);
    page.set(packet, 27 + segments);
    let crc = 0;
    for (const byte of page) {
      crc ^= byte << 24;
      for (let i = 0; i < 8; i++) crc = crc << 1 ^ (crc & 2147483648 ? 79764919 : 0);
    }
    view.setUint32(22, crc >>> 0, true);
    return page;
  }
  async function prepareVoice(blob, video = false, signal, clip) {
    const context = new AudioContext();
    let decoded;
    try {
      try {
        decoded = await context.decodeAudioData(await blob.arrayBuffer());
      } catch (error) {
        if (!video) throw error;
        status("Extracting the video's audio in memory\u2026");
        const audio = await extractVideoAudio(blob, signal);
        decoded = await context.decodeAudioData(await audio.arrayBuffer());
      }
    } finally {
      await context.close();
    }
    const start2 = clip?.start ?? 0;
    const end = clip ? Math.min(clip.end, decoded.duration) : decoded.duration;
    const duration = end - start2;
    signal?.throwIfAborted();
    if (!Number.isFinite(duration) || duration <= 0 || start2 < 0 || clip && clip.end - start2 < 0.1) throw new Error("This audio file is empty or could not be decoded.");
    const offline = new OfflineAudioContext(1, Math.ceil(duration * 48e3), 48e3);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, start2, duration);
    const samples = (await offline.startRendering()).getChannelData(0);
    const wave = waveform(samples, duration);
    const headerBytes = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
    const signature = new TextDecoder().decode(headerBytes);
    if (!clip && signature.startsWith("OggS") && signature.includes("OpusHead")) return { blob, duration, waveform: wave };
    if (!globalThis.AudioEncoder || !globalThis.AudioData) throw new Error("Voice conversion is unavailable in this client version. You can send this as a file, or use OGG Opus audio.");
    const config = { codec: "opus", sampleRate: 48e3, numberOfChannels: 1, bitrate: 32e3, opus: { frameDuration: 2e4 } };
    if (!(await AudioEncoder.isConfigSupported(config)).supported) throw new Error("This client version cannot encode voice messages. Send the original file instead.");
    const packets = [];
    let header;
    let encodingError;
    const encoder = new AudioEncoder({
      output(chunk, metadata) {
        const packet = new Uint8Array(chunk.byteLength);
        chunk.copyTo(packet);
        packets.push(packet);
        if (metadata?.decoderConfig?.description) header = new Uint8Array(metadata.decoderConfig.description).slice();
      },
      error: (error) => {
        encodingError = error;
      }
    });
    try {
      encoder.configure(config);
      for (let offset = 0; offset < samples.length; offset += 960) {
        signal?.throwIfAborted();
        const data = new Float32Array(960);
        data.set(samples.subarray(offset, offset + 960));
        const frame2 = new AudioData({ format: "f32", sampleRate: 48e3, numberOfFrames: 960, numberOfChannels: 1, timestamp: Math.round(offset / 48e3 * 1e6), data });
        try {
          encoder.encode(frame2);
        } finally {
          frame2.close();
        }
        while (encoder.encodeQueueSize > 50 && !encodingError) await new Promise((resolve) => setTimeout(resolve, 0));
        if (encodingError) throw encodingError;
      }
      await encoder.flush();
      if (encodingError) throw encodingError;
    } finally {
      if (encoder.state !== "closed") encoder.close();
    }
    if (!packets.length) throw new Error("Voice conversion produced no audio.");
    if (!header || new TextDecoder().decode(header.subarray(0, 8)) !== "OpusHead") {
      header = new Uint8Array(19);
      header.set(new TextEncoder().encode("OpusHead"));
      header[8] = 1;
      header[9] = 1;
      const view = new DataView(header.buffer);
      view.setUint16(10, 312, true);
      view.setUint32(12, 48e3, true);
    }
    const preskip = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint16(10, true);
    const tags = new Uint8Array(16);
    tags.set(new TextEncoder().encode("OpusTags"));
    const serial = crypto.getRandomValues(new Uint32Array(1))[0];
    const pages = [oggPage(header, 0, 0, 2, serial), oggPage(tags, 1, 0, 0, serial)];
    packets.forEach((packet, i) => pages.push(oggPage(packet, i + 2, i === packets.length - 1 ? Math.min((i + 1) * 960, samples.length + preskip) : (i + 1) * 960, i === packets.length - 1 ? 4 : 0, serial)));
    return { blob: new Blob(pages, { type: "audio/ogg; codecs=opus" }), duration, waveform: wave };
  }
  async function uploadVoice(common, channelId, prepared) {
    const reply = common.PendingReplyStore.getPendingReply(channelId);
    const upload = new common.CloudUploader({ file: new File([prepared.blob], "voice-message.ogg", { type: "audio/ogg; codecs=opus" }), isThumbnail: false, platform: 1 }, channelId);
    await new Promise((resolve, reject) => {
      upload.on("complete", resolve);
      upload.on("error", () => reject(new Error("Voice message upload failed.")));
      Promise.resolve(upload.upload()).catch(reject);
    });
    await common.RestAPI.post({
      url: common.Constants.Endpoints.MESSAGES(channelId),
      body: {
        flags: 8192,
        channel_id: channelId,
        content: "",
        nonce: common.SnowflakeUtils.fromTimestamp(Date.now()),
        sticker_ids: [],
        type: 0,
        attachments: [{ id: "0", filename: "voice-message.ogg", uploaded_filename: upload.uploadedFilename, waveform: prepared.waveform, duration_secs: prepared.duration }],
        message_reference: reply ? common.MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null
      }
    });
    if (reply && common.PendingReplyStore.getPendingReply(channelId) === reply) common.FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
  }
  async function readMedia(entry, request = false) {
    const folderName = entry.path?.split("/")[0];
    if (!request && entry.reference && folderAccess.has(folderName) && folderAccess.get(folderName) !== "granted") {
      const error = new Error("Restore folder access below to load your thumbnails. Your file references are still saved.");
      error.name = "NotAllowedError";
      throw error;
    }
    const { api, store: store2 } = dataStore();
    const saved = await api.get(FILE(entry.id), store2);
    if (saved instanceof Blob) return saved;
    if (saved?.kind === "native-file") {
      const native = vencord()?.Native;
      if (!native) throw new Error("Desktop file access is unavailable. Restart your client to load the plugin's native helper.");
      const file = await native.readMedia(saved.root, saved.relative);
      return new File([file.data], file.name, { type: file.type });
    }
    if (!saved || saved.kind !== "file") throw new Error("This file is missing. Add its folder again to reconnect it.");
    let permission = await saved.queryPermission({ mode: "read" });
    if (permission !== "granted" && request) permission = await saved.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      folderAccess.set(folderName, permission);
      renderFolderAccess();
      const error = new Error("Restore folder access below to load your thumbnails. Your file references are still saved.");
      error.name = "NotAllowedError";
      throw error;
    }
    return saved.getFile();
  }
  async function refreshFolderAccess() {
    await Promise.all(folderHandles.map(async (folder) => {
      try {
        folderAccess.set(folder.name, folder.handle.kind === "native-directory" ? "granted" : await folder.handle.queryPermission({ mode: "read" }));
      } catch {
        folderAccess.set(folder.name, "unavailable");
      }
    }));
    for (const entry of entries) {
      const name = entry.path.split("/")[0];
      if (entry.reference && !folderHandles.some((folder) => folder.name === name)) folderAccess.set(name, "unavailable");
    }
    renderFolderAccess();
  }
  function renderFolderAccess() {
    const area = root?.querySelector(".rl-access");
    if (!area) return;
    area.replaceChildren();
    const names = new Set(entries.filter((entry) => entry.reference).map((entry) => entry.path.split("/")[0]));
    const pending = [...names].filter((name) => folderAccess.has(name) && folderAccess.get(name) !== "granted" && (!folderFilter || folderFilter.split("/")[0] === name));
    if (!pending.length) {
      position();
      return;
    }
    area.append(element("div", "", "Folder access needs to be renewed after restarting your client. Your library and tags are still saved."));
    for (const name of pending) {
      const row = element("div", "rl-access-row");
      const missing = folderAccess.get(name) === "unavailable";
      const button = element("button", "rl-primary", missing ? "Select folder again" : "Restore access");
      button.type = "button";
      button.setAttribute("aria-label", `${t(missing ? "Select" : "Restore access to")} ${name}`);
      button.addEventListener("click", () => void (missing ? pickFolder() : reconnect(name)));
      row.append(element("span", "", name), button);
      area.append(row);
    }
    position();
  }
  async function restoreAccessOnOpen() {
    if (!root || !navigator.userActivation?.isActive) return;
    for (const folder of folderHandles) {
      if (folderAccess.get(folder.name) !== "prompt") continue;
      if (!navigator.userActivation.isActive) break;
      try {
        const permission = await folder.handle.requestPermission({ mode: "read" });
        folderAccess.set(folder.name, permission);
        if (permission !== "granted") break;
      } catch {
        break;
      }
    }
    renderFolderAccess();
  }
  async function reconnect(name = folderFilter.split("/")[0]) {
    if (!name) name = folderHandles.find((folder2) => folderAccess.get(folder2.name) !== "granted")?.name;
    const folder = folderHandles.find((item) => item.name === name);
    if (!folder) return status("Select a referenced folder first, or use Add folder to reconnect it.");
    try {
      if (folder.handle.kind === "native-directory") {
        folderAccess.set(folder.name, "granted");
        accessWarning = false;
        render();
        status(`Folder ${folder.name} reconnected.`);
        return;
      }
      const permission = await folder.handle.requestPermission({ mode: "read" });
      folderAccess.set(folder.name, permission);
      renderFolderAccess();
      if (permission !== "granted") return status("Folder access was not granted. Your references and tags are unchanged.");
      await refreshFolderAccess();
      accessWarning = false;
      render();
      status(`Access to ${folder.name} restored. Thumbnails are loading.`);
    } catch (error) {
      status(error.message);
    }
  }
  async function removeEntries(items) {
    if (importing || removing || !items.length) return;
    if (!confirm(/^pt/i.test(locale()) ? `Remover ${items.length === 1 ? items[0].name : `${items.length} itens`} da biblioteca? Os arquivos originais no computador n\xE3o ser\xE3o alterados.` : `Remove ${items.length === 1 ? items[0].name : `${items.length} items`} from the library? Original files on your computer will stay untouched.`)) return;
    removing = true;
    updateProgress();
    try {
      const ids = new Set(items.map((item) => item.id));
      const next = entries.filter((entry) => !ids.has(entry.id));
      const roots = new Set(next.filter((entry) => entry.reference).map((entry) => entry.path.split("/")[0]));
      const nextFolders = folderHandles.filter((folder) => roots.has(folder.name));
      const { api, store: store2 } = dataStore();
      await store2("readwrite", (objectStore) => {
        items.forEach((entry) => objectStore.delete(FILE(entry.id)));
        objectStore.put(next, KEY);
        objectStore.put(nextFolders, "folders");
        return api.promisifyRequest(objectStore.transaction);
      });
      entries = next;
      folderHandles = nextFolders;
      render();
      status(/^pt/i.test(locale()) ? `${items.length} ${items.length === 1 ? "item removido" : "itens removidos"} da biblioteca.` : `${items.length} item${items.length === 1 ? "" : "s"} removed from the library.`);
    } catch (error) {
      status(error.message);
    } finally {
      removing = false;
      updateProgress();
    }
  }
  function updateFolders() {
    const select = root?.querySelector(".rl-folder-select");
    if (!select) return;
    const folders = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      const parts = entry.path.split("/");
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    }
    if (folderFilter && !folders.has(folderFilter)) folderFilter = "";
    select.replaceChildren();
    for (const folder of ["", ...[...folders].sort()]) {
      const option = element("option", "", folder || "All folders");
      option.value = folder;
      select.append(option);
    }
    select.value = folderFilter;
    const remove = root.querySelector(".rl-remove-folder");
    remove.disabled = !folderFilter || importing || removing;
  }
  function clearPreviews() {
    previewObserver?.disconnect();
    previewCleanup.forEach((cleanup) => cleanup());
    previewCleanup = [];
  }
  function observePreviews(cards, scroll, currentRender) {
    let active = 0;
    const queue = [];
    const states = new Map(cards.map((card) => [card.button, { ...card, visible: false, queued: false, generation: 0, url: null, media: null }]));
    function release(state) {
      state.generation++;
      if (state.media?.tagName === "VIDEO") {
        state.media.removeAttribute("src");
        state.media.load();
      }
      state.media?.remove();
      state.media = null;
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = null;
      state.symbol.hidden = false;
    }
    async function hydrate(state) {
      const generation = ++state.generation;
      try {
        const blob = await readMedia(state.entry);
        if (!state.visible || generation !== state.generation || currentRender !== renderId) return;
        state.url = URL.createObjectURL(blob);
        const media = element(state.entry.kind === "video" ? "video" : "img");
        state.media = media;
        if (state.entry.kind === "video") {
          media.muted = true;
          media.playsInline = true;
          media.preload = "metadata";
          media.addEventListener("loadedmetadata", () => {
            if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = Math.min(0.2, media.duration / 2);
          }, { once: true });
        } else {
          media.alt = "";
          media.decoding = "async";
        }
        media.addEventListener("error", () => release(state), { once: true });
        media.src = state.url;
        state.symbol.hidden = true;
        state.button.prepend(media);
      } catch (error) {
        if (error.name === "NotAllowedError") {
          state.symbol.textContent = "\u{1F512}";
          state.button.title = `${state.entry.name} \xB7 ${t("Restore folder access to load its thumbnail")}`;
        }
        if (currentRender === renderId && !accessWarning) {
          accessWarning = true;
          status(error.message);
        }
      }
    }
    function pump() {
      while (active < 3 && queue.length) {
        const state = queue.shift();
        state.queued = false;
        if (!state.visible || state.url || currentRender !== renderId) continue;
        active++;
        void hydrate(state).finally(() => {
          active--;
          pump();
        });
      }
    }
    previewObserver = new IntersectionObserver((changes) => {
      for (const change of changes) {
        const state = states.get(change.target);
        state.visible = change.isIntersecting;
        if (!state.visible) release(state);
        else if (!state.url && !state.queued) {
          state.queued = true;
          queue.push(state);
        }
      }
      pump();
    }, { root: scroll, rootMargin: "160px" });
    states.forEach((state) => {
      previewObserver.observe(state.button);
      previewCleanup.push(() => {
        state.visible = false;
        release(state);
      });
    });
  }
  function render() {
    if (!root) return;
    const currentRender = ++renderId;
    clearPreviews();
    updateFolders();
    renderFolderAccess();
    const scroll = root.querySelector(".rl-scroll");
    const previousScroll = scroll.scrollTop;
    scroll.replaceChildren();
    const shown = entries.filter(
      (entry) => (filter === "all" || entry.kind === filter) && (!folderFilter || entry.path.startsWith(`${folderFilter}/`)) && `${entry.name} ${entry.path} ${entry.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.added - b.added : b.added - a.added);
    if (!entries.length || !shown.length) {
      scroll.append(element("div", "rl-empty", entries.length ? "No reactions match your search." : "Choose a folder to start your reaction library."));
      position();
      return;
    }
    const grid = element("div", "rl-grid");
    scroll.append(grid);
    const cards = [];
    for (const entry of shown.slice(0, visibleLimit)) {
      if (!root || currentRender !== renderId) return;
      const item = element("div", "rl-item");
      const sendButton = element("button", "rl-send");
      sendButton.type = "button";
      sendButton.title = `${t("Send")} ${entry.name}`;
      sendButton.addEventListener("click", () => void sendEntry(entry));
      const symbol = element("span", "rl-symbol", entry.kind === "video" ? "\u25B6" : entry.kind === "audio" ? "\u266B" : "\u25A7");
      sendButton.append(symbol);
      if (entry.kind !== "audio") cards.push({ button: sendButton, entry, symbol });
      if (entry.kind === "video") sendButton.append(element("span", "rl-video-badge", "\u25B6"));
      sendButton.append(element("strong", "", entry.name));
      item.append(sendButton);
      {
        const menu = element("details", "rl-options");
        const summary = element("summary", "", "\u22EF");
        summary.setAttribute("aria-label", `${t("Options for")} ${entry.name}`);
        summary.title = `${t("Options for")} ${entry.name}`;
        const actions = element("div", "rl-actions");
        const spoiler = element("button", "", "\u25C9  Send as spoiler");
        spoiler.type = "button";
        spoiler.addEventListener("click", () => void sendEntry(entry, "file", { spoiler: true }));
        actions.append(spoiler);
        if (entry.kind === "audio" || entry.kind === "video") {
          if (entry.kind === "audio") {
            const voice = element("button", "rl-action-voice", "\u266B  Send as voice");
            voice.type = "button";
            voice.addEventListener("click", () => void sendEntry(entry, "voice"));
            actions.append(voice);
          }
          if (entry.kind === "video") {
            const voice = element("button", "rl-action-voice", "\u266B  Send as voice");
            voice.type = "button";
            voice.addEventListener("click", () => void sendEntry(entry, "voice"));
            const gif = element("button", "rl-action-gif", "\u25A7  Send as GIF");
            gif.type = "button";
            gif.addEventListener("click", () => void sendEntry(entry, "gif"));
            actions.append(voice, gif);
          }
          const preview = element("button", "rl-action-preview", "\u25B6  Preview and trim");
          preview.type = "button";
          preview.setAttribute("aria-label", `${t("Preview")} ${entry.name}`);
          preview.addEventListener("click", () => void previewEntry(entry));
          actions.append(preview);
        }
        menu.append(summary, actions);
        item.append(menu);
      }
      if (editing === entry.id) {
        const row = element("div", "rl-tags");
        const input = element("input");
        input.placeholder = t("Tags, separated by commas");
        input.value = entry.tags.join(", ");
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") void saveTags(entry, input.value);
        });
        const save = element("button", "rl-primary", "Save");
        save.type = "button";
        save.addEventListener("click", () => void saveTags(entry, input.value));
        row.append(input, save);
        item.append(row);
      } else {
        const edit = element("button", "rl-edit", entry.tags.length ? entry.tags.join(", ") : "Add tags");
        edit.type = "button";
        edit.disabled = importing || removing;
        edit.addEventListener("click", () => {
          editing = entry.id;
          void render();
        });
        const footer = element("div", "rl-item-footer");
        const remove = element("button", "rl-remove", "Remove");
        remove.type = "button";
        remove.disabled = importing || removing;
        remove.setAttribute("aria-label", /^pt/i.test(locale()) ? `Remover ${entry.name} da biblioteca` : `Remove ${entry.name} from library`);
        remove.addEventListener("click", () => void removeEntries([entry]));
        footer.append(edit, remove);
        item.append(footer);
      }
      grid.append(item);
    }
    if (shown.length > visibleLimit) {
      const more = element("button", "rl-primary rl-more", `Show more (${Math.min(visibleLimit, shown.length)} / ${shown.length})`);
      more.type = "button";
      more.addEventListener("click", () => {
        visibleLimit += 60;
        render();
      });
      scroll.append(more);
    }
    scroll.scrollTop = previousScroll;
    observePreviews(cards, scroll, currentRender);
    position();
  }
  function position() {
    if (!root || !anchor?.isConnected) return;
    if (panelSize) {
      root.style.width = `${Math.min(panelSize.width, Math.max(1, innerWidth - 16))}px`;
      root.style.height = `${Math.min(panelSize.height, Math.max(1, innerHeight - 16))}px`;
      root.style.maxHeight = "calc(100vh - 16px)";
    }
    const rect = anchor.getBoundingClientRect();
    root.style.left = `${Math.max(8, Math.min(rect.right - root.offsetWidth, innerWidth - root.offsetWidth - 8))}px`;
    root.style.top = `${Math.max(8, rect.top - root.offsetHeight - 8)}px`;
  }
  function resizePanel(width, height) {
    panelSize = {
      width: Math.max(Math.min(360, innerWidth - 16), Math.min(width, innerWidth - 16)),
      height: Math.max(Math.min(300, innerHeight - 16), Math.min(height, innerHeight - 16))
    };
    position();
  }
  function savePanelSize() {
    const { api, store: store2 } = dataStore();
    void api.set("panelSize", panelSize, store2).catch((error) => status(error.message));
  }
  async function open(button) {
    if (root) return close();
    visibleLimit = 60;
    accessWarning = false;
    anchor = button;
    root = element("div", ROOT_CLASS);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", t(NAME));
    root.append(element("header", "", NAME));
    const resize = element("button", "rl-resize");
    resize.type = "button";
    resize.title = t("Drag the upper-left corner to resize. Arrow keys also work.");
    resize.setAttribute("aria-label", t("Resize library"));
    let drag;
    resize.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = { x: event.clientX, y: event.clientY, width: root.offsetWidth, height: root.offsetHeight };
      resize.setPointerCapture(event.pointerId);
    });
    resize.addEventListener("pointermove", (event) => {
      if (drag) resizePanel(drag.width + drag.x - event.clientX, drag.height + drag.y - event.clientY);
    });
    resize.addEventListener("lostpointercapture", () => {
      if (!drag) return;
      drag = void 0;
      savePanelSize();
    });
    resize.addEventListener("keydown", (event) => {
      const changes = { ArrowLeft: [20, 0], ArrowRight: [-20, 0], ArrowUp: [0, 20], ArrowDown: [0, -20] };
      const change = changes[event.key];
      if (!change) return;
      event.preventDefault();
      resizePanel(root.offsetWidth + change[0], root.offsetHeight + change[1]);
      savePanelSize();
    });
    root.append(resize);
    const cancel = element("button", "rl-cancel", "Cancel conversion");
    cancel.type = "button";
    cancel.hidden = !conversion;
    cancel.addEventListener("click", () => conversion?.abort());
    root.append(cancel);
    const controls = element("div", "rl-controls");
    const search = element("input");
    search.type = "search";
    search.placeholder = t("Search names, folders, and tags");
    search.setAttribute("aria-label", t("Search reactions"));
    search.value = query;
    search.addEventListener("input", () => {
      query = search.value;
      visibleLimit = 60;
      root.querySelector(".rl-scroll").scrollTop = 0;
      render();
    });
    const type = element("select");
    type.setAttribute("aria-label", t("Type"));
    for (const [value, label] of [["all", "All types"], ["image", "Images and GIFs"], ["video", "Videos"], ["audio", "Audio"]]) {
      const option = element("option", "", label);
      option.value = value;
      type.append(option);
    }
    type.value = filter;
    type.addEventListener("change", () => {
      filter = type.value;
      visibleLimit = 60;
      render();
    });
    const order = element("select");
    order.setAttribute("aria-label", t("Sort"));
    for (const [value, label] of [["newest", "Newest"], ["oldest", "Oldest"], ["name", "Name"]]) {
      const option = element("option", "", label);
      option.value = value;
      order.append(option);
    }
    order.value = sort;
    order.addEventListener("change", () => {
      sort = order.value;
      void render();
    });
    controls.append(search, type, order);
    root.append(controls);
    const add = element("button", "rl-primary rl-import", "Add folder");
    add.type = "button";
    add.addEventListener("click", () => void pickFolder());
    const folders = element("div", "rl-folders");
    const folderSelect = element("select", "rl-folder-select");
    folderSelect.setAttribute("aria-label", t("Library folder"));
    folderSelect.addEventListener("change", () => {
      folderFilter = folderSelect.value;
      visibleLimit = 60;
      accessWarning = false;
      render();
    });
    const reconnectButton = element("button", "rl-primary", "Reconnect");
    reconnectButton.type = "button";
    reconnectButton.addEventListener("click", () => void reconnect());
    const removeFolder = element("button", "rl-remove rl-remove-folder", "Remove folder");
    removeFolder.type = "button";
    removeFolder.addEventListener("click", () => {
      if (folderFilter) void removeEntries(entries.filter((entry) => entry.path.startsWith(`${folderFilter}/`)));
    });
    folders.append(folderSelect, reconnectButton, removeFolder);
    const saveFolderRow = element("div", "rl-save-folder");
    const saveFolderButton = element("button", "rl-primary", "Set save folder");
    saveFolderButton.type = "button";
    saveFolderButton.addEventListener("click", () => void chooseSaveFolder());
    const saveFolderLabel = element("span", "rl-save-folder-label");
    saveFolderRow.append(saveFolderButton, saveFolderLabel);
    updateSaveFolderLabel();
    const progress = element("div", "rl-progress");
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    const access = element("div", "rl-access");
    access.setAttribute("role", "status");
    access.setAttribute("aria-live", "polite");
    root.append(add, folders, saveFolderRow, access, progress, element("div", "rl-preview"), element("div", "rl-scroll"), element("div", "rl-status"));
    updateSaveFolderLabel();
    document.body.append(root);
    if (lastStatus) status(lastStatus);
    else syncSendState();
    position();
    search.focus();
    try {
      await load();
    } catch (error) {
      status(error.message);
    }
  }
  function mount() {
    const nextLocaleStore = vencord()?.Webpack?.Common?.LocaleStore;
    if (nextLocaleStore !== localeStore) {
      localeStore?.removeChangeListener?.(refreshLocale);
      localeStore = nextLocaleStore;
      localeStore?.addChangeListener?.(refreshLocale);
    }
    refreshLocale();
    for (const form of document.querySelectorAll("form")) {
      if (!form.querySelector('[role="textbox"][contenteditable="true"], [data-slate-editor="true"]')) continue;
      const host2 = form.querySelector('[class*="buttons_"]');
      if (!host2 || host2.querySelector(`.${BUTTON_CLASS}`)) continue;
      const button = element("button", BUTTON_CLASS);
      button.type = "button";
      button.title = t(NAME);
      button.setAttribute("aria-label", t(NAME));
      button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="m5 16 5-5 3 3 3-3 3 3" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="8" r="1.5" fill="currentColor"/></svg>';
      button.addEventListener("click", () => void open(button));
      const gif = [...host2.querySelectorAll("button")].find((item) => /gif/i.test(item.getAttribute("aria-label") ?? ""));
      if (gif) gif.parentElement?.before(button);
      else host2.append(button);
    }
    if (root && (!anchor?.isConnected || !document.body.contains(root))) close();
    else position();
    syncSendState();
  }
  let queued = false;
  let frame;
  let style;
  let started = false;
  let localeStore;
  let displayedLocale;
  function refreshLocale() {
    const current = locale();
    if (current === displayedLocale) return;
    displayedLocale = current;
    if (root) {
      const button = anchor;
      close();
      if (button?.isConnected) void open(button);
    }
    if (options.mountButton !== false) for (const button of document.querySelectorAll(`button.${BUTTON_CLASS}`)) {
      button.title = t(NAME);
      button.setAttribute("aria-label", t(NAME));
    }
  }
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    frame = requestAnimationFrame(() => {
      queued = false;
      mount();
    });
  });
  function attach() {
    style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    attachContextMenus();
    if (options.mountButton !== false) {
      observer.observe(document.body, { childList: true, subtree: true });
      mount();
    } else {
      localeStore = vencord()?.Webpack?.Common?.LocaleStore;
      localeStore?.addChangeListener?.(refreshLocale);
      refreshLocale();
    }
    document.addEventListener("pointerdown", outsideClick);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", position);
  }
  function start() {
    if (started) return;
    started = true;
    if (document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });
  }
  function outsideClick(event) {
    if (root && !root.contains(event.target) && !anchor?.contains(event.target)) close();
  }
  function keydown(event) {
    if (event.key === "Escape") close();
  }
  function stop() {
    started = false;
    for (const { api, navId, patch } of contextPatches.splice(0)) api.removeContextMenuPatch?.(navId, patch);
    localeStore?.removeChangeListener?.(refreshLocale);
    localeStore = void 0;
    conversion?.abort();
    close();
    observer.disconnect();
    if (frame !== void 0) cancelAnimationFrame(frame);
    queued = false;
    document.removeEventListener("DOMContentLoaded", attach);
    document.removeEventListener("pointerdown", outsideClick);
    document.removeEventListener("keydown", keydown);
    window.removeEventListener("resize", position);
    style?.remove();
    if (options.mountButton !== false) document.querySelectorAll(`button.${BUTTON_CLASS}`).forEach((button) => button.remove());
  }
  return { start, stop, toggle: open };
}
export {
  createReactionLibrary
};

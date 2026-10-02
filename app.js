(function () {
  const QrCode = qrcodegen.QrCode;
  const QrSegment = qrcodegen.QrSegment;

  const ECC = {
    low: QrCode.Ecc.LOW,
    medium: QrCode.Ecc.MEDIUM,
    high: QrCode.Ecc.QUARTILE,
    max: QrCode.Ecc.HIGH,
  };

  const ECC_NAME = {
    low: "Low",
    medium: "Medium",
    high: "High",
    max: "Max",
  };

  const ECC_HINT = {
    low: "About 7% of the code can be damaged and it should still scan. This makes the smallest symbol.",
    medium: "About 15% of the code can be damaged and it should still scan.",
    high: "About 25% of the code can be damaged and it should still scan.",
    max: "About 30% of the code can be damaged and it should still scan. This makes the densest symbol.",
  };

  const BORDER = 4;
  const MIN_PX = 32;
  const MAX_PX = 8192;
  const DEFAULT_PX = 1024;
  const MIN_BAR = 40;
  const MAX_BAR = 2048;
  const DEFAULT_BAR = 160;

  const FORMAT_HINT = {
    code128: "Letters, numbers, and symbols.",
    ean13: "12 or 13 digits. A missing check digit is added.",
    upca: "11 or 12 digits. A missing check digit is added.",
    code39: "Uppercase letters, digits, and - . space $ / + %.",
  };

  const FORMAT_PLACEHOLDER = {
    code128: "ABC-123",
    ean13: "5901234123457",
    upca: "036000291452",
    code39: "CODE-39",
  };

  const input = document.getElementById("input");
  const stage = document.getElementById("stage");
  const meta = document.getElementById("meta");
  const warn = document.getElementById("warn");
  const hint = document.getElementById("ecc-hint");
  const formatHint = document.getElementById("format-hint");
  const sizeHint = document.getElementById("size-hint");
  const sizeLabel = document.getElementById("size-label");
  const fieldLabel = document.getElementById("field-label");
  const downloadBtn = document.getElementById("download");
  const copyBtn = document.getElementById("copy");
  const inkInput = document.getElementById("ink");
  const paperInput = document.getElementById("paper");
  const sizeInput = document.getElementById("size");
  const barHeightInput = document.getElementById("bar-height");

  let savedSize = DEFAULT_PX;
  let savedBarHeight = DEFAULT_BAR;
  let mode = "qr";

  let current = null;
  let frame = 0;
  let copyTimer = 0;
  let copying = false;

  function readStore(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      /* Storage can be blocked in private browsing. */
    }
  }

  function isHex(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function restore() {
    const ecc = readStore("qrmaxx.ecc", "medium");
    const ink = readStore("qrmaxx.ink", "#1b1814");
    const paper = readStore("qrmaxx.paper", "#ffffff");
    const eccInput = document.querySelector(`input[name="ecc"][value="${ecc}"]`);
    if (eccInput && Object.prototype.hasOwnProperty.call(ECC, ecc)) eccInput.checked = true;
    if (isHex(ink)) inkInput.value = ink;
    if (isHex(paper)) paperInput.value = paper;
    const storedSize = Number(readStore("qrmaxx.size", String(DEFAULT_PX)));
    if (Number.isInteger(storedSize) && storedSize >= MIN_PX && storedSize <= MAX_PX) {
      savedSize = storedSize;
    }
    sizeInput.value = String(savedSize);
    const storedBar = Number(readStore("qrmaxx.barHeight", String(DEFAULT_BAR)));
    if (Number.isInteger(storedBar) && storedBar >= MIN_BAR && storedBar <= MAX_BAR) {
      savedBarHeight = storedBar;
    }
    barHeightInput.value = String(savedBarHeight);
    const storedMode = readStore("qrmaxx.mode", "qr");
    if (storedMode === "qr" || storedMode === "barcode") mode = storedMode;
    const modeInput = document.querySelector(`input[name="mode"][value="${mode}"]`);
    if (modeInput) modeInput.checked = true;
    const storedFormat = readStore("qrmaxx.format", "code128");
    const formatInput = document.querySelector(`input[name="format"][value="${storedFormat}"]`);
    if (formatInput) formatInput.checked = true;
    applyMode();
  }

  function selectedFormat() {
    const checked = document.querySelector('input[name="format"]:checked');
    const value = checked ? checked.value : "code128";
    return Object.prototype.hasOwnProperty.call(FORMAT_HINT, value) ? value : "code128";
  }

  function applyMode() {
    const barcode = mode === "barcode";
    document.getElementById("ecc-options").hidden = barcode;
    document.getElementById("format-options").hidden = !barcode;
    document.getElementById("height-row").hidden = !barcode;
    stage.classList.toggle("barcode", barcode);
    sizeLabel.textContent = barcode ? "Image width" : "Image size";
    fieldLabel.textContent = barcode ? "Text or number" : "Text or link";
    input.placeholder = barcode ? FORMAT_PLACEHOLDER[selectedFormat()] : "https://example.com";
    if (barcode) formatHint.textContent = FORMAT_HINT[selectedFormat()];
  }

  function parseSize(raw) {
    if (!/^\d+$/.test(String(raw).trim())) return null;
    const n = Number(raw);
    if (n < MIN_PX || n > MAX_PX) return null;
    return n;
  }

  function commitSize(px) {
    savedSize = px;
    writeStore("qrmaxx.size", String(px));
  }

  function parseBarHeight(raw) {
    if (!/^\d+$/.test(String(raw).trim())) return null;
    const n = Number(raw);
    if (n < MIN_BAR || n > MAX_BAR) return null;
    return n;
  }

  function commitBarHeight(px) {
    savedBarHeight = px;
    writeStore("qrmaxx.barHeight", String(px));
  }

  function exportPixels(qr) {
    const dim = qr.size + BORDER * 2;
    let scale = Math.max(1, Math.ceil(savedSize / dim));
    const maxScale = Math.max(1, Math.floor(MAX_PX / dim));
    const capped = scale > maxScale;
    if (capped) scale = maxScale;
    return { scale, px: dim * scale, capped };
  }

  function updateSizeHint() {
    if (!current) {
      sizeHint.textContent = "Width of the saved PNG, from 32 to 8192.";
      return;
    }
    if (current.kind === "barcode") {
      const exported = barcodeExport(current.symbol);
      const sharp = exported.width !== savedSize ? " so the bars stay sharp" : "";
      if (exported.capped) {
        sizeHint.textContent = `Largest sharp PNG for this code is ${exported.width} × ${exported.height}.`;
        return;
      }
      sizeHint.textContent = `Saves a ${exported.width} × ${exported.height} PNG${sharp}.`;
      return;
    }
    const { px, capped } = exportPixels(current.qr);
    if (capped) {
      sizeHint.textContent = `Largest sharp PNG for this code is ${px} × ${px}.`;
      return;
    }
    if (px !== savedSize) {
      sizeHint.textContent = `Saves a ${px} × ${px} PNG so each square stays sharp.`;
      return;
    }
    sizeHint.textContent = `Saves a ${px} × ${px} PNG.`;
  }

  function selectedEcc() {
    const checked = document.querySelector('input[name="ecc"]:checked');
    const value = checked ? checked.value : "medium";
    return Object.prototype.hasOwnProperty.call(ECC, value) ? value : "medium";
  }

  function channel(hex, offset) {
    const value = parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex) {
    return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
  }

  function contrast(a, b) {
    const left = luminance(a);
    const right = luminance(b);
    const lighter = Math.max(left, right);
    const darker = Math.min(left, right);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function colorAdvice(ink, paper) {
    if (luminance(paper) + 0.02 < luminance(ink)) {
      return "Scanners read dark marks on a light background best.";
    }
    if (contrast(ink, paper) < 4) {
      return "These colors are close. A stronger contrast scans more reliably.";
    }
    return "";
  }

  function toSvg(qr, ink, paper) {
    const size = qr.size;
    const dim = size + BORDER * 2;
    let path = "";
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (qr.getModule(x, y)) path += `M${x + BORDER} ${y + BORDER}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="${paper}"/><path d="${path}" fill="${ink}"/></svg>`;
  }

  function drawCanvas(qr, ink, paper) {
    const { scale, px } = exportPixels(qr);
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    if (canvas.width !== px || canvas.height !== px) {
      throw new Error("Image is too large for this browser.");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image is too large for this browser.");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.getModule(x, y)) {
          ctx.fillRect((x + BORDER) * scale, (y + BORDER) * scale, scale, scale);
        }
      }
    }
    return canvas;
  }

  function escapeXml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    }[char]));
  }

  function barcodeModules(symbol) {
    return symbol.quietLeft + symbol.bits.length + symbol.quietRight;
  }

  function barcodeScale(symbol) {
    const modules = barcodeModules(symbol);
    let scale = Math.max(1, Math.ceil(savedSize / modules));
    const maxScale = Math.max(1, Math.floor(MAX_PX / modules));
    const capped = scale > maxScale;
    if (capped) scale = maxScale;
    return { scale, width: modules * scale, capped };
  }

  function barcodeFontSize(text, width, barHeight) {
    let fontSize = Math.round(Math.min(barHeight * 0.22, 72));
    fontSize = Math.max(14, fontSize);
    const widest = Math.max(text.length, 1) * fontSize * 0.62;
    if (widest > width * 0.92) {
      fontSize = Math.max(10, Math.floor((width * 0.92) / (text.length * 0.62)));
    }
    return fontSize;
  }

  function barcodePadding() {
    return Math.max(8, Math.round(savedBarHeight * 0.08));
  }

  function barcodeExport(symbol) {
    const scaled = barcodeScale(symbol);
    const fontSize = barcodeFontSize(symbol.text, scaled.width, savedBarHeight);
    const pad = barcodePadding();
    const textBlock = Math.round(fontSize * 2);
    const height = pad + savedBarHeight + textBlock;
    return {
      scale: scaled.scale,
      width: scaled.width,
      height,
      fontSize,
      pad,
      textBlock: Math.round(fontSize * 2),
      capped: scaled.capped,
    };
  }

  function barPath(symbol, barHeight) {
    const bits = symbol.bits;
    let path = "";
    let index = 0;
    while (index < bits.length) {
      if (bits.charAt(index) !== "1") {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < bits.length && bits.charAt(end) === "1") end += 1;
      const x = symbol.quietLeft + index;
      path += `M${x} 0h${end - index}v${barHeight}h-${end - index}z`;
      index = end;
    }
    return path;
  }

  function barcodeSvg(symbol, ink, paper) {
    const exported = barcodeExport(symbol);
    const modules = barcodeModules(symbol);
    const barHeight = savedBarHeight / exported.scale;
    const fontSize = exported.fontSize / exported.scale;
    const pad = exported.pad / exported.scale;
    const textBlock = exported.textBlock / exported.scale;
    const height = exported.height / exported.scale;
    const textY = pad + barHeight + textBlock / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${height}" role="img" aria-label="${escapeXml(symbol.name)}" shape-rendering="crispEdges"><rect width="${modules}" height="${height}" fill="${paper}"/><path d="${barPath(symbol, barHeight)}" fill="${ink}" transform="translate(0 ${pad})"/><text x="${modules / 2}" y="${textY}" fill="${ink}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="600">${escapeXml(symbol.text)}</text></svg>`;
  }

  function drawBarcode(symbol, ink, paper) {
    const exported = barcodeExport(symbol);
    const canvas = document.createElement("canvas");
    canvas.width = exported.width;
    canvas.height = exported.height;
    if (canvas.width !== exported.width || canvas.height !== exported.height) {
      throw new Error("Image is too large for this browser.");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image is too large for this browser.");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink;
    const bits = symbol.bits;
    let index = 0;
    while (index < bits.length) {
      if (bits.charAt(index) !== "1") {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < bits.length && bits.charAt(end) === "1") end += 1;
      ctx.fillRect((symbol.quietLeft + index) * exported.scale, exported.pad, (end - index) * exported.scale, savedBarHeight);
      index = end;
    }
    ctx.font = `600 ${exported.fontSize}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol.text, exported.width / 2, exported.pad + savedBarHeight + exported.textBlock / 2);
    return canvas;
  }

  function showMessage(message) {
    current = null;
    const note = document.createElement("p");
    note.className = "empty";
    note.setAttribute("role", "status");
    note.textContent = message;
    stage.replaceChildren(note);
    stage.classList.remove("has-code");
    stage.style.background = "";
    meta.textContent = "";
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
    updateSizeHint();
  }

  function setWarn(message) {
    if (warn.textContent !== message) warn.textContent = message;
  }

  function render() {
    const text = input.value;
    const eccKey = selectedEcc();
    const ink = isHex(inkInput.value) ? inkInput.value : "#1b1814";
    const paper = isHex(paperInput.value) ? paperInput.value : "#ffffff";

    hint.textContent = ECC_HINT[eccKey];
    writeStore("qrmaxx.ecc", eccKey);
    writeStore("qrmaxx.ink", ink);
    writeStore("qrmaxx.paper", paper);
    writeStore("qrmaxx.mode", mode);
    if (mode === "barcode") {
      const format = selectedFormat();
      writeStore("qrmaxx.format", format);
      formatHint.textContent = FORMAT_HINT[format];
      input.placeholder = FORMAT_PLACEHOLDER[format];
    }

    if (text.length === 0) {
      showMessage("The code appears as you type.");
      setWarn("");
      return;
    }

    if (mode === "barcode") {
      let symbol;
      try {
        symbol = QrmaxxBarcode.encode(text, selectedFormat());
      } catch (err) {
        showMessage(err.userMessage || "That text couldn’t be turned into a barcode.");
        setWarn("");
        return;
      }
      stage.innerHTML = barcodeSvg(symbol, ink, paper);
      stage.classList.add("has-code");
      stage.style.background = paper;
      meta.textContent = symbol.name;
      setWarn(colorAdvice(ink, paper));
      current = { kind: "barcode", symbol, ink, paper };
      updateSizeHint();
      downloadBtn.disabled = false;
      copyBtn.disabled = false;
      return;
    }

    let qr;
    try {
      const segments = QrSegment.makeSegments(text);
      qr = QrCode.encodeSegments(segments, ECC[eccKey], 1, 40, -1, false);
    } catch (err) {
      const tooLong = err instanceof RangeError;
      showMessage(
        tooLong
          ? "That text is too long for one QR code. Shorten it, or choose a lower correction level."
          : "That text couldn’t be turned into a QR code."
      );
      setWarn("");
      return;
    }

    stage.innerHTML = toSvg(qr, ink, paper);
    stage.classList.remove("has-code");
    stage.style.background = "";
    const count = text.length === 1 ? "1 character" : `${text.length} characters`;
    meta.textContent = `${count} · ${ECC_NAME[eccKey]} correction`;
    setWarn(colorAdvice(ink, paper));
    current = { kind: "qr", qr, ink, paper };
    updateSizeHint();
    downloadBtn.disabled = false;
    copyBtn.disabled = false;
  }

  function raster() {
    if (!current) return null;
    if (current.kind === "barcode") return drawBarcode(current.symbol, current.ink, current.paper);
    return drawCanvas(current.qr, current.ink, current.paper);
  }

  function fileName() {
    if (current.kind === "barcode") {
      const exported = barcodeExport(current.symbol);
      return `barcode-${exported.width}x${exported.height}.png`;
    }
    return `qrmaxx-${exportPixels(current.qr).px}.png`;
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function fitInput() {
    input.style.height = "auto";
    const full = input.scrollHeight;
    input.style.height = `${Math.min(full, 200)}px`;
    input.style.overflowY = full > 200 ? "auto" : "hidden";
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not build the image."));
      }, "image/png");
    });
  }

  async function download() {
    if (!current) return;
    const blob = await canvasBlob(raster());
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function flashCopy(label) {
    copyBtn.textContent = label;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.textContent = "Copy image";
    }, 1600);
  }

  async function copyImage() {
    if (!current || copying) return;
    copying = true;
    clearTimeout(copyTimer);
    copyBtn.textContent = "Copying…";
    try {
      const blob = await canvasBlob(raster());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flashCopy("Copied");
    } catch (err) {
      if (err && /too large/i.test(err.message)) {
        setWarn("That image is too large for this browser. Try a smaller size.");
      }
      flashCopy("Copy failed");
    } finally {
      copying = false;
    }
  }

  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    copyBtn.hidden = true;
    document.querySelector(".actions").classList.add("single");
  }

  restore();
  input.addEventListener("input", () => {
    fitInput();
    schedule();
  });
  document.querySelectorAll('input[name="ecc"]').forEach((el) => {
    el.addEventListener("change", schedule);
  });
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      mode = el.value === "barcode" ? "barcode" : "qr";
      applyMode();
      schedule();
    });
  });
  document.querySelectorAll('input[name="format"]').forEach((el) => {
    el.addEventListener("change", schedule);
  });
  barHeightInput.addEventListener("input", () => {
    const px = parseBarHeight(barHeightInput.value);
    if (px != null) commitBarHeight(px);
    updateSizeHint();
    if (current && current.kind === "barcode") schedule();
  });
  barHeightInput.addEventListener("blur", () => {
    const raw = String(barHeightInput.value).trim();
    if (/^\d+$/.test(raw)) {
      const px = Math.min(MAX_BAR, Math.max(MIN_BAR, Number(raw)));
      commitBarHeight(px);
      barHeightInput.value = String(px);
    } else {
      barHeightInput.value = String(savedBarHeight);
    }
    updateSizeHint();
    if (mode === "barcode") schedule();
  });
  inkInput.addEventListener("input", schedule);
  paperInput.addEventListener("input", schedule);
  sizeInput.addEventListener("input", () => {
    const px = parseSize(sizeInput.value);
    if (px != null) commitSize(px);
    updateSizeHint();
  });
  sizeInput.addEventListener("blur", () => {
    const raw = String(sizeInput.value).trim();
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      const px = Math.min(MAX_PX, Math.max(MIN_PX, n));
      commitSize(px);
      sizeInput.value = String(px);
    } else {
      sizeInput.value = String(savedSize);
    }
    updateSizeHint();
  });
  downloadBtn.addEventListener("click", () => {
    download().catch(() => {
      setWarn("That image is too large for this browser. Try a smaller size.");
    });
  });
  copyBtn.addEventListener("click", () => {
    copyImage();
  });

  fitInput();
  render();
})();

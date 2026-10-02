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

  const input = document.getElementById("input");
  const stage = document.getElementById("stage");
  const meta = document.getElementById("meta");
  const warn = document.getElementById("warn");
  const hint = document.getElementById("ecc-hint");
  const sizeHint = document.getElementById("size-hint");
  const downloadBtn = document.getElementById("download");
  const copyBtn = document.getElementById("copy");
  const inkInput = document.getElementById("ink");
  const paperInput = document.getElementById("paper");
  const sizeInput = document.getElementById("size");

  let savedSize = DEFAULT_PX;

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

  function showMessage(message) {
    current = null;
    const note = document.createElement("p");
    note.className = "empty";
    note.setAttribute("role", "status");
    note.textContent = message;
    stage.replaceChildren(note);
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

    if (text.length === 0) {
      showMessage("The code appears as you type.");
      setWarn("");
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
    const count = text.length === 1 ? "1 character" : `${text.length} characters`;
    meta.textContent = `${count} · ${ECC_NAME[eccKey]} correction`;
    setWarn(colorAdvice(ink, paper));
    current = { qr, ink, paper };
    updateSizeHint();
    downloadBtn.disabled = false;
    copyBtn.disabled = false;
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
    const blob = await canvasBlob(drawCanvas(current.qr, current.ink, current.paper));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qrmaxx-${exportPixels(current.qr).px}.png`;
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
      const blob = await canvasBlob(drawCanvas(current.qr, current.ink, current.paper));
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

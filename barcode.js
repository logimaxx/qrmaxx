/* Barcode encoder for Code 128, Code 39, EAN-13, and UPC-A.
   Patterns follow the public symbology specifications. */
var QrmaxxBarcode = (function () {
  // Decimal digits of each Code 128 symbol. The stop symbol is 13 modules.
  var CODE128 = [
    "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
    "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
    "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
    "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
    "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
    "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
    "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
    "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
    "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
    "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
    "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
    "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
    "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
    "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
    "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
    "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
    "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
    "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
    "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
    "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
    "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
    "11010011100", "1100011101011"
  ];

  var CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";
  var CODE39 = [
    20957, 29783, 23639, 30485, 20951, 29813, 23669, 20855,
    29789, 23645, 29975, 23831, 30533, 22295, 30149, 24005,
    21623, 29981, 23837, 22301, 30023, 23879, 30545, 22343,
    30161, 24017, 21959, 30065, 23921, 22385, 29015, 18263,
    29141, 17879, 29045, 18293, 17783, 29021, 18269, 17477,
    17489, 17681, 20753, 35770
  ].map(function (value) {
    return value.toString(2);
  });

  var EAN_L = [
    "0001101", "0011001", "0010011", "0111101", "0100011",
    "0110001", "0101111", "0111011", "0110111", "0001011"
  ];
  var EAN_G = [
    "0100111", "0110011", "0011011", "0100001", "0011101",
    "0111001", "0000101", "0010001", "0001001", "0010111"
  ];
  var EAN_R = [
    "1110010", "1100110", "1101100", "1000010", "1011100",
    "1001110", "1010000", "1000100", "1001000", "1110100"
  ];
  var EAN13_PARITY = [
    "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
    "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"
  ];

  function userError(message) {
    var error = new Error(message);
    error.userMessage = message;
    return error;
  }

  function symbol(bits, quietLeft, quietRight, text, name) {
    return {
      bits: bits,
      quietLeft: quietLeft,
      quietRight: quietRight,
      text: text,
      name: name
    };
  }

  function digitRun(text, index) {
    var count = 0;
    while (index + count < text.length && text.charCodeAt(index + count) >= 48 && text.charCodeAt(index + count) <= 57) {
      count += 1;
    }
    return count;
  }

  function encodeCode128(text) {
    if (text.length > 80) {
      throw userError("That is too long for one barcode. Keep it under 80 characters.");
    }
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 32 || code > 126) {
        throw userError("Code 128 here uses plain text, without line breaks or symbols outside the keyboard.");
      }
    }

    var symbols = [];
    var set = "B";
    var cursor = 0;
    var startRun = digitRun(text, 0);
    if (startRun >= 4 || (startRun === text.length && startRun >= 2 && startRun % 2 === 0)) {
      set = "C";
      symbols.push(105);
    } else {
      symbols.push(104);
    }

    while (cursor < text.length) {
      if (set === "C") {
        if (digitRun(text, cursor) < 2) {
          symbols.push(100);
          set = "B";
          continue;
        }
        symbols.push(Number(text.slice(cursor, cursor + 2)));
        cursor += 2;
        continue;
      }
      var run = digitRun(text, cursor);
      if (run >= 4 && run - (run % 2) >= 4) {
        symbols.push(99);
        set = "C";
        continue;
      }
      symbols.push(text.charCodeAt(cursor) - 32);
      cursor += 1;
    }

    var checksum = symbols[0];
    for (var p = 1; p < symbols.length; p += 1) checksum += symbols[p] * p;
    symbols.push(checksum % 103);
    symbols.push(106);

    var bits = "";
    for (var s = 0; s < symbols.length; s += 1) bits += CODE128[symbols[s]];
    return symbol(bits, 10, 10, text, "Code 128");
  }

  function encodeCode39(text) {
    var data = text.toUpperCase();
    if (data.length > 80) {
      throw userError("That is too long for one barcode. Keep it under 80 characters.");
    }
    if (!/^[0-9A-Z\-. $/+%]+$/.test(data)) {
      throw userError("Code 39 uses uppercase letters, digits, and the symbols - . space $ / + %.");
    }
    var bits = "";
    var body = "*" + data + "*";
    for (var i = 0; i < body.length; i += 1) {
      bits += CODE39[CODE39_CHARS.indexOf(body.charAt(i))];
      if (i < body.length - 1) bits += "0";
    }
    return symbol(bits, 10, 10, data, "Code 39");
  }

  function eanChecksum(twelve) {
    var sum = 0;
    for (var i = 0; i < 12; i += 1) {
      sum += Number(twelve.charAt(i)) * (i % 2 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10;
  }

  function upcChecksum(eleven) {
    var sum = 0;
    for (var i = 0; i < 11; i += 1) {
      sum += Number(eleven.charAt(i)) * (i % 2 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10;
  }

  function digitsOnly(text) {
    return text.replace(/[\s-]/g, "");
  }

  function encodeEan13(text) {
    var digits = digitsOnly(text);
    if (!/^\d{12,13}$/.test(digits)) {
      throw userError("EAN-13 needs 12 or 13 digits.");
    }
    var check = eanChecksum(digits.slice(0, 12));
    if (digits.length === 13 && Number(digits.charAt(12)) !== check) {
      throw userError("That check digit doesn’t match. Leave it off and it will be added.");
    }
    var data = digits.slice(0, 12) + String(check);
    var parity = EAN13_PARITY[Number(data.charAt(0))];
    var bits = "101";
    for (var i = 0; i < 6; i += 1) {
      var table = parity.charAt(i) === "L" ? EAN_L : EAN_G;
      bits += table[Number(data.charAt(i + 1))];
    }
    bits += "01010";
    for (var r = 0; r < 6; r += 1) bits += EAN_R[Number(data.charAt(r + 7))];
    bits += "101";
    return symbol(bits, 11, 7, data, "EAN-13");
  }

  function encodeUpcA(text) {
    var digits = digitsOnly(text);
    if (!/^\d{11,12}$/.test(digits)) {
      throw userError("UPC-A needs 11 or 12 digits.");
    }
    var check = upcChecksum(digits.slice(0, 11));
    if (digits.length === 12 && Number(digits.charAt(11)) !== check) {
      throw userError("That check digit doesn’t match. Leave it off and it will be added.");
    }
    var data = digits.slice(0, 11) + String(check);
    var bits = "101";
    for (var i = 0; i < 6; i += 1) bits += EAN_L[Number(data.charAt(i))];
    bits += "01010";
    for (var r = 0; r < 6; r += 1) bits += EAN_R[Number(data.charAt(r + 6))];
    bits += "101";
    return symbol(bits, 9, 9, data, "UPC-A");
  }

  function encode(text, format) {
    if (format === "ean13") return encodeEan13(text);
    if (format === "upca") return encodeUpcA(text);
    if (format === "code39") return encodeCode39(text);
    return encodeCode128(text);
  }

  return { encode: encode };
})();

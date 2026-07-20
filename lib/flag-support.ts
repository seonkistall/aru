/**
 * Windows Chrome ships no flag glyphs, so a flag emoji falls back to its two
 * regional-indicator letters and the language pill reads "us English" — which
 * looks like a rendering bug. Draw one flag to a canvas and treat it as
 * supported only when it paints in colour; the letter fallback paints in the
 * single fill colour. Returns true on any environment we cannot measure, so a
 * detection failure keeps the intended design rather than stripping it.
 */
export function supportsFlagEmoji(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 20;
    canvas.height = 20;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return true;
    context.fillStyle = "#000";
    context.textBaseline = "top";
    context.font = "16px sans-serif";
    context.fillText("\u{1F1FA}\u{1F1F8}", 0, 0);
    const { data } = context.getImageData(0, 0, 20, 20);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      // Any pixel whose channels differ means real colour, i.e. a drawn flag.
      if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) return true;
    }
    return false;
  } catch {
    return true;
  }
}

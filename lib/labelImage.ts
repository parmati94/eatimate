// Draws the FDA panel to a canvas, entirely in the browser -- nothing about a
// meal is ever sent to the server, and the button costs no request.
import type { Totals } from "./schema";
import { LABEL_FOOTNOTE, labelCalories, labelRows } from "./label";

const W = 420; // CSS px; the backing store is scaled up for a crisp export
const PAD = 18;
const SANS =
  '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';

/** Wrap on spaces to a pixel width, returning the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Render the label at `scale`x for a sharp photo/import, and hand back a PNG blob.
 * `subtitle` states what was measured -- without it a saved image cannot say
 * whether it is one slice or the whole pizza.
 */
export function drawLabel(
  totals: Totals,
  subtitle: string,
  missing?: ReadonlySet<string>,
  estimated?: ReadonlySet<string>,
  scale = 3,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Measure first: the subtitle wraps, so the height is not fixed.
  canvas.width = W;
  ctx.font = `12px ${SANS}`;
  const subLines = wrap(ctx, subtitle, W - PAD * 2);
  ctx.font = `10px ${SANS}`;
  const noteLines = wrap(ctx, LABEL_FOOTNOTE, W - PAD * 2);
  const rows = labelRows(totals, missing, estimated);
  const height =
    PAD + 30 + subLines.length * 15 + 12 + 46 + 20 + rows.length * 22 + 14 +
    noteLines.length * 13 + PAD;

  canvas.width = W * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  // Ground and frame. Always black on white, whatever theme the page is in --
  // a label photo has to read like a label.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, height - 2);
  ctx.fillStyle = "#000";

  let y = PAD + 24;
  ctx.font = `900 30px ${SANS}`;
  ctx.fillText("Nutrition Facts", PAD, y);

  y += 16;
  ctx.font = `12px ${SANS}`;
  for (const line of subLines) {
    ctx.fillText(line, PAD, y);
    y += 15;
  }

  const rule = (h: number) => {
    y += 4;
    ctx.fillRect(PAD, y, W - PAD * 2, h);
    y += h;
  };
  rule(7);

  y += 26;
  ctx.font = `900 20px ${SANS}`;
  ctx.fillText("Calories", PAD, y);
  ctx.font = `900 34px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(String(labelCalories(totals)), W - PAD, y);
  ctx.textAlign = "left";
  y += 6;
  rule(4);

  y += 13;
  ctx.font = `bold 11px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText("% Daily Value*", W - PAD, y);
  ctx.textAlign = "left";
  y += 5;

  for (const r of rows) {
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(PAD, y, W - PAD * 2, 1);
    ctx.fillStyle = "#000";
    y += 16;
    const x = PAD + (r.indent ? 16 : 0);
    ctx.font = `${r.bold ? "bold " : ""}13px ${SANS}`;
    ctx.fillText(r.label, x, y);
    const w = ctx.measureText(r.label).width;
    ctx.font = `13px ${SANS}`;
    ctx.fillText(r.value === null ? " not published"
      : `${r.approx ? " \u2248" : ""} ${r.value}${r.unit}${r.approx ? " (est.)" : ""}`, x + w, y);
    if (r.dv !== undefined) {
      ctx.font = `bold 13px ${SANS}`;
      ctx.textAlign = "right";
      ctx.fillText(`${r.dv}%`, W - PAD, y);
      ctx.textAlign = "left";
    }
    y += 6;
  }

  rule(5);
  y += 12;
  ctx.font = `10px ${SANS}`;
  ctx.fillStyle = "#404040";
  for (const line of noteLines) {
    ctx.fillText(line, PAD, y);
    y += 13;
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Encode full SVG document string for use as an SVG <image href="...">. */
export function svgMarkupToDataUrl(svgMarkup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

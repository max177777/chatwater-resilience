// Renders every page of a PDF to PNG with macOS PDFKit, for local OCR of scanned documents.
// Usage: swift scripts/library/render-pdf.swift <file.pdf> <out-dir> [dpi=300]
import Foundation
import PDFKit
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage: render-pdf.swift <file.pdf> <out-dir> [dpi]\n".data(using: .utf8)!)
  exit(1)
}
let outDir = URL(fileURLWithPath: args[2])
let dpi = args.count > 3 ? Double(args[3]) ?? 300 : 300
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

var failed = 0
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { failed += 1; continue }
  let box = page.bounds(for: .mediaBox)
  let scale = dpi / 72.0
  let w = Int(box.width * scale), h = Int(box.height * scale)
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { failed += 1; continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  let url = outDir.appendingPathComponent(String(format: "page-%03d.png", i + 1))
  guard let img = ctx.makeImage(),
        let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { failed += 1; continue }
  CGImageDestinationAddImage(dest, img, nil)
  if !CGImageDestinationFinalize(dest) { failed += 1; continue }
  print(url.lastPathComponent)
}
if failed > 0 { FileHandle.standardError.write("\(failed) page(s) could not be rendered\n".data(using: .utf8)!); exit(2) }

import ExpoModulesCore
import Vision
import UIKit
import Photos
import CoreImage

/**
 * ExpoFaceMatcher
 *
 * Two async functions exposed to JS:
 *
 *   embedFace(localUri: String) -> { embedding: [Double], faceCount: Int, primaryBox: {x,y,w,h} | nil }
 *     Detects the largest face in the image, crops it, and computes a
 *     VNGenerateImageFeaturePrintObservation feature print, returned as a
 *     normalised [Double] embedding vector.
 *
 *   matchAgainst(reference: { embedding: [Double] },
 *                candidates: [{ assetId: String, localUri: String }])
 *     -> [{ assetId: String, score: Double, faceCount: Int }]
 *     For each candidate, detects the largest face, computes its feature
 *     print, and returns cosine similarity (in [-1..1], usually [0..1])
 *     against the reference embedding. Candidate scoring uses bounded parallel
 *     operations (same per-image decode + Vision path as sequential).
 *
 * URIs accepted:
 *   - file://...   read with Data(contentsOf:)
 *   - ph://<id>    resolved via PHImageManager (full-size image)
 *   - assets-library URLs are also handled by PHImageManager fallback
 *
 * All work runs on a background queue so the JS bridge stays responsive.
 */
public class ExpoFaceMatcherModule: Module {

  // Reuse a single CIContext for crop work — cheaper than per-call.
  private let ciContext = CIContext(options: nil)

  /// Bounded Vision/PHImageLoader concurrency per batch. Same decode + face
  /// pipeline as serial; only wall time changes. Capped to reduce memory spikes.
  private static var matchWorkerCount: Int {
    let cores = ProcessInfo.processInfo.processorCount
    return max(1, min(4, cores))
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoFaceMatcher")

    AsyncFunction("embedFace") { (localUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard let cgImage = try self.loadCGImage(uri: localUri) else {
            promise.resolve(nil); return
          }
          let faces = try self.detectFaces(in: cgImage)
          guard let primary = faces.first else {
            promise.resolve([
              "embedding": [Double](),
              "faceCount": 0,
              "primaryBox": NSNull()
            ])
            return
          }
          let cropped = try self.crop(cgImage: cgImage, to: primary.boundingBox, padding: 0.18)
          let embedding = try self.computeEmbedding(for: cropped)
          promise.resolve([
            "embedding": embedding,
            "faceCount": faces.count,
            "primaryBox": [
              "x": primary.boundingBox.origin.x,
              "y": primary.boundingBox.origin.y,
              "w": primary.boundingBox.size.width,
              "h": primary.boundingBox.size.height
            ]
          ])
        } catch {
          promise.reject("EFM_EMBED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("matchAgainst") {
      (reference: [String: Any], candidates: [[String: String]], promise: Promise) in

      DispatchQueue.global(qos: .userInitiated).async {
        guard let refEmb = reference["embedding"] as? [Double], refEmb.count > 0 else {
          promise.resolve([])
          return
        }
        let refVec = self.l2Normalise(refEmb)
        let n = candidates.count
        guard n > 0 else {
          promise.resolve([])
          return
        }

        let workers = Self.matchWorkerCount
        var scores = [Double](repeating: 0, count: n)
        var faceCounts = [Int](repeating: 0, count: n)
        let lock = NSLock()

        if workers <= 1 {
          for idx in 0..<n {
            let uri = candidates[idx]["localUri"] ?? ""
            let out = self.scoreCandidate(uri: uri, refVec: refVec)
            scores[idx] = out.score
            faceCounts[idx] = out.faceCount
          }
        } else {
          let queue = OperationQueue()
          queue.name = "expo.faceMatcher.batch"
          queue.maxConcurrentOperationCount = workers
          queue.qualityOfService = .userInitiated

          for idx in 0..<n {
            let index = idx
            let uri = candidates[index]["localUri"] ?? ""
            queue.addOperation {
              let out = self.scoreCandidate(uri: uri, refVec: refVec)
              lock.lock()
              scores[index] = out.score
              faceCounts[index] = out.faceCount
              lock.unlock()
            }
          }
          queue.waitUntilAllOperationsAreFinished()
        }

        let results: [[String: Any]] = (0..<n).map { i in
          [
            "assetId": candidates[i]["assetId"] ?? "",
            "score": scores[i],
            "faceCount": faceCounts[i]
          ]
        }
        promise.resolve(results)
      }
    }
  }

  /// Per-candidate scoring: identical pipeline to former serial loop (same load,
  /// detection, crop padding, top-3 faces, embeddings, cosine vs `refVec`).
  private func scoreCandidate(uri: String, refVec: [Double]) -> (score: Double, faceCount: Int) {
    var score = 0.0
    var faceCount = 0
    do {
      if let cgImage = try loadCGImage(uri: uri) {
        let faces = try detectFaces(in: cgImage)
        faceCount = faces.count
        var best = 0.0
        for face in faces.prefix(3) {
          let cropped = try crop(cgImage: cgImage, to: face.boundingBox, padding: 0.18)
          let emb = try computeEmbedding(for: cropped)
          let dot = cosine(refVec, l2Normalise(emb))
          if dot > best { best = dot }
        }
        score = best
      }
    } catch {
      score = 0
    }
    return (score, faceCount)
  }

  // MARK: - Vision

  /// Detect faces in `cgImage`, returning observations sorted by area descending.
  private func detectFaces(in cgImage: CGImage) throws -> [VNFaceObservation] {
    let req = VNDetectFaceRectanglesRequest()
    req.revision = VNDetectFaceRectanglesRequestRevision3
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([req])
    let raw = req.results ?? []
    return raw.sorted { lhs, rhs in
      (lhs.boundingBox.size.width * lhs.boundingBox.size.height) >
      (rhs.boundingBox.size.width * rhs.boundingBox.size.height)
    }
  }

  /// Compute a feature print from `cgImage` and return as an array of doubles.
  private func computeEmbedding(for cgImage: CGImage) throws -> [Double] {
    let req = VNGenerateImageFeaturePrintRequest()
    if #available(iOS 17.0, *) {
      req.imageCropAndScaleOption = .scaleFill
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([req])
    guard let obs = req.results?.first as? VNFeaturePrintObservation else {
      throw NSError(domain: "ExpoFaceMatcher", code: 1, userInfo: [NSLocalizedDescriptionKey: "No feature print observation"])
    }

    let count = Int(obs.elementCount)
    var doubles = [Double](repeating: 0, count: count)
    obs.data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let basePtr = raw.bindMemory(to: Float.self)
      for i in 0..<count {
        doubles[i] = Double(basePtr[i])
      }
    }
    return doubles
  }

  // MARK: - Image loading & cropping

  /// Resolve a `localUri` (file://, ph://, or assets-library://) to a CGImage.
  private func loadCGImage(uri: String) throws -> CGImage? {
    guard let url = URL(string: uri) else { return nil }
    if url.scheme == "file" {
      let data = try Data(contentsOf: url)
      guard let img = UIImage(data: data) else { return nil }
      return img.cgImage ?? CIImage(image: img).flatMap { ciContext.createCGImage($0, from: $0.extent) }
    }
    if url.scheme == "ph" || url.scheme == "assets-library" {
      return try loadFromPhotos(url: url)
    }
    // Fallback: try as data URL string for HTTP urls (not expected in our flow)
    return nil
  }

  private func loadFromPhotos(url: URL) throws -> CGImage? {
    // expo-media-library returns URIs like:
    //   ph://9F2BC54A-1234-5678-ABCD-AB12CD34EF56/L0/001
    // PHAsset.localIdentifier is everything after "ph://" — the host + path.
    var localId = url.absoluteString
    if let scheme = url.scheme {
      let prefix = "\(scheme)://"
      if localId.hasPrefix(prefix) {
        localId = String(localId.dropFirst(prefix.count))
      }
    }
    let res = PHAsset.fetchAssets(withLocalIdentifiers: [localId], options: nil)
    guard let asset = res.firstObject else { return nil }
    let manager = PHImageManager.default()
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.deliveryMode = .highQualityFormat
    options.isNetworkAccessAllowed = true
    options.resizeMode = .exact
    options.progressHandler = { _, _, _, _ in }

    var resultImage: UIImage?
    let target = CGSize(width: 1280, height: 1280)
    manager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFit,
      options: options
    ) { image, _ in
      resultImage = image
    }
    return resultImage?.cgImage
  }

  /// Crop a CGImage to the given Vision bounding box (normalised 0..1, origin
  /// at lower-left), expanded by `padding` fraction of the box on each side.
  private func crop(cgImage: CGImage, to vBox: CGRect, padding: CGFloat) throws -> CGImage {
    let w = CGFloat(cgImage.width)
    let h = CGFloat(cgImage.height)
    // Convert Vision (origin lower-left) to UIKit (origin upper-left)
    let pixelBox = CGRect(
      x: max(0, (vBox.origin.x - vBox.size.width * padding) * w),
      y: max(0, (1.0 - vBox.origin.y - vBox.size.height - vBox.size.height * padding) * h),
      width: min(w, (vBox.size.width * (1 + padding * 2)) * w),
      height: min(h, (vBox.size.height * (1 + padding * 2)) * h)
    )
    guard let cropped = cgImage.cropping(to: pixelBox) else {
      return cgImage
    }
    return cropped
  }

  // MARK: - Math

  private func l2Normalise(_ v: [Double]) -> [Double] {
    var sum = 0.0
    for x in v { sum += x * x }
    let n = sum > 0 ? sqrt(sum) : 1.0
    return v.map { $0 / n }
  }

  private func cosine(_ a: [Double], _ b: [Double]) -> Double {
    let n = min(a.count, b.count)
    var s = 0.0
    for i in 0..<n { s += a[i] * b[i] }
    return s
  }
}

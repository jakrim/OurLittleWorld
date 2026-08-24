import ExpoModulesCore
import Foundation
import Vision
import UIKit
import Photos
import CoreImage

private final class MatchBatchToken: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelReason: String?
  private var imageCancels: [PHImageRequestID: () -> Void] = [:]
  private var visionRequests: [ObjectIdentifier: VNRequest] = [:]

  var isCancelled: Bool {
    lock.lock()
    let value = cancelReason != nil
    lock.unlock()
    return value
  }

  var reason: String? {
    lock.lock()
    let value = cancelReason
    lock.unlock()
    return value
  }

  func cancel(reason: String) {
    lock.lock()
    if cancelReason != nil {
      lock.unlock()
      return
    }
    cancelReason = reason
    let cancels = Array(imageCancels.values)
    let requests = Array(visionRequests.values)
    imageCancels.removeAll()
    visionRequests.removeAll()
    lock.unlock()

    for request in requests {
      request.cancel()
    }
    for cancel in cancels {
      cancel()
    }
  }

  func registerImageRequest(id: PHImageRequestID, cancel: @escaping () -> Void) -> Bool {
    lock.lock()
    let cancelled = cancelReason != nil
    if !cancelled {
      imageCancels[id] = cancel
    }
    lock.unlock()
    if cancelled {
      cancel()
      return false
    }
    return true
  }

  func unregisterImageRequest(id: PHImageRequestID) {
    lock.lock()
    imageCancels.removeValue(forKey: id)
    lock.unlock()
  }

  func registerVisionRequest(_ request: VNRequest) -> Bool {
    lock.lock()
    let cancelled = cancelReason != nil
    if !cancelled {
      visionRequests[ObjectIdentifier(request)] = request
    }
    lock.unlock()
    if cancelled {
      request.cancel()
      return false
    }
    return true
  }

  func unregisterVisionRequest(_ request: VNRequest) {
    lock.lock()
    visionRequests.removeValue(forKey: ObjectIdentifier(request))
    lock.unlock()
  }
}

private struct AnalyzedFace {
  let embedding: [Double]
  let captureQuality: Double?
  let faceSizeRatio: Double
  let sharpness: Double
  let yaw: Double?
  let roll: Double?
  let brightness: Double
  let fingerprint: [Double]
}

private struct AnalyzedCandidate {
  let faceCount: Int
  let faces: [AnalyzedFace]
  let wholeImageFingerprint: [Double]
}

/**
 * ExpoFaceMatcher
 *
 * Two async functions exposed to JS:
 *
 *   embedFace(localUri: String) -> { embedding, faceCount, primaryBox, captureQuality, faceSizeRatio, sharpness, yaw, roll, brightness }
 *     Detects the largest face in the image, crops it, and computes a
 *     VNGenerateImageFeaturePrintObservation feature print, returned as a
 *     normalised [Double] embedding vector.
 *
 *   matchAgainst(reference: { embedding: [Double] },
 *                candidates: [{ assetId: String, localUri: String }])
 *     -> [{ assetId, score, faceCount, captureQuality, faceSizeRatio, sharpness, yaw, roll, brightness }]
 *     For each candidate, detects the largest face, computes its feature
 *     print, and returns cosine similarity (in [-1..1], usually [0..1])
 *     against the reference embedding. Candidate scoring uses bounded parallel
 *     operations (same per-image decode + Vision path as sequential).
 *     captureQuality is only meaningful when comparing shots of the same
 *     subject; do not treat it as an absolute cross-subject quality score.
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
  private let matchBatchRegistryLock = NSLock()
  private var matchBatches: [String: MatchBatchToken] = [:]

  /// Bounded Vision/PHImageLoader concurrency per batch. Same decode + face
  /// pipeline as serial; only wall time changes. Two decoded 1280px images keep
  /// peak memory predictable while still overlapping iCloud/local reads.
  private static var matchWorkerCount: Int {
    let cores = ProcessInfo.processInfo.processorCount
    return max(1, min(2, cores))
  }

  /// PhotoKit may otherwise wait indefinitely for an iCloud original and hold
  /// the whole native batch. Keep every per-asset load bounded.
  private static let photoLoadTimeoutSeconds: Double = 6
  private static let minBatchTimeoutSeconds: Double = 4
  private static let maxBatchTimeoutSeconds: Double = 90

  public func definition() -> ModuleDefinition {
    Name("ExpoFaceMatcher")

    AsyncFunction("embedFace") { (localUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let cgImage: CGImage
        do {
          guard let image = try self.loadCGImage(uri: localUri) else {
            promise.resolve(nil)
            return
          }
          cgImage = image
        } catch {
          self.rejectNativeError(promise, code: "EFM_LOAD_IMAGE", error: error, stage: "load image")
          return
        }

        let faces: [VNFaceObservation]
        do {
          faces = try self.detectFaces(in: cgImage)
        } catch {
          self.rejectNativeError(promise, code: "EFM_DETECT_FACES", error: error, stage: "detect faces")
          return
        }

        guard let primary = faces.first else {
          promise.resolve([
            "embedding": [Double](),
            "faceCount": 0,
            "primaryBox": NSNull(),
            "captureQuality": NSNull(),
            "faceSizeRatio": 0,
            "sharpness": 0,
            "yaw": NSNull(),
            "roll": NSNull(),
            "brightness": NSNull()
          ])
          return
        }

        let cropped: CGImage
        do {
          cropped = try self.crop(cgImage: cgImage, to: primary.boundingBox, padding: 0.18)
        } catch {
          self.rejectNativeError(promise, code: "EFM_CROP_FACE", error: error, stage: "crop face")
          return
        }

        let embedding: [Double]
        do {
          embedding = try self.computeEmbedding(for: cropped)
        } catch {
          self.rejectNativeError(promise, code: "EFM_COMPUTE_EMBEDDING", error: error, stage: "compute embedding")
          return
        }

        let qualityFaces = (try? self.detectFaceCaptureQuality(in: cgImage)) ?? []
        let metrics = self.qualityMetrics(for: primary, cropped: cropped, qualityFaces: qualityFaces)
        promise.resolve([
          "embedding": embedding,
          "faceCount": faces.count,
          "primaryBox": [
            "x": primary.boundingBox.origin.x,
            "y": primary.boundingBox.origin.y,
            "w": primary.boundingBox.size.width,
            "h": primary.boundingBox.size.height
          ],
          "captureQuality": self.nullableDouble(metrics.captureQuality),
          "faceSizeRatio": metrics.faceSizeRatio,
          "sharpness": metrics.sharpness,
          "yaw": self.nullableDouble(metrics.yaw),
          "roll": self.nullableDouble(metrics.roll),
          "brightness": metrics.brightness
        ])
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
        var captureQualities = [Double?](repeating: nil, count: n)
        var faceSizeRatios = [Double](repeating: 0, count: n)
        var sharpnesses = [Double](repeating: 0, count: n)
        var yaws = [Double?](repeating: nil, count: n)
        var rolls = [Double?](repeating: nil, count: n)
        var brightnesses = [Double](repeating: 0, count: n)
        var featureVectors = [[Double]](repeating: [], count: n)
        var visualFingerprints = [[Double]](repeating: [], count: n)
        let lock = NSLock()

        if workers <= 1 {
          for idx in 0..<n {
            let uri = candidates[idx]["localUri"] ?? ""
            let out = self.scoreCandidate(uri: uri, refVec: refVec)
            scores[idx] = out.score
            faceCounts[idx] = out.faceCount
            captureQualities[idx] = out.captureQuality
            faceSizeRatios[idx] = out.faceSizeRatio
            sharpnesses[idx] = out.sharpness
            yaws[idx] = out.yaw
            rolls[idx] = out.roll
            brightnesses[idx] = out.brightness
            featureVectors[idx] = out.featureVector
            visualFingerprints[idx] = out.visualFingerprint
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
              captureQualities[index] = out.captureQuality
              faceSizeRatios[index] = out.faceSizeRatio
              sharpnesses[index] = out.sharpness
              yaws[index] = out.yaw
              rolls[index] = out.roll
              brightnesses[index] = out.brightness
              featureVectors[index] = out.featureVector
              visualFingerprints[index] = out.visualFingerprint
              lock.unlock()
            }
          }
          queue.waitUntilAllOperationsAreFinished()
        }

        var results = [[String: Any]]()
        results.reserveCapacity(n)
        for i in 0..<n {
          let captureQuality = self.nullableDouble(captureQualities[i])
          let yaw = self.nullableDouble(yaws[i])
          let roll = self.nullableDouble(rolls[i])
          let row: [String: Any] = [
              "assetId": candidates[i]["assetId"] ?? "",
              "score": scores[i],
              "faceCount": faceCounts[i],
              "captureQuality": captureQuality,
              "faceSizeRatio": faceSizeRatios[i],
              "sharpness": sharpnesses[i],
              "yaw": yaw,
              "roll": roll,
              "brightness": brightnesses[i],
              "featureVector": featureVectors[i],
              "visualFingerprint": visualFingerprints[i]
            ]
          results.append(row)
        }
        promise.resolve(results)
      }
    }

    AsyncFunction("matchAgainstMany") {
      (
        references: [[String: Any]],
        candidates: [[String: String]],
        options: [String: Any],
        promise: Promise
      ) in

      DispatchQueue.global(qos: .userInitiated).async {
        let referenceRows: [(id: String, vector: [Double])] = references.compactMap { row in
          guard
            let id = row["referenceId"] as? String,
            let embedding = row["embedding"] as? [Double],
            !id.isEmpty,
            !embedding.isEmpty
          else {
            return nil
          }
          return (id, self.l2Normalise(embedding))
        }
        guard !referenceRows.isEmpty, !candidates.isEmpty else {
          promise.resolve([
            "results": [[String: Any]](),
            "processedAssetIds": [String](),
            "timedOut": false,
            "cancelled": false,
            "durationMs": 0
          ])
          return
        }

        let batchId = (options["batchId"] as? String).flatMap { $0.isEmpty ? nil : $0 }
          ?? UUID().uuidString
        let requestedTimeoutMs = (options["timeoutMs"] as? NSNumber)?.doubleValue ?? 60_000
        let timeoutSeconds = max(
          Self.minBatchTimeoutSeconds,
          min(Self.maxBatchTimeoutSeconds, requestedTimeoutMs / 1_000)
        )
        let token = self.registerMatchBatch(id: batchId)
        let startedAt = Date()
        let queue = OperationQueue()
        queue.name = "expo.faceMatcher.multiReference"
        queue.maxConcurrentOperationCount = Self.matchWorkerCount
        queue.qualityOfService = .userInitiated
        let group = DispatchGroup()
        let resultLock = NSLock()
        var acceptingResults = true
        var results = [[String: Any]]()
        var processedAssetIds = Set<String>()

        for candidate in candidates {
          group.enter()
          queue.addOperation {
            defer { group.leave() }
            if token.isCancelled { return }
            let assetId = candidate["assetId"] ?? ""
            let uri = candidate["localUri"] ?? ""
            let analysis = self.analyzeCandidate(uri: uri, token: token)
            if token.isCancelled { return }
            let rows = self.matchRows(
              assetId: assetId,
              analysis: analysis,
              references: referenceRows
            )
            resultLock.lock()
            if acceptingResults, !token.isCancelled {
              results.append(contentsOf: rows)
              if !assetId.isEmpty {
                processedAssetIds.insert(assetId)
              }
            }
            resultLock.unlock()
          }
        }

        let waitResult = group.wait(timeout: .now() + timeoutSeconds)
        let timedOut = waitResult == .timedOut
        if timedOut {
          resultLock.lock()
          acceptingResults = false
          resultLock.unlock()
          token.cancel(reason: "timeout")
          queue.cancelAllOperations()
        }

        resultLock.lock()
        let resolvedResults = results
        let resolvedAssetIds = Array(processedAssetIds).sorted()
        resultLock.unlock()
        let cancelled = token.reason == "cancelled"
        self.finishMatchBatch(id: batchId, token: token)
        promise.resolve([
          "results": resolvedResults,
          "processedAssetIds": resolvedAssetIds,
          "timedOut": timedOut,
          "cancelled": cancelled,
          "durationMs": Int(Date().timeIntervalSince(startedAt) * 1_000)
        ])
      }
    }

    Function("cancelMatchBatch") { (batchId: String) -> Bool in
      self.cancelMatchBatch(id: batchId)
    }
  }

  private func registerMatchBatch(id: String) -> MatchBatchToken {
    let token = MatchBatchToken()
    matchBatchRegistryLock.lock()
    let previous = matchBatches.updateValue(token, forKey: id)
    matchBatchRegistryLock.unlock()
    previous?.cancel(reason: "replaced")
    return token
  }

  private func cancelMatchBatch(id: String) -> Bool {
    matchBatchRegistryLock.lock()
    let token = matchBatches[id]
    matchBatchRegistryLock.unlock()
    guard let token else { return false }
    token.cancel(reason: "cancelled")
    return true
  }

  private func finishMatchBatch(id: String, token: MatchBatchToken) {
    matchBatchRegistryLock.lock()
    if matchBatches[id] === token {
      matchBatches.removeValue(forKey: id)
    }
    matchBatchRegistryLock.unlock()
  }

  private func analyzeCandidate(uri: String, token: MatchBatchToken? = nil) -> AnalyzedCandidate {
    if token?.isCancelled == true {
      return AnalyzedCandidate(faceCount: 0, faces: [], wholeImageFingerprint: [])
    }
    do {
      guard let cgImage = try loadCGImage(uri: uri, token: token) else {
        return AnalyzedCandidate(faceCount: 0, faces: [], wholeImageFingerprint: [])
      }
      if token?.isCancelled == true {
        return AnalyzedCandidate(faceCount: 0, faces: [], wholeImageFingerprint: [])
      }
      let wholeImageFingerprint = perceptualFingerprint(cgImage)
      let observations = try detectFaces(in: cgImage, token: token)
      let qualityFaces = (try? detectFaceCaptureQuality(in: cgImage, token: token)) ?? []
      var faces = [AnalyzedFace]()
      faces.reserveCapacity(min(3, observations.count))
      for face in observations.prefix(3) {
        if token?.isCancelled == true { break }
        let cropped = try crop(cgImage: cgImage, to: face.boundingBox, padding: 0.18)
        let embedding = l2Normalise(try computeEmbedding(for: cropped, token: token))
        let metrics = qualityMetrics(for: face, cropped: cropped, qualityFaces: qualityFaces)
        faces.append(AnalyzedFace(
          embedding: embedding,
          captureQuality: metrics.captureQuality,
          faceSizeRatio: metrics.faceSizeRatio,
          sharpness: metrics.sharpness,
          yaw: metrics.yaw,
          roll: metrics.roll,
          brightness: metrics.brightness,
          fingerprint: perceptualFingerprint(cropped)
        ))
      }
      return AnalyzedCandidate(
        faceCount: observations.count,
        faces: faces,
        wholeImageFingerprint: wholeImageFingerprint
      )
    } catch {
      return AnalyzedCandidate(faceCount: 0, faces: [], wholeImageFingerprint: [])
    }
  }

  private func matchRows(
    assetId: String,
    analysis: AnalyzedCandidate,
    references: [(id: String, vector: [Double])]
  ) -> [[String: Any]] {
    references.map { reference in
      var bestScore = 0.0
      var bestFace: AnalyzedFace?
      for face in analysis.faces {
        let score = cosine(reference.vector, face.embedding)
        if score > bestScore {
          bestScore = score
          bestFace = face
        }
      }
      return [
        "assetId": assetId,
        "referenceId": reference.id,
        "score": bestScore,
        "faceCount": analysis.faceCount,
        "captureQuality": nullableDouble(bestFace?.captureQuality),
        "faceSizeRatio": bestFace?.faceSizeRatio ?? 0,
        "sharpness": bestFace?.sharpness ?? 0,
        "yaw": nullableDouble(bestFace?.yaw),
        "roll": nullableDouble(bestFace?.roll),
        "brightness": bestFace?.brightness ?? 0,
        "featureVector": bestFace?.embedding ?? [],
        "visualFingerprint": analysis.wholeImageFingerprint + (bestFace?.fingerprint ?? [])
      ]
    }
  }

  /// Per-candidate scoring: identical pipeline to former serial loop (same load,
  /// detection, crop padding, top-3 faces, embeddings, cosine vs `refVec`).
  private func scoreCandidate(uri: String, refVec: [Double]) -> (score: Double, faceCount: Int, captureQuality: Double?, faceSizeRatio: Double, sharpness: Double, yaw: Double?, roll: Double?, brightness: Double, featureVector: [Double], visualFingerprint: [Double]) {
    let analysis = analyzeCandidate(uri: uri)
    let row = matchRows(
      assetId: "",
      analysis: analysis,
      references: [(id: "legacy", vector: refVec)]
    ).first
    return (
      row?["score"] as? Double ?? 0,
      analysis.faceCount,
      row?["captureQuality"] as? Double,
      row?["faceSizeRatio"] as? Double ?? 0,
      row?["sharpness"] as? Double ?? 0,
      row?["yaw"] as? Double,
      row?["roll"] as? Double,
      row?["brightness"] as? Double ?? 0,
      row?["featureVector"] as? [Double] ?? [],
      row?["visualFingerprint"] as? [Double] ?? []
    )
  }

  // MARK: - Vision

  /// Detect faces in `cgImage`, returning observations sorted by area descending.
  private func detectFaces(
    in cgImage: CGImage,
    token: MatchBatchToken? = nil
  ) throws -> [VNFaceObservation] {
    let req = VNDetectFaceRectanglesRequest()
    preferSimulatorCPU(req)
    try prepareVisionRequest(req, token: token)
    defer { token?.unregisterVisionRequest(req) }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([req])
    try ensureNotCancelled(token)
    let raw = req.results ?? []
    return raw.sorted { lhs, rhs in
      (lhs.boundingBox.size.width * lhs.boundingBox.size.height) >
      (rhs.boundingBox.size.width * rhs.boundingBox.size.height)
    }
  }

  private func detectFaceCaptureQuality(
    in cgImage: CGImage,
    token: MatchBatchToken? = nil
  ) throws -> [VNFaceObservation] {
    let req = VNDetectFaceCaptureQualityRequest()
    preferSimulatorCPU(req)
    try prepareVisionRequest(req, token: token)
    defer { token?.unregisterVisionRequest(req) }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([req])
    try ensureNotCancelled(token)
    return req.results ?? []
  }

  private func qualityMetrics(
    for face: VNFaceObservation,
    cropped: CGImage,
    qualityFaces: [VNFaceObservation]
  ) -> (captureQuality: Double?, faceSizeRatio: Double, sharpness: Double, yaw: Double?, roll: Double?, brightness: Double) {
    let captureQuality = captureQualityFor(face: face, qualityFaces: qualityFaces)
    let faceSizeRatio = max(0, min(1, Double(face.boundingBox.width * face.boundingBox.height)))
    let pixels = grayscaleMetrics(cropped)
    return (
      captureQuality,
      faceSizeRatio,
      pixels.sharpness,
      face.yaw.map { Double(truncating: $0) },
      face.roll.map { Double(truncating: $0) },
      pixels.brightness
    )
  }

  private func captureQualityFor(face: VNFaceObservation, qualityFaces: [VNFaceObservation]) -> Double? {
    var best: VNFaceObservation?
    var bestOverlap = 0.0
    for candidate in qualityFaces {
      let overlap = intersectionOverUnion(face.boundingBox, candidate.boundingBox)
      if overlap > bestOverlap {
        best = candidate
        bestOverlap = overlap
      }
    }
    guard bestOverlap > 0.2, let quality = best?.faceCaptureQuality else { return nil }
    return max(0, min(1, Double(quality)))
  }

  private func intersectionOverUnion(_ a: CGRect, _ b: CGRect) -> Double {
    let intersection = a.intersection(b)
    if intersection.isNull || intersection.isEmpty { return 0 }
    let intersectionArea = Double(intersection.width * intersection.height)
    let unionArea = Double(a.width * a.height + b.width * b.height) - intersectionArea
    if unionArea <= 0 { return 0 }
    return intersectionArea / unionArea
  }

  private func grayscaleMetrics(_ cgImage: CGImage) -> (sharpness: Double, brightness: Double) {
    let width = max(8, min(96, cgImage.width))
    let height = max(8, min(96, cgImage.height))
    var pixels = [UInt8](repeating: 0, count: width * height)
    let colorSpace = CGColorSpaceCreateDeviceGray()
    let rendered = pixels.withUnsafeMutableBytes { raw in
      guard let context = CGContext(
        data: raw.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      ) else {
        return false
      }
      context.interpolationQuality = .low
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }

    if !rendered { return (0, 0) }

    var sum = 0.0
    var count = 0
    var brightnessSum = 0.0
    for pixel in pixels {
      brightnessSum += Double(pixel) / 255.0
    }
    for y in stride(from: 1, to: height - 1, by: 2) {
      for x in stride(from: 1, to: width - 1, by: 2) {
        let i = y * width + x
        let laplacian =
          4 * Int(pixels[i])
          - Int(pixels[i - 1])
          - Int(pixels[i + 1])
          - Int(pixels[i - width])
          - Int(pixels[i + width])
        sum += Double(laplacian * laplacian)
        count += 1
      }
    }
    let brightness = pixels.isEmpty ? 0 : brightnessSum / Double(pixels.count)
    if count == 0 { return (0, brightness) }
    return (min(1, sqrt(sum / Double(count)) / 255.0), brightness)
  }

  /// Cheap whole-image fingerprint for near-duplicate suppression. The face
  /// feature print remains identity evidence; it must not be used to decide
  /// that two different photos of the same child are duplicates.
  private func perceptualFingerprint(_ cgImage: CGImage) -> [Double] {
    let width = 8
    let height = 8
    var pixels = [UInt8](repeating: 0, count: width * height)
    let colorSpace = CGColorSpaceCreateDeviceGray()
    let rendered = pixels.withUnsafeMutableBytes { raw in
      guard let context = CGContext(
        data: raw.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      ) else {
        return false
      }
      context.interpolationQuality = .medium
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard rendered else { return [] }
    let mean = Double(pixels.reduce(0) { $0 + Int($1) }) / Double(pixels.count)
    return pixels.map { Double($0) >= mean ? 1.0 : -1.0 }
  }

  private func nullableDouble(_ value: Double?) -> Any {
    guard let value else { return NSNull() }
    return value
  }

  private func rejectNativeError(_ promise: Promise, code: String, error: Error, stage: String) {
    let nsError = error as NSError
    let safeDomain = nsError.domain
      .replacingOccurrences(of: ".", with: "_")
      .replacingOccurrences(of: " ", with: "_")
    promise.reject("\(code)_\(safeDomain)_\(nsError.code)", describeError(error, stage: stage))
  }

  private func describeError(_ error: Error, stage: String) -> String {
    let nsError = error as NSError
    let description = nsError.localizedDescription
    let reason = nsError.localizedFailureReason
    if let reason, !reason.isEmpty {
      return "\(stage) failed: \(description) (\(reason))"
    }
    return "\(stage) failed: \(description)"
  }

  private func preferSimulatorCPU(_ request: VNRequest) {
    #if targetEnvironment(simulator)
    request.usesCPUOnly = true
    #endif
  }

  /// Compute a feature print from `cgImage` and return as an array of doubles.
  private func computeEmbedding(
    for cgImage: CGImage,
    token: MatchBatchToken? = nil
  ) throws -> [Double] {
    let req = VNGenerateImageFeaturePrintRequest()
    if #available(iOS 17.0, *) {
      req.imageCropAndScaleOption = .scaleFill
    }
    preferSimulatorCPU(req)
    try prepareVisionRequest(req, token: token)
    defer { token?.unregisterVisionRequest(req) }
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    try handler.perform([req])
    try ensureNotCancelled(token)
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

  private func prepareVisionRequest(_ request: VNRequest, token: MatchBatchToken?) throws {
    guard token?.registerVisionRequest(request) != false else {
      throw cancellationError()
    }
  }

  private func ensureNotCancelled(_ token: MatchBatchToken?) throws {
    if token?.isCancelled == true {
      throw cancellationError()
    }
  }

  private func cancellationError() -> NSError {
    NSError(
      domain: "ExpoFaceMatcher",
      code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Photo analysis was cancelled"]
    )
  }

  // MARK: - Image loading & cropping

  /// Resolve a `localUri` (file://, ph://, or assets-library://) to a CGImage.
  private func loadCGImage(
    uri: String,
    token: MatchBatchToken? = nil
  ) throws -> CGImage? {
    try ensureNotCancelled(token)
    guard let url = URL(string: uri) else { return nil }
    if url.scheme == "file" {
      let data = try Data(contentsOf: url)
      try ensureNotCancelled(token)
      guard let img = UIImage(data: data) else { return nil }
      return img.cgImage ?? CIImage(image: img).flatMap { ciContext.createCGImage($0, from: $0.extent) }
    }
    if url.scheme == "ph" || url.scheme == "assets-library" {
      return try loadFromPhotos(url: url, token: token)
    }
    // Fallback: try as data URL string for HTTP urls (not expected in our flow)
    return nil
  }

  private func loadFromPhotos(
    url: URL,
    token: MatchBatchToken? = nil
  ) throws -> CGImage? {
    try ensureNotCancelled(token)
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
    options.isSynchronous = false
    options.deliveryMode = .opportunistic
    options.isNetworkAccessAllowed = true
    options.resizeMode = .exact
    options.progressHandler = { _, _, _, _ in }

    let semaphore = DispatchSemaphore(value: 0)
    let resultLock = NSLock()
    var resultImage: UIImage?
    var finished = false
    let target = CGSize(width: 1280, height: 1280)
    let requestId = manager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFit,
      options: options
    ) { image, info in
      let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) == true
      let isCancelled = (info?[PHImageCancelledKey] as? Bool) == true
      let hasError = info?[PHImageErrorKey] != nil

      resultLock.lock()
      if !finished, let image {
        resultImage = image
      }
      let shouldFinish = isCancelled || hasError || !isDegraded
      if shouldFinish, !finished {
        finished = true
        resultLock.unlock()
        semaphore.signal()
        return
      }
      resultLock.unlock()
    }
    let cancelRequest = {
      resultLock.lock()
      let shouldSignal = !finished
      finished = true
      resultLock.unlock()
      manager.cancelImageRequest(requestId)
      if shouldSignal {
        semaphore.signal()
      }
    }
    if let token, !token.registerImageRequest(id: requestId, cancel: cancelRequest) {
      return nil
    }
    defer { token?.unregisterImageRequest(id: requestId) }

    let deadline = DispatchTime.now() + Self.photoLoadTimeoutSeconds
    if semaphore.wait(timeout: deadline) == .timedOut {
      cancelRequest()
      resultLock.lock()
      let bestAvailable = resultImage
      resultLock.unlock()
      return bestAvailable?.cgImage
    }

    try ensureNotCancelled(token)
    resultLock.lock()
    let resolvedImage = resultImage
    resultLock.unlock()
    return resolvedImage?.cgImage
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

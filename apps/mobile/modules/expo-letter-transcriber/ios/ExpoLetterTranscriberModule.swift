import ExpoModulesCore
import Foundation
import Speech

public class ExpoLetterTranscriberModule: Module {
  private var tasks: [UUID: SFSpeechRecognitionTask] = [:]
  private let taskLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("ExpoLetterTranscriber")

    AsyncFunction("transcribe") { (localUri: String, promise: Promise) in
      self.withSpeechPermission(promise: promise) {
        self.transcribeFile(localUri: localUri, promise: promise)
      }
    }
  }

  private func withSpeechPermission(promise: Promise, authorized: @escaping () -> Void) {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized:
      authorized()
    case .notDetermined:
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
          promise.reject("ELT_PERMISSION", "Speech recognition permission was not granted")
          return
        }
        authorized()
      }
    case .denied, .restricted:
      promise.reject("ELT_PERMISSION", "Speech recognition permission is unavailable")
    @unknown default:
      promise.reject("ELT_PERMISSION", "Speech recognition permission is unavailable")
    }
  }

  private func transcribeFile(localUri: String, promise: Promise) {
    guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable else {
      promise.reject("ELT_UNAVAILABLE", "On-device transcription is unavailable for this language")
      return
    }
    guard recognizer.supportsOnDeviceRecognition else {
      promise.reject("ELT_NOT_ON_DEVICE", "This iPhone does not have an on-device speech model available")
      return
    }

    let url: URL
    if let parsed = URL(string: localUri), parsed.isFileURL {
      url = parsed
    } else {
      url = URL(fileURLWithPath: localUri)
    }
    guard FileManager.default.fileExists(atPath: url.path) else {
      promise.reject("ELT_FILE", "The voice recording could not be found")
      return
    }

    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    request.taskHint = .dictation
    request.requiresOnDeviceRecognition = true

    let taskId = UUID()
    var completed = false
    let task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard !completed else { return }
      if let result, result.isFinal {
        completed = true
        self?.removeTask(taskId)
        promise.resolve(result.bestTranscription.formattedString)
        return
      }
      if let error {
        completed = true
        self?.removeTask(taskId)
        promise.reject("ELT_TRANSCRIBE", error.localizedDescription)
      }
    }
    taskLock.lock()
    tasks[taskId] = task
    taskLock.unlock()
  }

  private func removeTask(_ id: UUID) {
    taskLock.lock()
    tasks.removeValue(forKey: id)
    taskLock.unlock()
  }
}
